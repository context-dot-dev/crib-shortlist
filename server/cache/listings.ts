import { createClient } from "@libsql/client/web";
import {
  dedupeApartments,
  excludeApartments,
  prepareApartmentForPreferences,
  rankApartments,
} from "../search/ranking";
import {
  ApartmentCardSchema,
  type ApartmentCard,
  type Preferences,
} from "../search/schemas";
import { requestContext } from "../search/context-client";
import { isRecord, mapWithConcurrency } from "../search/html";
import type { SourceId } from "../search/sources";

const COVERAGE_MAX_AGE_MS = 25 * 60 * 60 * 1000;
const LISTING_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const MEDIA_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHED_CANDIDATES = 300;

const globalDatabase = globalThis as typeof globalThis & {
  criblistDatabase?: ReturnType<typeof createClient>;
  criblistDatabaseSignature?: string;
  criblistDatabaseSchemaV2?: Promise<void>;
};

type CachedSearch = {
  configured: boolean;
  coverageFresh: boolean;
  ageMs: number | null;
  apartments: ApartmentCard[];
  analyzed: number;
  qualityMatches: number;
  coreMatches: number;
  relaxed: boolean;
};

type SourceListings = {
  sourceId: SourceId;
  apartments: ApartmentCard[];
};

export async function readListingCache(
  preferences: Preferences,
  sourceIds: SourceId[],
  excludedUrls: string[] = [],
): Promise<CachedSearch> {
  const client = databaseClient();
  if (!client) return emptyCachedSearch(false);

  await ensureSchema(client);
  const now = Date.now();
  const sourcePlaceholders = sourceIds.map(() => "?").join(", ");
  const bedroomClause =
    preferences.bedrooms === "3+" ? "bedrooms >= 3" : "bedrooms = ?";
  const bedroomArguments =
    preferences.bedrooms === "3+"
      ? []
      : [preferences.bedrooms === "studio" ? 0 : Number(preferences.bedrooms)];
  const [result, coverage] = await client.batch(
    [
      {
        sql: `
          SELECT payload, refreshed_at
          FROM listing_cache_v2
          WHERE source_id IN (${sourcePlaceholders})
            AND bedroom_key = ?
            AND refreshed_at >= ?
            AND price >= ?
            AND price <= ?
            AND ${bedroomClause}
          ORDER BY refreshed_at DESC
          LIMIT ?
        `,
        args: [
          ...sourceIds,
          preferences.bedrooms,
          now - LISTING_MAX_AGE_MS,
          preferences.budgetMin,
          preferences.budgetMax,
          ...bedroomArguments,
          MAX_CACHED_CANDIDATES,
        ],
      },
      {
        sql: `
          SELECT source_id, refreshed_at
          FROM listing_cache_segments_v2
          WHERE source_id IN (${sourcePlaceholders})
            AND bedroom_key = ?
            AND refreshed_at >= ?
        `,
        args: [
          ...sourceIds,
          preferences.bedrooms,
          now - COVERAGE_MAX_AGE_MS,
        ],
      },
    ],
    "read",
  );
  const cards = result.rows.flatMap((row) => {
    try {
      const parsed = ApartmentCardSchema.safeParse(
        JSON.parse(String(row.payload)),
      );
      return parsed.success
        ? [prepareApartmentForPreferences(parsed.data, preferences)]
        : [];
    } catch {
      return [];
    }
  });
  const eligibleCards = dedupeApartments(
    excludeApartments(cards, excludedUrls),
  );
  const ranked = rankApartments(eligibleCards, preferences);
  const coveredSources = new Set(
    coverage.rows.map((row) => String(row.source_id)),
  );
  const refreshTimes = coverage.rows.map((row) => Number(row.refreshed_at));

  return {
    configured: true,
    coverageFresh: sourceIds.every((sourceId) =>
      coveredSources.has(sourceId),
    ),
    ageMs:
      refreshTimes.length > 0
        ? now - Math.min(...refreshTimes)
        : null,
    apartments: ranked.apartments,
    analyzed: eligibleCards.length,
    qualityMatches: ranked.qualityMatches,
    coreMatches: ranked.coreMatches,
    relaxed: ranked.relaxed,
  };
}

export async function storeSearchListings(
  sources: SourceListings[],
  bedrooms: Preferences["bedrooms"],
) {
  const client = databaseClient();
  if (!client) return false;

  await ensureSchema(client);
  const refreshedAt = Date.now();
  const statements = sources.flatMap(({ sourceId, apartments }) =>
    apartments.map((apartment) =>
      listingUpsert(sourceId, bedrooms, apartment, refreshedAt),
    ),
  );
  if (statements.length === 0) return true;
  await client.batch(statements, "write");
  return true;
}

