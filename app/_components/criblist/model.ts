export type LaundryPreference = "any" | "in-unit" | "in-building";

export type Preferences = {
  budgetMin: number;
  budgetMax: number;
  bedrooms: "studio" | "1" | "2" | "3+";
  bathroomsMin: number;
  neighborhoods: string[];
  moveIn: "now" | "30 days" | "60 days" | "flexible";
  laundry: LaundryPreference;
  dishwasher: boolean;
  pets: boolean;
  minSquareFeet: number;
};

export type ApartmentCard = {
  name: string;
  url: string;
  provider: string | null;
  images: string[];
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  neighborhood: string | null;
  address: string | null;
  squareFeet: number | null;
  floorLevel: string | null;
  availability: string | null;
  description: string | null;
  laundry: "in-unit" | "in-building" | "none" | "unknown";
  dishwasher: boolean | null;
  petsAllowed: boolean | null;
  amenities: string[];
  matchScore: number;
  matchReasons: string[];
  catches: string[];
};

export type Decision = {
  apartment: ApartmentCard;
  kind: "pass" | "save";
};

export type Stage = "setup" | "searching" | "deck" | "done";

export const NEIGHBORHOODS = [
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
];

export const DEFAULT_PREFERENCES: Preferences = {
  budgetMin: 1800,
  budgetMax: 3500,
  bedrooms: "1",
  bathroomsMin: 1,
  neighborhoods: [],
  moveIn: "30 days",
  laundry: "any",
  dishwasher: false,
  pets: false,
  minSquareFeet: 0,
};

export const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const PREFS_KEY = "criblist.prefs.v1";
export const SAVED_KEY = "criblist.saved.v1";
export const SESSION_KEY = "criblist.session.v3";
export const EASE = [0.23, 1, 0.32, 1] as const;

export function formatBedrooms(bedrooms: number | null) {
  if (bedrooms === null) return "beds n/a";
  return bedrooms === 0 ? "studio" : `${bedrooms} bed`;
}

export function formatLaundry(
  laundry: ApartmentCard["laundry"] | LaundryPreference,
) {
  if (laundry === "in-unit") return "in-unit";
  if (laundry === "in-building") return "in building";
  if (laundry === "none") return "none";
  return "any";
}

export function formatSearchLabel(preferences: Preferences) {
  const bedroom =
    preferences.bedrooms === "studio"
      ? "studio"
      : preferences.bedrooms === "3+"
        ? "3+ beds"
        : `${preferences.bedrooms} bed`;
  return `${bedroom} · ${MONEY.format(preferences.budgetMin)}–${MONEY.format(preferences.budgetMax)}`;
}
