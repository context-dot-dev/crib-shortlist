import { htmlPath, markdownPath, requestContext } from "./context-client";
import { cleanImageUrls, createApartmentCard, inferNeighborhood, matchesBedrooms } from "./ranking";
import { HtmlResponseSchema, MarkdownResponseSchema } from "./schemas";
import type { ApartmentCard, ExtractedApartment, Preferences } from "./schemas";

type LocalSource = {
  provider: string;
  feedUrl: string | ((preferences: Preferences) => string);
  detailUrlPattern: RegExp;
};

type LocalCandidate = {
  provider: string;
  url: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  availability: string | null;
  description: string;
};

const LOCAL_SOURCES: LocalSource[] = [
  {
    provider: "gaetanirealestate.com",
    feedUrl: "https://www.gaetanirealestate.com/vacancies",
    detailUrlPattern:
      /https:\/\/www\.gaetanirealestate\.com\/listings\/detail\/[a-f0-9-]+/gi,
  },
  {
    provider: "sfcityrents.com",
    feedUrl: "https://www.sfcityrents.com/listings",
    detailUrlPattern:
      /https:\/\/www\.sfcityrents\.com\/listings\/detail\/[a-f0-9-]+/gi,
  },
  {
    provider: "jodirentals.com",
    feedUrl: "https://www.jodirentals.com/vacancies",
    detailUrlPattern:
      /https:\/\/www\.jodirentals\.com\/listings\/detail\/[a-f0-9-]+/gi,
  },
  {
    provider: "rentalsinsf.com",
    feedUrl: "https://www.rentalsinsf.com/rentals/",
    detailUrlPattern:
      /https:\/\/www\.rentalsinsf\.com\/rentals\/[a-z0-9-]+\/?/gi,
  },
  {
    provider: "mosserliving.com",
    feedUrl: (preferences) => {
      if (preferences.bedrooms === "studio") {
        return "https://www.mosserliving.com/san-francisco-apartments/studio/";
      }
      if (preferences.bedrooms === "1") {
        return "https://www.mosserliving.com/san-francisco-apartments/1-bed/";
      }
      if (preferences.bedrooms === "2") {
        return "https://www.mosserliving.com/san-francisco-apartments/2-bed/";
      }
      return "https://www.mosserliving.com/san-francisco-apartments/all/";
    },
    detailUrlPattern:
      /https:\/\/www\.mosserliving\.com\/apartments\/[a-z0-9-]+\/?/gi,
  },
  {
    provider: "rentsfnow.com",
    feedUrl: "https://www.rentsfnow.com/apartments/",
    detailUrlPattern:
      /https:\/\/www\.rentsfnow\.com\/apartments\/rental\/[a-z0-9-]+/gi,
  },
];

const globalCache = globalThis as typeof globalThis & {
  criblistLocalDeckCache?: Map<
    string,
    { expiresAt: number; apartments: ApartmentCard[] }
  >;
};
const localDeckCache = globalCache.criblistLocalDeckCache ?? new Map();
globalCache.criblistLocalDeckCache = localDeckCache;

export async function discoverLocalListings(
  preferences: Preferences,
  apiKey: string,
) {
  const cacheKey = JSON.stringify({
    version: 3,
    budgetMin: preferences.budgetMin,
    budgetMax: preferences.budgetMax,
    bedrooms: preferences.bedrooms,
    bathroomsMin: preferences.bathroomsMin,
  });
  const cached = localDeckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.apartments;

  const feeds = await mapInBatches(LOCAL_SOURCES, 2, (source) =>
    scrapeFeed(source, preferences, apiKey),
  );
  const candidates = selectCandidates(feeds.flat(), preferences);
  const cards = await mapInBatches(candidates, 2, (candidate) =>
    scrapeListing(candidate, preferences, apiKey),
  );
  const apartments = cards.filter(
    (card): card is ApartmentCard => card !== null,
  );

  if (apartments.length > 0) {
    localDeckCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      apartments,
    });
  }
  return apartments;
}

async function scrapeFeed(
  source: LocalSource,
  preferences: Preferences,
  apiKey: string,
) {
  const feedUrl =
    typeof source.feedUrl === "function"
      ? source.feedUrl(preferences)
      : source.feedUrl;
  try {
    const response = await requestContext(
      markdownPath(feedUrl, {
        includeImages: false,
        maxAgeMs: 0,
        waitForMs: 1200,
        timeoutMs: 20_000,
      }),
      apiKey,
      { timeoutMs: 22_000, maxAttempts: 2 },
    );
    const snapshot = MarkdownResponseSchema.parse(response);
    return candidatesFromFeed(source, snapshot.markdown, preferences);
  } catch {
    return [];
  }
}

