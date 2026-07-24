import type {
  ApartmentCard,
  ExtractedApartment,
  ListingSource,
  Preferences,
} from "./schemas";

export function createApartmentCard(
  source: ListingSource,
  extracted: ExtractedApartment,
  images: string[],
  preferences: Preferences,
): ApartmentCard {
  const provider = new URL(source.url).hostname.replace(/^www\./, "");
  const cleanImages = cleanImageUrls(images).slice(0, 10);
  return {
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
    availability: extracted.availability,
    description: extracted.description ?? source.description,
    laundry: extracted.laundry,
    dishwasher: extracted.dishwasher,
    petsAllowed: extracted.petsAllowed,
    amenities: extracted.amenities.slice(0, 12),
    matchScore: calculateMatchScore(extracted, cleanImages, preferences),
    matchReasons: buildMatchReasons(extracted, preferences),
    catches: [
      ...extracted.caveats,
      ...buildCatches(extracted, preferences),
    ].slice(0, 4),
    preferenceFit: matchesBedrooms(extracted.bedrooms, preferences.bedrooms),
  };
}

export function rankApartments(
  apartments: ApartmentCard[],
  preferences: Preferences,
) {
  const qualityMatches = apartments.filter((apartment) =>
    passesQualityGate(apartment, preferences),
  );
  const coreMatches = apartments.filter((apartment) =>
    passesCoreGate(apartment, preferences),
  );
  const pool = qualityMatches.length > 0 ? qualityMatches : coreMatches;
  const ranked = pool
    .map((apartment) => ({
      ...apartment,
      matchScore: Math.min(apartment.matchScore, completenessScore(apartment)),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);

  return {
    apartments: diversifyApartments(ranked).slice(0, 8),
    qualityMatches: qualityMatches.length,
    coreMatches: coreMatches.length,
    relaxed: qualityMatches.length === 0 && coreMatches.length > 0,
  };
}

export function dedupeApartments(apartments: ApartmentCard[]) {
  const seen = new Set<string>();
  return apartments.filter((apartment) => {
    const key = normalizeListingUrl(apartment.url) ?? apartment.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countByProvider(apartments: ApartmentCard[]) {
  return apartments.reduce<Record<string, number>>(
    (counts, apartment) => ({
      ...counts,
      [apartment.provider ?? "unknown"]:
        (counts[apartment.provider ?? "unknown"] ?? 0) + 1,
    }),
    {},
  );
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

export function inferNeighborhood(text: string) {
  const neighborhoods = [
    "Mission Bay",
    "Mission",
    "SoMa",
    "South of Market",
    "North Beach",
    "Nob Hill",
    "Russian Hill",
    "Pacific Heights",
    "Marina",
    "Hayes Valley",
    "Lower Haight",
    "Duboce Triangle",
    "Noe Valley",
    "Castro",
    "Dogpatch",
    "Potrero Hill",
    "Inner Sunset",
    "Outer Sunset",
    "Richmond",
    "Tenderloin",
  ];
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
      if (/(logo|icon|avatar|favicon|sprite|badge|pixel|tracking|map)/i.test(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    } catch {
      return false;
    }
  });
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
  if (apartment.laundry !== "unknown" && apartment.laundry !== "none") score += 4;
  if (images.length >= 3) score += 5;
  if (apartment.squareFeet !== null) score += 3;
  return Math.min(score, 100);
}

function buildMatchReasons(
  apartment: ExtractedApartment,
  preferences: Preferences,
) {
  return [
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
    apartment.neighborhood &&
    !preferences.neighborhoods.some((neighborhood) =>
      apartment.neighborhood?.toLowerCase().includes(neighborhood.toLowerCase()),
    )
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
  return true;
}

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
  return selected;
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
