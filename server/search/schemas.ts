import * as z from "zod/v4";

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