function candidatesFromFeed(
  source: LocalSource,
  markdown: string,
  preferences: Preferences,
) {
  const urls = [...new Set(markdown.match(source.detailUrlPattern) ?? [])];
  return urls.map((url) => {
    const urlIndex = markdown.indexOf(url);
    const context = markdown.slice(
      Math.max(0, urlIndex - 260),
      Math.min(markdown.length, urlIndex + 900),
    );
    const beforeUrl = markdown.slice(Math.max(0, urlIndex - 260), urlIndex);
    const label = listingLabel(beforeUrl);
    if (source.provider === "mosserliving.com") {
      return mosserCandidate(source, url, label, preferences);
    }
    if (source.provider === "rentsfnow.com") {
      return rentSfNowCandidate(source, url, label);
    }
    const name =
      cleanMarkdownText(beforeUrl.match(/\*\*([^*\n]+)\*\*\]\($/)?.[1] ?? "") ||
      cleanMarkdownText(beforeUrl.match(/\[([^\]\n]+)\]\($/)?.[1] ?? "") ||
      cleanMarkdownText(
        new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "",
      );
    const description = feedDescription(context, name);

    return {
      provider: source.provider,
      url,
      name,
      address: /san francisco/i.test(name) ? name : null,
      neighborhood: inferNeighborhood(`${name} ${description}`),
      price: parseNumber(context.match(/\$\s?([\d,]{3,6})/)?.[1]),
      bedrooms: parseBedrooms(context),
      bathrooms: parseNumber(
        context.match(/\b(\d+(?:\.\d+)?)\s*baths?\b/i)?.[1],
      ),
      squareFeet: parseNumber(
        context.match(/\b([\d,]+)\s*(?:sq\.?\s*ft|sqft|ft²)\b/i)?.[1],
      ),
      availability:
        cleanMarkdownText(
          context.match(/\bAvailable\s+\**([^\n*]+)\**/i)?.[1] ?? "",
        ) || null,
      description,
    } satisfies LocalCandidate;
  });
}

function listingLabel(beforeUrl: string) {
  const linkStart = beforeUrl.lastIndexOf("[");
  if (linkStart < 0) return "";
  return cleanMarkdownText(beforeUrl.slice(linkStart + 1).replace(/\]\($/, ""))
    .replace(/\\+/g, " · ")
    .replace(/\s*·\s*/g, " · ");
}

function mosserCandidate(
  source: LocalSource,
  url: string,
  label: string,
  preferences: Preferences,
): LocalCandidate {
  const parts = label.split(" · ").filter(Boolean);
  const name = parts[0] || new URL(url).pathname.split("/").filter(Boolean).at(-1) || "";
  const location = parts[1] ?? "San Francisco, CA";
  const bedroomLabel = parts[2] ?? "";
  const hasMixedUnitTypes = bedroomLabel.includes("-");
  return {
    provider: source.provider,
    url,
    name,
    address: `${name}, San Francisco, CA`,
    neighborhood: location.split(",")[0]?.trim() || null,
    price: hasMixedUnitTypes
      ? null
      : parseNumber(label.match(/\$([\d,]+)/)?.[1]),
    bedrooms: requestedBedroomCount(preferences.bedrooms),
    bathrooms: null,
    squareFeet: null,
    availability: "Available now",
    description: `${bedroomLabel || "Apartment"} in ${location}`,
  };
}

function rentSfNowCandidate(
  source: LocalSource,
  url: string,
  label: string,
): LocalCandidate {
  const parts = label.split(" · ").filter(Boolean);
  const neighborhood = parts[0] ?? null;
  const name = parts[1] || new URL(url).pathname.split("/").filter(Boolean).at(-1) || "";
  return {
    provider: source.provider,
    url,
    name,
    address: `${name}, San Francisco, CA`,
    neighborhood,
    price: parseNumber(label.match(/\$([\d,]+)/)?.[1]),
    bedrooms: parseBedrooms(parts[2] ?? label),
    bathrooms: parseNumber((parts[3] ?? "").match(/(\d+(?:\.\d+)?)/)?.[1]),
    squareFeet: null,
    availability: "Available now",
    description: `${parts[2] ?? "Apartment"} in ${neighborhood ?? "San Francisco"}`,
  };
}

function requestedBedroomCount(bedrooms: Preferences["bedrooms"]) {
  if (bedrooms === "studio") return 0;
  if (bedrooms === "3+") return 3;
  return Number(bedrooms);
}

