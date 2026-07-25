import {
  pruneExpiredListings,
  storeInventorySegment,
} from "./listings";
import {
  inventoryPreferences,
  refreshInventorySegment,
} from "../search/service";
import { SOURCE_IDS } from "../search/sources";

const BEDROOM_KEYS = ["studio", "1", "2", "3+"] as const;

export async function refreshListingInventory(apiKey: string) {
  const startedAt = Date.now();
  const bedroomResults = await Promise.all(
    BEDROOM_KEYS.map(async (bedrooms) => {
      const preferences = inventoryPreferences(bedrooms);
      return Promise.all(
        SOURCE_IDS.map(async (sourceId) => {
          try {
            const result = await refreshInventorySegment(
              sourceId,
              preferences,
              apiKey,
            );
            await storeInventorySegment({
              sourceId,
              bedrooms,
              apartments: result.apartments,
              durationMs: result.durationMs,
            });
            return {
              source: sourceId,
              bedrooms,
              listings: result.apartments.length,
              durationMs: result.durationMs,
              error: null,
            };
          } catch (error) {
            return {
              source: sourceId,
              bedrooms,
              listings: 0,
              durationMs: 0,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
    }),
  );
  const summaries = bedroomResults.flat();
  const prunedListings = await pruneExpiredListings();

  return {
    refreshedAt: new Date().toISOString(),
    listings: summaries.reduce(
      (total, summary) => total + summary.listings,
      0,
    ),
    errors: summaries.filter((summary) => summary.error !== null).length,
    prunedListings,
    durationMs: Date.now() - startedAt,
    summaries,
  };
}
