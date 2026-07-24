const HTML_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
};

const globalHtmlCache = globalThis as typeof globalThis & {
  criblistHtmlCache?: Map<string, { expiresAt: number; html: string }>;
  criblistHtmlRequests?: Map<string, Promise<string>>;
};
const htmlCache = globalHtmlCache.criblistHtmlCache ?? new Map();
const htmlRequests = globalHtmlCache.criblistHtmlRequests ?? new Map();
globalHtmlCache.criblistHtmlCache = htmlCache;
globalHtmlCache.criblistHtmlRequests = htmlRequests;

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