function selectCandidates(
  candidates: LocalCandidate[],
  preferences: Preferences,
) {
  const ranked = candidates
    .filter(
      (candidate) =>
        candidate.price === null ||
        (candidate.price >= preferences.budgetMin &&
          candidate.price <= preferences.budgetMax),
    )
    .filter(
      (candidate) =>
        candidate.bedrooms !== null ||
        candidate.provider === "rentalsinsf.com",
    )
    .filter(
      (candidate) =>
        !/\b(commercial|retail|office space)\b/i.test(candidate.description),
    )
    .filter(isSanFranciscoCandidate)
    .filter(
      (candidate) =>
        candidate.bedrooms === null ||
        matchesBedrooms(candidate.bedrooms, preferences.bedrooms),
    )
    .sort(
      (a, b) =>
        candidateScore(b, preferences) - candidateScore(a, preferences),
    );

  const providerCounts = new Map<string, number>();
  return ranked
    .filter((candidate) => {
      const count = providerCounts.get(candidate.provider) ?? 0;
      if (count >= 2) return false;
      providerCounts.set(candidate.provider, count + 1);
      return true;
    })
    .slice(0, 6);
}

function isSanFranciscoCandidate(candidate: LocalCandidate) {
  const location = `${candidate.address ?? ""} ${candidate.name}`;
  const californiaCity = location.match(/,\s*([^,]+),\s*CA\b/i)?.[1]?.trim();
  return !californiaCity || /^san francisco$/i.test(californiaCity);
}

function candidateScore(
  candidate: LocalCandidate,
  preferences: Preferences,
) {
  let score = 0;
  if (candidate.price !== null && candidate.price <= preferences.budgetMax) {
    score += 10;
  }
  if (candidate.price !== null && candidate.price >= preferences.budgetMin) {
    score += 5;
  }
  if (
    candidate.bedrooms !== null &&
    matchesBedrooms(candidate.bedrooms, preferences.bedrooms)
  ) {
    score += 15;
  }
  if (
    candidate.bathrooms !== null &&
    candidate.bathrooms >= preferences.bathroomsMin
  ) {
    score += 4;
  }
  if (candidate.availability) score += 3;
  if (
    preferences.neighborhoods.some((neighborhood) =>
      `${candidate.neighborhood} ${candidate.address}`
        .toLowerCase()
        .includes(neighborhood.toLowerCase()),
    )
  ) {
    score += 8;
  }
  return score;
}