export async function storeInventorySegment({
  sourceId,
  bedrooms,
  apartments,
  durationMs,
}: {
  sourceId: SourceId;
  bedrooms: Preferences["bedrooms"];
  apartments: ApartmentCard[];
  durationMs: number;
}) {
  const client = databaseClient();
  if (!client) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
  }

  await ensureSchema(client);
  const refreshedAt = Date.now();
  const listingStatements =
    apartments.length > 0
      ? [
          segmentDelete(sourceId, bedrooms),
          ...apartments.map((apartment) =>
            listingUpsert(sourceId, bedrooms, apartment, refreshedAt),
          ),
        ]
      : [];
  await client.batch(
    [
      ...listingStatements,
      segmentUpsert(
        sourceId,
        bedrooms,
        apartments.length,
        durationMs,
        refreshedAt,
      ),
    ],
    "write",
  );
}

export function listingCacheConfigured() {
  return databaseClient() !== null;
}

export async function stabilizeCraigslistImages(
  apartments: ApartmentCard[],
  apiKey: string,
) {
  const client = databaseClient();
  if (!client) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
  }

  const craigslistApartments = apartments.filter(
    (apartment) => apartment.provider === "craigslist.org",
  );
  if (craigslistApartments.length === 0) return apartments;

  await ensureSchema(client);
  const cachedImages = await readStableImages(
    client,
    craigslistApartments.map((apartment) => apartment.url),
  );
  const uncachedApartments = craigslistApartments.filter(
    (apartment) => !cachedImages.has(apartment.url),
  );
  const freshImages = await mapWithConcurrency(
    uncachedApartments,
    5,
    async (apartment) => ({
      url: apartment.url,
      images: await fetchHostedImages(apartment.images[0] ?? "", apiKey),
    }),
  );
  const successfulImages = freshImages.filter(
    (entry) => entry.images.length > 0,
  );
  if (successfulImages.length > 0) {
    await client.batch(
      successfulImages.map((entry) => stableImagesUpsert(entry)),
      "write",
    );
  }

  const stableImages = new Map([
    ...cachedImages,
    ...successfulImages.map(
      (entry) => [entry.url, entry.images] as const,
    ),
  ]);
  return apartments.flatMap((apartment) => {
    if (apartment.provider !== "craigslist.org") return [apartment];
    const images = stableImages.get(apartment.url);
    return images ? [{ ...apartment, images }] : [];
  });
}

export function extractHostedImageUrls(response: unknown) {
  if (!isRecord(response) || !Array.isArray(response.images)) return [];
  return [
    ...new Set(
      response.images.flatMap((image) => {
        if (!isRecord(image) || !isRecord(image.enrichment)) return [];
        const { url, width, height } = image.enrichment;
        if (
          typeof url !== "string" ||
          typeof width !== "number" ||
          typeof height !== "number" ||
          width < 320 ||
          height < 240
        ) {
          return [];
        }
        try {
          return new URL(url).hostname === "media.brand.dev" ? [url] : [];
        } catch {
          return [];
        }
      }),
    ),
  ].slice(0, 10);
}

function databaseClient() {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !authToken) return null;

  const signature = `${url}:${authToken.length}`;
  if (
    !globalDatabase.criblistDatabase ||
    globalDatabase.criblistDatabaseSignature !== signature
  ) {
    globalDatabase.criblistDatabase = createClient({ url, authToken });
    globalDatabase.criblistDatabaseSignature = signature;
    globalDatabase.criblistDatabaseSchemaV2 = undefined;
  }
  return globalDatabase.criblistDatabase;
}

function ensureSchema(client: ReturnType<typeof createClient>) {
  globalDatabase.criblistDatabaseSchemaV2 ??= client
    .batch(
      [
        `
          CREATE TABLE IF NOT EXISTS listing_cache_v2 (
            cache_key TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            bedroom_key TEXT NOT NULL,
            url TEXT NOT NULL,
            provider TEXT,
            price REAL,
            bedrooms REAL,
            refreshed_at INTEGER NOT NULL,
            payload TEXT NOT NULL
          )
        `,
        `
          CREATE INDEX IF NOT EXISTS listing_cache_v2_search
          ON listing_cache_v2 (
            source_id,
            bedroom_key,
            bedrooms,
            price,
            refreshed_at
          )
        `,
        `
          CREATE INDEX IF NOT EXISTS listing_cache_v2_refresh
          ON listing_cache_v2 (refreshed_at)
        `,
        `
          CREATE TABLE IF NOT EXISTS listing_cache_segments_v2 (
            source_id TEXT NOT NULL,
            bedroom_key TEXT NOT NULL,
            refreshed_at INTEGER NOT NULL,
            listing_count INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            PRIMARY KEY (source_id, bedroom_key)
          )
        `,
        `
          CREATE TABLE IF NOT EXISTS listing_media_v1 (
            url TEXT PRIMARY KEY,
            images TEXT NOT NULL,
            refreshed_at INTEGER NOT NULL
          )
        `,
      ],
      "write",
    )
    .then(() => undefined);
  return globalDatabase.criblistDatabaseSchemaV2;
}

