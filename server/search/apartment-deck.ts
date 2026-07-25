import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";
import {
  matchApartmentToPreferences,
  matchesBedrooms,
} from "./listing-card";

export type ApartmentDeck = {
  apartments: ApartmentCard[];
  analyzed: number;
  discoveredSources: Record<string, number>;
  deckSources: Record<string, number>;
  qualityMatches: number;
  coreMatches: number;
  relaxed: boolean;
};

export function buildApartmentDeck(
  apartments: ApartmentCard[],
  preferences: Preferences,
  options: {
    excludedUrls?: string[];
    now?: Date;
  } = {},
): ApartmentDeck {
  const matched = apartments.map((apartment) =>
    matchApartmentToPreferences(apartment, preferences, options.now),
  );
  const eligible = uniqueApartments(
    excludeApartments(matched, options.excludedUrls ?? []),
  );
  const qualityMatches = eligible.filter((apartment) =>
    passesQualityGate(apartment, preferences),
  );
  const coreMatches = eligible.filter((apartment) =>
    passesCoreGate(apartment, preferences),
  );
  const strict = hasStrictPreferences(preferences);
  const pool =
    qualityMatches.length > 0
      ? qualityMatches
      : strict
        ? []
        : coreMatches;
  const ranked = pool
    .map((apartment) => ({
      ...apartment,
      matchScore: Math.min(apartment.matchScore, completenessScore(apartment)),
    }))
    .sort((first, second) => second.matchScore - first.matchScore);
  const deck = diversifyApartments(ranked).slice(0, 8);

  return {
    apartments: deck,
    analyzed: eligible.length,
    discoveredSources: countByProvider(eligible),
    deckSources: countByProvider(deck),
    qualityMatches: qualityMatches.length,
    coreMatches: coreMatches.length,
    relaxed:
      !strict && qualityMatches.length === 0 && coreMatches.length > 0,
  };
}

export function mergeApartmentInventory(apartments: ApartmentCard[]) {
  return uniqueApartments(apartments);
}

function uniqueApartments(apartments: ApartmentCard[]) {
  const seenUrls = new Set<string>();
  const seenListings = new Set<string>();
  return apartments.filter((apartment) => {
    const urlKey = normalizeListingUrl(apartment.url) ?? apartment.url;
    const listingKey = listingFingerprint(apartment);
    if (
      seenUrls.has(urlKey) ||
      (listingKey !== null && seenListings.has(listingKey))
    ) {
      return false;
    }
    seenUrls.add(urlKey);
    if (listingKey !== null) seenListings.add(listingKey);
    return true;
  });
}

function excludeApartments(
  apartments: ApartmentCard[],
  excludedUrls: string[],
) {
  if (excludedUrls.length === 0) return apartments;

  const normalizedExcludedUrls = new Set(
    excludedUrls.map((url) => normalizeListingUrl(url) ?? url),
  );
  const excludedFingerprints = new Set(
    apartments.flatMap((apartment) => {
      const normalizedUrl =
        normalizeListingUrl(apartment.url) ?? apartment.url;
      if (!normalizedExcludedUrls.has(normalizedUrl)) return [];
      const fingerprint = listingFingerprint(apartment);
      return fingerprint ? [fingerprint] : [];
    }),
  );

  return apartments.filter((apartment) => {
    const normalizedUrl = normalizeListingUrl(apartment.url) ?? apartment.url;
    if (normalizedExcludedUrls.has(normalizedUrl)) return false;
    const fingerprint = listingFingerprint(apartment);
    return !fingerprint || !excludedFingerprints.has(fingerprint);
  });
}

function countByProvider(apartments: ApartmentCard[]) {
  return apartments.reduce<Record<string, number>>((counts, apartment) => {
    const provider = apartment.provider ?? "unknown";
    counts[provider] = (counts[provider] ?? 0) + 1;
    return counts;
  }, {});
}

function passesQualityGate(
  apartment: ApartmentCard,
  preferences: Preferences,
) {
  if (!passesCoreGate(apartment, preferences)) return false;
  if (
    apartment.bathrooms !== null &&
    apartment.bathrooms < preferences.bathroomsMin
  ) {
    return false;
  }
  if (apartment.bathrooms === null && preferences.bathroomsMin > 1) return false;
  if (
    preferences.neighborhoods.length > 0 &&
    (!apartment.neighborhood ||
      !preferences.neighborhoods.some((neighborhood) =>
        apartment.neighborhood
          ?.toLowerCase()
          .includes(neighborhood.toLowerCase()),
      ))
  ) {
    return false;
  }
  if (
    preferences.minSquareFeet > 0 &&
    (apartment.squareFeet === null ||
      apartment.squareFeet < preferences.minSquareFeet)
  ) {
    return false;
  }
  if (preferences.laundry === "in-unit" && apartment.laundry !== "in-unit") {
    return false;
  }
  if (
    preferences.laundry === "in-building" &&
    apartment.laundry !== "in-unit" &&
    apartment.laundry !== "in-building"
  ) {
    return false;
  }
  if (preferences.dishwasher && apartment.dishwasher !== true) return false;
  if (preferences.pets && apartment.petsAllowed !== true) return false;
  if (
    preferences.entireUnit &&
    isSharedUnitListing(`${apartment.name}\n${apartment.description ?? ""}`)
  ) {
    return false;
  }
  return true;
}

