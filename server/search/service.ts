import {
  readListingCache,
  storeSearchListings,
} from "../cache/listings";
import {
  buildApartmentDeck,
  mergeApartmentInventory,
} from "./apartment-deck";
import type {
  ApartmentCard,
  Preferences,
} from "../../shared/search-contract";
import {
  runSource,
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
  const cached = await safeReadCache(preferences, sources);
  const cachedDeck = buildApartmentDeck(cached.apartments, preferences, {
    excludedUrls,
  });
  if (cached.coverageFresh) {
    return {
      apartments: cachedDeck.apartments,
      analyzed: cachedDeck.analyzed,
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
        extracted: cachedDeck.analyzed,
        discoveredSources: cachedDeck.discoveredSources,
        deckSources: cachedDeck.deckSources,
        qualityMatched: cachedDeck.qualityMatches,
        coreMatched: cachedDeck.coreMatches,
        relaxed: cachedDeck.relaxed,
        cache: {
          hit: true,
          ageMs: cached.ageMs,
        },
        sourceErrors: {},
      },
    };
  }

  const measurements = await discoverSources(sources, preferences, apiKey);
  const discoveredAt = Date.now();
  const liveDeck = buildApartmentDeck(
    measurements.flatMap((measurement) => measurement.value),
    preferences,
    { excludedUrls },
  );
  await storeSearchListings(
    measurements.map((measurement) => ({
      sourceId: measurement.sourceId,
      apartments: measurement.value,
    })),
    preferences.bedrooms,
  ).catch(() => false);
  const useCachedFallback =
    liveDeck.apartments.length === 0 && cachedDeck.apartments.length > 0;
  const selectedDeck = useCachedFallback ? cachedDeck : liveDeck;

  return {
    apartments: selectedDeck.apartments,
    analyzed: selectedDeck.analyzed,
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
      extracted: liveDeck.analyzed,
      discoveredSources: liveDeck.discoveredSources,
      deckSources: selectedDeck.deckSources,
      qualityMatched: selectedDeck.qualityMatches,
      coreMatched: selectedDeck.coreMatches,
      relaxed: selectedDeck.relaxed,
      cache: {
        hit: useCachedFallback,
        ageMs: cached.ageMs,
      },
      sourceErrors: Object.fromEntries(
        measurements.flatMap((measurement) =>
          measurement.error
            ? [[measurement.sourceId, measurement.error]]
            : [],
        ),
      ),
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
  const result = await measure(async () => {
    const priceBands = [
      { budgetMin: 0, budgetMax: 1_799 },
      { budgetMin: 1_800, budgetMax: 3_500 },
      { budgetMin: 3_501, budgetMax: 20_000 },
    ];
    const apartments = await Promise.all(
      priceBands.map((priceBand) =>
        runSource(
          sourceId,
          {
            ...preferences,
            ...priceBand,
          },
          apiKey,
        ),
      ),
    );
    return mergeApartmentInventory(apartments.flat());
  });
  return {
    apartments: result.value,
    durationMs: result.durationMs,
  };
}

async function discoverSources(
  sources: SourceId[],
  preferences: Preferences,
  apiKey: string,
) {
  return Promise.all(
    sources.map((sourceId) =>
      measureSource(sourceId, preferences, apiKey),
    ),
  );
}

async function measureSource(
  sourceId: SourceId,
  preferences: Preferences,
  apiKey: string,
) {
  const startedAt = Date.now();
  try {
    return {
      sourceId,
      value: await runSource(sourceId, preferences, apiKey),
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      sourceId,
      value: [] as ApartmentCard[],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function safeReadCache(
  preferences: Preferences,
  sources: SourceId[],
) {
  try {
    return await readListingCache(preferences, sources);
  } catch {
    return {
      configured: false,
      coverageFresh: false,
      ageMs: null,
      apartments: [],
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
