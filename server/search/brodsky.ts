import {
  fetchPublicHtml,
  isRecord,
} from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  matchesBedrooms,
} from "./listing-card";
import type { ExtractedApartment } from "./schemas";
import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";

const INVENTORY_URL = "https://www.brodsky.com/rentals";
const CACHE_TTL_MS = 10 * 60 * 1000;

type BrodskyListing = {
  name: string;
  url: string;
  image: string;
  price: number;
  bedrooms: number;
  bathrooms: number | null;
  neighborhood: string | null;
  address: string;
  availability: string | null;
  description: string | null;
  amenities: string[];
};

const globalBrodskyCache = globalThis as typeof globalThis & {
  criblistBrodskyInventory?: {
    expiresAt: number;
    apartments: BrodskyListing[];
  };
  criblistBrodskyRequest?: Promise<BrodskyListing[]>;
};

export async function discoverBrodskyListings(
  preferences: Preferences,
  _apiKey: string,
) {
  const listings = await brodskyInventory();
  return listings
    .filter(
      (listing) =>
        listing.price >= preferences.budgetMin &&
        listing.price <= preferences.budgetMax &&
        matchesBedrooms(listing.bedrooms, preferences.bedrooms),
    )
    .filter(
      (listing) =>
        preferences.neighborhoods.length === 0 ||
        preferences.neighborhoods.some((neighborhood) =>
          listing.neighborhood
            ?.toLowerCase()
            .includes(neighborhood.toLowerCase()),
        ),
    )
    .map((listing) => brodskyCard(listing, preferences));
}

export function extractBrodskyListings(html: string) {
  const payload = nextFlightPayloads(html).find((candidate) =>
    candidate.includes('"initialApartments":'),
  );
  if (!payload) return [];
  const apartments = extractJsonArray(payload, '"initialApartments":');
  if (!apartments) return [];
  try {
    const values: unknown = JSON.parse(apartments);
    return Array.isArray(values)
      ? values
          .map(parseBrodskyListing)
          .filter((listing): listing is BrodskyListing => listing !== null)
      : [];
  } catch {
    return [];
  }
}

async function brodskyInventory() {
  const cached = globalBrodskyCache.criblistBrodskyInventory;
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;
  if (globalBrodskyCache.criblistBrodskyRequest) {
    return globalBrodskyCache.criblistBrodskyRequest;
  }

  const request = fetchPublicHtml(INVENTORY_URL, 15_000).then(
    extractBrodskyListings,
  );
  globalBrodskyCache.criblistBrodskyRequest = request;
  try {
    const apartments = await request;
    if (apartments.length > 0) {
      globalBrodskyCache.criblistBrodskyInventory = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        apartments,
      };
    }
    return apartments;
  } finally {
    if (globalBrodskyCache.criblistBrodskyRequest === request) {
      delete globalBrodskyCache.criblistBrodskyRequest;
    }
  }
}

function parseBrodskyListing(value: unknown): BrodskyListing | null {
  if (!isRecord(value)) return null;
  const path = stringValue(value.url);
  const propertyName = stringValue(value.propertyName);
  const apartmentName = stringValue(value.apartmentName);
  const price =
    numberValue(value.effectiveMinRent) ?? numberValue(value.minimumRent);
  const bedrooms = numberValue(value.beds);
  const image = isRecord(value.thumbnail)
    ? stringValue(value.thumbnail.url)
    : null;
  if (
    !path ||
    !propertyName ||
    !apartmentName ||
    price === null ||
    bedrooms === null ||
    !image
  ) {
    return null;
  }

  const zipCode = stringValue(value.zipCode);
  const amenities = arrayOfStrings(value.amenities);
  const descriptionParts = [
    stringValue(value.unitDescription),
    stringValue(value.specials),
    stringValue(value.incentiveVerbiageBlock),
  ].filter((part): part is string => part !== null);

  return {
    name: `${propertyName} · ${apartmentName}`,
    url: new URL(path, INVENTORY_URL).toString(),
    image,
    price,
    bedrooms,
    bathrooms: numberValue(value.baths),
    neighborhood: stringValue(value.neighborhoodName),
    address: `${propertyName}, New York, NY${zipCode ? ` ${zipCode}` : ""}`,
    availability: stringValue(value.availableDate),
    description:
      descriptionParts.length > 0 ? descriptionParts.join(" ") : null,
    amenities,
  };
}

function brodskyCard(
  listing: BrodskyListing,
  preferences: Preferences,
): ApartmentCard {
  const amenityText = listing.amenities.join(" ");
  const laundry = /in[- ]unit laundry|washer.?dryer/i.test(amenityText)
    ? "in-unit"
    : /laundry room|laundry in building/i.test(amenityText)
      ? "in-building"
      : "unknown";
  const extracted: ExtractedApartment = {
    name: listing.name,
    address: listing.address,
    neighborhood: listing.neighborhood,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: null,
    availability: listing.availability,
    laundry,
    dishwasher: /\bdishwasher\b/i.test(amenityText) ? true : null,
    petsAllowed: null,
    amenities: listing.amenities,
    description: listing.description,
    caveats: ["Live Brodsky inventory. Verify availability before applying."],
  };
  return createApartmentCard(
    {
      url: listing.url,
      title: listing.name,
      description: listing.description ?? listing.name,
    },
    extracted,
    cleanImageUrls([listing.image]),
    preferences,
  );
}

function nextFlightPayloads(html: string) {
  const scripts = [
    ...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => match[1]);
  return scripts.flatMap((script) => {
    const serializedPayload = script.match(
      /self\.__next_f\.push\((\[.*\])\)/s,
    )?.[1];
    if (!serializedPayload) return [];
      try {
        const payload: unknown = JSON.parse(serializedPayload);
        return Array.isArray(payload) && typeof payload[1] === "string"
          ? [payload[1]]
          : [];
      } catch {
        return [];
      }
  });
}

function extractJsonArray(payload: string, token: string) {
  const tokenIndex = payload.indexOf(token);
  if (tokenIndex < 0) return null;
  const start = payload.indexOf("[", tokenIndex + token.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < payload.length; index += 1) {
    const character = payload[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return payload.slice(start, index + 1);
    }
  }
  return null;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
