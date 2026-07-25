import {
  decodeHtml,
  fetchPublicHtml,
  textFromHtml,
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

const INVENTORY_URL = "https://www.stonehengenyc.com/apartments";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CARD_MARKER =
  '<div role="listitem" class="apt-card-collection-item';

const globalStonehengeCache = globalThis as typeof globalThis & {
  criblistStonehengeInventory?: {
    expiresAt: number;
    apartments: StonehengeListing[];
  };
  criblistStonehengeRequest?: Promise<StonehengeListing[]>;
};

type StonehengeListing = {
  name: string;
  url: string;
  image: string;
  price: number;
  bedrooms: number;
  bathrooms: number | null;
  neighborhood: string | null;
  address: string;
  squareFeet: number | null;
};

export async function discoverStonehengeListings(
  preferences: Preferences,
  _apiKey: string,
) {
  const listings = await stonehengeInventory();
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
    .map((listing) => stonehengeCard(listing, preferences));
}

export function extractStonehengeListings(html: string) {
  const listings = html
    .split(CARD_MARKER)
    .slice(1)
    .map((block) => `${CARD_MARKER}${block}`)
    .map(parseStonehengeCard)
    .filter((listing): listing is StonehengeListing => listing !== null);
  return [
    ...new Map(listings.map((listing) => [listing.url, listing])).values(),
  ];
}

async function stonehengeInventory() {
  const cached = globalStonehengeCache.criblistStonehengeInventory;
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;
  if (globalStonehengeCache.criblistStonehengeRequest) {
    return globalStonehengeCache.criblistStonehengeRequest;
  }

  const request = fetchPublicHtml(INVENTORY_URL, 15_000).then(
    extractStonehengeListings,
  );
  globalStonehengeCache.criblistStonehengeRequest = request;
  try {
    const apartments = await request;
    if (apartments.length > 0) {
      globalStonehengeCache.criblistStonehengeInventory = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        apartments,
      };
    }
    return apartments;
  } finally {
    if (globalStonehengeCache.criblistStonehengeRequest === request) {
      delete globalStonehengeCache.criblistStonehengeRequest;
    }
  }
}

function parseStonehengeCard(block: string): StonehengeListing | null {
  const path = attributeValue(block, "href", /\/apartments\/[^"']+/i);
  const name = attributeValue(block, "title", /.+/);
  const image = attributeValue(block, "src", /https?:\/\/[^"']+/i);
  const neighborhood = fieldValue(block, "Neighborhood");
  const building = fieldValue(block, "building");
  const bedroomLabel = fieldValue(block, "Bedroom");
  const bathroomLabel = fieldValue(block, "Bathroom");
  const priceLabel = fieldValue(block, "Price");
  if (
    !path ||
    !name ||
    !image ||
    !building ||
    !bedroomLabel ||
    !priceLabel
  ) {
    return null;
  }

  const bedrooms = /studio/i.test(bedroomLabel)
    ? 0
    : numberValue(bedroomLabel);
  const price = numberValue(priceLabel);
  if (bedrooms === null || price === null) return null;

  return {
    name,
    url: new URL(path, INVENTORY_URL).toString(),
    image,
    price,
    bedrooms,
    bathrooms: numberValue(bathroomLabel),
    neighborhood,
    address: `${building}, New York, NY`,
    squareFeet: numberValue(
      textFromHtml(block).match(/\b([\d,]+)\s*ft²\b/i)?.[1] ?? null,
    ),
  };
}

function stonehengeCard(
  listing: StonehengeListing,
  preferences: Preferences,
): ApartmentCard {
  const description = `${formatBedrooms(listing.bedrooms)} apartment at ${listing.address}.`;
  const extracted: ExtractedApartment = {
    name: listing.name,
    address: listing.address,
    neighborhood: listing.neighborhood,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: listing.squareFeet,
    availability: "Available now",
    laundry: "unknown",
    dishwasher: null,
    petsAllowed: null,
    amenities: ["No fee"],
    description,
    caveats: [
      "Live Stonehenge NYC inventory. Verify availability before applying.",
    ],
  };
  return createApartmentCard(
    {
      url: listing.url,
      title: listing.name,
      description,
    },
    extracted,
    cleanImageUrls([listing.image]),
    preferences,
  );
}

function attributeValue(
  html: string,
  attribute: string,
  expected: RegExp,
) {
  const values = [
    ...html.matchAll(new RegExp(`${attribute}=["']([^"']+)["']`, "gi")),
  ].map((match) => decodeHtml(match[1]).trim());
  return values.find((value) => expected.test(value)) ?? null;
}

function fieldValue(html: string, field: string) {
  const value = html.match(
    new RegExp(
      `fs-cmsfilter-field=["']${field}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
      "i",
    ),
  )?.[1];
  return value ? decodeHtml(value.replace(/<[^>]+>/g, " ")).trim() : null;
}

function numberValue(value: string | null) {
  if (!value) return null;
  const number = Number(value.replaceAll(",", "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function formatBedrooms(bedrooms: number) {
  return bedrooms === 0 ? "Studio" : `${bedrooms}-bedroom`;
}
