import { discoverCraigslistListings } from "./craigslist";
import { discoverJwavroListings } from "./jwavro";
import { discoverMosserListings } from "./mosser";
import { countByProvider, dedupeApartments, rankApartments } from "./ranking";
import { discoverRentBtListings } from "./rentbt";
import { discoverRentSfNowListings } from "./rentsfnow";
import type { ApartmentCard, Preferences } from "./schemas";

export type SearchSource =
  | "all"
  | "fast"
  | "independent"
  | "craigslist"
  | "extract";

type SourceId =
  | "brick-timber"
  | "rentsfnow"
  | "mosser"
  | "craigslist"
  | "jwavro";

export async function searchApartments(
  preferences: Preferences,
  apiKey: string,
  source: SearchSource = "all",
) {
  const startedAt = Date.now();
  const sources = selectedSources(source);
  const measurements = await Promise.all(
    sources.map(async (sourceId) => ({
      sourceId,
      ...(await measure(() => runSource(sourceId, preferences, apiKey))),
    })),
  );
  const discoveredAt = Date.now();
  const discoveredApartments = dedupeApartments(
    measurements.flatMap((measurement) => measurement.value),
  );
  const ranked = rankApartments(discoveredApartments, preferences);

  return {
    apartments: ranked.apartments,
    analyzed: discoveredApartments.length,
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
      source: "live-multi-source-aggregate",
      requestedLane: source,
      extracted: discoveredApartments.length,
      discoveredSources: countByProvider(discoveredApartments),
      deckSources: countByProvider(ranked.apartments),
      qualityMatched: ranked.qualityMatches,
      coreMatched: ranked.coreMatches,
      relaxed: ranked.relaxed,
    },
  };
}

function selectedSources(source: SearchSource): SourceId[] {
  if (source === "fast") return ["brick-timber", "rentsfnow", "mosser"];
  if (source === "craigslist") return ["craigslist"];
  if (source === "extract") return ["jwavro"];
  if (source === "independent") {
    return ["brick-timber", "rentsfnow", "mosser", "jwavro"];
  }
  return ["brick-timber", "rentsfnow", "mosser", "craigslist", "jwavro"];
}

function runSource(
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

async function measure<T>(operation: () => Promise<T>) {
  const startedAt = Date.now();
  return {
    value: await operation(),
    durationMs: Date.now() - startedAt,
  };
}
