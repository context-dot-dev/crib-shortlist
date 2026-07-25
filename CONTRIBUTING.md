# Contributing to Criblist

Thanks for helping improve Criblist. Bug reports, source-adapter fixes,
documentation improvements, and focused product changes are welcome.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
For a suspected vulnerability, follow [SECURITY.md](./SECURITY.md) instead of
opening a public issue.

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- Open an issue before a large behavioral or architectural change so the scope
  can be agreed on first.
- Keep pull requests focused. Unrelated cleanup is easier to review separately.

## Development setup

Follow the [README quick start](./README.md#quick-start). The short version is:

```bash
nvm use # optional; reads .nvmrc when nvm is installed
npm ci
cp .env.example .env.local
npm run dev
```

`CONTEXT_DEV_API_KEY` is required for live apartment searches. Turso is
optional unless you are working on inventory persistence or refresh behavior.
The deterministic test suite does not require credentials or network access.

## Making a change

1. Fork the repository and create a descriptive branch from `main`.
2. Add or update tests for observable behavior.
3. Update documentation when setup, commands, environment variables, or user
   behavior changes.
4. Run the local quality gate:

   ```bash
   npm run check
   npm run build
   ```

5. Open a pull request that explains the problem, the approach, and how the
   result was verified. Include before/after screenshots for visual changes.

## Source-adapter changes

Rental sites change independently of Criblist. When fixing or adding an
adapter:

- Start from the publisher's current-availability page.
- Keep upstream parsing and normalization in `server/search/`.
- Return the shared Apartment Card contract; do not leak provider-specific
  shapes into the UI.
- Add a small, synthetic HTML or JSON fixture to the test suite. Do not commit
  API responses containing credentials, personal contact details, or a large
  copy of third-party content.
- Treat explicit user preferences as strict filters.
- Isolate source failures so one provider cannot fail the whole search.

Live checks such as `npm run stress:search` and `npm run cache:warm` are useful
when relevant, but they consume API credits and query external sites. Mention
whether you ran them in the pull request; they are not required for every
change.

## Style and project language

- Match the existing TypeScript and React style; ESLint is the formatter of
  record where it has an opinion.
- Prefer the domain terms defined in [CONTEXT.md](./CONTEXT.md), especially
  Listing Source, Provider, Apartment Card, Apartment Deck, and Preferences.
- Keep browser/server boundaries explicit and validate data at those seams.
- Never expose server credentials through `NEXT_PUBLIC_` variables or client
  components.

## Commit and pull-request guidance

Clear, imperative commit subjects are preferred, for example:

```text
fix: parse updated provider availability cards
docs: clarify optional Turso setup
```

Maintainers may ask for a pull request to be rebased, split, or supplemented
with tests before merge.

## License

By submitting a contribution, you agree that it may be distributed under the
repository's [MIT License](./LICENSE).