export async function pruneExpiredListings() {
  const client = databaseClient();
  if (!client) return 0;

  await ensureSchema(client);
  const result = await client.execute({
    sql: "DELETE FROM listing_cache_v2 WHERE refreshed_at < ?",
    args: [Date.now() - LISTING_MAX_AGE_MS],
  });
  return result.rowsAffected;
}

async function readStableImages(
  client: ReturnType<typeof createClient>,
  urls: string[],
) {
  if (urls.length === 0) return new Map<string, string[]>();
  const result = await client.execute({
    sql: `
      SELECT url, images
      FROM listing_media_v1
      WHERE url IN (${urls.map(() => "?").join(", ")})
        AND refreshed_at >= ?
    `,
    args: [...urls, Date.now() - MEDIA_MAX_AGE_MS],
  });
  return new Map(
    result.rows.flatMap((row) => {
      try {
        const images = JSON.parse(String(row.images));
        return Array.isArray(images) &&
          images.every((image) => typeof image === "string")
          ? [[String(row.url), images] as const]
          : [];
      } catch {
        return [];
      }
    }),
  );
}

async function fetchHostedImages(sourceImageUrl: string, apiKey: string) {
  if (!sourceImageUrl) return [];
  try {
    const params = new URLSearchParams({
      url: sourceImageUrl,
      dedupe: "true",
      maxAgeMs: String(MEDIA_MAX_AGE_MS),
      timeoutMs: "60000",
    });
    params.set("enrichment[hostedUrl]", "true");
    params.set("enrichment[resolution]", "true");
    const response = await requestContext(
      `/web/scrape/images?${params.toString()}`,
      apiKey,
      { timeoutMs: 65_000 },
    );
    return extractHostedImageUrls(response);
  } catch {
    return [];
  }
}

function stableImagesUpsert({
  url,
  images,
}: {
  url: string;
  images: string[];
}) {
  return {
    sql: `
      INSERT INTO listing_media_v1 (url, images, refreshed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        images = excluded.images,
        refreshed_at = excluded.refreshed_at
    `,
    args: [url, JSON.stringify(images), Date.now()],
  };
}

function listingUpsert(
  sourceId: SourceId,
  bedrooms: Preferences["bedrooms"],
  apartment: ApartmentCard,
  refreshedAt: number,
) {
  return {
    sql: `
      INSERT INTO listing_cache_v2 (
        cache_key,
        source_id,
        bedroom_key,
        url,
        provider,
        price,
        bedrooms,
        refreshed_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        source_id = excluded.source_id,
        bedroom_key = excluded.bedroom_key,
        url = excluded.url,
        provider = excluded.provider,
        price = excluded.price,
        bedrooms = excluded.bedrooms,
        refreshed_at = excluded.refreshed_at,
        payload = excluded.payload
    `,
    args: [
      `${sourceId}:${bedrooms}:${apartment.url}`,
      sourceId,
      bedrooms,
      apartment.url,
      apartment.provider,
      apartment.price,
      apartment.bedrooms,
      refreshedAt,
      JSON.stringify(apartment),
    ],
  };
}

function segmentDelete(
  sourceId: SourceId,
  bedrooms: Preferences["bedrooms"],
) {
  return {
    sql: `
      DELETE FROM listing_cache_v2
      WHERE source_id = ? AND bedroom_key = ?
    `,
    args: [sourceId, bedrooms],
  };
}

function segmentUpsert(
  sourceId: SourceId,
  bedrooms: Preferences["bedrooms"],
  listingCount: number,
  durationMs: number,
  refreshedAt: number,
) {
  return {
    sql: `
      INSERT INTO listing_cache_segments_v2 (
        source_id,
        bedroom_key,
        refreshed_at,
        listing_count,
        duration_ms
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id, bedroom_key) DO UPDATE SET
        refreshed_at = excluded.refreshed_at,
        listing_count = excluded.listing_count,
        duration_ms = excluded.duration_ms
    `,
    args: [
      sourceId,
      bedrooms,
      refreshedAt,
      listingCount,
      durationMs,
    ],
  };
}

function emptyCachedSearch(configured: boolean): CachedSearch {
  return {
    configured,
    coverageFresh: false,
    ageMs: null,
    apartments: [],
    analyzed: 0,
    qualityMatches: 0,
    coreMatches: 0,
    relaxed: false,
  };
}