function hasStrictPreferences(preferences: Preferences) {
  return (
    preferences.bathroomsMin > 1 ||
    preferences.neighborhoods.length > 0 ||
    preferences.laundry !== "any" ||
    preferences.dishwasher ||
    preferences.pets ||
    preferences.entireUnit ||
    preferences.minSquareFeet > 0
  );
}

/**
 * Detects listings that offer a bedroom inside an occupied home (joining an
 * existing lease) rather than an entire unit. Ingestion already hard-drops
 * blatant "room for rent" posts, so this catches the subtler shared-housing
 * language that survives into cards, including cached ones.
 */
function isSharedUnitListing(text: string) {
  return SHARED_UNIT_PATTERNS.some((pattern) => pattern.test(text));
}

const SHARED_UNIT_PATTERNS = [
  /\b(?:private|shared|furnished) (?:bed)?rooms?\b/i,
  /\brooms? (?:for rent|to rent|for lease|available)\b/i,
  // "bedroom in a 3 bed apartment" — but not "living room in a 3 bed".
  /(?<!\b(?:living|dining|family|sun|bonus|laundry|media|rec) )\b(?:bed)?room in an? (?:\d+|two|three|four|five|six)[ -]*(?:bed(?:room)?s?|br|bd)\b/i,
  /\bsros?\b|single[- ]room occupancy/i,
  /\bco-?living\b/i,
  /\b(?:room|house|flat)mates? (?:wanted|needed)\b/i,
  /\blooking for an? (?:new )?(?:room|house|flat)mate\b/i,
  /\bjoin (?:our|the|an existing) (?:lease|household|apartment|flat|home)\b/i,
  /\bshared (?:apartment|house|flat|home|unit|housing|living space)\b/i,
];

function passesCoreGate(apartment: ApartmentCard, preferences: Preferences) {
  if (apartment.images.length === 0) return false;
  if (
    apartment.price === null ||
    apartment.price < preferences.budgetMin ||
    apartment.price > preferences.budgetMax
  ) {
    return false;
  }
  if (!matchesBedrooms(apartment.bedrooms, preferences.bedrooms)) return false;
  if (
    /\b(just rented|unavailable|leased|no longer available)\b/i.test(
      `${apartment.name} ${apartment.availability ?? ""} ${apartment.description ?? ""}`,
    )
  ) {
    return false;
  }
  return true;
}

function completenessScore(apartment: ApartmentCard) {
  const signals = [
    Boolean(apartment.address),
    Boolean(apartment.neighborhood),
    apartment.squareFeet !== null,
    apartment.laundry !== "unknown",
    apartment.availability !== null,
    apartment.amenities.length >= 2,
    apartment.images.length >= 3,
  ];
  return 65 + signals.filter(Boolean).length * 5;
}

function diversifyApartments(apartments: ApartmentCard[]) {
  const independent: ApartmentCard[] = [];
  const craigslist: ApartmentCard[] = [];
  const providerCounts = new Map<string, number>();

  apartments.forEach((apartment) => {
    const provider = apartment.provider ?? "unknown";
    if (/craigslist\.org$/i.test(provider)) {
      if (craigslist.length < 2) craigslist.push(apartment);
      return;
    }

    const count = providerCounts.get(provider) ?? 0;
    if (count < 2) {
      providerCounts.set(provider, count + 1);
      independent.push(apartment);
    }
  });

  const selected: ApartmentCard[] = [];
  const depth = Math.max(independent.length, craigslist.length);
  for (let index = 0; index < depth; index += 1) {
    if (independent[index]) selected.push(independent[index]);
    if (craigslist[index]) selected.push(craigslist[index]);
  }
  const selectedUrls = new Set(selected.map((apartment) => apartment.url));
  return [
    ...selected,
    ...apartments.filter((apartment) => !selectedUrls.has(apartment.url)),
  ];
}

function normalizeListingUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(
      (key) => url.searchParams.delete(key),
    );
    return url.toString();
  } catch {
    return null;
  }
}

function listingFingerprint(apartment: ApartmentCard) {
  if (!apartment.address || apartment.price === null) return null;
  const address = apartment.address
    .toLowerCase()
    .replace(/\b(?:apt|apartment|unit|#)\s*[\w-]+\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!/\d/.test(address)) return null;
  return [address, apartment.bedrooms ?? "unknown"].join("|");
}
