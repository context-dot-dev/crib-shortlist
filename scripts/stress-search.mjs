const baseUrl = process.env.CRIBLIST_BASE_URL ?? "http://localhost:3000";
const lanes = ["all", "fast", "craigslist", "extract"];
const profiles = [
  {
    name: "studio-value",
    city: "sf",
    budgetMin: 1_500,
    budgetMax: 3_000,
    bedrooms: "studio",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "30 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: false,
    minSquareFeet: 0,
  },
  {
    name: "one-bed-default",
    city: "sf",
    budgetMin: 1_800,
    budgetMax: 3_500,
    bedrooms: "1",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "30 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: false,
    minSquareFeet: 0,
  },
  {
    name: "one-bed-market",
    city: "sf",
    budgetMin: 2_500,
    budgetMax: 4_500,
    bedrooms: "1",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "30 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: false,
    minSquareFeet: 0,
  },
  {
    name: "two-bed",
    city: "sf",
    budgetMin: 3_000,
    budgetMax: 6_000,
    bedrooms: "2",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "60 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: false,
    minSquareFeet: 0,
  },
  {
    name: "three-plus",
    city: "sf",
    budgetMin: 4_000,
    budgetMax: 10_000,
    bedrooms: "3+",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "flexible",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: false,
    minSquareFeet: 0,
  },
  {
    name: "strict-one-bed",
    city: "sf",
    budgetMin: 2_500,
    budgetMax: 4_500,
    bedrooms: "1",
    bathroomsMin: 1,
    neighborhoods: ["Mission", "Hayes Valley", "Noe Valley"],
    moveIn: "30 days",
    laundry: "in-unit",
    dishwasher: true,
    pets: true,
    entireUnit: true,
    minSquareFeet: 500,
  },
  {
    name: "nyc-studio",
    city: "nyc",
    budgetMin: 2_500,
    budgetMax: 4_500,
    bedrooms: "studio",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "30 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: true,
    minSquareFeet: 0,
  },
  {
    name: "nyc-one-bed",
    city: "nyc",
    budgetMin: 3_000,
    budgetMax: 5_000,
    bedrooms: "1",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "30 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: true,
    minSquareFeet: 0,
  },
  {
    name: "nyc-two-bed",
    city: "nyc",
    budgetMin: 4_000,
    budgetMax: 7_000,
    bedrooms: "2",
    bathroomsMin: 1,
    neighborhoods: [],
    moveIn: "60 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: true,
    minSquareFeet: 0,
  },
  {
    name: "nyc-neighborhoods",
    city: "nyc",
    budgetMin: 3_000,
    budgetMax: 5_500,
    bedrooms: "1",
    bathroomsMin: 1,
    neighborhoods: ["Williamsburg", "Long Island City", "Astoria"],
    moveIn: "30 days",
    laundry: "any",
    dishwasher: false,
    pets: false,
    entireUnit: true,
    minSquareFeet: 0,
  },
];

const jobs = profiles.flatMap((profile) =>
  lanes.map((lane) => ({ profile, lane })),
);
const results = await mapWithConcurrency(
  jobs,
  4,
  ({ profile, lane }) => runLane(profile, lane),
);

const summaries = profiles.map((profile) => {
  const profileResults = results.filter(
    (result) => result.profile === profile.name,
  );
  const apartments = dedupe(
    profileResults.flatMap((result) => result.apartments),
  );
  const successfulDurations = profileResults
    .filter((result) => result.apartments.length > 0)
    .map((result) => result.durationMs);
  return {
    profile: profile.name,
    total: apartments.length,
    providers: Object.keys(providerCounts(apartments)).length,
    mix: JSON.stringify(providerCounts(apartments)),
    firstMs:
      successfulDurations.length > 0
        ? Math.min(...successfulDurations)
        : null,
    allMs: Math.max(...profileResults.map((result) => result.durationMs)),
    errors: profileResults.filter((result) => result.error).length,
  };
});

console.table(summaries);

if (summaries.some((summary) => summary.errors > 0)) process.exitCode = 1;

async function runLane(profile, lane) {
  const startedAt = Date.now();
  try {
    const response = await fetch(
      `${baseUrl}/api/apartment-search?source=${lane}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withoutName(profile)),
        signal: AbortSignal.timeout(90_000),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return {
      profile: profile.name,
      lane,
      durationMs: Date.now() - startedAt,
      apartments: result.apartments ?? [],
      error: null,
    };
  } catch (error) {
    return {
      profile: profile.name,
      lane,
      durationMs: Date.now() - startedAt,
      apartments: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function withoutName(profile) {
  const { name, ...preferences } = profile;
  return preferences;
}

function dedupe(apartments) {
  return [
    ...new Map(apartments.map((apartment) => [apartment.url, apartment])).values(),
  ];
}

function providerCounts(apartments) {
  return apartments.reduce(
    (counts, apartment) => ({
      ...counts,
      [apartment.provider ?? "unknown"]:
        (counts[apartment.provider ?? "unknown"] ?? 0) + 1,
    }),
    {},
  );
}

async function mapWithConcurrency(items, concurrency, operation) {
  const groups = Array.from(
    { length: Math.ceil(items.length / concurrency) },
    (_, index) =>
      items.slice(index * concurrency, (index + 1) * concurrency),
  );
  const results = [];
  for (const group of groups) {
    results.push(...(await Promise.all(group.map(operation))));
  }
  return results;
}
