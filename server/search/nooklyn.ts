import { mapWithConcurrency, isRecord } from "./html";
import {
  createApartmentCard,
  matchesBedrooms,
} from "./listing-card";
import type { ExtractedApartment } from "./schemas";
import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";

const NOOKLYN_ROOT = "https://nooklyn.com";
const INVENTORY_TTL_MS = 5 * 60 * 1000;
const IMAGE_TTL_MS = 30 * 60 * 1000;
const MAX_INVENTORY_PAGES = 5;

type NooklynListing = {
  id: number;
  price: number;
  bedrooms: number;
  bathrooms: number | null;
  neighborhood: string | null;
  address: string;
  shortAddress: string | null;
  squareFeet: number | null;
  description: string | null;
  amenities: string[];
  petsAllowed: boolean | null;
  noFee: boolean;
  availableAt: string | null;
  listedAt: string | null;
  url: string;
  image: string | null;
};

const globalNooklynCache = globalThis as typeof globalThis & {
  criblistNooklynInventory?: {
    expiresAt: number;
    listings: NooklynListing[];
  };
  criblistNooklynRequest?: Promise<NooklynListing[]>;
  criblistNooklynImages?: Map<
    number,
    { expiresAt: number; images: string[] }
  >;
  criblistNooklynImageRequests?: Map<number, Promise<string[]>>;
  criblistNooklynActiveRequests?: number;
  criblistNooklynWaiters?: Array<() => void>;
};

const imageCache = globalNooklynCache.criblistNooklynImages ?? new Map();
const imageRequests =
  globalNooklynCache.criblistNooklynImageRequests ?? new Map();
globalNooklynCache.criblistNooklynImages = imageCache;
globalNooklynCache.criblistNooklynImageRequests = imageRequests;
globalNooklynCache.criblistNooklynActiveRequests ??= 0;
globalNooklynCache.criblistNooklynWaiters ??= [];

export async function discoverNooklynListings(
  preferences: Preferences,
  _apiKey: string,
) {
  const inventory = await nooklynInventory();
  const candidates = inventory
    .filter(
      (listing) =>
        listing.price >= preferences.budgetMin &&
        listing.price <= preferences.budgetMax &&
        matchesBedrooms(listing.bedrooms, preferences.bedrooms),
    )
    .filter(
      (listing) =>
        preferences.neighborhoods.length === 0 ||
        preferences.neighborhoods.some(
          (neighborhood) =>
            listing.neighborhood?.toLowerCase() ===
            neighborhood.toLowerCase(),
        ),
    )
    .slice(0, 30);
  const galleries = await mapWithConcurrency(candidates, 8, (listing) =>
    nooklynImages(listing),
  );

  return candidates.map((listing, index) =>
    nooklynCard(listing, galleries[index], preferences),
  );
}

async function nooklynInventory() {
  const cached = globalNooklynCache.criblistNooklynInventory;
  if (cached && cached.expiresAt > Date.now()) return cached.listings;
  if (globalNooklynCache.criblistNooklynRequest) {
    return globalNooklynCache.criblistNooklynRequest;
  }

  const request = fetchNooklynInventory();
  globalNooklynCache.criblistNooklynRequest = request;
  try {
    const listings = await request;
    if (listings.length > 0) {
      globalNooklynCache.criblistNooklynInventory = {
        expiresAt: Date.now() + INVENTORY_TTL_MS,
        listings,
      };
    }
    return listings;
  } finally {
    if (globalNooklynCache.criblistNooklynRequest === request) {
      delete globalNooklynCache.criblistNooklynRequest;
    }
  }
}

async function fetchNooklynInventory() {
  const firstPage = await fetchNooklynPage(1);
  const pageCount = Math.min(
    MAX_INVENTORY_PAGES,
    numberValue(firstPage.page_count) ?? 1,
  );
  const remainingPages = await mapWithConcurrency(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2),
    5,
    fetchNooklynPage,
  );
  const searchListings = [firstPage, ...remainingPages]
    .flatMap((response) => arrayValue(response.listings))
    .map(parseNooklynListing)
    .filter((listing): listing is NooklynListing => listing !== null);
  const matchingIds = searchListings.map((listing) => listing.id);
  if (matchingIds.length === 0) return [];

  const detailResponses = await mapWithConcurrency(
    chunkValues(matchingIds, 100),
    5,
    (ids) =>
      fetchJson(`/api/v3/web/listings.list?listing_ids=${ids.join(",")}`),
  );
  const detailedListings = detailResponses
    .flatMap((response) => arrayValue(response.listings))
    .map(parseNooklynListing)
    .filter((listing): listing is NooklynListing => listing !== null);
  return detailedListings.length > 0 ? detailedListings : searchListings;
}

function fetchNooklynPage(page: number) {
  return fetchJson("/api/v3/web/listings.search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page }),
  });
}

async function nooklynImages(listing: NooklynListing) {
  const cached = imageCache.get(listing.id);
  if (cached && cached.expiresAt > Date.now()) return cached.images;
  const activeRequest = imageRequests.get(listing.id);
  if (activeRequest) return activeRequest;

  const request = fetchNooklynImages(listing);
  imageRequests.set(listing.id, request);
  try {
    return await request;
  } finally {
    if (imageRequests.get(listing.id) === request) {
      imageRequests.delete(listing.id);
    }
  }
}

