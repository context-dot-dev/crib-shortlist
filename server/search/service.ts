import {
  readListingCache,
  storeSearchListings,
} from "../cache/listings";
import { discoverCraigslistListings } from "./craigslist";
import { discoverJwavroListings } from "./jwavro";
import { discoverMosserListings } from "./mosser";
import {
  countByProvider,
  dedupeApartments,
  excludeApartments,
  rankApartments,
} from "./ranking";
import { discoverRentBtListings } from "./rentbt";
import { discoverRentSfNowListings } from "./rentsfnow";
import type { ApartmentCard, Preferences } from "./schemas";
import {
  selectedSources,
  type SearchSource,
  type SourceId,
} from "./sources";

export type { SearchSource } from "./sources";

export async function searchApartments(
  preferences: Preferences,
  apiKey: string,
  source: SearchSource = "all",
  excludedUrls: string[] = [],
) {
  const startedAt = Date.now();
  const sources = selectedSources(source);
  const cached = await safeReadCache(preferences, sources, excludedUrls);
  if (cached.coverageFresh) {
    return {
      apartments: cached.apartments,
      analyzed: cached.analyzed,
      timings: {
        discoveryMs: Date.now() - startedAt,
        totalMs: Date.now() - startedAt,
        sources: Object.fromEntries(
          sources.map((sourceId) => [sourceId, 0]),
        ),
      },
      diagnostics: {
        source: "turso-listing-cache",
        requestedLane: source,
        extracted: cached.analyzed,
        discoveredSources: countByProvider(cached.apartments),
        deckSources: countByProvider(cached.apartments),
        qualityMatched: cached.qualityMatches,
        coreMatched: cached.coreMatches,
        relaxed: cached.relaxed,
        cache: {
          hit: true,
          ageMs: cached.ageMs,
        },
      },
    };
  }

  const measurements = await discoverSources(sources, preferences, apiKey);
  const discoveredAt = Date.now();
  const discoveredApartments = dedupeApartments(
    excludeApartments(
      measurements.flatMap((measurement) => measurement.value),
      excludedUrls,
    ),
  );
  const ranked = rankApartments(discoveredApartments, preferences);
  await storeSearchListings(
    measurements.map((measurement) => ({
      sourceId: measurement.sourceId,
      apartments: measurement.value,
    })),
    preferences.bedrooms,
  ).catch(() => false);
  const useCachedFallback =
    ranked.apartments.length === 0 && cached.apartments.length > 0;
  const apartments = useCachedFallback
    ? cached.apartments
    : ranked.apartments;

  return {
    apartments,
    analyzed: useCachedFallback
      ? cached.analyzed
      : discoveredApartments.length,
    timings: {
      discoveryMs: discoveredAt - startedAt,
      totalMs: Date.now() - startedAt,
      sources: Object.fromEntries(
        measurements.map((measurement) => [
          measurement.sourceId,
          measurement.durationMs,
        ]),
      ),
    },
    diagnostics: {
      source: useCachedFallback
        ? "turso-stale-fallback"
        : "live-multi-source-aggregate",
      requestedLane: source,
      extracted: discoveredApartments.length,
      discoveredSources: countByProvider(discoveredApartments),
      deckSources: countByProvider(apartments),
      qualityMatched: useCachedFallback
        ? cached.qualityMatches
        : ranked.qualityMatches,
      coreMatched: useCachedFallback
        ? cached.coreMatches
        : ranked.coreMatches,
      relaxed: useCachedFallback ? cached.relaxed : ranked.relaxed,
      cache: {
        hit: useCachedFallback,
        ageMs: cached.ageMs,
      },
    },
  };
}

export function inventoryPreferences(
  bedrooms: Preferences["bedrooms"],
): Preferences {
  return {
    budgetMin: 0,
    budgetMax: 20_000,
    bedrooms,
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "flexible",
    laundry: "any",
    dishwasher: false,
    pets: false,
    minSquareFeet: 0,
  };
}

export async function refreshInventorySegment(
  sourceId: SourceId,
  preferences: Preferences,
  apiKey: string,
) {
  const result = await measure(() => runSource(sourceId, preferences, apiKey));
  return {
    apartments: result.value,
    durationMs: result.durationMs,
  };
}

export function runSource(
  source: SourceId,
  preferences: Preferences,
  apiKey: string,
): Promise<ApartmentCard[]> {
  if (source === "brick-timber") return discoverRentBtListings(preferences);
  if (source === "rentsfnow") return discoverRentSfNowListings(preferences);
  if (source === "mosser") return discoverMosserListings(preferences);
  if (source === "craigslist") {
    return discoverCraigslistListings(preferences, apiKey);
  }
  return discoverJwavroListings(preferences, apiKey);
}

async function discoverSources(
  sources: SourceId[],
  preferences: Preferences,
  apiKey: string,
) {
  return Promise.all(
    sources.map(async (sourceId) => ({
      sourceId,
      ...(await measure(() => runSource(sourceId, preferences, apiKey))),
    })),
  );
}

async function safeReadCache(
  preferences: Preferences,
  sources: SourceId[],
  excludedUrls: string[],
) {
  try {
    return await readListingCache(preferences, sources, excludedUrls);
  } catch {
    return {
      configured: false,
      coverageFresh: false,
      ageMs: null,
      apartments: [],
      analyzed: 0,
      qualityMatches: 0,
      coreMatches: 0,
      relaxed: false,
    };
  }
}

async function measure<T>(operation: () => Promise<T>) {
  const startedAt = Date.now();
  return {
    value: await operation(),
    durationMs: Date.now() - startedAt,
  };
}
