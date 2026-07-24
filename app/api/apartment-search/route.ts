import { NextResponse } from "next/server";
import {
  searchApartments,
  type SearchSource,
} from "../../../server/search/service";
import { PreferencesSchema } from "../../../server/search/schemas";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const sourceParameter = new URL(request.url).searchParams.get("source");
    const source = isSearchSource(sourceParameter) ? sourceParameter : "all";
    const preferences = PreferencesSchema.parse(await request.json());
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
      await searchApartments(preferences, apiKey, source),
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