async function fetchNooklynImages(listing: NooklynListing) {
  try {
    const response = await fetchJson(
      `/api/v3/web/listings.images?listing_id=${listing.id}`,
    );
    const images = [
      ...new Set(
        arrayValue(response.images).flatMap((image) => {
          if (!isRecord(image)) return [];
          return stringValue(image.wide) ??
            stringValue(image.large) ??
            stringValue(image.original)
            ? [
                stringValue(image.wide) ??
                  stringValue(image.large) ??
                  stringValue(image.original) ??
                  "",
              ]
            : [];
        }),
      ),
    ].slice(0, 10);
    const resolvedImages =
      images.length > 0 ? images : listing.image ? [listing.image] : [];
    imageCache.set(listing.id, {
      expiresAt: Date.now() + IMAGE_TTL_MS,
      images: resolvedImages,
    });
    return resolvedImages;
  } catch {
    return listing.image ? [listing.image] : [];
  }
}

function nooklynCard(
  listing: NooklynListing,
  images: string[],
  preferences: Preferences,
): ApartmentCard {
  const laundry = inferLaundry(listing.amenities);
  const extracted: ExtractedApartment = {
    name: listing.shortAddress ?? listing.address,
    address: listing.address,
    neighborhood: listing.neighborhood,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: listing.squareFeet,
    availability: listing.availableAt,
    laundry,
    dishwasher: listing.amenities.some((amenity) =>
      /\bdishwasher\b/i.test(amenity),
    ),
    petsAllowed: listing.petsAllowed,
    amenities: [
      ...(listing.noFee ? ["No fee"] : []),
      ...listing.amenities,
    ],
    description: listing.description,
    caveats: ["Live Nooklyn inventory. Verify availability before applying."],
  };
  return createApartmentCard(
    {
      url: listing.url,
      title: listing.shortAddress ?? listing.address,
      description: listing.description ?? "",
    },
    extracted,
    images,
    preferences,
    listing.listedAt,
  );
}

function parseNooklynListing(value: unknown): NooklynListing | null {
  if (!isRecord(value)) return null;
  const id = numberValue(value.id);
  const priceInCents = numberValue(value.price);
  const bedrooms = numberValue(value.bedrooms);
  const address = stringValue(value.address);
  const path = stringValue(value.listing_url) ?? stringValue(value.url);
  if (
    id === null ||
    priceInCents === null ||
    bedrooms === null ||
    !address ||
    !path ||
    value.rental === false ||
    value.residential === false
  ) {
    return null;
  }

  const neighborhood = isRecord(value.neighborhood)
    ? stringValue(value.neighborhood.name)
    : stringValue(value.neighborhood);
  const image = isRecord(value.image)
    ? stringValue(value.image.wide) ??
      stringValue(value.image.large) ??
      stringValue(value.image.xlarge)
    : null;
  const pets = stringValue(value.pets);

  return {
    id,
    price: priceInCents / 100,
    bedrooms,
    bathrooms: numberValue(value.bathrooms),
    neighborhood,
    address,
    shortAddress: stringValue(value.short_address),
    squareFeet: numberValue(value.square_feet),
    description: stringValue(value.description),
    amenities: stringValue(value.amenities)
      ?.split(/\r?\n+/)
      .map((amenity) => amenity.trim())
      .filter(Boolean) ?? [],
    petsAllowed: pets
      ? !/\bno pets?\b/i.test(pets)
      : null,
    noFee: value.no_fee === true,
    availableAt: stringValue(value.date_available),
    listedAt:
      stringValue(value.date_posted) ??
      stringValue(value.listed_at) ??
      stringValue(value.created_at),
    url: new URL(path, NOOKLYN_ROOT).toString(),
    image,
  };
}

async function fetchJson(path: string, init?: RequestInit) {
  await acquireNooklynSlot();
  try {
    const response = await fetch(`${NOOKLYN_ROOT}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Nooklyn returned ${response.status}.`);
    }
    const value: unknown = await response.json();
    if (!isRecord(value)) throw new Error("Nooklyn returned invalid data.");
    return value;
  } finally {
    releaseNooklynSlot();
  }
}

async function acquireNooklynSlot() {
  if ((globalNooklynCache.criblistNooklynActiveRequests ?? 0) < 12) {
    globalNooklynCache.criblistNooklynActiveRequests =
      (globalNooklynCache.criblistNooklynActiveRequests ?? 0) + 1;
    return;
  }
  await new Promise<void>((resolve) => {
    globalNooklynCache.criblistNooklynWaiters?.push(resolve);
  });
  globalNooklynCache.criblistNooklynActiveRequests =
    (globalNooklynCache.criblistNooklynActiveRequests ?? 0) + 1;
}

function releaseNooklynSlot() {
  globalNooklynCache.criblistNooklynActiveRequests = Math.max(
    0,
    (globalNooklynCache.criblistNooklynActiveRequests ?? 1) - 1,
  );
  globalNooklynCache.criblistNooklynWaiters?.shift()?.();
}

function inferLaundry(amenities: string[]): ExtractedApartment["laundry"] {
  const text = amenities.join(" ");
  if (/washer dryer installed|in[- ]unit laundry/i.test(text)) {
    return "in-unit";
  }
  if (/laundry in building|laundry room/i.test(text)) {
    return "in-building";
  }
  return "unknown";
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function chunkValues<T>(values: T[], size: number) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
