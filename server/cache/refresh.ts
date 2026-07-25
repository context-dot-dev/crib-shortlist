import {
  pruneExpiredListings,
  stabilizeCraigslistImages,
  storeInventorySegment,
} from "./listings";
import {
  inventoryPreferences,
  refreshInventorySegment,
} from "../search/service";
import {
  SOURCE_IDS,
  type SourceId,
} from "../search/sources";
import {
  CITY_IDS,
  type CityId,
} from "../../shared/cities";
import { LISTING_PROVIDERS } from "../../shared/providers";
import type { Preferences } from "../../shared/search-contract";

const BEDROOM_KEYS = ["studio", "1", "2", "3+"] as const;
const REFRESH_CONCURRENCY = 2;

type RefreshOptions = {
  cities?: CityId[];
  sourceIds?: SourceId[];
  bedrooms?: Preferences["bedrooms"][];
};

export async function refreshListingInventory(
  apiKey: string,
  options: RefreshOptions = {},
) {
  const startedAt = Date.now();
  const cities = options.cities ?? [...CITY_IDS];
  const bedroomKeys = options.bedrooms ?? [...BEDROOM_KEYS];
  const tasks = cities.flatMap((city) =>
    bedroomKeys.flatMap((bedrooms) =>
      sourceIdsForCity(city, options.sourceIds).map((sourceId) => ({
        city,
        bedrooms,
        sourceId,
      })),
    ),
  );
  if (tasks.length === 0) {
    throw new Error("No listing sources matched the refresh filters.");
  }
  const summaries = await runWithConcurrency(
    tasks,
    REFRESH_CONCURRENCY,
    async ({ city, bedrooms, sourceId }) => {
      const preferences = inventoryPreferences(city, bedrooms);
      try {
        const result = await refreshInventorySegment(
          sourceId,
          preferences,
          apiKey,
        );
        const apartments =
          sourceId === "craigslist" || sourceId === "nyc-craigslist"
            ? await stabilizeCraigslistImages(result.apartments, apiKey)
            : result.apartments;
        await storeInventorySegment({
          sourceId,
          bedrooms,
          apartments,
          durationMs: result.durationMs,
        });
        return {
          city,
          source: sourceId,
          bedrooms,
          listings: apartments.length,
          durationMs: result.durationMs,
          error: null,
        };
      } catch (error) {
        return {
          city,
          source: sourceId,
          bedrooms,
          listings: 0,
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
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

function sourceIdsForCity(
  city: CityId,
  requestedSourceIds?: SourceId[],
) {
  const sourceIds = new Set(
    LISTING_PROVIDERS.filter((provider) => provider.city === city).map(
      (provider) => provider.sourceId,
    ),
  );
  return SOURCE_IDS.filter(
    (sourceId) =>
      sourceIds.has(sourceId) &&
      (requestedSourceIds === undefined ||
        requestedSourceIds.includes(sourceId)),
  );
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
) {
  const groups = Array.from(
    { length: Math.ceil(items.length / concurrency) },
    (_, index) =>
      items.slice(index * concurrency, (index + 1) * concurrency),
  );
  const results: R[] = [];
  for (const group of groups) {
    results.push(...(await Promise.all(group.map(operation))));
  }
  return results;
}
