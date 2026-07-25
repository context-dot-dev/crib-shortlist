export const CITY_IDS = ["sf", "nyc"] as const;

export type CityId = (typeof CITY_IDS)[number];

export const CITY_CONFIG = {
  sf: {
    label: "san francisco",
    shortLabel: "sf",
    fullName: "San Francisco",
    emoji: "🌉",
    headline: "the sf hunt, minus the hunting.",
    anywhereLabel: "anywhere in sf",
    allLabel: "all sf",
    defaultBudget: {
      minimum: 1_800,
      maximum: 3_500,
    },
    neighborhoods: [
      "Mission",
      "Hayes Valley",
      "Lower Haight",
      "Duboce Triangle",
      "Castro",
      "Noe Valley",
      "SoMa",
      "Dogpatch",
      "Potrero Hill",
      "North Beach",
      "Russian Hill",
      "Nob Hill",
      "Pacific Heights",
      "Marina",
      "Mission Bay",
      "Inner Sunset",
      "Outer Sunset",
      "Richmond",
      "Tenderloin",
    ],
  },
  nyc: {
    label: "new york city",
    shortLabel: "nyc",
    fullName: "New York City",
    emoji: "🗽",
    headline: "the nyc hunt, minus the hunting.",
    anywhereLabel: "anywhere in nyc",
    allLabel: "all nyc",
    defaultBudget: {
      minimum: 2_000,
      maximum: 5_000,
    },
    neighborhoods: [
      "Financial District",
      "Tribeca",
      "SoHo",
      "Lower East Side",
      "Nolita",
      "East Village",
      "Greenwich Village",
      "West Village",
      "Chelsea",
      "Flatiron",
      "Gramercy",
      "Stuyvesant Town",
      "Hell's Kitchen",
      "Midtown",
      "Midtown East",
      "Murray Hill",
      "Kips Bay",
      "Sutton Place",
      "Upper East Side",
      "Upper West Side",
      "Morningside Heights",
      "Harlem",
      "East Harlem",
      "Washington Heights",
      "Inwood",
      "Williamsburg",
      "Greenpoint",
      "Bushwick",
      "Bed-Stuy",
      "Crown Heights",
      "Prospect Heights",
      "Fort Greene",
      "Clinton Hill",
      "Downtown Brooklyn",
      "Boerum Hill",
      "Cobble Hill",
      "Carroll Gardens",
      "Gowanus",
      "Park Slope",
      "Sunset Park",
      "Bay Ridge",
      "Astoria",
      "Long Island City",
      "Sunnyside",
      "Woodside",
      "Jackson Heights",
      "Ridgewood",
      "Forest Hills",
      "Mott Haven",
      "Riverdale",
    ],
  },
} as const satisfies Record<
  CityId,
  {
    label: string;
    shortLabel: string;
    fullName: string;
    emoji: string;
    headline: string;
    anywhereLabel: string;
    allLabel: string;
    defaultBudget: {
      minimum: number;
      maximum: number;
    };
    neighborhoods: readonly string[];
  }
>;

export function isCityId(value: unknown): value is CityId {
  return (
    typeof value === "string" &&
    (CITY_IDS as readonly string[]).includes(value)
  );
}
