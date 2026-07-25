import { NextResponse } from "next/server";
import { searchApartments } from "../../../server/search/service";
import { isSearchSource } from "../../../server/search/sources";
import { SearchRequestSchema } from "../../../shared/search-contract";

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
      const budgetError = parsedRequest.error.issues.find(
        (issue) => issue.message === "minimum rent cannot exceed maximum rent.",
      );
      return NextResponse.json(
        {
          error:
            budgetError?.message ??
            "check the apartment filters and try again.",
        },
        { status: 400 },
      );
    }
    const { excludeUrls = [], ...preferences } = parsedRequest.data;
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
