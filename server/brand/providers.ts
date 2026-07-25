import * as z from "zod/v4";
import {
  LISTING_PROVIDERS,
  type ProviderBrand,
} from "../../shared/providers";
import { requestContext } from "../search/context-client";
import type { CityId } from "../../shared/cities";

const PROVIDER_CACHE_VERSION = 6;

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
  criblistProviderBrands?: Map<string, {
    version: number;
    expiresAt: number;
    providers: ProviderBrand[];
  }>;
  criblistProviderBrandsRequests?: Map<string, Promise<ProviderBrand[]>>;
};

const providerCache =
  globalProviderBrands.criblistProviderBrands ?? new Map();
const providerRequests =
  globalProviderBrands.criblistProviderBrandsRequests ?? new Map();
globalProviderBrands.criblistProviderBrands = providerCache;
globalProviderBrands.criblistProviderBrandsRequests = providerRequests;

export async function retrieveProviderBrands(
  apiKey: string,
  city?: CityId,
) {
  const cacheKey = city ?? "all";
  const cached = providerCache.get(cacheKey);
  if (
    cached &&
    cached.version === PROVIDER_CACHE_VERSION &&
    cached.expiresAt > Date.now()
  ) {
    return cached.providers;
  }

  const activeRequest = providerRequests.get(cacheKey);
  if (activeRequest) return activeRequest;

  const providersForCity = LISTING_PROVIDERS.filter(
    (provider) => city === undefined || provider.city === city,
  );
  const request = Promise.all(
    providersForCity.map((provider) =>
      retrieveProviderBrand(provider, apiKey),
    ),
  );
  providerRequests.set(cacheKey, request);
  try {
    const providers = await request;
    providerCache.set(cacheKey, {
      version: PROVIDER_CACHE_VERSION,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      providers,
    });
    return providers;
  } finally {
    if (providerRequests.get(cacheKey) === request) {
      providerRequests.delete(cacheKey);
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
      sourceId: provider.sourceId,
      city: provider.city,
      domain: provider.domain,
      label: provider.label,
      url: provider.url,
      title: brand.title?.trim() || provider.label,
      logoUrl: selectPreferredBrandLogo(brand.logos ?? []),
      color: preferredColor(brand.colors ?? []),
      accent: provider.accent,
    };
  } catch {
    return {
      sourceId: provider.sourceId,
      city: provider.city,
      domain: provider.domain,
      label: provider.label,
      url: provider.url,
      title: provider.label,
      logoUrl: null,
      color: null,
      accent: provider.accent,
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
