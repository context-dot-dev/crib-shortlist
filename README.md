<p align="center">
  <img src="./public/criblist-logo.png" width="336" alt="Criblist" />
</p>

<p align="center"><em>the sf hunt, minus the hunting.</em></p>

<p align="center">
  <img src="./public/crib-cover.png" width="100%" alt="Criblist SF rentals, built with Context.dev" />
</p>

## Built on Context.dev

Criblist is a live showcase of the
[Context.dev Web Extraction API](https://context.dev). Context turns rental
sites into fast, usable documents; Criblist turns those documents into a
ranked apartment deck.

The search pipeline uses Context.dev before any product logic runs:

1. The **Markdown API** renders live Craigslist searches and independent San
   Francisco property-manager feeds with links and listing content intact.
2. The **HTML API** retrieves detail pages so Criblist can recover high-quality
   photography and facts from dynamically rendered property sites.
3. Criblist normalizes, validates, deduplicates, filters, and ranks the returned
   inventory into one consistent deck.

The Context.dev API key stays server-side. Source adapters run concurrently,
short-lived caches make repeat searches fast, and failed sources cannot take
down the entire search.

## The product

Criblist asks for the few apartment constraints that matter, searches listings
that are live right now, and gives the renter one home at a time to swipe,
inspect, or shortlist.

- Live Craigslist and independent SF property-manager inventory
- Budget, bedroom, bathroom, neighborhood, laundry, pet, dishwasher, and size
  filters
- Photo-backed cards with match reasons and honest caveats
- Provider diversity so one marketplace cannot dominate the deck
- Preloaded photography for fast galleries and card transitions
- Browser-local preferences, deck progress, and shortlist

## Local setup

Requirements:

- Node.js 20 or newer
- A [Context.dev API key](https://context.dev)

```bash
cp .env.example .env.local
# Add CONTEXT_DEV_API_KEY to .env.local

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run start
```

## Architecture

```text
app/
├── _components/criblist/      product UI and client state
├── _components/ui/            small reusable visual primitives
├── _lib/                      shared browser utilities
└── api/apartment-search/      thin HTTP route

server/search/
├── context-client.ts          Context.dev transport
├── craigslist.ts              Craigslist discovery and parsing
├── local-sources.ts           SF property-manager adapters
├── ranking.ts                 filtering, scoring, and diversity
├── schemas.ts                 request and response contracts
└── service.ts                 search orchestration
```

The browser sends one validated preference object to
`POST /api/apartment-search`. The search service queries each Context-backed
source adapter concurrently, normalizes the results into one card contract,
applies shared quality gates, and returns a ranked deck.

## Live sources

- Craigslist San Francisco
- Gaetani Real Estate
- JODI Rentals
- Rentals in SF
- SF City Rents

Each adapter starts from the provider's current-availability page instead of a
stale search index.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONTEXT_DEV_API_KEY` | yes | Live rendering and extraction through Context.dev |
| `NEXT_PUBLIC_SITE_URL` | no | Canonical URL for social metadata |

Do not commit `.env.local`.

## Product principles

- Fewer choices, shown well.
- No dead listings to make the deck look larger.
- No listing without a usable photo.
- Source diversity without weakening user filters.
- Fast repeat searches through short-lived server caches.

## License

MIT
