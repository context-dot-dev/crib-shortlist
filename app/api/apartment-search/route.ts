import { NextResponse } from "next/server";
import {
  searchApartments,
  type SearchSource,
} from "../../../server/search/service";
import { SearchRequestSchema } from "../../../server/search/schemas";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const sourceParameter = new URL(request.url).searchParams.get("source");
    const source = isSearchSource(sourceParameter) ? sourceParameter : "all";
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "check the apartment filters and try again." },
        { status: 400 },
      );
    }
    const parsedRequest = SearchRequestSchema.safeParse(
      requestBody,
    );
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "check the apartment filters and try again." },
        { status: 400 },
      );
    }
    const { excludeUrls = [], ...preferences } = parsedRequest.data;
    if (preferences.budgetMin > preferences.budgetMax) {
      return NextResponse.json(
        { error: "minimum rent cannot exceed maximum rent." },
        { status: 400 },
      );
    }

    const apiKey = process.env.CONTEXT_DEV_API_KEY;
    if (!apiKey) {
      throw new Error("a context.dev key is required.");
    }

    return NextResponse.json(
      await searchApartments(preferences, apiKey, source, excludeUrls),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isSearchSource(value: string | null): value is SearchSource {
  return (
    value === "all" ||
    value === "fast" ||
    value === "independent" ||
    value === "craigslist" ||
    value === "extract"
  );
}
