import assert from "node:assert/strict";
import test from "node:test";
import { POST as apartmentSearchPost } from "../app/api/apartment-search/route";
import { loadHuntStorage } from "../app/_components/criblist/storage";
import { selectPreferredBrandLogo } from "../server/brand/providers";
import { extractHostedImageUrls } from "../server/cache/listings";
import {
  buildSearchUrl,
  cardFromSnapshot,
  extractCraigslistSearchCandidates,
  isRemovedCraigslistPosting,
  removedCraigslistListingUrls,
  snapshotFromHtml,
} from "../server/search/craigslist";
import { verifiedApartmentDeck } from "../server/search/service";
import {
  filterAvailableListings,
  fetchPublicHtml,
  publicUrlExists,
} from "../server/search/html";
import { extractedCardFromHtml } from "../server/search/extracted-inventory";
import { buildApartmentDeck } from "../server/search/apartment-deck";
import {
  extractRentalsInSfUrls,
  rentalsInSfCardFromHtml,
} from "../server/search/rentalsinsf";
import { extractRentSfNowCandidates } from "../server/search/rentsfnow";
import {
  isSearchSource,
  selectedSources,
} from "../server/search/sources";
import type {
  ApartmentCard,
  Preferences,
} from "../shared/search-contract";
import {
  ApartmentSearchResponseSchema,
  PreferencesSchema,
} from "../shared/search-contract";
import {
  LISTING_PROVIDERS,
  SOURCE_IDS,
} from "../shared/providers";
import type { ContextListing } from "../server/search/schemas";

const preferences: Preferences = {
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
};

test("returns a client error for malformed search JSON", async () => {
  const response = await apartmentSearchPost(
    new Request("http://localhost/api/apartment-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "check the apartment filters and try again.",
  });
});

test("keeps budget ordering in the shared Preferences contract", async () => {
  assert.equal(
    PreferencesSchema.safeParse({
      ...preferences,
      budgetMin: 4_000,
      budgetMax: 3_000,
    }).success,
    false,
  );

  const response = await apartmentSearchPost(
    new Request("http://localhost/api/apartment-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...preferences,
        budgetMin: 4_000,
        budgetMax: 3_000,
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "minimum rent cannot exceed maximum rent.",
  });
});

test("decodes browser storage keys independently", () => {
  const values = new Map<string, string>([
    ["criblist.saved.v1", "not-json"],
    ["criblist.prefs.v1", JSON.stringify({ bedrooms: "2" })],
  ]);
  const restored = loadHuntStorage({
    getItem: (key) => values.get(key) ?? null,
  });

  assert.deepEqual(restored.saved, []);
  assert.equal(restored.preferences.bedrooms, "2");
  assert.equal(restored.preferences.budgetMin, 1_800);
  assert.equal(restored.session, null);
});

test("rejects malformed Apartment Cards at the browser response seam", () => {
  const malformed = {
    ...apartmentCard(),
    matchScore: "100",
  };
  assert.equal(
    ApartmentSearchResponseSchema.safeParse({
      apartments: [malformed],
    }).success,
    false,
  );
});

test("prefers a square brand icon over a larger wordmark", () => {
  const selected = selectPreferredBrandLogo([
    {
      url: "https://media.brand.dev/rentsfnow-wordmark.png",
      type: "logo",
      mode: "has_opaque_background",
      resolution: { width: 975, height: 512, aspect_ratio: 1.9 },
    },
    {
      url: "https://media.brand.dev/rentsfnow-icon.png",
      type: "icon",
      mode: "light",
      resolution: { width: 152, height: 152, aspect_ratio: 1 },
    },
  ]);

  assert.equal(selected, "https://media.brand.dev/rentsfnow-icon.png");
});

test("keeps only card-sized Context-hosted listing images", () => {
  const images = extractHostedImageUrls({
    images: [
      {
        enrichment: {
          url: "https://media.brand.dev/full.jpg",
          width: 600,
          height: 399,
        },
      },
      {
        enrichment: {
          url: "https://media.brand.dev/thumb.jpg",
          width: 50,
          height: 50,
        },
      },
      {
        enrichment: {
          url: "https://untrusted.example.com/full.jpg",
          width: 1200,
          height: 800,
        },
      },
    ],
  });

  assert.deepEqual(images, ["https://media.brand.dev/full.jpg"]);
});