async function scrapeListing(
  candidate: LocalCandidate,
  preferences: Preferences,
  apiKey: string,
) {
  try {
    const response = await requestContext(
      htmlPath(candidate.url, {
        maxAgeMs: 15 * 60 * 1000,
        waitForMs: 500,
        timeoutMs: 22_000,
      }),
      apiKey,
      { timeoutMs: 24_000, maxAttempts: 2 },
    );
    const html = HtmlResponseSchema.parse(response).html.replaceAll("\\/", "/");
    const text = htmlToText(html);
    if (
      /\b(commercial|retail|office space|storefront|warehouse)\b/i.test(
        `${candidate.description} ${text.slice(0, 12_000)}`,
      )
    ) {
      return null;
    }
    const laundry = inferLaundry(text);
    const petsAllowed = inferPetsAllowed(text);
    const extracted: ExtractedApartment = {
      name: candidate.name,
      address: candidate.address ?? candidate.name,
      neighborhood:
        candidate.neighborhood ??
        inferNeighborhood(
          `${candidate.name} ${candidate.description} ${text.slice(0, 5000)}`,
        ),
      price:
        candidate.price ??
        parseNumber(
          text.match(/\$\s?([\d,]{3,6})(?:\s*\/\s*month)?/i)?.[1],
        ),
      bedrooms: candidate.bedrooms ?? parseBedrooms(text),
      bathrooms:
        candidate.bathrooms ??
        parseBathrooms(text, candidate.bedrooms),
      squareFeet:
        candidate.squareFeet ??
        parseNumber(
          text.match(
            /\b([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet|ft²)\b/i,
          )?.[1],
        ),
      availability: candidate.availability ?? "Available now",
      laundry,
      dishwasher: /dishwasher/i.test(text) ? true : null,
      petsAllowed,
      amenities: inferAmenities(text, laundry, petsAllowed),
      description: candidate.description || candidate.name,
      caveats: [
        `Live listing from ${candidate.provider}. Verify availability before applying.`,
      ],
    };
    return createApartmentCard(
      {
        url: candidate.url,
        title: candidate.name,
        description: candidate.description,
      },
      extracted,
      imagesFromHtml(html, candidate.provider),
      preferences,
    );
  } catch {
    return null;
  }
}

function imagesFromHtml(html: string, provider: string) {
  const urls =
    html.match(
      /https?:\/\/[^"'<>\\\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\\\s]*)?/gi,
    ) ?? [];
  const preferred = urls.filter((url) =>
    provider === "rentalsinsf.com"
      ? /rentalsinsf\.com\/wp-content\/uploads\//i.test(url)
      : provider === "mosserliving.com"
        ? /mosserliving\.com\/wp-content\/uploads\//i.test(url)
        : provider === "rentsfnow.com"
          ? /cdn\.rentcafe\.com\/dmslivecafe\//i.test(url)
          : /images\.cdn\.appfolio\.com\//i.test(url),
  );
  return cleanImageUrls(preferred)
    .filter(
      (url) =>
        !/(25x25|150x100|-\d+x\d+\.|medium\.|logo|icon|avatar|map)/i.test(url),
    )
    .slice(0, 10);
}

function inferLaundry(text: string): ExtractedApartment["laundry"] {
  if (
    /washer\s*\/?\s*dryer[^\n]{0,30}(?:in apartment|in unit)|in-unit laundry/i.test(
      text,
    )
  ) {
    return "in-unit";
  }
  if (
    /washer\s*\/?\s*dryer[^\n]{0,30}(?:in building|on site)|shared laundry|common area laundry/i.test(
      text,
    )
  ) {
    return "in-building";
  }
  return /no laundry/i.test(text) ? "none" : "unknown";
}

function inferPetsAllowed(text: string) {
  if (
    /pets? (?:allowed|welcome)|pet friendly|cats welcome|dogs welcome/i.test(
      text,
    )
  ) {
    return true;
  }
  return /no pets/i.test(text) ? false : null;
}

function inferAmenities(
  text: string,
  laundry: ExtractedApartment["laundry"],
  petsAllowed: boolean | null,
) {
  return [
    /dishwasher/i.test(text) ? "Dishwasher" : null,
    /elevator/i.test(text) ? "Elevator" : null,
    /garage|parking included/i.test(text) ? "Parking" : null,
    /balcony|private deck|patio|backyard/i.test(text) ? "Outdoor space" : null,
    laundry === "in-unit" ? "In-unit laundry" : null,
    laundry === "in-building" ? "Laundry in building" : null,
    petsAllowed ? "Pet friendly" : null,
  ].filter((amenity): amenity is string => Boolean(amenity));
}

function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBedrooms(text: string) {
  const bedroomCount = parseNumber(
    text.match(/\b(\d+(?:\.\d+)?)\s*(?:beds?|bedrooms?)\b/i)?.[1],
  );
  if (bedroomCount !== null) return bedroomCount;
  return /\bstudio\b/i.test(text) ? 0 : null;
}

function parseBathrooms(text: string, bedrooms: number | null) {
  if (bedrooms !== null) {
    const bedroomLabel = bedrooms === 0 ? "studio" : `${bedrooms}\\s*bedrooms?`;
    const nearbyBathroom = text.match(
      new RegExp(
        `\\b${bedroomLabel}\\b.{0,180}?\\b(\\d+(?:\\.\\d+)?)\\s*baths?\\b`,
        "i",
      ),
    )?.[1];
    const parsedNearbyBathroom = parseNumber(nearbyBathroom);
    if (parsedNearbyBathroom !== null) return parsedNearbyBathroom;
  }
  return parseNumber(text.match(/\b(\d+(?:\.\d+)?)\s*baths?\b/i)?.[1]);
}

function parseNumber(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/\\([\\[\]_*])/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function feedDescription(context: string, name: string) {
  const lines = context
    .split("\n")
    .map(cleanMarkdownText)
    .filter(
      (line) =>
        line.length > 24 &&
        line !== name &&
        !/^(view details|apply now|available|showing|sorted by|reset map)/i.test(
          line,
        ) &&
        !/^https?:/i.test(line),
    );
  return lines.sort((a, b) => b.length - a.length)[0]?.slice(0, 280) ?? name;
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
) {
  const batches = Array.from(
    { length: Math.ceil(items.length / batchSize) },
    (_, index) => items.slice(index * batchSize, (index + 1) * batchSize),
  );
  const results: R[] = [];
  for (const batch of batches) {
    results.push(...(await Promise.all(batch.map(mapper))));
  }
  return results;
}
