export const SOURCE_IDS = [
  "brick-timber",
  "rentsfnow",
  "mosser",
  "craigslist",
  "jwavro",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export type SearchSource =
  | "all"
  | "fast"
  | "independent"
  | "craigslist"
  | "extract";

export function selectedSources(source: SearchSource): SourceId[] {
  if (source === "fast") return ["brick-timber", "rentsfnow", "mosser"];
  if (source === "craigslist") return ["craigslist"];
  if (source === "extract") return ["jwavro"];
  if (source === "independent") {
    return ["brick-timber", "rentsfnow", "mosser", "jwavro"];
  }
  return [...SOURCE_IDS];
}
