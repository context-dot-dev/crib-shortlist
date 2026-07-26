import {
  htmlPath,
  markdownPath,
  requestContext,
} from "./context-client";
import {
  fetchPublicHtml,
  listingPublishedAtFromHtml,
  mapWithConcurrency,
  metaContent,
  textFromHtml,
} from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  matchesBedrooms,
} from "./listing-card";
import {
  HtmlResponseSchema,
  ListingSnapshotSchema,
  type ExtractedApartment,
} from "./schemas";
import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";

const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const DECK_CACHE_TTL_MS = 5 * 60 * 1000;

type StreetEasyCandidate = {
  name: string;
  url: string;
  propertyType: string;
  neighborhood: string;
  price: number;
  bedrooms: number;
  bathrooms: number | null;
  squareFeet: number | null;
};

const globalStreetEasyCache = globalThis as typeof globalThis & {
  criblistStreetEasySearches?: Map<
    string,
    { expiresAt: number; candidates: StreetEasyCandidate[] }
  >;
  criblistStreetEasySearchRequests?: Map<
    string,
    Promise<StreetEasyCandidate[]>
  >;
  criblistStreetEasyDecks?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};

const searchCache: Map<
  string,
  { expiresAt: number; candidates: StreetEasyCandidate[] }
> =
  globalStreetEasyCache.criblistStreetEasySearches ?? new Map();
const searchRequests: Map<string, Promise<StreetEasyCandidate[]>> =
  globalStreetEasyCache.criblistStreetEasySearchRequests ?? new Map();
const deckCache: Map<
  string,
  { expiresAt: number; apartments: ApartmentCard[] }
> =
  globalStreetEasyCache.criblistStreetEasyDecks ?? new Map();
globalStreetEasyCache.criblistStreetEasySearches = searchCache;
globalStreetEasyCache.criblistStreetEasySearchRequests = searchRequests;
globalStreetEasyCache.criblistStreetEasyDecks = deckCache;

export async function discoverStreetEasyListings(
  preferences: Preferences,
  apiKey: string,
) {
  const searchUrl = buildStreetEasySearchUrl(preferences);
  const deckKey = `${searchUrl}:${preferences.neighborhoods.join("|")}`;
  const cachedDeck = deckCache.get(deckKey);
  if (cachedDeck && cachedDeck.expiresAt > Date.now()) {
    return cachedDeck.apartments;
  }

  const candidates = (await streetEasyCandidates(searchUrl, apiKey))
    .filter(
      (candidate) =>
        candidate.price >= preferences.budgetMin &&
        candidate.price <= preferences.budgetMax &&
        matchesBedrooms(candidate.bedrooms, preferences.bedrooms),
    )
    .filter(
      (candidate) =>
        preferences.neighborhoods.length === 0 ||
        preferences.neighborhoods.some((neighborhood) =>
          candidate.neighborhood
            .toLowerCase()
            .includes(neighborhood.toLowerCase()),
        ),
    )
    .slice(0, 24);
  const cards = await mapWithConcurrency(candidates, 5, (candidate) =>
    fetchStreetEasyCard(candidate, preferences, apiKey),
  );
  const apartments = cards.filter(
    (card): card is ApartmentCard => card !== null,
  );
  if (apartments.length > 0) {
    deckCache.set(deckKey, {
      expiresAt: Date.now() + DECK_CACHE_TTL_MS,
      apartments,
    });
  }
  return apartments;
}

export function buildStreetEasySearchUrl(preferences: Preferences) {
  const bedroomRoute =
    preferences.bedrooms === "studio"
      ? "studios-for-rent"
      : `${preferences.bedrooms === "3+" ? "3" : preferences.bedrooms}-bedroom-apartments-for-rent`;
  return `https://streeteasy.com/${bedroomRoute}/nyc/price:${preferences.budgetMin}-${preferences.budgetMax}`;
}

export function extractStreetEasyCandidates(markdown: string) {
  const listingPattern =
    /^- ([^\n]+) in ([^\n]+)\n\n\s*\[([^\]]+)\]\((https:\/\/streeteasy\.com\/building\/[^)\s]+)\)/gm;
  const matches = [...markdown.matchAll(listingPattern)];
  const candidates = matches.flatMap((match, index) => {
    const block = markdown.slice(
      match.index,
      matches[index + 1]?.index ?? markdown.length,
    );
    const price = moneyValue(
      block.match(/^\s*\$([\d,]+)\s*$/m)?.[1] ?? null,
    );
    const bedroomLabel = block.match(
      /^\s*-\s*(Studio|\d+(?:\.\d+)?\s+beds?)\s*$/im,
    )?.[1];
    const bedrooms = /studio/i.test(bedroomLabel ?? "")
      ? 0
      : numberValue(bedroomLabel ?? null);
    if (price === null || bedrooms === null) return [];

    return [
      {
        name: match[3].trim(),
        url: canonicalStreetEasyUrl(match[4]),
        propertyType: match[1].trim(),
        neighborhood: match[2].trim(),
        price,
        bedrooms,
        bathrooms: numberValue(
          block.match(
            /^\s*-\s*(\d+(?:\.\d+)?)\s+baths?\s*$/im,
          )?.[1] ?? null,
        ),
        squareFeet: numberValue(
          block.match(
            /^\s*-\s*([\d,]+)\s*ft²\s*$/im,
          )?.[1] ?? null,
        ),
      },
    ];
  });
  return [
    ...new Map(
      candidates.map((candidate) => [candidate.url, candidate]),
    ).values(),
  ];
}

