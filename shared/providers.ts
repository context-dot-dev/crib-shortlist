import type { CityId } from "./cities";

export type SearchSource =
  | "all"
  | "fast"
  | "independent"
  | "craigslist"
  | "extract";

type ProviderLane = Exclude<SearchSource, "all">;

export const LISTING_PROVIDERS = [
  {
    sourceId: "craigslist",
    city: "sf",
    searchOrder: 3,
    lanes: ["craigslist"] as const,
    domain: "craigslist.org",
    label: "craigslist",
    url: "https://sfbay.craigslist.org/search/sfc/apa",
    accent: "#7d35a5",
  },
  {
    sourceId: "brick-timber",
    city: "sf",
    searchOrder: 0,
    lanes: ["extract", "independent"] as const,
    domain: "rentbt.com",
    label: "brick + timber",
    url: "https://rentbt.com/listings/",
    accent: "#b57d66",
  },
  {
    sourceId: "rentsfnow",
    city: "sf",
    searchOrder: 1,
    lanes: ["fast", "independent"] as const,
    domain: "rentsfnow.com",
    label: "rentsfnow",
    url: "https://www.rentsfnow.com/",
    accent: "#d1492e",
    fallbackLookup: {
      type: "by_name" as const,
      name: "RentSFNow",
    },
  },
  {
    sourceId: "mosser",
    city: "sf",
    searchOrder: 2,
    lanes: ["fast", "independent"] as const,
    domain: "mosserliving.com",
    label: "mosser",
    url: "https://www.mosserliving.com/san-francisco-apartments/",
    accent: "#1796c7",
  },
  {
    sourceId: "jwavro",
    city: "sf",
    searchOrder: 4,
    lanes: ["extract", "independent"] as const,
    domain: "jwavro.com",
    label: "j. wavro",
    url: "https://www.jwavro.com/rental_list.php?hood=sfc",
    accent: "#3d496b",
  },
  {
    sourceId: "rentalsinc",
    city: "sf",
    searchOrder: 5,
    lanes: ["extract", "independent"] as const,
    domain: "rentalsinc.com",
    label: "rentals inc.",
    url: "https://www.rentalsinc.com/markets/san-francisco",
    accent: "#255b46",
  },
  {
    sourceId: "rentalsinsf",
    city: "sf",
    searchOrder: 6,
    lanes: ["fast", "independent"] as const,
    domain: "rentalsinsf.com",
    label: "rentals in sf",
    url: "https://www.rentalsinsf.com/listings/",
    accent: "#b43b32",
  },
  {
    sourceId: "landmark",
    city: "sf",
    searchOrder: 7,
    lanes: ["extract", "independent"] as const,
    domain: "landmarksf.com",
    label: "landmark sf",
    url: "https://www.landmarksf.com/floorplans",
    accent: "#9b6d35",
  },
  {
    sourceId: "relisto",
    city: "sf",
    searchOrder: 8,
    lanes: ["extract", "independent"] as const,
    domain: "relisto.com",
    label: "relisto",
    url: "https://www.relisto.com/search/",
    accent: "#c54831",
  },
  {
    sourceId: "streeteasy",
    city: "nyc",
    searchOrder: 0,
    lanes: ["extract", "independent"] as const,
    domain: "streeteasy.com",
    label: "streeteasy",
    url: "https://streeteasy.com/for-rent/nyc",
    accent: "#006aff",
  },
  {
    sourceId: "nooklyn",
    city: "nyc",
    searchOrder: 1,
    lanes: ["fast", "independent"] as const,
    domain: "nooklyn.com",
    label: "nooklyn",
    url: "https://nooklyn.com/listings",
    accent: "#ff5a5f",
  },
  {
    sourceId: "brodsky",
    city: "nyc",
    searchOrder: 2,
    lanes: ["extract", "independent"] as const,
    domain: "brodsky.com",
    label: "brodsky",
    url: "https://www.brodsky.com/rentals",
    accent: "#c9a464",
  },
  {
    sourceId: "stonehenge",
    city: "nyc",
    searchOrder: 3,
    lanes: ["extract", "independent"] as const,
    domain: "stonehengenyc.com",
    label: "stonehenge",
    url: "https://www.stonehengenyc.com/apartments",
    accent: "#27666e",
  },
  {
    sourceId: "nyc-craigslist",
    city: "nyc",
    searchOrder: 4,
    lanes: ["craigslist"] as const,
    domain: "craigslist.org",
    label: "craigslist",
    url: "https://newyork.craigslist.org/search/apa",
    accent: "#7d35a5",
  },
] as const satisfies ReadonlyArray<{
  sourceId: string;
  city: CityId;
  searchOrder: number;
  lanes: readonly ProviderLane[];
  domain: string;
  label: string;
  url: string;
  accent: string;
  fallbackLookup?: { type: "by_name"; name: string };
}>;

export type SourceId = (typeof LISTING_PROVIDERS)[number]["sourceId"];

export const SOURCE_IDS: SourceId[] = [...LISTING_PROVIDERS]
  .sort((first, second) =>
    first.city === second.city
      ? first.searchOrder - second.searchOrder
      : first.city.localeCompare(second.city),
  )
  .map((provider) => provider.sourceId);

const SEARCH_SOURCES = [
  "all",
  "fast",
  "independent",
  "craigslist",
  "extract",
] as const satisfies readonly SearchSource[];

export function isSearchSource(value: unknown): value is SearchSource {
  return (
    typeof value === "string" &&
    (SEARCH_SOURCES as readonly string[]).includes(value)
  );
}

export function selectedSources(
  source: SearchSource,
  city: CityId,
): SourceId[] {
  return SOURCE_IDS.filter((sourceId) => {
    const provider = LISTING_PROVIDERS.find(
      (candidate) => candidate.sourceId === sourceId,
    );
    return (
      provider?.city === city &&
      (source === "all" || provider.lanes.some((lane) => lane === source))
    );
  });
}

export type ProviderBrand = {
  sourceId: SourceId;
  city: CityId;
  domain: string;
  label: string;
  url: string;
  title: string;
  logoUrl: string | null;
  color: string | null;
  accent: string;
};

export function fallbackProviderBrands(city?: CityId): ProviderBrand[] {
  return LISTING_PROVIDERS.filter(
    (provider) => city === undefined || provider.city === city,
  ).map((provider) => ({
    sourceId: provider.sourceId,
    city: provider.city,
    domain: provider.domain,
    label: provider.label,
    url: provider.url,
    title: provider.label,
    logoUrl: null,
    color: null,
    accent: provider.accent,
  }));
}
