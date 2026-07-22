# criblist 🌉

Criblist turns live San Francisco rental inventory into a small deck you can
swipe, inspect, and shortlist.

Instead of presenting another dense search-results page, it asks for the few
constraints that matter, verifies exact listing pages, and keeps the interaction
focused on one apartment at a time.

## What it does

- Searches live Craigslist inventory and local San Francisco property managers.
- Extracts listing facts and photography through Context.dev.
- Applies budget, bedroom, bathroom, neighborhood, laundry, pet, and dishwasher
  requirements.
- Ranks complete listings while keeping the deck diverse across providers.
- Preloads upcoming photography for instant photo changes and card transitions.
- Stores search preferences, the current deck, and the shortlist in the browser.

## Local setup

Requirements:

- Node.js 20 or newer
- A Context.dev API key

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
`POST /api/apartment-search`. The search service queries independent source
adapters concurrently, normalizes their results into one card shape, applies
the same quality gates, and returns a ranked deck.

## Live sources

The source layer currently covers:

- Craigslist San Francisco
- Gaetani Real Estate
- JODI Rentals
- Rentals in SF
- SF City Rents

Each local adapter starts from the provider's current-availability page. This
avoids stale search-engine results and prevents unavailable detail pages from
entering the deck.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONTEXT_DEV_API_KEY` | yes | Live discovery, extraction, and page rendering |
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
