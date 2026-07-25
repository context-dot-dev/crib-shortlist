import {
  listingCacheConfigured,
} from "../server/cache/listings";
import { refreshListingInventory } from "../server/cache/refresh";

const apiKey = process.env.CONTEXT_DEV_API_KEY?.trim();
const watch = process.argv.includes("--watch");
const intervalMinutes = readIntervalMinutes(process.argv);

if (!apiKey) throw new Error("CONTEXT_DEV_API_KEY is required.");
if (!listingCacheConfigured()) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

do {
  const result = await refreshListingInventory(apiKey);
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
