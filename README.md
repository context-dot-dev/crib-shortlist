<p align="center">
  <img src="./public/criblist-logo.png" width="336" alt="Criblist" />
</p>

<p align="center"><em>the sf hunt, minus the hunting.</em></p>

<p align="center">
  <a href="https://crib-shortlist.vercel.app"><strong>Live demo</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/context-dot-dev/crib-shortlist/actions/workflows/ci.yml"><img src="https://github.com/context-dot-dev/crib-shortlist/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
</p>

Criblist turns live San Francisco rental inventory into a small,
preference-matched deck of apartments to review, swipe, and shortlist. It is a
runnable product and a reference implementation of the
[Context.dev Web Extraction API](https://context.dev).

> [!IMPORTANT]
> Rental availability, prices, and details can change at any time. Always
> verify a listing with its publisher before applying or sending money.

## What it does

- Searches nine live rental marketplaces and property managers
- Filters by budget, bedrooms, bathrooms, neighborhood, laundry, pets,
  dishwasher, and size
- Normalizes different source formats into one validated Apartment Card
- Ranks and diversifies each Apartment Deck so one provider cannot dominate it
- Stores preferences, deck progress, and saved homes in the browser only
- Optionally keeps a persistent Turso inventory for faster repeat searches

## How Context.dev is used

Criblist has three acquisition paths that share the same validation, ranking,
and deduplication pipeline:

1. The **HTML API** renders Craigslist search and detail pages.
2. The **Extract API** turns five property-manager inventory pages into typed
   listing candidates.
3. Three direct adapters read public inventory endpoints and page markup.
4. The **Brand API** enriches the provider list with current brand identities.

All Context.dev calls happen on the server. The API key is never sent to the
browser.

## Quick start

### Requirements

- A supported Node.js LTS release (Node.js 22 or newer)
- npm 10 or newer
- A [Context.dev API key](https://context.dev)

### Install and run

```bash
git clone https://github.com/context-dot-dev/crib-shortlist.git
cd crib-shortlist
npm ci
cp .env.example .env.local
```

Add your Context.dev key to `.env.local`:

```dotenv
CONTEXT_DEV_API_KEY=your_key_here
```

Then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A Turso database is not
required for local development; without one, searches acquire listings live.

## Optional persistent inventory

Turso lets Criblist serve fresh inventory immediately and refresh it outside a
user request. Create a Turso database, add both credentials to `.env.local`,
and warm it once:

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_token_here
```

```bash
npm run cache:warm
```

The tables and indexes are created automatically. To refresh continuously
during local development, run:

```bash
npm run cache:watch -- --interval-minutes=30
```

The interval must be at least five minutes. Warming queries live sites and can
consume Context.dev credits.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONTEXT_DEV_API_KEY` | For search | Context.dev HTML, Extract, image, and Brand API access |
| `TURSO_DATABASE_URL` | For persistent inventory | Turso/libSQL database URL; must be set with `TURSO_AUTH_TOKEN` |
| `TURSO_AUTH_TOKEN` | For persistent inventory | Authenticates Turso reads and writes; must be set with `TURSO_DATABASE_URL` |
| `CRON_SECRET` | For scheduled refreshes | Protects `GET /api/cron/refresh-listings` with a bearer token |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical origin used for social metadata outside Vercel |
| `CRIBLIST_BASE_URL` | No | Target URL for `npm run stress:search`; defaults to `http://localhost:3000` |

Never commit `.env`, `.env.local`, API keys, or database credentials. The
provided `.env.example` contains names and comments only.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Next.js development server |
| `npm run check` | Runs linting, TypeScript checks, and the unit test suite |
| `npm run lint` | Runs ESLint across the repository |
| `npm run typecheck` | Checks TypeScript without emitting files |
| `npm test` | Runs deterministic tests for contracts, parsing, ranking, and caching |
| `npm run build` | Creates a production Next.js build |
| `npm start` | Serves an existing production build |
| `npm run cache:warm` | Refreshes every provider and bedroom segment into Turso |
| `npm run cache:watch -- --interval-minutes=30` | Repeats the inventory refresh locally |
| `npm run stress:search` | Exercises live search lanes against a running app |

`stress:search`, `cache:warm`, and `cache:watch` make real upstream requests.
They are intentionally excluded from `npm run check` and CI.

## Architecture

```text
app/
├── _components/criblist/      product UI and browser-local state
├── _components/ui/            reusable visual primitives
├── _lib/                      browser utilities
├── api/apartment-search/      validated search HTTP route
├── api/cron/refresh-listings/ protected inventory refresh route
└── api/provider-brands/       provider brand enrichment route

server/
├── brand/                     Context.dev provider enrichment
├── cache/                     Turso inventory and refresh orchestration
└── search/                    source adapters, normalization, and ranking

shared/
├── providers.ts               provider catalog and search-lane mapping
└── search-contract.ts         shared browser/server schemas

scripts/                       live stress and inventory utilities
tests/                         deterministic Node test suite
```

The browser sends one validated Preferences object to
`POST /api/apartment-search?source=all`. The server first checks Turso when it
is configured. If every requested inventory segment is fresh, it builds a deck
from the stored cards. Otherwise, source adapters run concurrently, failures
are isolated per source, and successful cards pass through the same quality,
deduplication, preference, and provider-diversity rules. Best-effort results
are written back to Turso.

The API also accepts `fast`, `independent`, `craigslist`, and `extract` source
lanes for diagnostics and targeted testing. A completed Apartment Deck contains
at most eight cards.

See [CONTEXT.md](./CONTEXT.md) for the domain language used throughout the
codebase.

## Live sources

- Craigslist San Francisco
- Brick + Timber
- RentSFNow
- Mosser Living
- J. Wavro Associates
- Rentals Inc.
- Rentals in SF
- Landmark Real Estate
- ReLISTO

Adapters begin at each publisher's current-availability page. Upstream HTML,
APIs, and access policies can change without notice, so source fixes should
include a focused parser regression test.

## Troubleshooting

- **Search says a Context.dev key is required:** confirm
  `CONTEXT_DEV_API_KEY` is set in `.env.local`, then restart `npm run dev`.
- **A cache command asks for Turso credentials:** `TURSO_DATABASE_URL` and
  `TURSO_AUTH_TOKEN` must be configured together. They are optional for normal
  local searches.
- **One provider returns no cards:** source failures are isolated and live sites
  change independently. Try broader Preferences, then check the provider's
  current-availability page and the corresponding adapter test.
- **`npm ci` reports an unsupported engine:** switch to a supported LTS release;
  `nvm use` reads the repository's `.nvmrc`.

## Deployment

Any Node.js host that supports Next.js can run Criblist with `npm run build`
and `npm start`. For Vercel:

1. Import the repository.
2. Set `CONTEXT_DEV_API_KEY`.
3. To enable persistent inventory, also set `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`, and a long random `CRON_SECRET`.
4. Set `NEXT_PUBLIC_SITE_URL` when the production URL cannot be inferred from
   Vercel's environment.

[`vercel.json`](./vercel.json) schedules the protected inventory route once a
day at 08:00 UTC. Other schedulers must call the same route with
`Authorization: Bearer <CRON_SECRET>`.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before
opening a pull request and follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

Please report vulnerabilities privately as described in
[SECURITY.md](./SECURITY.md), not in a public issue.

## Data and trademark notice

Criblist is an independent discovery interface, not a rental broker or listing
provider. Provider names and trademarks belong to their respective owners.
Listing text, photos, and other content fetched at runtime remain subject to
the publisher's terms and rights. Review those terms before operating a public
deployment or adapting an adapter for another site.

## License

Criblist is available under the [MIT License](./LICENSE).
