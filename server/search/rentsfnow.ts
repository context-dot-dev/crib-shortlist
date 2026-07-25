import {
  decodeHtml,
  fetchPublicHtml,
  metaContent,
  textFromHtml,
} from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  matchesBedrooms,
} from "./ranking";
import type { ApartmentCard, Preferences } from "./schemas";

const INVENTORY_URL = "https://www.rentsfnow.com/";

const globalCache = globalThis as typeof globalThis & {
  criblistRentSfNowCache?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};
const rentSfNowCache = globalCache.criblistRentSfNowCache ?? new Map();
globalCache.criblistRentSfNowCache = rentSfNowCache;

type RentSfNowCandidate = {
  url: string;
  name: string;
  neighborhood: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  image: string;
};

export async function discoverRentSfNowListings(preferences: Preferences) {
  const cacheKey = JSON.stringify({
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
  });
  const cached = rentSfNowCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const html = await fetchPublicHtml(INVENTORY_URL, 10_000);
  const candidates = extractRentSfNowCandidates(html)
    .filter(
      (candidate) =>
        candidate.price >= preferences.budgetMin &&
        candidate.price <= preferences.budgetMax &&
        matchesBedrooms(candidate.bedrooms, preferences.bedrooms),
    )
    .slice(0, 6);
  const apartments = (
    await Promise.all(
      candidates.map((candidate) =>
        enrichRentSfNowCandidate(candidate, preferences),
      ),
    )
  ).filter((apartment): apartment is ApartmentCard => apartment !== null);
  if (apartments.length > 0) {
    rentSfNowCache.set(cacheKey, {
      expiresAt: Date.now() + 3 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

export function extractRentSfNowCandidates(html: string) {
  return [
    ...html.matchAll(
      /<a href="([^"]+)" class="apartment-image"[^>]*>[\s\S]*?background-image:url\(['"]([^'"]+)['"]\)[^>]*>[\s\S]*?<h5>([\s\S]*?)<\/h5>\s*<h4>([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>/gi,
    ),
  ].flatMap((match): RentSfNowCandidate[] => {
    const details = decodeHtml(match[5]).replace(/<[^>]+>/g, " ");
    const price = Number(
      details.match(/\$([\d,]+)/)?.[1]?.replaceAll(",", "") ?? NaN,
    );
    const bedrooms = /studio/i.test(details)
      ? 0
      : Number(details.match(/(\d+)\s*beds?/i)?.[1] ?? NaN);
    const bathrooms = Number(
      details.match(/(\d+(?:\.\d+)?)\s*baths?/i)?.[1] ?? NaN,
    );
    if (
      !Number.isFinite(price) ||
      !Number.isFinite(bedrooms) ||
      !Number.isFinite(bathrooms)
    ) {
      return [];
    }
    return [
      {
        url: new URL(match[1], INVENTORY_URL).toString(),
        image: new URL(decodeHtml(match[2]), INVENTORY_URL).toString(),
        neighborhood: decodeHtml(match[3]).replace(/<[^>]+>/g, "").trim(),
        name: decodeHtml(match[4]).replace(/<[^>]+>/g, "").trim(),
        price,
        bedrooms,
        bathrooms,
      },
    ];
  });
}

async function enrichRentSfNowCandidate(
  candidate: RentSfNowCandidate,
  preferences: Preferences,
) {
  try {
    const html = await fetchPublicHtml(candidate.url, 5_000);
    const text = textFromHtml(html);
    const images = cleanImageUrls([
      candidate.image,
      ...(html.match(
        /https:\/\/cdn\.rentcafe\.com\/[^"'<>]+?\.(?:jpg|jpeg|png|webp)/gi,
      ) ?? []),
    ]);
    const squareFeetText = text.match(
      /\b([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet)\b/i,
    )?.[1];
    const laundry = inferLaundry(text);
    const amenities = inferAmenities(text, laundry);
    const description = decodeHtml(
      metaContent(html, "description") ?? candidate.name,
    );
    return createApartmentCard(
      {
        url: candidate.url,
        title: candidate.name,
        description,
      },
      {
        name: candidate.name,
        address: `${candidate.name.replace(/\s+#.+$/, "")}, San Francisco, CA`,
        neighborhood: candidate.neighborhood,
        price: candidate.price,
        bedrooms: candidate.bedrooms,
        bathrooms: candidate.bathrooms,
        squareFeet: squareFeetText
          ? Number(squareFeetText.replaceAll(",", ""))
          : null,
        availability: "Available now",
        laundry,
        dishwasher: /dishwasher/i.test(text) ? true : null,
        petsAllowed: /pet friendly|pets? (?:welcome|allowed)/i.test(text)
          ? true
          : null,
        amenities,
        description,
        caveats: [
          "Live RentSFNow inventory. Verify availability before applying.",
        ],
      },
      images,
      preferences,
    );
  } catch {
    return createApartmentCard(
      {
        url: candidate.url,
        title: candidate.name,
        description: candidate.name,
      },
      {
        name: candidate.name,
        address: null,
        neighborhood: candidate.neighborhood,
        price: candidate.price,
        bedrooms: candidate.bedrooms,
        bathrooms: candidate.bathrooms,
        squareFeet: null,
        availability: "Available now",
        laundry: "unknown",
        dishwasher: null,
        petsAllowed: null,
        amenities: [],
        description: candidate.name,
        caveats: [
          "Live RentSFNow inventory. Verify availability before applying.",
        ],
      },
      [candidate.image],
      preferences,
    );
  }
}

function inferLaundry(text: string) {
  if (/in-unit washer|washer\/dryer in unit|in unit laundry/i.test(text)) {
    return "in-unit" as const;
  }
  if (/laundry facilities|laundry in building|shared laundry/i.test(text)) {
    return "in-building" as const;
  }
  return "unknown" as const;
}

function inferAmenities(
  text: string,
  laundry: "in-unit" | "in-building" | "unknown",
) {
  return [
    /dishwasher/i.test(text) ? "Dishwasher" : null,
    /elevator/i.test(text) ? "Elevator" : null,
    /pet friendly|pets? (?:welcome|allowed)/i.test(text)
      ? "Pet friendly"
      : null,
    /roof(?:top)? deck|patio|yard|courtyard|balcony/i.test(text)
      ? "Outdoor space"
      : null,
    laundry === "in-unit" ? "In-unit laundry" : null,
    laundry === "in-building" ? "Laundry in building" : null,
  ].filter((amenity): amenity is string => Boolean(amenity));
}
