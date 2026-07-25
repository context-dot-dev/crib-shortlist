import {
  listingCacheConfigured,
} from "../server/cache/listings";
import { refreshListingInventory } from "../server/cache/refresh";
import {
  SOURCE_IDS,
  type SourceId,
} from "../shared/providers";

const apiKey = process.env.CONTEXT_DEV_API_KEY?.trim();
const watch = process.argv.includes("--watch");
const intervalMinutes = readIntervalMinutes(process.argv);
const city = readCity(process.argv);
const sourceId = readSourceId(process.argv);
const bedrooms = readBedrooms(process.argv);

if (!apiKey) throw new Error("CONTEXT_DEV_API_KEY is required.");
if (!listingCacheConfigured()) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

do {
  const result = await refreshListingInventory(apiKey, {
    cities: city ? [city] : undefined,
    sourceIds: sourceId ? [sourceId] : undefined,
    bedrooms: bedrooms ? [bedrooms] : undefined,
  });
  console.table(result.summaries);
  console.info(JSON.stringify({
    refreshedAt: result.refreshedAt,
    listings: result.listings,
    errors: result.errors,
    prunedListings: result.prunedListings,
    durationMs: result.durationMs,
  }));
  if (watch) {
    await new Promise((resolve) =>
      setTimeout(resolve, intervalMinutes * 60 * 1000),
    );
  }
} while (watch);

function readIntervalMinutes(argumentsList: string[]) {
  const rawValue = argumentsList
    .find((argument) => argument.startsWith("--interval-minutes="))
    ?.split("=")[1];
  const value = Number(rawValue ?? 30);
  if (!Number.isFinite(value) || value < 5) {
    throw new Error("The warming interval must be at least five minutes.");
  }
  return value;
}

function readCity(argumentsList: string[]) {
  const value = argumentsList
    .find((argument) => argument.startsWith("--city="))
    ?.split("=")[1];
  if (value === undefined) return undefined;
  if (value === "sf" || value === "nyc") return value;
  throw new Error("The city must be sf or nyc.");
}

function readSourceId(argumentsList: string[]): SourceId | undefined {
  const value = argumentsList
    .find((argument) => argument.startsWith("--source="))
    ?.split("=")[1];
  if (value === undefined) return undefined;
  if (SOURCE_IDS.some((sourceId) => sourceId === value)) {
    return value as SourceId;
  }
  throw new Error(`Unknown listing source: ${value}`);
}

function readBedrooms(argumentsList: string[]) {
  const value = argumentsList
    .find((argument) => argument.startsWith("--bedrooms="))
    ?.split("=")[1];
  if (value === undefined) return undefined;
  if (value === "studio" || value === "1" || value === "2" || value === "3+") {
    return value;
  }
  throw new Error("Bedrooms must be studio, 1, 2, or 3+.");
}
