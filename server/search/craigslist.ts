import { htmlPath, requestContext } from "./context-client";
import {
  decodeHtml,
  fetchPublicHtml,
  formatPostalAddress,
  jsonLdFromHtml,
  metaContent,
  textFromHtml,
} from "./html";
import {
  cleanImageUrls,
  createApartmentCard,
  inferNeighborhood,
  matchesBedrooms,
} from "./ranking";
import { HtmlResponseSchema } from "./schemas";
import type {
  ApartmentCard,
  ExtractedApartment,
  ListingSnapshot,
  Preferences,
} from "./schemas";

const globalCache = globalThis as typeof globalThis & {
  criblistCraigslistDeckCache?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
  criblistCraigslistSearchCache?: Map<
    string,
    {
      expiresAt: number;
      candidates: CraigslistCandidate[];
    }
  >;
};
const craigslistDeckCache =
  globalCache.criblistCraigslistDeckCache ?? new Map();
globalCache.criblistCraigslistDeckCache = craigslistDeckCache;
const craigslistSearchCache: Map<
  string,
  { expiresAt: number; candidates: CraigslistCandidate[] }
> =
  globalCache.criblistCraigslistSearchCache ?? new Map();
globalCache.criblistCraigslistSearchCache = craigslistSearchCache;

type CraigslistCandidate = {
  url: string;
  name: string;
  price: number;
  location: string;
};

