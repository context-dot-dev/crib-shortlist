import { requestContext } from "./context-client";
import {
  fetchPublicHtml,
  formatPostalAddress,
  isRecord,
  jsonLdFromHtml,
  textFromHtml,
} from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  matchesBedrooms,
} from "./ranking";
import { ExtractListingsResponseSchema } from "./schemas";
import type {
  ApartmentCard,
  ContextListing,
  Preferences,
} from "./schemas";

const INVENTORY_URL = "https://www.jwavro.com/rental_list.php?hood=sfc";

const globalCache = globalThis as typeof globalThis & {
  criblistJwavroCandidateCache?: {
    expiresAt: number;
    candidates: ContextListing[];
  };
  criblistJwavroCandidateRequest?: Promise<ContextListing[]>;
  criblistJwavroDeckCache?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};
const deckCache = globalCache.criblistJwavroDeckCache ?? new Map();
globalCache.criblistJwavroDeckCache = deckCache;

export async function discoverJwavroListings(
  preferences: Preferences,
  apiKey: string,
) {
  const cacheKey = JSON.stringify({
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
  });
  const cached = deckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const candidates = (await getCandidates(apiKey))
    .filter(
      (candidate) =>
        candidate.url &&
        candidate.name &&
        candidate.price !== null &&
        candidate.price >= preferences.budgetMin &&
        candidate.price <= preferences.budgetMax &&
        matchesBedrooms(candidate.bedrooms, preferences.bedrooms),
    )
    .slice(0, 8);
  const apartments = (
    await Promise.all(
      candidates.map((candidate) =>
        fetchJwavroCard(candidate, preferences),
      ),
    )
  ).filter((apartment): apartment is ApartmentCard => apartment !== null);
  if (apartments.length > 0) {
    deckCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

async function getCandidates(apiKey: string) {
  const cached = globalCache.criblistJwavroCandidateCache;
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;

  const activeRequest = globalCache.criblistJwavroCandidateRequest;
  if (activeRequest) return activeRequest;

  const request = extractCandidates(apiKey);
  globalCache.criblistJwavroCandidateRequest = request;
  try {
    return await request;
  } finally {
    if (globalCache.criblistJwavroCandidateRequest === request) {
      delete globalCache.criblistJwavroCandidateRequest;
    }
  }
}

async function extractCandidates(apiKey: string) {
  const response = await requestContext("/web/extract", apiKey, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: INVENTORY_URL,
        schema: listingSchema(),
        instructions:
          "Extract every currently available San Francisco rental shown on this inventory page, up to 20. Use the exact detail-page URL, numeric monthly rent, bedrooms and bathrooms. Preserve image URLs when visible. Do not include navigation or properties outside San Francisco. Do not invent missing values.",
        factCheck: true,
        maxPages: 1,
        maxDepth: 0,
        maxAgeMs: 5 * 60 * 1000,
        waitForMs: 300,
        stopAfterMs: 35_000,
        timeoutMS: 45_000,
        tags: ["criblist", "production", "jwavro"],
      }),
    },
    timeoutMs: 48_000,
    maxAttempts: 1,
  });
  const candidates =
    ExtractListingsResponseSchema.parse(response).data.listings;
  globalCache.criblistJwavroCandidateCache = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    candidates,
  };
  return candidates;
}

async function fetchJwavroCard(
  candidate: ContextListing,
  preferences: Preferences,
) {
  if (!candidate.url) return null;
  try {
    return jwavroCardFromHtml(
      candidate.url,
      await fetchPublicHtml(candidate.url, 6_000),
      candidate,
      preferences,
    );
  } catch {
    return null;
  }
}

export function jwavroCardFromHtml(
  url: string,
  html: string,
  candidate: ContextListing,
  preferences: Preferences,
) {
  const listing = jsonLdFromHtml(html).find(
    (entry) => entry["@type"] === "Apartment" && isRecord(entry.offers),
  );
  if (!listing) return null;
  const offer = listing.offers as Record<string, unknown>;
  const price =
    typeof offer.price === "number" ? offer.price : candidate.price;
  const bedrooms =
    typeof listing.numberOfBedrooms === "number"
      ? listing.numberOfBedrooms
      : candidate.bedrooms;
  if (
    price === null ||
    bedrooms === null ||
    !matchesBedrooms(bedrooms, preferences.bedrooms)
  ) {
    return null;
  }

  const description =
    typeof listing.description === "string"
      ? listing.description.replaceAll("&nbsp;", " ")
      : candidate.name ?? "San Francisco apartment";
  const pageText = `${textFromHtml(html)}\n${description}`;
  const amenities = amenityNames(listing.amenityFeature);
  const laundry = inferLaundry(pageText);
  const images = cleanImageUrls([
    ...imageValues(listing.image),
    ...candidate.images,
  ]);
  const squareFeet = floorSize(listing.floorSize);
  const availability =
    typeof offer.availability === "string" &&
    /InStock|LimitedAvailability/i.test(offer.availability)
      ? "Available now"
      : null;
  const name =
    typeof listing.name === "string"
      ? listing.name
      : candidate.name ?? "San Francisco apartment";

  return createApartmentCard(
    { url, title: name, description },
    {
      name,
      address: formatPostalAddress(listing.address) ?? candidate.address,
      neighborhood: candidate.neighborhood,
      price,
      bedrooms,
      bathrooms:
        typeof listing.numberOfBathroomsTotal === "number"
          ? listing.numberOfBathroomsTotal
          : candidate.bathrooms,
      squareFeet,
      availability,
      laundry,
      dishwasher: /dishwasher/i.test(pageText) ? true : null,
      petsAllowed: /\bno pets?\b/i.test(pageText)
        ? false
        : /\bpet friendly|pets? (?:welcome|allowed)\b/i.test(pageText)
          ? true
          : candidate.petsAllowed,
      amenities: [
        ...amenities,
        ...(laundry === "in-unit"
          ? ["In-unit laundry"]
          : laundry === "in-building"
            ? ["Laundry in building"]
            : []),
      ],
      description,
      caveats: [
        "Live J. Wavro inventory. Verify availability before applying.",
      ],
    },
    images,
    preferences,
  );
}

function listingSchema() {
  return {
    type: "object",
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            url: { type: ["string", "null"] },
            price: { type: ["number", "null"] },
            bedrooms: { type: ["number", "null"] },
            bathrooms: { type: ["number", "null"] },
            neighborhood: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
            squareFeet: { type: ["number", "null"] },
            petsAllowed: { type: ["boolean", "null"] },
            images: { type: "array", items: { type: "string" } },
          },
          required: [
            "name",
            "url",
            "price",
            "bedrooms",
            "bathrooms",
            "neighborhood",
            "address",
            "squareFeet",
            "petsAllowed",
            "images",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["listings"],
    additionalProperties: false,
  };
}

function imageValues(value: unknown) {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((image): image is string => typeof image === "string")
    : [];
}

function amenityNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((amenity) =>
    isRecord(amenity) && typeof amenity.name === "string"
      ? [amenity.name]
      : [],
  );
}

function floorSize(value: unknown) {
  if (typeof value === "number") return value;
  if (!isRecord(value)) return null;
  return typeof value.value === "number" ? value.value : null;
}

function inferLaundry(text: string) {
  if (/in-unit washer|washer\/dryer in unit|in unit laundry/i.test(text)) {
    return "in-unit" as const;
  }
  if (/laundry in building|shared laundry|laundry facilities/i.test(text)) {
    return "in-building" as const;
  }
  return /\bno laundry\b/i.test(text)
    ? ("none" as const)
    : ("unknown" as const);
}
