import * as z from "zod/v4";

const LaundrySchema = z.enum(["any", "in-unit", "in-building"]);

export const PreferencesSchema = z.object({
  budgetMin: z.number().min(0).max(20000),
  budgetMax: z.number().min(1000).max(20000),
  bedrooms: z.enum(["studio", "1", "2", "3+"]),
  bathroomsMin: z.number().min(1).max(4),
  neighborhoods: z.array(z.string().min(1).max(80)).max(20),
  moveIn: z.enum(["now", "30 days", "60 days", "flexible"]),
  laundry: LaundrySchema,
  dishwasher: z.boolean(),
  pets: z.boolean(),
  minSquareFeet: z.number().min(0).max(5000),
});

export const ListingSnapshotSchema = z.object({
  success: z.literal(true),
  markdown: z.string(),
  contentLength: z.number(),
  url: z.string(),
  metadata: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      canonicalUrl: z.string().optional(),
      image: z.string().optional(),
      jsonLd: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .passthrough(),
});

export const HtmlResponseSchema = z
  .object({
    html: z.string(),
  })
  .passthrough();

export const ContextListingSchema = z.object({
  name: z.string().nullable(),
  url: z.string().nullable(),
  price: z.number().nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  squareFeet: z.number().nullable(),
  petsAllowed: z.boolean().nullable(),
  images: z.array(z.string()),
});

export const ExtractListingsResponseSchema = z
  .object({
    status: z.string(),
    data: z.object({
      listings: z.array(ContextListingSchema),
    }),
  })
  .passthrough();

export const ApartmentCardSchema = z.object({
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

export type Preferences = z.infer<typeof PreferencesSchema>;
export type ApartmentCard = z.infer<typeof ApartmentCardSchema>;
export type ListingSnapshot = z.infer<typeof ListingSnapshotSchema>;
export type ContextListing = z.infer<typeof ContextListingSchema>;

export type ExtractedApartment = {
  name: string | null;
  address: string | null;
  neighborhood: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  availability: string | null;
  laundry: "in-unit" | "in-building" | "none" | "unknown";
  dishwasher: boolean | null;
  petsAllowed: boolean | null;
  amenities: string[];
  description: string | null;
  caveats: string[];
};

export type ListingSource = {
  url: string;
  title: string;
  description: string;
};