test("parses current Craigslist search result markup", () => {
  const candidates = extractCraigslistSearchCandidates(`
    <li class="cl-static-search-result" title="Sunny one bedroom">
      <a href="https://www.craigslist.org/view/d/san-francisco-sunny-one/abc123">
        <div class="title">Sunny one bedroom</div>
        <div class="details">
          <div class="price">$2,750</div>
          <div class="location">mission</div>
        </div>
      </a>
    </li>
  `);

  assert.deepEqual(candidates, [
    {
      url: "https://www.craigslist.org/view/d/san-francisco-sunny-one/abc123",
      name: "Sunny one bedroom",
      price: 2_750,
      location: "mission",
    },
  ]);
});

test("uses exact Craigslist bedroom filters", () => {
  const studioUrl = new URL(
    buildSearchUrl({ ...preferences, bedrooms: "studio" }),
  );
  const twoBedUrl = new URL(
    buildSearchUrl({ ...preferences, bedrooms: "2" }),
  );

  assert.equal(studioUrl.searchParams.get("min_bedrooms"), "0");
  assert.equal(studioUrl.searchParams.get("max_bedrooms"), "0");
  assert.equal(twoBedUrl.searchParams.get("min_bedrooms"), "2");
  assert.equal(twoBedUrl.searchParams.get("max_bedrooms"), "2");
  assert.equal(studioUrl.searchParams.has("hub"), false);
});

test("accepts Craigslist House JSON-LD and builds a complete card", () => {
  const url =
    "https://www.craigslist.org/view/d/san-francisco-sunny-one/abc123";
  const html = `
    <html>
      <head>
        <title>$2,750 / 1br - Sunny one bedroom</title>
        <meta name="description" content="Sunny home with shared laundry and dishwasher">
        <meta property="og:image" content="https://images.craigslist.org/example_600x450.jpg">
        <link rel="canonical" href="${url}">
        <script type="application/ld+json">
          {
            "@type": "House",
            "numberOfBathroomsTotal": 1,
            "petsAllowed": true,
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "123 Valencia Street",
              "addressLocality": "San Francisco",
              "addressRegion": "CA",
              "postalCode": "94110"
            }
          }
        </script>
      </head>
      <body>
        <h1 class="postingtitle">
          <span class="price">$2,750</span>
          <span class="housing">/ 1br - </span>
          <span id="titletextonly">Sunny one bedroom</span>
        </h1>
        available now
        shared laundry
        dishwasher
        <img src="https://images.craigslist.org/example_600x450.jpg">
      </body>
    </html>
  `;
  const card = cardFromSnapshot(
    snapshotFromHtml(url, html),
    preferences,
  );

  assert.ok(card);
  assert.equal(card.provider, "craigslist.org");
  assert.equal(card.price, 2_750);
  assert.equal(card.bedrooms, 1);
  assert.equal(card.bathrooms, 1);
  assert.equal(card.address, "123 Valencia Street, San Francisco, CA, 94110");
  assert.equal(card.laundry, "in-building");
  assert.equal(card.images.length, 1);
});

test("rejects a Craigslist detail page with the wrong bedroom count", () => {
  const card = cardFromSnapshot(
    snapshotFromHtml(
      "https://www.craigslist.org/view/d/example/wrong-bedroom",
      `
        <title>$2,750 / 1br - Wrong bedroom count</title>
        <link rel="canonical" href="https://www.craigslist.org/view/d/example/wrong-bedroom">
        <script type="application/ld+json">
          {
            "@type": "Apartment",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "123 Valencia Street",
              "addressLocality": "San Francisco",
              "addressRegion": "CA"
            }
          }
        </script>
        <h1 class="postingtitle">$2,750 / 1br - Wrong bedroom count</h1>
        <img src="https://images.craigslist.org/example_600x450.jpg">
      `,
    ),
    { ...preferences, bedrooms: "2" },
  );

  assert.equal(card, null);
});

