import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";
import { CITY_CONFIG, type CityId } from "../../shared/cities";
import type {
  ExtractedApartment,
  ListingSource,
} from "./schemas";

export function createApartmentCard(
  source: ListingSource,
  extracted: ExtractedApartment,
  images: string[],
  preferences: Preferences,
  listedAt: string | null = null,
): ApartmentCard {
  const provider = new URL(source.url).hostname.replace(/^www\./, "");
  const cleanImages = cleanImageUrls(images).slice(0, 10);
  const availability = formatAvailability(extracted.availability);
  const normalizedListedAt = normalizeListedAt(listedAt);
  return {
    city: preferences.city,
    name: extracted.name ?? source.title,
    url: source.url,
    provider,
    images: cleanImages,
    price: extracted.price,
    bedrooms: extracted.bedrooms,
    bathrooms: extracted.bathrooms,
    neighborhood: extracted.neighborhood,
    address: extracted.address,
    squareFeet: extracted.squareFeet,
    floorLevel: null,
    availability,
    listedAt: normalizedListedAt,
    description: extracted.description ?? source.description,
    laundry: extracted.laundry,
    dishwasher: extracted.dishwasher,
    petsAllowed: extracted.petsAllowed,
    amenities: extracted.amenities.slice(0, 12),
    matchScore: calculateMatchScore(extracted, cleanImages, preferences),
    matchReasons: buildMatchReasons(
      { ...extracted, availability },
      preferences,
      normalizedListedAt,
    ),
    catches: [
      ...extracted.caveats,
      ...buildCatches(extracted, preferences),
    ].slice(0, 4),
    preferenceFit: matchesBedrooms(extracted.bedrooms, preferences.bedrooms),
  };
}

export function matchApartmentToPreferences(
  apartment: ApartmentCard,
  preferences: Preferences,
  now = new Date(),
): ApartmentCard {
  const extracted = extractedApartmentFromCard(apartment);
  const scamPenalty = apartment.catches.some((catchText) =>
    /suspicious contact or payment wording/i.test(catchText),
  )
    ? 18
    : 0;
  const sourceCatches = apartment.catches.filter(
    (catchText) => !isPreferenceCatch(catchText),
  );
  const availability = formatAvailability(extracted.availability, now);

  return {
    ...apartment,
    availability,
    matchScore: Math.max(
      0,
      calculateMatchScore(extracted, apartment.images, preferences) -
        scamPenalty,
    ),
    matchReasons: buildMatchReasons(
      { ...extracted, availability },
      preferences,
      apartment.listedAt,
      now,
    ),
    catches: [
      ...sourceCatches,
      ...buildCatches(extracted, preferences),
    ].slice(0, 4),
    preferenceFit: matchesBedrooms(apartment.bedrooms, preferences.bedrooms),
  };
}

export function matchesBedrooms(
  actual: number | null,
  requested: Preferences["bedrooms"],
) {
  if (actual === null) return false;
  if (requested === "studio") return actual === 0;
  if (requested === "3+") return actual >= 3;
  return actual === Number(requested);
}

export function inferNeighborhood(text: string, city: CityId = "sf") {
  const neighborhoods = CITY_CONFIG[city].neighborhoods;
  return (
    neighborhoods.find((neighborhood) =>
      text.toLowerCase().includes(neighborhood.toLowerCase()),
    ) ?? null
  );
}

export function cleanImageUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls.filter((rawUrl) => {
    try {
      const url = new URL(rawUrl);
      const normalized = url.toString();
      if (!url.protocol.startsWith("http") || seen.has(normalized)) return false;
      if (
        /(logo|icon|avatar|favicon|sprite|badge|pixel|tracking|map|coming[_-]?soon|no[_-]?photo)/i.test(
          normalized,
        )
      ) {
        return false;
      }
      seen.add(normalized);
      return true;
    } catch {
      return false;
    }
  });
}

