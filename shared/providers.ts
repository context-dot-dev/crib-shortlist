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
    searchOrder: 3,
    lanes: ["craigslist"] as const,
    domain: "craigslist.org",
    label: "craigslist",
    url: "https://sfbay.craigslist.org/search/sfc/apa",
    accent: "#7d35a5",
  },
  {
    sourceId: "brick-timber",
    searchOrder: 0,
    lanes: ["extract", "independent"] as const,
    domain: "rentbt.com",
    label: "brick + timber",
    url: "https://rentbt.com/listings/",
    accent: "#b57d66",
  },
  {
    sourceId: "rentsfnow",
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
    searchOrder: 2,
    lanes: ["fast", "independent"] as const,
    domain: "mosserliving.com",
    label: "mosser",
    url: "https://www.mosserliving.com/san-francisco-apartments/",
    accent: "#1796c7",
  },
  {
    sourceId: "jwavro",
    searchOrder: 4,
    lanes: ["extract", "independent"] as const,
    domain: "jwavro.com",
    label: "j. wavro",
    url: "https://www.jwavro.com/rental_list.php?hood=sfc",
    accent: "#3d496b",
  },
  {
    sourceId: "rentalsinc",
    searchOrder: 5,
    lanes: ["extract", "independent"] as const,
    domain: "rentalsinc.com",
    label: "rentals inc.",
    url: "https://www.rentalsinc.com/markets/san-francisco",
    accent: "#255b46",
  },
  {
    sourceId: "rentalsinsf",
    searchOrder: 6,
    lanes: ["fast", "independent"] as const,
    domain: "rentalsinsf.com",
    label: "rentals in sf",
    url: "https://www.rentalsinsf.com/listings/",
    accent: "#b43b32",
  },
  {
    sourceId: "landmark",
    searchOrder: 7,
    lanes: ["extract", "independent"] as const,
    domain: "landmarksf.com",
    label: "landmark sf",
    url: "https://www.landmarksf.com/floorplans",
    accent: "#9b6d35",
  },
  {
    sourceId: "relisto",
    searchOrder: 8,
    lanes: ["extract", "independent"] as const,
    domain: "relisto.com",
    label: "relisto",
    url: "https://www.relisto.com/search/",
    accent: "#c54831",
  },
] as const satisfies ReadonlyArray<{
  sourceId: string;
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
  .sort((first, second) => first.searchOrder - second.searchOrder)
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

export function selectedSources(source: SearchSource): SourceId[] {
  if (source === "all") return [...SOURCE_IDS];
  return SOURCE_IDS.filter((sourceId) =>
    LISTING_PROVIDERS.find((provider) => provider.sourceId === sourceId)
      ?.lanes.some((lane) => lane === source),
  );
}

export type ProviderBrand = {
  sourceId: SourceId;
  domain: string;
  label: string;
  url: string;
  title: string;
  logoUrl: string | null;
  color: string | null;
  accent: string;
};

export function fallbackProviderBrands(): ProviderBrand[] {
  return LISTING_PROVIDERS.map((provider) => ({
    sourceId: provider.sourceId,
    domain: provider.domain,
    label: provider.label,
    url: provider.url,
    title: provider.label,
    logoUrl: null,
    color: null,
    accent: provider.accent,
  }));
}
