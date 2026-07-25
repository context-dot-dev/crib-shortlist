const HTML_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
};

const globalHtmlCache = globalThis as typeof globalThis & {
  criblistHtmlCache?: Map<string, { expiresAt: number; html: string }>;
  criblistHtmlRequests?: Map<string, Promise<string>>;
  criblistUrlHealthCache?: Map<
    string,
    { expiresAt: number; available: boolean }
  >;
  criblistUrlHealthRequests?: Map<string, Promise<boolean>>;
};
const htmlCache = globalHtmlCache.criblistHtmlCache ?? new Map();
const htmlRequests = globalHtmlCache.criblistHtmlRequests ?? new Map();
const urlHealthCache = globalHtmlCache.criblistUrlHealthCache ?? new Map();
const urlHealthRequests =
  globalHtmlCache.criblistUrlHealthRequests ?? new Map();
globalHtmlCache.criblistHtmlCache = htmlCache;
globalHtmlCache.criblistHtmlRequests = htmlRequests;
globalHtmlCache.criblistUrlHealthCache = urlHealthCache;
globalHtmlCache.criblistUrlHealthRequests = urlHealthRequests;

export async function fetchPublicHtml(
  url: string,
  timeoutMs = 7_000,
  maxAgeMs = 60_000,
) {
  const cached = htmlCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.html;

  const activeRequest = htmlRequests.get(url);
  if (activeRequest) return activeRequest;

  const request = fetch(url, {
    headers: HTML_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${new URL(url).hostname} returned ${response.status}.`);
    }
    const html = await response.text();
    htmlCache.set(url, { expiresAt: Date.now() + maxAgeMs, html });
    trimHtmlCache();
    return html;
  });
  htmlRequests.set(url, request);
  try {
    return await request;
  } finally {
    if (htmlRequests.get(url) === request) htmlRequests.delete(url);
  }
}

export async function publicUrlExists(
  url: string,
  timeoutMs = 4_000,
  maxAgeMs = 10 * 60 * 1000,
) {
  const cached = urlHealthCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.available;

  const activeRequest = urlHealthRequests.get(url);
  if (activeRequest) return activeRequest;

  const request = fetch(url, {
    method: "HEAD",
    headers: HTML_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  })
    .then((response) => response.ok)
    .catch(() => false)
    .then((available) => {
      urlHealthCache.set(url, {
        expiresAt: Date.now() + maxAgeMs,
        available,
      });
      return available;
    });
  urlHealthRequests.set(url, request);
  try {
    return await request;
  } finally {
    if (urlHealthRequests.get(url) === request) {
      urlHealthRequests.delete(url);
    }
  }
}

export async function filterAvailableListings<T extends { url: string }>(
  listings: T[],
  concurrency = 4,
) {
  const availableListings: T[] = [];
  for (let index = 0; index < listings.length; index += concurrency) {
    const group = listings.slice(index, index + concurrency);
    const availability = await Promise.all(
      group.map((listing) => publicUrlExists(listing.url)),
    );
    availableListings.push(
      ...group.filter((_, groupIndex) => availability[groupIndex]),
    );
  }
  return availableListings;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(
      ...(await Promise.all(
        items
          .slice(index, index + concurrency)
          .map((item) => operation(item)),
      )),
    );
  }
  return results;
}

export function jsonLdFromHtml(html: string) {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].flatMap((match) => {
    try {
      const value = JSON.parse(match[1]) as unknown;
      return flattenJsonLd(value);
    } catch {
      return [];
    }
  });
}

export function metaContent(html: string, key: string) {
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

export function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

export function textFromHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function formatPostalAddress(value: unknown) {
  if (!isRecord(value)) return null;
  const address = [
    value.streetAddress,
    value.addressLocality,
    value.addressRegion,
    value.postalCode,
  ]
    .filter(
      (part): part is string =>
        typeof part === "string" && part.trim().length > 0,
    )
    .join(", ");
  return address || null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isRecord(value)) return [];
  const graph = Array.isArray(value["@graph"])
    ? value["@graph"].flatMap(flattenJsonLd)
    : [];
  return [value, ...graph];
}

function trimHtmlCache() {
  if (htmlCache.size <= 100) return;
  const oldestKey = htmlCache.keys().next().value;
  if (typeof oldestKey === "string") htmlCache.delete(oldestKey);
}
