import {
  extractedCardFromHtml,
  type ExtractedInventoryConfig,
} from "./extracted-inventory";
import {
  decodeHtml,
  fetchPublicHtml,
  mapWithConcurrency,
  metaContent,
  textFromHtml,
} from "./html";
import { inferNeighborhood, matchesBedrooms } from "./ranking";
import type {
  ApartmentCard,
  ContextListing,
  Preferences,
} from "./schemas";

const INVENTORY_URL = "https://www.rentalsinsf.com/listings/";
const CONFIG: ExtractedInventoryConfig = {
  id: "rentalsinsf",
  inventoryUrl: INVENTORY_URL,
  instructions: "",
  caveat:
    "Live Rentals in SF inventory. Verify availability before applying.",
  requireSanFranciscoAddress: true,
};

const globalCache = globalThis as typeof globalThis & {
  criblistRentalsInSfDecks?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};
const deckCache = globalCache.criblistRentalsInSfDecks ?? new Map();
globalCache.criblistRentalsInSfDecks = deckCache;

export async function discoverRentalsInSfListings(
  preferences: Preferences,
) {
  const cacheKey = JSON.stringify({
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
  });
  const cached = deckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const inventoryHtml = await fetchPublicHtml(INVENTORY_URL, 10_000);
  const urls = extractRentalsInSfUrls(inventoryHtml);
  const cards = await mapWithConcurrency(urls, 5, async (url) => {
    try {
      return rentalsInSfCardFromHtml(
        url,
        await fetchPublicHtml(url, 8_000),
        preferences,
      );
    } catch {
      return null;
    }
  });
  const apartments = cards.filter(
    (card): card is ApartmentCard => card !== null,
  );
  if (apartments.length > 0) {
    deckCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

export function extractRentalsInSfUrls(html: string) {
  return [
    ...new Set(
      [...html.matchAll(/href=["'](https:\/\/www\.rentalsinsf\.com\/rentals\/[^"']+)["']/gi)]
        .map((match) => decodeHtml(match[1]))
        .filter((url) => !/\/feed\/?$/i.test(url)),
    ),
  ];
}

export function rentalsInSfCardFromHtml(
  url: string,
  html: string,
  preferences: Preferences,
) {
  const text = textFromHtml(html);
  const name =
    decodeHtml(metaContent(html, "og:title") ?? "")
      .replace(/\s*\|\s*Rentals in SF.*$/i, "")
      .trim() ||
    decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "")
      .replace(/\s*\|\s*Rentals in SF.*$/i, "")
      .trim();
  const price = numberFromMatch(
    html.match(
      /class=["'][^"']*page-price[^"']*["'][^>]*>\s*\$([\d,]+)/i,
    )?.[1] ??
      html.match(/\bRent:\s*<\/div>\s*<div[^>]*>\s*\$([\d,]+)/i)?.[1],
  );
  const bedrooms = numberFromMatch(
    html.match(
      /title=["']Bedrooms["'][\s\S]{0,180}?class=["']icon-value["'][^>]*>([\d.]+)/i,
    )?.[1],
  );
  const bathrooms = numberFromMatch(
    html.match(
      /title=["']Bathrooms["'][\s\S]{0,180}?class=["']icon-value["'][^>]*>([\d.]+)/i,
    )?.[1],
  );
  if (
    !name ||
    price === null ||
    bedrooms === null ||
    price < preferences.budgetMin ||
    price > preferences.budgetMax ||
    !matchesBedrooms(bedrooms, preferences.bedrooms)
  ) {
    return null;
  }

  const candidate: ContextListing = {
    name,
    url,
    price,
    bedrooms,
    bathrooms,
    neighborhood: inferNeighborhood(text),
    address: `${name}, San Francisco, CA`,
    squareFeet: numberFromMatch(
      text.match(/\b([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet)\b/i)?.[1],
    ),
    petsAllowed: null,
    images: [],
  };
  return extractedCardFromHtml(CONFIG, candidate, html, preferences);
}

function numberFromMatch(value: string | undefined) {
  if (!value) return null;
  const number = Number(value.replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}
