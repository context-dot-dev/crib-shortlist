import { filterAvailableListings } from "./html";
import { createApartmentCard, matchesBedrooms } from "./ranking";
import type { ApartmentCard, Preferences } from "./schemas";

const ALGOLIA_APP_ID = "R132TNFQIJ";
const ALGOLIA_SEARCH_KEY = "26692e052b7a312a8f25b8d158606ae1";
const ALGOLIA_INDEX = "bricktimber_byvyxl_units";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

const globalCache = globalThis as typeof globalThis & {
  criblistRentBtCache?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};
const rentBtCache = globalCache.criblistRentBtCache ?? new Map();
globalCache.criblistRentBtCache = rentBtCache;

type RentBtPhoto = {
  full_url?: unknown;
  reference_url?: unknown;
};

type RentBtHit = {
  permalink?: unknown;
  propertyName?: unknown;
  propertyAddress?: unknown;
  propertyDescription?: unknown;
  propertyCity?: unknown;
  unitNumber?: unknown;
  unitAvailable?: unknown;
  unitAvailableDate?: unknown;
  unitBedrooms?: unknown;
  unitBathrooms?: unknown;
  unitPrice?: unknown;
  unitInteriorSquareFeet?: unknown;
  unitPhotos?: unknown;
  amenityNames?: unknown;
  customFacets?: unknown;
};

export async function discoverRentBtListings(preferences: Preferences) {
  const cacheKey = JSON.stringify({
    version: 2,
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
  });
  const cached = rentBtCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const response = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-algolia-application-id": ALGOLIA_APP_ID,
      "x-algolia-api-key": ALGOLIA_SEARCH_KEY,
    },
    body: JSON.stringify({
      query: "san francisco",
      hitsPerPage: 30,
      filters: [
        "unitAvailable:true",
        bedroomFilter(preferences.bedrooms),
        `unitPrice >= ${preferences.budgetMin}`,
        `unitPrice <= ${preferences.budgetMax}`,
      ].join(" AND "),
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Brick + Timber returned ${response.status}.`);
  const result = (await response.json()) as { hits?: unknown };
  const discoveredApartments = Array.isArray(result.hits)
    ? result.hits.flatMap((hit) =>
        rentBtCardFromHit(hit as RentBtHit, preferences),
      )
    : [];
  const apartments = await filterAvailableListings(discoveredApartments);
  if (apartments.length > 0) {
    rentBtCache.set(cacheKey, {
      expiresAt: Date.now() + 2 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

export function rentBtCardFromHit(
  hit: RentBtHit,
  preferences: Preferences,
) {
  if (
    typeof hit.permalink !== "string" ||
    typeof hit.propertyName !== "string" ||
    typeof hit.unitBedrooms !== "number" ||
    typeof hit.unitPrice !== "number" ||
    hit.unitAvailable !== true ||
    hit.propertyCity !== "San Francisco" ||
    !matchesBedrooms(hit.unitBedrooms, preferences.bedrooms)
  ) {
    return [];
  }

  const amenities = Array.isArray(hit.amenityNames)
    ? hit.amenityNames.filter(
        (amenity): amenity is string => typeof amenity === "string",
      )
    : [];
  const images = Array.isArray(hit.unitPhotos)
    ? hit.unitPhotos.flatMap((photo) => {
        if (typeof photo !== "object" || photo === null) return [];
        const value = photo as RentBtPhoto;
        if (typeof value.full_url === "string") return [value.full_url];
        return typeof value.reference_url === "string"
          ? [value.reference_url]
          : [];
      })
    : [];
  const neighborhood =
    typeof hit.customFacets === "object" &&
    hit.customFacets !== null &&
    typeof (hit.customFacets as { neighborhood?: unknown }).neighborhood ===
      "string"
      ? (hit.customFacets as { neighborhood: string }).neighborhood
      : null;
  const description =
    typeof hit.propertyDescription === "string"
      ? hit.propertyDescription
      : hit.propertyName;
  const laundry = inferLaundry(amenities);

  return [
    createApartmentCard(
      {
        url: hit.permalink,
        title: apartmentName(hit.propertyName, hit.unitNumber),
        description,
      },
      {
        name: apartmentName(hit.propertyName, hit.unitNumber),
        address:
          typeof hit.propertyAddress === "string"
            ? hit.propertyAddress
            : null,
        neighborhood,
        price: hit.unitPrice,
        bedrooms: hit.unitBedrooms,
        bathrooms:
          typeof hit.unitBathrooms === "number" ? hit.unitBathrooms : null,
        squareFeet:
          typeof hit.unitInteriorSquareFeet === "number"
            ? hit.unitInteriorSquareFeet
            : null,
        availability:
          typeof hit.unitAvailableDate === "string"
            ? hit.unitAvailableDate
            : "Available now",
        laundry,
        dishwasher: includesAmenity(amenities, "dishwasher") ? true : null,
        petsAllowed: includesAmenity(amenities, "pet friendly") ? true : null,
        amenities,
        description,
        caveats: [
          "Live Brick + Timber inventory. Verify availability before applying.",
        ],
      },
      images,
      preferences,
    ),
  ];
}

function bedroomFilter(bedrooms: Preferences["bedrooms"]) {
  if (bedrooms === "studio") return "unitBedrooms = 0";
  if (bedrooms === "3+") return "unitBedrooms >= 3";
  return `unitBedrooms = ${bedrooms}`;
}

function apartmentName(propertyName: string, unitNumber: unknown) {
  return typeof unitNumber === "string" && unitNumber.trim()
    ? `${propertyName} #${unitNumber}`
    : propertyName;
}

function includesAmenity(amenities: string[], value: string) {
  return amenities.some((amenity) =>
    amenity.toLowerCase().includes(value.toLowerCase()),
  );
}

function inferLaundry(amenities: string[]) {
  if (
    amenities.some((amenity) =>
      /in-unit|in unit|washer\/dryer in unit/i.test(amenity),
    )
  ) {
    return "in-unit" as const;
  }
  if (amenities.some((amenity) => /laundry/i.test(amenity))) {
    return "in-building" as const;
  }
  return "unknown" as const;
}
