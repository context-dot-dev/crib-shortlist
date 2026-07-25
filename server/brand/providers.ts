import * as z from "zod/v4";
import {
  LISTING_PROVIDERS,
  type ProviderBrand,
} from "../../shared/providers";
import { requestContext } from "../search/context-client";

const PROVIDER_CACHE_VERSION = 3;

const BrandResponseSchema = z
  .object({
    brand: z
      .object({
        title: z.string().optional(),
        colors: z
          .array(
            z
              .object({
                hex: z.string(),
              })
              .passthrough(),
          )
          .optional(),
        logos: z
          .array(
            z
              .object({
                url: z.string(),
                type: z.string().optional(),
                mode: z.string().optional(),
                resolution: z
                  .object({
                    width: z.number().optional(),
                    height: z.number().optional(),
                    aspect_ratio: z.number().optional(),
                  })
                  .optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

const globalProviderBrands = globalThis as typeof globalThis & {
  criblistProviderBrands?: {
    version: number;
    expiresAt: number;
    providers: ProviderBrand[];
  };
  criblistProviderBrandsRequest?: Promise<ProviderBrand[]>;
};

export async function retrieveProviderBrands(apiKey: string) {
  const cached = globalProviderBrands.criblistProviderBrands;
  if (
    cached &&
    cached.version === PROVIDER_CACHE_VERSION &&
    cached.expiresAt > Date.now()
  ) {
    return cached.providers;
  }

  const activeRequest = globalProviderBrands.criblistProviderBrandsRequest;
  if (activeRequest) return activeRequest;

  const request = Promise.all(
    LISTING_PROVIDERS.map((provider) =>
      retrieveProviderBrand(provider, apiKey),
    ),
  );
  globalProviderBrands.criblistProviderBrandsRequest = request;
  try {
    const providers = await request;
    globalProviderBrands.criblistProviderBrands = {
      version: PROVIDER_CACHE_VERSION,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      providers,
    };
    return providers;
  } finally {
    if (globalProviderBrands.criblistProviderBrandsRequest === request) {
      delete globalProviderBrands.criblistProviderBrandsRequest;
    }
  }
}

async function retrieveProviderBrand(
  provider: (typeof LISTING_PROVIDERS)[number],
  apiKey: string,
): Promise<ProviderBrand> {
  try {
    const primaryBrand = await retrieveBrand(
      {
        type: "by_domain",
        domain: provider.domain,
      },
      apiKey,
    );
    const fallbackLookup =
      "fallbackLookup" in provider ? provider.fallbackLookup : null;
    const fallbackBrand =
      (primaryBrand.logos?.length ?? 0) === 0 && fallbackLookup
        ? await retrieveBrand(fallbackLookup, apiKey)
        : null;
    const brand = fallbackBrand ?? primaryBrand;
    return {
      domain: provider.domain,
      label: provider.label,
      url: provider.url,
      title: brand.title?.trim() || provider.label,
      logoUrl: selectPreferredBrandLogo(brand.logos ?? []),
      color: preferredColor(brand.colors ?? []),
    };
  } catch {
    return {
      domain: provider.domain,
      label: provider.label,
      url: provider.url,
      title: provider.label,
      logoUrl: null,
      color: null,
    };
  }
}

async function retrieveBrand(
  lookup:
    | { type: "by_domain"; domain: string }
    | { type: "by_name"; name: string },
  apiKey: string,
) {
  const response = await requestContext("/brand/retrieve", apiKey, {
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...lookup,
        force_language: "english",
        maxSpeed: true,
        maxAgeMs: 7_776_000_000,
        timeoutMS: 20_000,
        tags: ["criblist", "landing-page", "provider"],
      }),
    },
    timeoutMs: 23_000,
    maxAttempts: 2,
  });
  return BrandResponseSchema.parse(response).brand;
}

export function selectPreferredBrandLogo(
  logos: Array<{
    url: string;
    type?: string;
    mode?: string;
    resolution?: {
      width?: number;
      height?: number;
      aspect_ratio?: number;
    };
  }>,
) {
  return (
    [...logos]
      .filter((logo) => /^https?:\/\//i.test(logo.url))
      .sort((first, second) => logoScore(second) - logoScore(first))[0]
      ?.url ?? null
  );
}

function logoScore(logo: {
  type?: string;
  mode?: string;
  resolution?: {
    width?: number;
    height?: number;
    aspect_ratio?: number;
  };
}) {
  const width = logo.resolution?.width ?? 0;
  const height = logo.resolution?.height ?? 0;
  const ratio =
    logo.resolution?.aspect_ratio ??
    (width > 0 && height > 0 ? width / height : 1);
  const typeScore =
    logo.type === "icon" ? 3_000_000 : logo.type === "logo" ? 1_000_000 : 0;
  const shapeScore = Math.max(0, 1_000_000 - Math.abs(1 - ratio) * 600_000);
  const resolutionScore = Math.min(width * height, 500_000);
  const modeScore = logo.mode === "light" ? 100_000 : 0;
  return typeScore + shapeScore + resolutionScore + modeScore;
}

function preferredColor(colors: Array<{ hex: string }>) {
  return (
    colors
      .map((color) => color.hex)
      .find((color) => /^#[0-9a-f]{6}$/i.test(color)) ?? null
  );
}
