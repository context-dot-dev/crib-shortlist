import { requestContext } from "./context-client";
import {
  decodeHtml,
  fetchPublicHtml,
  formatPostalAddress,
  isRecord,
  jsonLdFromHtml,
  mapWithConcurrency,
  metaContent,
  textFromHtml,
} from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  inferNeighborhood,
  matchesBedrooms,
} from "./listing-card";
import { ExtractListingsResponseSchema } from "./schemas";
import type {
  ContextListing,
  ExtractedApartment,
} from "./schemas";
import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";

export type ExtractedInventoryConfig = {
  id: string;
  inventoryUrl: string;
  instructions: string;
  caveat: string;
  defaultAddress?: string;
  maxCandidates?: number;
  requireSanFranciscoAddress?: boolean;
};

const globalCache = globalThis as typeof globalThis & {
  criblistExtractedInventoryCandidates?: Map<
    string,
    { expiresAt: number; candidates: ContextListing[] }
  >;
  criblistExtractedInventoryRequests?: Map<
    string,
    Promise<ContextListing[]>
  >;
  criblistExtractedInventoryDecks?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};
const candidateCache =
  globalCache.criblistExtractedInventoryCandidates ?? new Map();
const candidateRequests =
  globalCache.criblistExtractedInventoryRequests ?? new Map();
const deckCache = globalCache.criblistExtractedInventoryDecks ?? new Map();
globalCache.criblistExtractedInventoryCandidates = candidateCache;
globalCache.criblistExtractedInventoryRequests = candidateRequests;
globalCache.criblistExtractedInventoryDecks = deckCache;

export async function discoverExtractedInventory(
  config: ExtractedInventoryConfig,
  preferences: Preferences,
  apiKey: string,
) {
  const deckKey = `${config.id}:${JSON.stringify({
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
  })}`;
  const cachedDeck = deckCache.get(deckKey);
  if (cachedDeck && cachedDeck.expiresAt > Date.now()) {
    return cachedDeck.apartments;
  }

  const candidates = (await getCandidates(config, apiKey))
    .filter((candidate) => candidateMatches(candidate, preferences))
    .slice(0, config.maxCandidates ?? 50);
  const cards = await mapWithConcurrency(candidates, 5, (candidate) =>
    fetchCandidateCard(config, candidate, preferences),
  );
  const apartments = cards.filter(
    (card): card is ApartmentCard => card !== null,
  );
  if (apartments.length > 0) {
    deckCache.set(deckKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

export function extractedCardFromHtml(
  config: ExtractedInventoryConfig,
  candidate: ContextListing,
  html: string,
  preferences: Preferences,
) {
  if (!candidate.url) return null;
  const entities = jsonLdFromHtml(html);
  const listing = entities.find((entry) =>
    hasSchemaType(entry["@type"], [
      "Apartment",
      "House",
      "Residence",
      "SingleFamilyResidence",
      "Product",
      "Accommodation",
    ]),
  );
  const offer =
    listing && isRecord(listing.offers)
      ? listing.offers
      : entities.find((entry) => hasSchemaType(entry["@type"], ["Offer"]));
  const price =
    numberValue(offer?.price) ??
    numberValue(
      isRecord(offer?.priceSpecification)
        ? offer.priceSpecification.price
        : null,
    ) ??
    candidate.price;
  const bedrooms =
    numberValue(listing?.numberOfBedrooms) ?? candidate.bedrooms;
  if (
    price === null ||
    bedrooms === null ||
    !matchesBedrooms(bedrooms, preferences.bedrooms) ||
    price < preferences.budgetMin ||
    price > preferences.budgetMax
  ) {
    return null;
  }

  const name =
    stringValue(listing?.name) ??
    candidate.name ??
    "San Francisco apartment";
  const description =
    stringValue(listing?.description) ??
    stringValue(decodeHtml(metaContent(html, "description") ?? "")) ??
    name;
  const pageText = `${textFromHtml(html)}\n${description}`;
  if (isRoomOrSro(`${name}\n${description}`)) return null;
  const describedBedrooms = numberValue(
    description.match(/\b(\d+)\s*[- ]bedrooms?\b/i)?.[1],
  );
  if (describedBedrooms !== null && describedBedrooms !== bedrooms) {
    return null;
  }

  const address =
    formatPostalAddress(listing?.address) ??
    candidate.address ??
    config.defaultAddress ??
    null;
  if (
    config.requireSanFranciscoAddress &&
    (!address || !/\bsan francisco\b/i.test(address))
  ) {
    return null;
  }

  const laundry = inferLaundry(pageText);
  const amenities = [
    ...structuredAmenityNames(listing?.amenityFeature),
    ...inferAmenities(pageText, laundry),
  ].filter((amenity, index, all) => all.indexOf(amenity) === index);
  const extracted: ExtractedApartment = {
    name,
    address,
    neighborhood:
      candidate.neighborhood ?? inferNeighborhood(`${address ?? ""} ${pageText}`),
    price,
    bedrooms,
    bathrooms:
      numberValue(listing?.numberOfBathroomsTotal) ??
      numberValue(listing?.numberOfBathrooms) ??
      candidate.bathrooms,
    squareFeet:
      floorSize(listing?.floorSize) ??
      candidate.squareFeet ??
      squareFeetFromText(pageText),
    availability: inferAvailability(offer, pageText),
    laundry,
    dishwasher: /\bdishwasher\b/i.test(pageText) ? true : null,
    petsAllowed: inferPetsAllowed(pageText, listing?.petsAllowed),
    amenities,
    description,
    caveats: [config.caveat],
  };
  const images = cleanImageUrls([
    ...imageValues(listing?.image),
    ...candidate.images,
    metaContent(html, "og:image") ?? "",
    ...imageUrlsFromHtml(html, candidate.url),
  ]);
  return createApartmentCard(
    {
      url: candidate.url,
      title: name,
      description,
    },
    extracted,
    images,
    preferences,
  );
}

async function getCandidates(
  config: ExtractedInventoryConfig,
  apiKey: string,
): Promise<ContextListing[]> {
  const cached = candidateCache.get(config.id);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;

  const activeRequest = candidateRequests.get(config.id);
  if (activeRequest) return activeRequest;

  const request = extractCandidates(config, apiKey);
  candidateRequests.set(config.id, request);
  try {
    return await request;
  } finally {
    if (candidateRequests.get(config.id) === request) {
      candidateRequests.delete(config.id);
    }
  }
}

async function extractCandidates(
  config: ExtractedInventoryConfig,
  apiKey: string,
): Promise<ContextListing[]> {
  const response = await requestContext("/web/extract", apiKey, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: config.inventoryUrl,
        schema: listingSchema(),
        instructions: config.instructions,
        factCheck: true,
        maxPages: 1,
        maxDepth: 0,
        maxAgeMs: 5 * 60 * 1000,
        waitForMs: 500,
        stopAfterMs: 40_000,
        timeoutMS: 50_000,
        tags: ["criblist", "production", config.id],
      }),
    },
    timeoutMs: 55_000,
    maxAttempts: 1,
  });
  const candidates =
    ExtractListingsResponseSchema.parse(response).data.listings;
  candidateCache.set(config.id, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    candidates,
  });
  return candidates;
}