export function isRemovedStreetEasyListing(text: string) {
  return /\b(?:this listing is no longer available|no longer on the market|listing has been rented)\b/i.test(
    text,
  );
}

export async function removedStreetEasyListingUrls(urls: string[]) {
  const checks = await mapWithConcurrency(urls, 5, async (url) => {
    try {
      const html = await fetchPublicHtml(url, 8_000);
      return isRemovedStreetEasyListing(textFromHtml(html)) ? url : null;
    } catch {
      return null;
    }
  });
  return checks.filter((url): url is string => url !== null);
}

async function streetEasyCandidates(searchUrl: string, apiKey: string) {
  const cached = searchCache.get(searchUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;
  const activeRequest = searchRequests.get(searchUrl);
  if (activeRequest) return activeRequest;

  const request = fetchStreetEasyCandidates(searchUrl, apiKey);
  searchRequests.set(searchUrl, request);
  try {
    const candidates = await request;
    if (candidates.length > 0) {
      searchCache.set(searchUrl, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        candidates,
      });
    }
    return candidates;
  } finally {
    if (searchRequests.get(searchUrl) === request) {
      searchRequests.delete(searchUrl);
    }
  }
}

async function fetchStreetEasyCandidates(
  searchUrl: string,
  apiKey: string,
) {
  const response = await requestContext(
    markdownPath(searchUrl, {
      maxAgeMs: 30 * 60 * 1000,
      waitForMs: 500,
      timeoutMs: 25_000,
    }),
    apiKey,
    { timeoutMs: 30_000, maxAttempts: 1 },
  );
  return extractStreetEasyCandidates(
    ListingSnapshotSchema.parse(response).markdown,
  );
}

async function fetchStreetEasyCard(
  candidate: StreetEasyCandidate,
  preferences: Preferences,
  apiKey: string,
) {
  try {
    const html = await streetEasyDetailHtml(candidate.url, apiKey);
    const pageText = textFromHtml(html);
    if (isRemovedStreetEasyListing(pageText)) {
      return null;
    }
    const images = streetEasyImages(html);
    if (images.length === 0) return null;
    const description =
      metaContent(html, "description") ??
      `${candidate.propertyType} in ${candidate.neighborhood}.`;
    const laundry = inferLaundry(`${pageText}\n${description}`);
    const extracted: ExtractedApartment = {
      name: candidate.name,
      address: `${candidate.name}, New York, NY`,
      neighborhood: candidate.neighborhood,
      price: candidate.price,
      bedrooms: candidate.bedrooms,
      bathrooms: candidate.bathrooms,
      squareFeet: candidate.squareFeet,
      availability: "Available now",
      laundry,
      dishwasher: /\bdishwasher\b/i.test(pageText) ? true : null,
      petsAllowed: inferPets(pageText),
      amenities: inferAmenities(pageText, laundry),
      description,
      caveats: [
        "Live StreetEasy inventory. Verify availability before applying.",
      ],
    };
    return createApartmentCard(
      {
        url: candidate.url,
        title: candidate.name,
        description,
      },
      extracted,
      images,
      preferences,
      listingPublishedAtFromHtml(html),
    );
  } catch {
    return null;
  }
}

async function streetEasyDetailHtml(url: string, apiKey: string) {
  try {
    return await fetchPublicHtml(url, 12_000);
  } catch {
    const response = await requestContext(
      htmlPath(url, {
        maxAgeMs: 10 * 60 * 1000,
        waitForMs: 500,
        timeoutMs: 30_000,
      }),
      apiKey,
      { timeoutMs: 35_000, maxAttempts: 1 },
    );
    return HtmlResponseSchema.parse(response).html;
  }
}

function streetEasyImages(html: string) {
  return cleanImageUrls([
    metaContent(html, "og:image") ?? "",
    ...(html.match(
      /https:\/\/photos\.zillowstatic\.com\/fp\/[^"'\\\s<]+?-se_extra_large_1500_800\.(?:webp|jpe?g|png)/gi,
    ) ?? []),
  ]).slice(0, 10);
}

function inferLaundry(text: string): ExtractedApartment["laundry"] {
  if (/in[- ]unit laundry|washer.?dryer in unit/i.test(text)) {
    return "in-unit";
  }
  if (/laundry in building|laundry room|shared laundry/i.test(text)) {
    return "in-building";
  }
  return "unknown";
}

function inferPets(text: string) {
  if (/\bno pets?\b/i.test(text)) return false;
  if (/\bpets? allowed\b|\bpet friendly\b/i.test(text)) return true;
  return null;
}

function inferAmenities(
  text: string,
  laundry: ExtractedApartment["laundry"],
) {
  return [
    /\bdishwasher\b/i.test(text) ? "Dishwasher" : null,
    /\belevator\b/i.test(text) ? "Elevator" : null,
    /\bdoorman\b/i.test(text) ? "Doorman" : null,
    /\bgym\b|\bfitness center\b/i.test(text) ? "Gym" : null,
    /roof deck|private terrace|balcony|outdoor space/i.test(text)
      ? "Outdoor space"
      : null,
    laundry === "in-unit" ? "In-unit laundry" : null,
    laundry === "in-building" ? "Laundry in building" : null,
  ].filter((amenity): amenity is string => amenity !== null);
}

function canonicalStreetEasyUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function moneyValue(value: string | null) {
  return numberValue(value);
}

function numberValue(value: string | null) {
  if (!value) return null;
  const number = Number(value.replaceAll(",", "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}
