import { discoverCraigslistListings } from "./craigslist";
import { discoverLocalListings } from "./local-sources";
import { countByProvider, dedupeApartments, rankApartments } from "./ranking";
import type { Preferences } from "./schemas";

export async function searchApartments(
  preferences: Preferences,
  apiKey: string,
) {
  const startedAt = Date.now();
  const [craigslistApartments, localApartments] = await Promise.all([
    discoverCraigslistListings(preferences, apiKey),
    discoverLocalListings(preferences, apiKey),
  ]);
  const discoveredAt = Date.now();
  const discoveredApartments = dedupeApartments([
    ...localApartments,
    ...craigslistApartments,
  ]);
  const ranked = rankApartments(discoveredApartments, preferences);

  return {
    apartments: ranked.apartments,
    analyzed: discoveredApartments.length,
    timings: {
      discoveryMs: discoveredAt - startedAt,
      totalMs: Date.now() - startedAt,
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
