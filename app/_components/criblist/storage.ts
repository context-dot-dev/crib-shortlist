import * as z from "zod/v4";
import {
  ApartmentCardSchema,
  PreferencesSchema,
  StoredPreferencesSchema,
  type ApartmentCard,
  type Preferences,
} from "../../../shared/search-contract";
import {
  DEFAULT_PREFERENCES,
  PREFS_KEY,
  SAVED_KEY,
  SESSION_KEY,
} from "./model";

const HuntSessionSchema = z.object({
  apartments: z.array(ApartmentCardSchema).min(1),
  currentIndex: z.number().int().nonnegative().default(0),
  seenUrls: z.array(z.string()).max(200).default([]),
});

type StorageReader = Pick<Storage, "getItem">;

export type HuntSession = z.infer<typeof HuntSessionSchema>;

export function loadHuntStorage(storage: StorageReader): {
  saved: ApartmentCard[];
  preferences: Preferences;
  session: HuntSession | null;
} {
  return {
    saved: parseSaved(readJson(storage, SAVED_KEY)),
    preferences: parsePreferences(readJson(storage, PREFS_KEY)),
    session: parseSession(readJson(storage, SESSION_KEY)),
  };
}

function parseSaved(value: unknown) {
  const parsed = z.array(ApartmentCardSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parsePreferences(value: unknown): Preferences {
  const parsed = StoredPreferencesSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_PREFERENCES;

  const budgetMin = boundedBudget(parsed.data.budgetMin, 0);
  const budgetMax = boundedBudget(parsed.data.budgetMax, 1_000);
  const restored = PreferencesSchema.safeParse({
    ...DEFAULT_PREFERENCES,
    ...parsed.data,
    budgetMin: Math.min(budgetMin, budgetMax),
    budgetMax: Math.max(budgetMin, budgetMax),
  });
  return restored.success ? restored.data : DEFAULT_PREFERENCES;
}

function parseSession(value: unknown) {
  const parsed = HuntSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readJson(storage: StorageReader, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value === null ? null : JSON.parse(value);
  } catch {
    return null;
  }
}

function boundedBudget(value: number | undefined, minimum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return minimum === 0
      ? DEFAULT_PREFERENCES.budgetMin
      : DEFAULT_PREFERENCES.budgetMax;
  }
  return Math.min(20_000, Math.max(minimum, value));
}