async function fetchCandidateCard(
  config: ExtractedInventoryConfig,
  candidate: ContextListing,
  preferences: Preferences,
) {
  if (!candidate.url) return null;
  try {
    const html = await fetchPublicHtml(candidate.url, 8_000);
    return extractedCardFromHtml(config, candidate, html, preferences);
  } catch {
    return null;
  }
}

function candidateMatches(
  candidate: ContextListing,
  preferences: Preferences,
) {
  return Boolean(
    candidate.url &&
      candidate.name &&
      candidate.price !== null &&
      candidate.price >= preferences.budgetMin &&
      candidate.price <= preferences.budgetMax &&
      matchesBedrooms(candidate.bedrooms, preferences.bedrooms) &&
      !isRoomOrSro(candidate.name),
  );
}

function hasSchemaType(value: unknown, expected: string[]) {
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    (type) => typeof type === "string" && expected.includes(type),
  );
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replaceAll(",", "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function imageValues(value: unknown) {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((image): image is string => typeof image === "string")
    : [];
}

function structuredAmenityNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((amenity) => {
    if (!isRecord(amenity)) return [];
    const name = stringValue(amenity.name);
    return name ? [name] : [];
  });
}

function imageUrlsFromHtml(html: string, pageUrl: string) {
  return [
    ...html.matchAll(
      /(?:src|data-src|content)=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)/gi,
    ),
  ].flatMap((match) => {
    try {
      const value = decodeHtml(match[1]);
      const url = new URL(value, pageUrl);
      if (url.pathname === "/_next/image") {
        const source = url.searchParams.get("url");
        return source ? [new URL(source, pageUrl).toString()] : [];
      }
      return [url.toString()];
    } catch {
      return [];
    }
  });
}

function floorSize(value: unknown) {
  if (typeof value === "number") return value;
  if (!isRecord(value)) return null;
  return numberValue(value.value);
}

function squareFeetFromText(text: string) {
  return numberValue(
    text.match(/\b([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet)\b/i)?.[1],
  );
}

function inferAvailability(
  offer: Record<string, unknown> | undefined,
  text: string,
) {
  const availability = stringValue(offer?.availability);
  if (availability && /InStock|LimitedAvailability/i.test(availability)) {
    return "Available now";
  }
  return (
    text.match(/\bavailable (?:now|from [^\n]+|on [^\n]+)/i)?.[0] ?? null
  );
}

function inferLaundry(text: string): ExtractedApartment["laundry"] {
  if (
    /in-unit (?:washer|laundry)|washer\/dryer in unit|in unit laundry/i.test(
      text,
    )
  ) {
    return "in-unit";
  }
  if (/laundry in (?:the )?building|shared laundry|laundry facilities/i.test(text)) {
    return "in-building";
  }
  return /\bno laundry\b/i.test(text) ? "none" : "unknown";
}

function inferPetsAllowed(text: string, structuredValue: unknown) {
  if (/\bno pets?\b/i.test(text)) return false;
  if (/\bpet friendly|pets? (?:welcome|allowed)|cats? welcome|dogs? welcome\b/i.test(text)) {
    return true;
  }
  return typeof structuredValue === "boolean" ? structuredValue : null;
}

function inferAmenities(
  text: string,
  laundry: ExtractedApartment["laundry"],
) {
  return [
    /\bdishwasher\b/i.test(text) ? "Dishwasher" : null,
    /air conditioning|central air/i.test(text) ? "Air conditioning" : null,
    /garage parking|parking included/i.test(text) ? "Parking" : null,
    /balcony|private deck|patio|roof deck/i.test(text)
      ? "Outdoor space"
      : null,
    /\belevator\b/i.test(text) ? "Elevator" : null,
    laundry === "in-unit" ? "In-unit laundry" : null,
    laundry === "in-building" ? "Laundry in building" : null,
  ].filter((amenity): amenity is string => Boolean(amenity));
}

function isRoomOrSro(text: string) {
  return /\b(?:private|shared) room\b|\broom for rent\b|\bsro\b|single-room occupancy/i.test(
    text,
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