function extractedApartmentFromCard(
  apartment: ApartmentCard,
): ExtractedApartment {
  return {
    name: apartment.name,
    address: apartment.address,
    neighborhood: apartment.neighborhood,
    price: apartment.price,
    bedrooms: apartment.bedrooms,
    bathrooms: apartment.bathrooms,
    squareFeet: apartment.squareFeet,
    availability: apartment.availability,
    laundry: apartment.laundry,
    dishwasher: apartment.dishwasher,
    petsAllowed: apartment.petsAllowed,
    amenities: apartment.amenities,
    description: apartment.description,
    caveats: [],
  };
}

function isPreferenceCatch(catchText: string) {
  return [
    "Bathroom count is unverified",
    "Square footage is unverified",
    "Laundry is unverified",
    "Dishwasher is unverified",
    "Pet policy is unverified",
  ].includes(catchText);
}

function formatAvailability(
  availability: string | null,
  now = new Date(),
) {
  if (!availability) return availability;
  const timestamp = Date.parse(availability);
  if (!Number.isFinite(timestamp)) return availability;

  const availableDate = new Date(timestamp);
  if (timestamp <= now.getTime()) return "Available now";
  const includeYear = availableDate.getFullYear() !== now.getFullYear();
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(availableDate);
  return `Available ${formattedDate}`;
}

function calculateMatchScore(
  apartment: ExtractedApartment,
  images: string[],
  preferences: Preferences,
) {
  let score = 45;
  if (matchesBedrooms(apartment.bedrooms, preferences.bedrooms)) score += 20;
  if (apartment.price !== null && apartment.price <= preferences.budgetMax) {
    score += 15;
  }
  if (
    apartment.bathrooms !== null &&
    apartment.bathrooms >= preferences.bathroomsMin
  ) {
    score += 8;
  }
  if (apartment.laundry !== "unknown" && apartment.laundry !== "none") {
    score += 4;
  }
  if (images.length >= 3) score += 5;
  if (apartment.squareFeet !== null) score += 3;
  return Math.min(score, 100);
}

function buildMatchReasons(
  apartment: ExtractedApartment,
  preferences: Preferences,
  listedAt: string | null,
  now = new Date(),
) {
  return [
    listedAgeLabel(listedAt, now),
    matchesBedrooms(apartment.bedrooms, preferences.bedrooms)
      ? "Correct bedroom count"
      : null,
    apartment.price !== null && apartment.price <= preferences.budgetMax
      ? "Within budget"
      : null,
    apartment.laundry === "in-unit" ? "In-unit laundry" : null,
    apartment.laundry === "in-building" ? "Laundry in building" : null,
    apartment.availability,
  ]
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, 4);
}

export function normalizeListedAt(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > Date.now() + 24 * 60 * 60 * 1000) return null;
  return new Date(timestamp).toISOString();
}

function listedAgeLabel(listedAt: string | null, now: Date) {
  if (!listedAt) return null;
  const timestamp = Date.parse(listedAt);
  if (!Number.isFinite(timestamp)) return null;
  const ageHours = Math.max(0, (now.getTime() - timestamp) / (60 * 60 * 1000));
  if (ageHours < 24) return "Listed today";
  const ageDays = Math.floor(ageHours / 24);
  return `Listed ${ageDays} ${ageDays === 1 ? "day" : "days"} ago`;
}

function buildCatches(
  apartment: ExtractedApartment,
  preferences: Preferences,
) {
  return [
    apartment.bathrooms === null ? "Bathroom count is unverified" : null,
    apartment.squareFeet === null ? "Square footage is unverified" : null,
    apartment.laundry === "unknown" ? "Laundry is unverified" : null,
    preferences.dishwasher && apartment.dishwasher !== true
      ? "Dishwasher is unverified"
      : null,
    preferences.pets && apartment.petsAllowed !== true
      ? "Pet policy is unverified"
      : null,
  ].filter((catchText): catchText is string => Boolean(catchText));
}
