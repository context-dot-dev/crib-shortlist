export const SOURCE_IDS = [
  "brick-timber",
  "rentsfnow",
  "mosser",
  "craigslist",
  "jwavro",
  "rentalsinc",
  "rentalsinsf",
  "landmark",
  "relisto",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export type SearchSource =
  | "all"
  | "fast"
  | "independent"
  | "craigslist"
  | "extract";

export function selectedSources(source: SearchSource): SourceId[] {
  if (source === "fast") {
    return [
      "brick-timber",
      "rentsfnow",
      "mosser",
      "rentalsinsf",
    ];
  }
  if (source === "craigslist") return ["craigslist"];
  if (source === "extract") {
    return ["jwavro", "rentalsinc", "landmark", "relisto"];
  }
  if (source === "independent") {
    return SOURCE_IDS.filter((sourceId) => sourceId !== "craigslist");
  }
  return [...SOURCE_IDS];
}
