import { filterAvailableListings } from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  matchesBedrooms,
} from "./ranking";
import type { ApartmentCard, Preferences } from "./schemas";

type Property = {
  property_post_link?: string;
  property_name?: string;
  property_description?: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_zip?: string;
  property_primary_neighborhood_post_name?: string;
  property_availability_matrix?: string;
  property_gallery_images?: string;
  property_features?: string;
  property_community_amenities?: string;
  property_pet_policy?: string;
};

type Candidate = {
  url: string;
  name: string;
  address: string;
  neighborhood: string | null;
  price: number;
  bedrooms: number;
  description: string;
  images: string[];
};

const globalCache = globalThis as typeof globalThis & {
  criblistMosserDeckCache?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
  criblistMosserFeedCache?: Map<
    string,
    { expiresAt: number; candidates: Candidate[] }
  >;
};
const deckCache: Map<
  string,
  { expiresAt: number; apartments: ApartmentCard[] }
> = globalCache.criblistMosserDeckCache ?? new Map();
const feedCache: Map<
  string,
  { expiresAt: number; candidates: Candidate[] }
> = globalCache.criblistMosserFeedCache ?? new Map();
globalCache.criblistMosserDeckCache = deckCache;
globalCache.criblistMosserFeedCache = feedCache;

export async function discoverMosserListings(preferences: Preferences) {
  const cacheKey = JSON.stringify({
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
    bathroomsMin: preferences.bathroomsMin,
  });
  const cached = deckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const candidates = await getCandidates(preferences);
  const candidatesInBudget = candidates
    .filter(
      (candidate) =>
        candidate.price >= preferences.budgetMin &&
        candidate.price <= preferences.budgetMax,
    )
    .slice(0, 24);
  const liveCandidates = await filterAvailableListings(candidatesInBudget);
  const apartments = liveCandidates
    .slice(0, 16)
    .map((candidate) => createCard(candidate, preferences));
  if (apartments.length > 0) {
    deckCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

async function getCandidates(preferences: Preferences) {
  const feedUrl = feedUrlFor(preferences.bedrooms);
  const cached = feedCache.get(feedUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;

  const response = await fetch(feedUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Mosser returned ${response.status}.`);
  const encodedProperties = (await response.text()).match(
    /data-properties='([\s\S]*?)'\s+data-options=/i,
  )?.[1];
  if (!encodedProperties) return [];

  const properties = JSON.parse(
    decodeHtmlAttribute(encodedProperties),
  ) as Property[];
  const candidates = properties.flatMap((property) =>
    propertyCandidates(property, preferences),
  );
  feedCache.set(feedUrl, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    candidates,
  });
  return candidates;
}

function feedUrlFor(bedrooms: Preferences["bedrooms"]) {
  if (bedrooms === "studio") {
    return "https://www.mosserliving.com/san-francisco-apartments/studio/";
  }
  if (bedrooms === "1") {
    return "https://www.mosserliving.com/san-francisco-apartments/1-bed/";
  }
  if (bedrooms === "2") {
    return "https://www.mosserliving.com/san-francisco-apartments/2-bed/";
  }
  return "https://www.mosserliving.com/san-francisco-apartments/all/";
}

function propertyCandidates(property: Property, preferences: Preferences) {
  if (
    !property.property_post_link ||
    !property.property_name ||
    property.property_city !== "San Francisco"
  ) {
    return [];
  }
  const url = property.property_post_link;
  const name = property.property_name;
  const availability = parseRecord(property.property_availability_matrix);
  const images = parseImages(property.property_gallery_images);
  const features = [
    ...parseStrings(property.property_features),
    ...parseStrings(property.property_community_amenities),
  ];

  return Object.entries(availability).flatMap(([key, value]) => {
    const bedrooms = Number(key.match(/^(\d+)bed$/)?.[1]);
    if (
      !Number.isFinite(bedrooms) ||
      !matchesBedrooms(bedrooms, preferences.bedrooms) ||
      !isAvailability(value) ||
      !value.available ||
      images.length === 0
    ) {
      return [];
    }
    return [
      {
        url,
        name,
        address: [
          property.property_address,
          property.property_city,
          property.property_state,
          property.property_zip,
        ]
          .filter(Boolean)
          .join(", "),
        neighborhood: property.property_primary_neighborhood_post_name ?? null,
        price: value.price,
        bedrooms,
        description: [
          property.property_description,
          features.join(", "),
          property.property_pet_policy,
        ]
          .filter(Boolean)
          .join(" "),
        images,
      },
    ];
  });
}

function createCard(candidate: Candidate, preferences: Preferences) {
  const laundry = /laundry facilities/i.test(candidate.description)
    ? "in-building" as const
    : "unknown" as const;
  const petsAllowed = /pets? (?:allowed|welcome)|pet friendly/i.test(
    candidate.description,
  )
    ? true
    : null;
  const dishwasher = /dishwasher/i.test(candidate.description) ? true : null;
  const amenities = [
    dishwasher ? "Dishwasher" : null,
    /elevator/i.test(candidate.description) ? "Elevator" : null,
    /garage|parking included/i.test(candidate.description) ? "Parking" : null,
    /balcony|private deck|patio|backyard|courtyard|rooftop terrace/i.test(
      candidate.description,
    )
      ? "Outdoor space"
      : null,
    laundry === "in-building" ? "Laundry in building" : null,
    petsAllowed ? "Pet friendly" : null,
  ].filter((amenity): amenity is string => Boolean(amenity));

  return createApartmentCard(
    {
      url: candidate.url,
      title: candidate.name,
      description: candidate.description,
    },
    {
      name: candidate.name,
      address: candidate.address,
      neighborhood: candidate.neighborhood,
      price: candidate.price,
      bedrooms: candidate.bedrooms,
      bathrooms: null,
      squareFeet: null,
      availability: "Available now",
      laundry,
      dishwasher,
      petsAllowed,
      amenities,
      description: candidate.description,
      caveats: ["Live Mosser inventory. Verify availability before applying."],
    },
    candidate.images,
    preferences,
  );
}

function isAvailability(
  value: unknown,
): value is { price: number; available: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { price?: unknown }).price === "number" &&
    typeof (value as { available?: unknown }).available === "boolean"
  );
}

function parseRecord(value?: string) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStrings(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseImages(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<{ url?: unknown }>;
    return cleanImageUrls(
      parsed.flatMap((image) =>
        typeof image.url === "string" ? [image.url] : [],
      ),
    ).slice(0, 10);
  } catch {
    return [];
  }
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
