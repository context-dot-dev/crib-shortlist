import type {
  ApartmentCard,
  Preferences,
} from "../../../shared/search-contract";
import {
  CITY_CONFIG,
  type CityId,
} from "../../../shared/cities";

export type {
  ApartmentCard,
  Preferences,
} from "../../../shared/search-contract";

export type LaundryPreference = Preferences["laundry"];

export type Decision = {
  apartment: ApartmentCard;
  kind: "pass" | "save";
};

export type Stage = "setup" | "searching" | "deck" | "done";

export const DEFAULT_PREFERENCES: Preferences = {
  city: "sf",
  budgetMin: 1800,
  budgetMax: 3500,
  bedrooms: "1",
  bathroomsMin: 1,
  neighborhoods: [],
  moveIn: "30 days",
  laundry: "any",
  dishwasher: false,
  pets: false,
  entireUnit: false,
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
  return `${CITY_CONFIG[preferences.city].shortLabel} · ${bedroom} · ${MONEY.format(preferences.budgetMin)}–${MONEY.format(preferences.budgetMax)}`;
}

export function cityPreferences(city: CityId): Partial<Preferences> {
  const budget = CITY_CONFIG[city].defaultBudget;
  return {
    city,
    neighborhoods: [],
    budgetMin: budget.minimum,
    budgetMax: budget.maximum,
  };
}
