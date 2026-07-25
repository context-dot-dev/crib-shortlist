import { NextResponse } from "next/server";
import { refreshListingInventory } from "../../../../server/cache/refresh";

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.CONTEXT_DEV_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "CONTEXT_DEV_API_KEY is required." },
      { status: 500 },
    );
  }

  return NextResponse.json(await refreshListingInventory(apiKey));
}