test("detects every Craigslist posting removal state", () => {
  const removalNotices = [
    "This posting has been flagged for removal.",
    "This posting has been deleted by its author.",
    "This posting has been removed by craigslist.",
    "This posting has expired.",
  ];
  for (const notice of removalNotices) {
    const snapshot = snapshotFromHtml(
      "https://www.craigslist.org/view/d/example/removed",
      `
        <html>
          <head><title>$2,750 / 1br - Sunny one bedroom</title></head>
          <body>
            <div class="removed">
              <h2>${notice}</h2>
              <p>(The title on the listings page will be removed in just a few minutes.)</p>
            </div>
          </body>
        </html>
      `,
    );
    assert.equal(isRemovedCraigslistPosting(snapshot.markdown), true, notice);
  }

  const liveSnapshot = snapshotFromHtml(
    "https://www.craigslist.org/view/d/example/live",
    `
      <html>
        <head><title>$2,750 / 1br - Sunny one bedroom</title></head>
        <body>
          <h1 class="postingtitle">$2,750 / 1br - Sunny one bedroom</h1>
          <section id="postingbody">Bright apartment near the park.</section>
        </body>
      </html>
    `,
  );
  assert.equal(isRemovedCraigslistPosting(liveSnapshot.markdown), false);
});

test("reports which Craigslist listings now show a removal notice", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    new Response(
      String(input).includes("flagged")
        ? `<html><body><div class="removed"><h2>This posting has been flagged for removal.</h2></div></body></html>`
        : `<html><body><section id="postingbody">Still live.</section></body></html>`,
      { status: 200 },
    );

  try {
    assert.deepEqual(
      await removedCraigslistListingUrls(
        [
          "https://removal-check.invalid/flagged-post",
          "https://removal-check.invalid/live-post",
        ],
        "test-key",
      ),
      ["https://removal-check.invalid/flagged-post"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("drops flagged Craigslist cards from cached Apartment Decks", async () => {
  const flagged = apartmentCard({
    name: "Flagged craigslist one bedroom",
    url: "https://deck-verify.invalid/flagged-post",
    provider: "craigslist.org",
    address: "100 Valencia Street, San Francisco, CA",
  });
  const live = apartmentCard({
    name: "Live craigslist one bedroom",
    url: "https://deck-verify.invalid/live-post",
    provider: "craigslist.org",
    address: "200 Guerrero Street, San Francisco, CA",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    new Response(
      String(input).includes("flagged")
        ? `<html><body><div class="removed"><h2>This posting has been flagged for removal.</h2></div></body></html>`
        : `<html><body><section id="postingbody">Still live.</section></body></html>`,
      { status: 200 },
    );

  try {
    const verified = await verifiedApartmentDeck(
      [flagged, live],
      preferences,
      [],
      "test-key",
    );
    assert.deepEqual(
      verified.deck.apartments.map((apartment) => apartment.url),
      [live.url],
    );
    assert.deepEqual(verified.removedUrls, [flagged.url]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parses RentSFNow featured inventory cards", () => {
  const candidates = extractRentSfNowCandidates(`
    <a href="/apartments/rental/655-powell-5" class="apartment-image">
      <div class="veritasCarouselImage" style="background-image:url('https://cdn.rentcafe.com/unit(1).jpg');"></div>
      <h5>Nob Hill</h5>
      <h4>655 Powell #5</h4>
      <p>1 Bed \\\\ 1 Bath \\\\ &#36;3,495</p>
    </a>
  `);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].price, 3_495);
  assert.equal(candidates[0].bedrooms, 1);
  assert.equal(candidates[0].bathrooms, 1);
  assert.equal(candidates[0].neighborhood, "Nob Hill");
  assert.equal(candidates[0].image, "https://cdn.rentcafe.com/unit(1).jpg");
});

test("enriches Brick + Timber Extract candidates from detail markup", () => {
  const candidate: ContextListing = {
    name: "540 Leavenworth Street #104",
    url: "https://rentbt.com/listing/540-leavenworth-unit-104",
    price: 2_595,
    bedrooms: 1,
    bathrooms: 1,
    neighborhood: "Tenderloin",
    address: "540 Leavenworth Street, San Francisco, CA 94109",
    squareFeet: 610,
    petsAllowed: true,
    images: [],
  };
  const html = `
    <script type="application/ld+json">
      {
        "@type": "Apartment",
        "name": "540 Leavenworth Street #104",
        "description": "Pet friendly with shared laundry in the building.",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "540 Leavenworth Street",
          "addressLocality": "San Francisco",
          "addressRegion": "CA",
          "postalCode": "94109"
        },
        "numberOfBedrooms": 1,
        "numberOfBathroomsTotal": 1,
        "floorSize": { "value": 610 },
        "petsAllowed": true,
        "image": ["https://images.example.com/leavenworth.jpg"],
        "offers": {
          "@type": "Offer",
          "price": 2595,
          "availability": "https://schema.org/InStock"
        }
      }
    </script>
  `;
  const card = extractedCardFromHtml(
    {
      id: "brick-timber",
      inventoryUrl: "https://rentbt.com/listings/",
      instructions: "",
      caveat:
        "Live Brick + Timber inventory. Verify availability before applying.",
      requireSanFranciscoAddress: true,
    },
    candidate,
    html,
    preferences,
  );

  assert.ok(card);
  assert.equal(card.provider, "rentbt.com");
  assert.equal(card.squareFeet, 610);
  assert.equal(card.petsAllowed, true);
  assert.equal(card.laundry, "in-building");
});

test("uses J. Wavro detail JSON-LD to enrich Extract candidates", () => {
  const candidate: ContextListing = {
    name: "Remodeled Junior One Bedroom",
    url: "https://www.jwavro.com/rental_details.php?id=1",
    price: 3_000,
    bedrooms: 1,
    bathrooms: 1,
    neighborhood: "Richmond",
    address: null,
    squareFeet: null,
    petsAllowed: null,
    images: [],
  };
  const html = `
    <script type="application/ld+json">
      {
        "@type": "Apartment",
        "name": "Remodeled Junior One Bedroom",
        "description": "Shared laundry in building. No pets.",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "22nd Avenue",
          "addressLocality": "San Francisco",
          "addressRegion": "CA"
        },
        "numberOfBedrooms": 1,
        "numberOfBathroomsTotal": 1,
        "amenityFeature": [
          { "@type": "LocationFeatureSpecification", "name": "Roof deck" }
        ],
        "image": ["https://static.letsrent.com/apartment.png"],
        "offers": {
          "@type": "Offer",
          "price": 3000,
          "availability": "https://schema.org/InStock"
        }
      }
    </script>
  `;
  const card = extractedCardFromHtml(
    {
      id: "jwavro",
      inventoryUrl: "https://www.jwavro.com/rental_list.php?hood=sfc",
      instructions: "",
      caveat:
        "Live J. Wavro inventory. Verify availability before applying.",
      maxCandidates: 20,
    },
    candidate,
    html,
    preferences,
  );

  assert.ok(card);
  assert.equal(card.provider, "jwavro.com");
  assert.equal(card.availability, "Available now");
  assert.equal(card.laundry, "in-building");
  assert.equal(card.petsAllowed, false);
  assert.ok(card.amenities.includes("Roof deck"));
  assert.equal(card.images.length, 1);
});

test("enriches a Context candidate with detail-page JSON-LD", () => {
  const candidate: ContextListing = {
    name: "869 Sutter St, 107",
    url: "https://www.rentalsinc.com/listings/869-sutter-st-107",
    price: 3_395,
    bedrooms: 1,
    bathrooms: 1,
    neighborhood: "Nob Hill",
    address: "869 Sutter St, San Francisco, CA 94109",
    squareFeet: null,
    petsAllowed: null,
    images: [],
  };
  const card = extractedCardFromHtml(
    {
      id: "rentalsinc",
      inventoryUrl: "https://www.rentalsinc.com/markets/san-francisco",
      instructions: "",
      caveat: "Verify availability.",
      requireSanFranciscoAddress: true,
    },
    candidate,
    `
      <meta property="og:image" content="https://images.example.com/unit.jpg">
      <script type="application/ld+json">
        {
          "@type": ["Product", "Apartment"],
          "name": "869 Sutter St, 107",
          "description": "Remodeled 1-bedroom with in-unit laundry and dishwasher.",
          "numberOfBedrooms": 1,
          "numberOfBathroomsTotal": 1,
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "869 Sutter St",
            "addressLocality": "San Francisco",
            "addressRegion": "CA",
            "postalCode": "94109"
          },
          "image": ["https://images.example.com/unit.jpg"],
          "offers": {
            "@type": "Offer",
            "price": "3395",
            "availability": "https://schema.org/InStock"
          }
        }
      </script>
    `,
    preferences,
  );

  assert.ok(card);
  assert.equal(card.provider, "rentalsinc.com");
  assert.equal(card.price, 3_395);
  assert.equal(card.laundry, "in-unit");
  assert.equal(card.dishwasher, true);
  assert.equal(card.images.length, 1);
});

test("parses Rentals in SF inventory and detail pages", () => {
  const url =
    "https://www.rentalsinsf.com/rentals/442995461-hoffman-ave-san-francisco/";
  assert.deepEqual(
    extractRentalsInSfUrls(`
      <a href="${url}">listing</a>
      <a href="${url}">details</a>
    `),
    [url],
  );

  const card = rentalsInSfCardFromHtml(
    url,
    `
      <meta property="og:title" content="216 Hoffman Ave. | Rentals in SF">
      <meta name="description" content="Bright 1-bedroom with shared laundry.">
      <span class="page-price">$2995</span>
      <span title="Bedrooms" class="icon beds"><span class="icon-value">1</span></span>
      <span title="Bathrooms" class="icon bath"><span class="icon-value">1</span></span>
      <img data-src="https://www.rentalsinsf.com/wp-content/uploads/hoffman-1300x800.jpeg">
    `,
    preferences,
  );

  assert.ok(card);
  assert.equal(card.provider, "rentalsinsf.com");
  assert.equal(card.price, 2_995);
  assert.equal(card.bedrooms, 1);
  assert.equal(card.images.length, 1);
});

test("does not silently relax explicit must-have filters", () => {
  const apartment: ApartmentCard = {
    name: "Incomplete one bedroom",
    url: "https://example.com/listing",
    provider: "example.com",
    images: ["https://example.com/listing.jpg"],
    price: 3_000,
    bedrooms: 1,
    bathrooms: 1,
    neighborhood: null,
    address: "123 Main Street, San Francisco, CA",
    squareFeet: null,
    floorLevel: null,
    availability: "Available now",
    description: null,
    laundry: "unknown",
    dishwasher: null,
    petsAllowed: null,
    amenities: [],
    matchScore: 80,
    matchReasons: [],
    catches: [],
    preferenceFit: true,
  };
  const deck = buildApartmentDeck(
    [apartment],
    {
      ...preferences,
      neighborhoods: ["Mission"],
      laundry: "in-unit",
      dishwasher: true,
      pets: true,
      minSquareFeet: 500,
    },
  );

  assert.equal(deck.apartments.length, 0);
  assert.equal(deck.relaxed, false);
});

test("filters rooms in shared apartments when entire unit only is on", () => {
  const sharedListings = [
    apartmentCard({
      name: "Sunny bedroom in a 3 bed apartment",
      url: "https://example.com/shared-1",
      address: "12 Valencia Street, San Francisco, CA",
    }),
    apartmentCard({
      name: "Mission flat",
      url: "https://example.com/shared-2",
      address: "34 Guerrero Street, San Francisco, CA",
      description: "Roommate wanted to join our lease near Dolores Park.",
    }),
    apartmentCard({
      name: "Furnished room with private bath",
      url: "https://example.com/shared-3",
      address: "56 Dolores Street, San Francisco, CA",
    }),
  ];
  const entireUnit = apartmentCard({
    name: "Charming one bedroom",
    url: "https://example.com/entire-unit",
    address: "78 Church Street, San Francisco, CA",
    description: "Bright 1-bedroom with a spacious living room.",
  });

  const filtered = buildApartmentDeck(
    [...sharedListings, entireUnit],
    { ...preferences, entireUnit: true },
  );
  assert.deepEqual(
    filtered.apartments.map((apartment) => apartment.url),
    ["https://example.com/entire-unit"],
  );
  assert.equal(filtered.relaxed, false);

  const unfiltered = buildApartmentDeck(
    [...sharedListings, entireUnit],
    preferences,
  );
  assert.equal(unfiltered.apartments.length, 4);
});

test("fills a deck after source diversity is exhausted", () => {
  const apartments = Array.from({ length: 10 }, (_, index) =>
    apartmentCard({
      name: `Craigslist apartment ${index}`,
      url: `https://craigslist.org/listing-${index}`,
      provider: "craigslist.org",
      address: `${index + 1} Market Street, San Francisco, CA`,
    }),
  );

  const deck = buildApartmentDeck(apartments, preferences);

  assert.equal(deck.apartments.length, 8);
  assert.equal(
    new Set(deck.apartments.map((apartment) => apartment.url)).size,
    8,
  );
});

test("recalculates cached cards for the current preferences", () => {
  const apartment: ApartmentCard = {
    name: "Cached one bedroom",
    url: "https://example.com/cached-listing",
    provider: "example.com",
    images: ["https://example.com/listing.jpg"],
    price: 3_000,
    bedrooms: 1,
    bathrooms: 1,
    neighborhood: "Mission",
    address: "123 Main Street, San Francisco, CA",
    squareFeet: 700,
    floorLevel: null,
    availability: "Available now",
    description: null,
    laundry: "in-unit",
    dishwasher: true,
    petsAllowed: true,
    amenities: ["Dishwasher", "In-unit laundry"],
    matchScore: 10,
    matchReasons: [],
    catches: ["Laundry is unverified", "Verify availability."],
    preferenceFit: false,
  };
  const prepared = buildApartmentDeck(
    [apartment],
    {
      ...preferences,
      neighborhoods: ["Mission"],
      laundry: "in-unit",
      dishwasher: true,
      pets: true,
      minSquareFeet: 600,
    },
  ).apartments[0];

  assert.ok(prepared);
  assert.equal(prepared.preferenceFit, true);
  assert.ok(prepared.matchScore > apartment.matchScore);
  assert.ok(prepared.matchReasons.includes("Within budget"));
  assert.ok(!prepared.catches.includes("Laundry is unverified"));
  assert.ok(prepared.catches.includes("Verify availability."));
});

test("formats listing availability for people instead of exposing ISO dates", () => {
  const now = new Date("2026-07-25T12:00:00.000Z");
  const availabilityFor = (availability: string) =>
    buildApartmentDeck(
      [apartmentCard({ availability })],
      preferences,
      { now },
    ).apartments[0];

  assert.equal(
    availabilityFor("2026-07-05T00:00:00.000000Z")?.availability,
    "Available now",
  );
  assert.equal(
    availabilityFor("2026-08-15T00:00:00.000000Z")?.availability,
    "Available Aug 15",
  );
  assert.equal(
    availabilityFor("2027-01-03T00:00:00.000000Z")?.availability,
    "Available Jan 3, 2027",
  );
  assert.equal(
    availabilityFor("Recently posted")?.availability,
    "Recently posted",
  );

  const prepared = availabilityFor("2026-07-05T00:00:00.000000Z");
  assert.ok(prepared?.matchReasons.includes("Available now"));
  assert.ok(
    !prepared?.matchReasons.some((reason) => reason.includes("2026-07-05")),
  );
});

test("keeps one card per building across providers", () => {
  const first = apartmentCard({
    url: "https://first.example/540-leavenworth/104",
    provider: "first.example",
    address: "540 Leavenworth Street, Unit 104, San Francisco, CA",
  });
  const second = apartmentCard({
    url: "https://second.example/listing/540-leavenworth",
    provider: "second.example",
    address: "540 Leavenworth Street, Apt 209, San Francisco, CA",
  });

  const deck = buildApartmentDeck([first, second], preferences);
  assert.equal(deck.analyzed, 1);
  assert.deepEqual(
    deck.apartments.map((apartment) => apartment.url),
    [first.url],
  );
});

test("does not recycle an excluded building under another listing URL", () => {
  const seen = apartmentCard({
    url: "https://first.example/540-leavenworth/104",
    provider: "first.example",
    address: "540 Leavenworth Street, Unit 104, San Francisco, CA",
  });
  const duplicate = apartmentCard({
    url: "https://second.example/listing/540-leavenworth",
    provider: "second.example",
    address: "540 Leavenworth Street, Apt 209, San Francisco, CA",
  });
  const fresh = apartmentCard({
    url: "https://second.example/listing/123-valencia",
    provider: "second.example",
    address: "123 Valencia Street, San Francisco, CA",
  });

  const deck = buildApartmentDeck(
    [seen, duplicate, fresh],
    preferences,
    { excludedUrls: [seen.url] },
  );
  assert.equal(deck.analyzed, 1);
  assert.deepEqual(
    deck.apartments.map((apartment) => apartment.url),
    [fresh.url],
  );
});

test("maps client search lanes to persistent inventory sources", () => {
  assert.equal(new Set(SOURCE_IDS).size, SOURCE_IDS.length);
  assert.deepEqual(
    new Set(LISTING_PROVIDERS.map((provider) => provider.sourceId)),
    new Set(SOURCE_IDS),
  );
  assert.deepEqual(selectedSources("fast"), [
    "rentsfnow",
    "mosser",
    "rentalsinsf",
  ]);
  assert.deepEqual(selectedSources("craigslist"), ["craigslist"]);
  assert.deepEqual(selectedSources("extract"), [
    "brick-timber",
    "jwavro",
    "rentalsinc",
    "landmark",
    "relisto",
  ]);
  assert.equal(isSearchSource("independent"), true);
  assert.equal(isSearchSource("unknown"), false);
});

test("coalesces concurrent requests for the same public page", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response("<html>listing</html>", { status: 200 });
  };

  try {
    const url = "https://cache-test.invalid/unique-listing";
    const pages = await Promise.all([
      fetchPublicHtml(url),
      fetchPublicHtml(url),
      fetchPublicHtml(url),
    ]);
    assert.deepEqual(pages, [
      "<html>listing</html>",
      "<html>listing</html>",
      "<html>listing</html>",
    ]);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects dead listing URLs before they enter the cache", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });

  try {
    assert.equal(
      await publicUrlExists("https://health-test.invalid/dead-listing"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps only reachable listings in their original order", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    new Response(null, {
      status: String(input).includes("dead") ? 404 : 200,
    });

  try {
    const liveFirst = {
      url: "https://health-filter.invalid/live-first",
    };
    const dead = {
      url: "https://health-filter.invalid/dead",
    };
    const liveSecond = {
      url: "https://health-filter.invalid/live-second",
    };
    assert.deepEqual(
      await filterAvailableListings([liveFirst, dead, liveSecond], 2),
      [liveFirst, liveSecond],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function apartmentCard(
  patch: Partial<ApartmentCard> = {},
): ApartmentCard {
  return {
    name: "One bedroom",
    url: "https://example.com/listing",
    provider: "example.com",
    images: ["https://example.com/listing.jpg"],
    price: 3_000,
    bedrooms: 1,
    bathrooms: 1,
    neighborhood: "Tenderloin",
    address: "540 Leavenworth Street, San Francisco, CA",
    squareFeet: 600,
    floorLevel: null,
    availability: "Available now",
    description: null,
    laundry: "in-building",
    dishwasher: null,
    petsAllowed: null,
    amenities: [],
    matchScore: 90,
    matchReasons: [],
    catches: [],
    preferenceFit: true,
    ...patch,
  };
}
