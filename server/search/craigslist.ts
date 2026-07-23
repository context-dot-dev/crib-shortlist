import { markdownPath, requestContext } from "./context-client";
import {
  cleanImageUrls,
  createApartmentCard,
  inferNeighborhood,
} from "./ranking";
import { MarkdownResponseSchema } from "./schemas";
import type {
  ApartmentCard,
  ExtractedApartment,
  MarkdownSnapshot,
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
    version: 4,
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
    bathroomsMin: preferences.bathroomsMin,
  });
  const cached = craigslistDeckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  try {
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
      .slice(0, 6)
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
  } catch {
    return [];
  }
}

async function discoverSearchCandidates(
  preferences: Preferences,
  apiKey: string,
) {
  const searchUrl = buildSearchUrl(preferences);
  const cached = craigslistSearchCache.get(searchUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;

  const response = await requestContext(
    markdownPath(searchUrl, {
      maxAgeMs: 2 * 60 * 1000,
      waitForMs: 300,
      timeoutMs: 12_000,
    }),
    apiKey,
    { timeoutMs: 14_000, maxAttempts: 1 },
  );
  const snapshot = MarkdownResponseSchema.parse(response);
  const candidates = extractSearchCandidates(snapshot.markdown);
  craigslistSearchCache.set(searchUrl, {
    expiresAt: Date.now() + 2 * 60 * 1000,
    candidates,
  });
  return candidates;
}

function buildSearchUrl(preferences: Preferences) {
  const searchUrl = new URL("https://sfbay.craigslist.org/search/sfc/apa");
  searchUrl.searchParams.set("availabilityMode", "0");
  Object.entries(bedroomParams(preferences.bedrooms)).forEach(([key, value]) =>
    searchUrl.searchParams.set(key, value),
  );
  return searchUrl.toString();
}

function bedroomParams(bedrooms: Preferences["bedrooms"]) {
  if (bedrooms === "studio") {
    return { min_bedrooms: "0", max_bedrooms: "0" };
  }
  if (bedrooms === "3+") return { min_bedrooms: "3" };
  return { min_bedrooms: bedrooms, max_bedrooms: bedrooms };
}

function extractSearchCandidates(markdown: string) {
  const normalized = markdown.replaceAll("\\/", "/").replaceAll("&amp;", "&");
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
): Promise<MarkdownSnapshot> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) {
    throw new Error(`Craigslist returned ${response.status}.`);
  }
  return snapshotFromHtml(url, await response.text());
}

function snapshotFromHtml(url: string, html: string): MarkdownSnapshot {
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
  const body = decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
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

function metaContent(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    html.match(
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]+content=["']([^"']*)["']`,
        "i",
      ),
    )?.[1] ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escapedKey}["']`,
        "i",
      ),
    )?.[1]
  );
}

function jsonLdFromHtml(html: string) {
  return [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )].flatMap((match) => {
    try {
      const value = JSON.parse(match[1]) as
        | Record<string, unknown>
        | Record<string, unknown>[];
      return Array.isArray(value) ? value : [value];
    } catch {
      return [];
    }
  });
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function cardFromSnapshot(
  snapshot: MarkdownSnapshot,
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
  if (bedrooms === null) return null;
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
  const name = titleWithoutPrice.replace(/\s+\([^()]*(?:\)|$)/, "").trim();
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

  const listingData = snapshot.metadata.jsonLd?.find(
    (entry) => entry["@type"] === "Apartment",
  );
  const addressData = listingData?.address;
  const address =
    typeof addressData === "object" && addressData !== null
      ? formatPostalAddress(addressData as Record<string, unknown>)
      : (snapshot.markdown.match(/^## (.+)$/m)?.[1] ?? null);
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

function formatPostalAddress(address: Record<string, unknown>) {
  return [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0,
    )
    .join(", ");
}
