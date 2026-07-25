import { NextResponse } from "next/server";
import { retrieveProviderBrands } from "../../../server/brand/providers";
import { fallbackProviderBrands } from "../../../shared/providers";

export const maxDuration = 60;

export async function GET() {
  const apiKey = process.env.CONTEXT_DEV_API_KEY;
  const providers = apiKey
    ? await retrieveProviderBrands(apiKey)
    : fallbackProviderBrands();

  return NextResponse.json(
    {
      providers,
      enrichedBy: apiKey ? "context.dev brand api" : null,
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
