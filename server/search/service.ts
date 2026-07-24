import { discoverCraigslistListings } from "./craigslist";
import { discoverMosserListings } from "./mosser";
import { countByProvider, dedupeApartments, rankApartments } from "./ranking";
import type { Preferences } from "./schemas";

export async function searchApartments(
  preferences: Preferences,
  apiKey: string,
  source: "all" | "independent" | "craigslist" = "all",
) {
  const startedAt = Date.now();
  const [craigslistResult, localResult] = await Promise.all([
    source === "independent"
      ? emptyMeasurement()
      : measure(() => discoverCraigslistListings(preferences, apiKey)),
    source === "craigslist"
      ? emptyMeasurement()
      : measure(() => discoverMosserListings(preferences)),
  ]);
  const discoveredAt = Date.now();
  const discoveredApartments = dedupeApartments([
    ...localResult.value,
    ...craigslistResult.value,
  ]);
  const ranked = rankApartments(discoveredApartments, preferences);

  return {
    apartments: ranked.apartments,
    analyzed: discoveredApartments.length,
    timings: {
      discoveryMs: discoveredAt - startedAt,
      totalMs: Date.now() - startedAt,
      sources: {
        craigslistMs: craigslistResult.durationMs,
        independentMs: localResult.durationMs,
      },
    },
    diagnostics: {
      source: "live-local-aggregate",
      extracted: discoveredApartments.length,
      discoveredSources: countByProvider(discoveredApartments),
      deckSources: countByProvider(ranked.apartments),
      qualityMatched: ranked.qualityMatches,
      coreMatched: ranked.coreMatches,
      relaxed: ranked.relaxed,
    },
  };
}

function emptyMeasurement() {
  return Promise.resolve({ value: [], durationMs: 0 });
}

async function measure<T>(operation: () => Promise<T>) {
  const startedAt = Date.now();
  return {
    value: await operation(),
    durationMs: Date.now() - startedAt,
  };
}