export async function discoverCraigslistListings(
  preferences: Preferences,
  apiKey: string,
) {
  const cacheKey = JSON.stringify({
    version: 7,
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
    bathroomsMin: preferences.bathroomsMin,
  });
  const cached = craigslistDeckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const candidates = await discoverSearchCandidates(preferences, apiKey);
  const urls = candidates
    .filter(
      (candidate) =>
        candidate.price >= preferences.budgetMin &&
        candidate.price <= preferences.budgetMax,
    )
    .filter(
      (candidate) =>
        !/\b(just rented|unavailable|leased|no longer available)\b/i.test(
          candidate.name,
        ),
    )
    .slice(0, 10)
    .map((candidate) => candidate.url);
  const cards = await Promise.all(
    urls.map((url) => scrapeListing(url, preferences)),
  );
  const apartments = cards.filter(
    (card): card is ApartmentCard => card !== null,
  );
  if (apartments.length > 0) {
    craigslistDeckCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

async function discoverSearchCandidates(
  preferences: Preferences,
  apiKey: string,
) {
  const searchUrl = buildSearchUrl(preferences);
  const cached = craigslistSearchCache.get(searchUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;

  const response = await requestContext(
    htmlPath(searchUrl, {
      maxAgeMs: 2 * 60 * 1000,
      waitForMs: 0,
      timeoutMs: 25_000,
    }),
    apiKey,
    { timeoutMs: 28_000, maxAttempts: 1 },
  );
  const snapshot = HtmlResponseSchema.parse(response);
  const candidates = extractCraigslistSearchCandidates(snapshot.html);
  craigslistSearchCache.set(searchUrl, {
    expiresAt: Date.now() + 2 * 60 * 1000,
    candidates,
  });
  return candidates;
}

export function buildSearchUrl(preferences: Preferences) {
  const searchUrl = new URL(
    "https://www.craigslist.org/search/subarea/sfc",
  );
  searchUrl.searchParams.set("cat", "apa");
  searchUrl.searchParams.set("availabilityMode", "0");
  searchUrl.searchParams.set("min_price", String(preferences.budgetMin));
  searchUrl.searchParams.set("max_price", String(preferences.budgetMax));
  Object.entries(bedroomParams(preferences.bedrooms)).forEach(([key, value]) =>
    searchUrl.searchParams.set(key, value),
  );
  return searchUrl.toString();
}

function bedroomParams(bedrooms: Preferences["bedrooms"]) {
  if (bedrooms === "studio") {
    return { min_bedrooms: "0", max_bedrooms: "0" };
  }
  if (bedrooms === "1") {
    return { min_bedrooms: "1", max_bedrooms: "1" };
  }
  if (bedrooms === "2") {
    return { min_bedrooms: "2", max_bedrooms: "2" };
  }
  if (bedrooms === "3+") return { min_bedrooms: "3" };
  return {};
}

export function extractCraigslistSearchCandidates(html: string) {
  const normalized = html.replaceAll("\\/", "/").replaceAll("&amp;", "&");
  const candidates = [
    ...normalized.matchAll(
      /<li class="cl-static-search-result"[\s\S]*?<\/li>/gi,
    ),
  ].flatMap((match) => {
    const block = match[0];
    const url = block.match(/<a href="([^"]+)"/i)?.[1];
    const price = Number(
      block
        .match(/<div class="price">\s*\$([\d,]+)\s*<\/div>/i)?.[1]
        ?.replaceAll(",", ""),
    );
    if (!url || !Number.isFinite(price)) return [];
    return [
      {
        url,
        name: decodeHtml(
          block.match(/<div class="title">([\s\S]*?)<\/div>/i)?.[1] ?? "",
        ).trim(),
        price,
        location: decodeHtml(
          block.match(/<div class="location">([\s\S]*?)<\/div>/i)?.[1] ?? "",
        ).trim(),
      },
    ];
  });
  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
}

async function scrapeListing(
  url: string,
  preferences: Preferences,
) {
  try {
    const snapshot = await fetchListingSnapshot(url);
    if (
      snapshot.contentLength < 1_000 ||
      /this posting has been deleted/i.test(snapshot.markdown)
    ) {
      return null;
    }
    return cardFromSnapshot(snapshot, preferences);
  } catch {
    return null;
  }
}

async function fetchListingSnapshot(
  url: string,
): Promise<ListingSnapshot> {
  return snapshotFromHtml(url, await fetchPublicHtml(url, 5_000));
}

export function snapshotFromHtml(
  url: string,
  html: string,
): ListingSnapshot {
  const pageTitle = decodeHtml(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  ).trim();
  const postingTitle = decodeHtml(
    html
      .match(/<h1[^>]+class=["']postingtitle["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      ?.replace(/<[^>]+>/g, " ") ?? "",
  )
    .replace(/\s+/g, " ")
    .replace(/\bft\s+2\b/i, "ft2")
    .trim();
  const title =
    decodeHtml(
      html.match(
        /<span[^>]+id=["']titletextonly["'][^>]*>([\s\S]*?)<\/span>/i,
      )?.[1] ?? "",
    ).trim() || pageTitle;
  const description = decodeHtml(
    metaContent(html, "description") ?? metaContent(html, "og:description") ?? "",
  );
  const canonicalUrl =
    html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
    )?.[1] ??
    url;
  const images = [
    ...new Set(
      html.match(
        /https:\/\/images\.craigslist\.org\/[^"'\s<]+?\.(?:jpg|jpeg|png|webp)/gi,
      ) ?? [],
    ),
  ];
  const body = textFromHtml(html);
  const jsonLd = jsonLdFromHtml(html);
  const markdown = `# ${postingTitle || pageTitle}\n\n${body}\n\n${images.join("\n")}`;
  return {
    success: true,
    markdown,
    contentLength: markdown.length,
    url,
    metadata: {
      title,
      description,
      canonicalUrl,
      image: images[0],
      jsonLd,
    },
  };
}

export function cardFromSnapshot(
  snapshot: ListingSnapshot,
  preferences: Preferences,
) {
  const heading = snapshot.markdown.match(/^# (.+)$/m)?.[1]?.trim();
  const priceText = heading?.match(/^\$([\d,]+)/)?.[1];
  if (!heading || !priceText) return null;

  const price = Number(priceText.replaceAll(",", ""));
  const bedroomText = heading.match(/\/\s*(\d+)br\b/i)?.[1];
  const bedrooms =
    bedroomText !== undefined
      ? Number(bedroomText)
      : preferences.bedrooms === "studio"
        ? 0
        : null;
  if (bedrooms === null || !matchesBedrooms(bedrooms, preferences.bedrooms)) {
    return null;
  }
  const squareFeetText = heading.match(/\b([\d,]+)\s*ft\s*2\b/i)?.[1];
  const squareFeet = squareFeetText
    ? Number(squareFeetText.replaceAll(",", ""))
    : null;
  const titleWithoutPrice = heading
    .replace(/^\$[\d,]+\s*/, "")
    .replace(/^\/\s*/, "")
    .replace(/^\d+br\s*-\s*/i, "")
    .replace(/^[\d,]+\s*ft\s*2\s*-\s*/i, "")
    .trim();
  const rawName = titleWithoutPrice
    .replace(/\s+\([^()]*(?:\)|$)/, "")
    .trim();
  const advertisedPrice = Number(
    rawName.match(/\$([\d,]+)/)?.[1]?.replaceAll(",", "") ?? NaN,
  );
  const hasMismatchedHeadlinePrice =
    Number.isFinite(advertisedPrice) && advertisedPrice !== price;
  const name = (hasMismatchedHeadlinePrice
    ? rawName.replace(/\$[\d,]+/g, "").replace(/\s{2,}/g, " ")
    : rawName
  ).trim();
  if (
    /\b\d+\s*-\s*\d+\s*(?:br|beds?|bedrooms?)\b/i.test(name) ||
    /\b(room for rent|private room|shared room|inlaw room)\b/i.test(name)
  ) {
    return null;
  }
  const sourceDescription = snapshot.metadata.description ?? "";
  const listingBodyStart = snapshot.markdown.search(
    /QR Code Link to This Post/i,
  );
  const postIdIndex = snapshot.markdown.search(/\n\npost id:/i);
  const listingBody =
    listingBodyStart >= 0 && postIdIndex > listingBodyStart
      ? snapshot.markdown.slice(listingBodyStart, postIdIndex)
      : sourceDescription;
  const describedBedroomCounts = [
    ...sourceDescription.matchAll(/\b(\d+)\s*(?:bed|br)\b/gi),
  ].map((match) => Number(match[1]));
  if (describedBedroomCounts.some((count) => count !== bedrooms)) return null;
  if (
    /\bone bedroom\b/i.test(name) &&
    /\btwo bedrooms?\b/i.test(name)
  ) {
    return null;
  }

  const listingData = snapshot.metadata.jsonLd?.find((entry) =>
    ["Apartment", "House", "Residence", "SingleFamilyResidence"].includes(
      String(entry["@type"]),
    ),
  );
  const addressData = listingData?.address;
  const address =
    formatPostalAddress(addressData) ??
    (snapshot.markdown.match(/^## (.+)$/m)?.[1] ?? null);
  if (!address || !/\bsan francisco\b/i.test(address)) return null;
  const bathroomsValue = listingData?.numberOfBathroomsTotal;
  const bathrooms =
    typeof bathroomsValue === "number"
      ? bathroomsValue
      : Number(
          snapshot.markdown.match(/\b(\d+(?:\.\d+)?)Ba\b/i)?.[1] ?? NaN,
        );
  const images = cleanImageUrls([
    snapshot.metadata.image ?? "",
    ...(snapshot.markdown.match(
      /https:\/\/images\.craigslist\.org\/[^)\s'\"]+?(?:_600x450)?\.(?:jpg|jpeg|png|webp)/gi,
    ) ?? []),
  ])
    .filter((image) => !/_50x50c\./i.test(image))
    .slice(0, 10);
  const laundry = inferLaundry(snapshot.markdown);
  const petsAllowed = inferPetsAllowed(snapshot.markdown, listingData);
  const extracted: ExtractedApartment = {
    name,
    address,
    neighborhood: inferNeighborhood(`${name} ${sourceDescription}`),
    price,
    bedrooms,
    bathrooms: Number.isFinite(bathrooms) ? bathrooms : null,
    squareFeet,
    availability:
      snapshot.markdown.match(/\bavailable (?:now|on [^\n]+)/i)?.[0] ??
      "Recently posted",
    laundry,
    dishwasher: /dishwasher/i.test(snapshot.markdown) ? true : null,
    petsAllowed,
    amenities: inferAmenities(snapshot.markdown, laundry),
    description: sourceDescription || name,
    caveats: [
      ...(hasMismatchedHeadlinePrice
        ? [
            `The headline mentioned a different rent; the listing currently shows $${price.toLocaleString()}.`,
          ]
        : []),
      "Craigslist listing: verify the poster and tour before paying.",
    ],
  };
  const card = createApartmentCard(
    {
      url: snapshot.metadata.canonicalUrl ?? snapshot.url,
      title: name,
      description: extracted.description ?? name,
    },
    extracted,
    images,
    preferences,
  );
  if (!hasScamSignals(listingBody)) return card;
  return {
    ...card,
    matchScore: Math.max(0, card.matchScore - 18),
    catches: [
      "Suspicious contact or payment wording detected. Verify the owner and never pay before a tour.",
      ...card.catches,
    ].slice(0, 4),
  };
}

function inferLaundry(text: string): ExtractedApartment["laundry"] {
  if (/w\/d in unit|washer[^\n]{0,20}dryer[^\n]{0,20}in unit/i.test(text)) {
    return "in-unit";
  }
  if (/laundry in bldg|laundry on site|shared laundry/i.test(text)) {
    return "in-building";
  }
  return /no laundry/i.test(text) ? "none" : "unknown";
}

function inferPetsAllowed(
  text: string,
  listingData: Record<string, unknown> | undefined,
) {
  if (/cats are ok|dogs are ok|pets allowed|pet friendly/i.test(text)) {
    return true;
  }
  if (/no pets/i.test(text)) return false;
  return typeof listingData?.petsAllowed === "boolean"
    ? listingData.petsAllowed
    : null;
}

function inferAmenities(
  text: string,
  laundry: ExtractedApartment["laundry"],
) {
  return [
    /dishwasher/i.test(text) ? "Dishwasher" : null,
    /air conditioning/i.test(text) ? "Air conditioning" : null,
    /attached garage|garage parking/i.test(text) ? "Garage parking" : null,
    /balcony|private deck|patio/i.test(text) ? "Outdoor space" : null,
    /elevator/i.test(text) ? "Elevator" : null,
    laundry === "in-unit" ? "In-unit laundry" : null,
    laundry === "in-building" ? "Laundry in building" : null,
  ].filter((amenity): amenity is string => Boolean(amenity));
}

function hasScamSignals(text: string) {
  return /(must\s+text\s+me\s+your\s+email|kindly\s+(?:text|send|reply)|wire\s+(?:the\s+)?money|western\s+union|pay\s+before\s+(?:viewing|touring)|i(?:'m| am)\s+(?:currently\s+)?out\s+of\s+(?:town|country)|crypto(?:currency)?\s+payment)/i.test(
    text,
  );
}
