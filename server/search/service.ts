import {
  pruneRemovedListings,
  readListingCache,
  storeSearchListings,
} from "../cache/listings";
import {
  buildApartmentDeck,
  mergeApartmentInventory,
} from "./apartment-deck";
import { removedCraigslistListingUrls } from "./craigslist";
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
  const knownRemovedUrls: string[] = [];

  if (cached.coverageFresh) {
    const verified = await verifiedApartmentDeck(
      cached.apartments,
      preferences,
      excludedUrls,
      apiKey,
    );
    knownRemovedUrls.push(...verified.removedUrls);
    await pruneRemovedListings(verified.removedUrls).catch(() => 0);
    // Only skip live discovery when the verified deck still has cards to
    // show; a deck emptied by removed postings needs a fresh acquisition.
    if (
      verified.deck.apartments.length > 0 ||
      verified.removedUrls.length === 0
    ) {
      return {
        apartments: verified.deck.apartments,
        analyzed: verified.deck.analyzed,
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
          extracted: verified.deck.analyzed,
          discoveredSources: verified.deck.discoveredSources,
          deckSources: verified.deck.deckSources,
          qualityMatched: verified.deck.qualityMatches,
          coreMatched: verified.deck.coreMatches,
          relaxed: verified.deck.relaxed,
          cache: {
            hit: true,
            ageMs: cached.ageMs,
          },
          sourceErrors: {},
        },
      };
    }
  }

  const measurements = await discoverSources(sources, preferences, apiKey);
  const discoveredAt = Date.now();
  const liveDeck = buildApartmentDeck(
    measurements.flatMap((measurement) => measurement.value),
    preferences,
    { excludedUrls: [...excludedUrls, ...knownRemovedUrls] },
  );
  await storeSearchListings(
    measurements.map((measurement) => ({
      sourceId: measurement.sourceId,
      apartments: measurement.value,
    })),
    preferences.bedrooms,
  ).catch(() => false);

  let selectedDeck = liveDeck;
  let useCachedFallback = false;
  if (liveDeck.apartments.length === 0 && cached.apartments.length > 0) {
    const fallback = await verifiedApartmentDeck(
      cached.apartments,
      preferences,
      [...excludedUrls, ...knownRemovedUrls],
      apiKey,
    );
    await pruneRemovedListings(fallback.removedUrls).catch(() => 0);
    if (fallback.deck.apartments.length > 0) {
      selectedDeck = fallback.deck;
      useCachedFallback = true;
    }
  }

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

const DECK_VERIFICATION_ROUNDS = 4;

/**
 * Builds an Apartment Deck from Listing Inventory, but confirms every
 * Craigslist card in the deck still points to a live posting. Craigslist
 * serves flagged/deleted/expired postings as normal HTTP 200 pages, so
 * cached cards must be re-checked against the posting body before renters
 * see them. Removed cards are excluded and the deck is rebuilt so other
 * inventory can fill the gap.
 */
export async function verifiedApartmentDeck(
  apartments: ApartmentCard[],
  preferences: Preferences,
  excludedUrls: string[],
  apiKey: string,
) {
  const exclusions = new Set(excludedUrls);
  const liveUrls = new Set<string>();
  const removedUrls: string[] = [];

  for (let round = 0; round < DECK_VERIFICATION_ROUNDS; round += 1) {
    const deck = buildApartmentDeck(apartments, preferences, {
      excludedUrls: [...exclusions],
    });
    const unverifiedUrls = deck.apartments
      .filter(
        (apartment) =>
          apartment.provider === "craigslist.org" &&
          !liveUrls.has(apartment.url),
      )
      .map((apartment) => apartment.url);
    if (unverifiedUrls.length === 0) return { deck, removedUrls };

    const removed = new Set(
      await removedCraigslistListingUrls(unverifiedUrls, apiKey),
    );
    for (const url of unverifiedUrls) {
      if (removed.has(url)) {
        exclusions.add(url);
        removedUrls.push(url);
      } else {
        liveUrls.add(url);
      }
    }
    if (removed.size === 0) return { deck, removedUrls };
  }

  // Verification budget exhausted while removals keep surfacing: only offer
  // Craigslist cards that were confirmed live.
  const provenApartments = apartments.filter(
    (apartment) =>
      apartment.provider !== "craigslist.org" ||
      liveUrls.has(apartment.url),
  );
  return {
    deck: buildApartmentDeck(provenApartments, preferences, {
      excludedUrls: [...exclusions],
    }),
    removedUrls,
  };
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
