import * as z from "zod/v4";
import { CITY_IDS } from "./cities";

const PreferenceShape = {
  city: z.enum(CITY_IDS).default("sf"),
  budgetMin: z.number().min(0).max(20_000),
  budgetMax: z.number().min(1_000).max(20_000),
  bedrooms: z.enum(["studio", "1", "2", "3+"]),
  bathroomsMin: z.number().min(1).max(4),
  neighborhoods: z.array(z.string().min(1).max(80)).max(20),
  moveIn: z.enum(["now", "30 days", "60 days", "flexible"]),
  laundry: z.enum(["any", "in-unit", "in-building"]),
  dishwasher: z.boolean(),
  pets: z.boolean(),
  // Defaulted so stored preferences and in-flight clients from before this
  // field existed keep validating.
  entireUnit: z.boolean().default(false),
  minSquareFeet: z.number().min(0).max(5_000),
} as const;

const validBudgetRange = (preferences: {
  budgetMin: number;
  budgetMax: number;
}) => preferences.budgetMin <= preferences.budgetMax;

export const PreferencesSchema = z
  .object(PreferenceShape)
  .refine(validBudgetRange, {
    message: "minimum rent cannot exceed maximum rent.",
    path: ["budgetMin"],
  });

export const StoredPreferencesSchema = z.object(PreferenceShape).partial();

export const SearchRequestSchema = z
  .object({
    ...PreferenceShape,
    excludeUrls: z.array(z.string().url()).max(200).optional(),
  })
  .refine(validBudgetRange, {
    message: "minimum rent cannot exceed maximum rent.",
    path: ["budgetMin"],
  });

export const ApartmentCardSchema = z.object({
  city: z.enum(CITY_IDS).default("sf"),
  name: z.string(),
  url: z.string(),
  provider: z.string().nullable(),
  images: z.array(z.string()).max(12),
  price: z.number().nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  squareFeet: z.number().nullable(),
  floorLevel: z.string().nullable(),
  availability: z.string().nullable(),
  description: z.string().nullable(),
  laundry: z.enum(["in-unit", "in-building", "none", "unknown"]),
  dishwasher: z.boolean().nullable(),
  petsAllowed: z.boolean().nullable(),
  amenities: z.array(z.string()).max(12),
  matchScore: z.number().min(0).max(100),
  matchReasons: z.array(z.string()).max(4),
  catches: z.array(z.string()).max(4),
  preferenceFit: z.boolean(),
});

export const ApartmentSearchResponseSchema = z.object({
  apartments: z.array(ApartmentCardSchema),
});

export const SearchErrorResponseSchema = z.object({
  error: z.string(),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
export type ApartmentCard = z.infer<typeof ApartmentCardSchema>;
