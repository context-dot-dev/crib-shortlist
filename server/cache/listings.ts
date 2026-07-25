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
import type { SourceId } from "../search/sources";

const COVERAGE_MAX_AGE_MS = 45 * 60 * 1000;
const LISTING_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_CACHED_CANDIDATES = 120;

const globalDatabase = globalThis as typeof globalThis & {
  criblistDatabase?: ReturnType<typeof createClient>;
  criblistDatabaseSignature?: string;
  criblistDatabaseSchema?: Promise<void>;
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
          FROM listing_cache
          WHERE source_id IN (${sourcePlaceholders})
            AND refreshed_at >= ?
            AND price >= ?
            AND price <= ?
            AND ${bedroomClause}
          ORDER BY refreshed_at DESC
          LIMIT ?
        `,
        args: [
          ...sourceIds,
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
          FROM listing_cache_segments
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
  const statements = sources.flatMap(({ sourceId, apartments }) => [
    ...apartments.map((apartment) =>
      listingUpsert(sourceId, apartment, refreshedAt),
    ),
    segmentUpsert(
      sourceId,
      bedrooms,
      apartments.length,
      0,
      refreshedAt,
    ),
  ]);
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
  await client.batch(
    [
      ...apartments.map((apartment) =>
        listingUpsert(sourceId, apartment, refreshedAt),
      ),
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
    globalDatabase.criblistDatabaseSchema = undefined;
  }
  return globalDatabase.criblistDatabase;
}

function ensureSchema(client: ReturnType<typeof createClient>) {
  globalDatabase.criblistDatabaseSchema ??= client
    .batch(
      [
        `
          CREATE TABLE IF NOT EXISTS listing_cache (
            url TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            provider TEXT,
            price REAL,
            bedrooms REAL,
            refreshed_at INTEGER NOT NULL,
            payload TEXT NOT NULL
          )
        `,
        `
          CREATE INDEX IF NOT EXISTS listing_cache_search
          ON listing_cache (
            source_id,
            bedrooms,
            price,
            refreshed_at
          )
        `,
        `
          CREATE INDEX IF NOT EXISTS listing_cache_refresh
          ON listing_cache (refreshed_at)
        `,
        `
          CREATE TABLE IF NOT EXISTS listing_cache_segments (
            source_id TEXT NOT NULL,
            bedroom_key TEXT NOT NULL,
            refreshed_at INTEGER NOT NULL,
            listing_count INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            PRIMARY KEY (source_id, bedroom_key)
          )
        `,
      ],
      "write",
    )
    .then(() => undefined);
  return globalDatabase.criblistDatabaseSchema;
}

export async function pruneExpiredListings() {
  const client = databaseClient();
  if (!client) return 0;

  await ensureSchema(client);
  const result = await client.execute({
    sql: "DELETE FROM listing_cache WHERE refreshed_at < ?",
    args: [Date.now() - LISTING_MAX_AGE_MS],
  });
  return result.rowsAffected;
}

function listingUpsert(
  sourceId: SourceId,
  apartment: ApartmentCard,
  refreshedAt: number,
) {
  return {
    sql: `
      INSERT INTO listing_cache (
        url,
        source_id,
        provider,
        price,
        bedrooms,
        refreshed_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        source_id = excluded.source_id,
        provider = excluded.provider,
        price = excluded.price,
        bedrooms = excluded.bedrooms,
        refreshed_at = excluded.refreshed_at,
        payload = excluded.payload
    `,
    args: [
      apartment.url,
      sourceId,
      apartment.provider,
      apartment.price,
      apartment.bedrooms,
      refreshedAt,
      JSON.stringify(apartment),
    ],
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
      INSERT INTO listing_cache_segments (
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
