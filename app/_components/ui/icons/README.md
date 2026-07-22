# Icons

UI icons are vendored locally. There is no icon package or license key to
install.

- The SVG source files live in [`svg/`](./svg).
- React components live in [`index.tsx`](./index.tsx).
- Icons use `currentColor` so they inherit surrounding text color.

## Adding or changing an icon

1. Add or replace the SVG using a kebab-case filename.
2. Use `fill="currentColor"` so the icon follows text color.
3. Add the matching React component to `index.tsx`.

Consume icons through the shared wrapper:

```tsx
import { Icon } from "@/_components/ui/icon";
import { IconPlusFill18 } from "@/_components/ui/icons";

<Icon glyph={IconPlusFill18} size={14} />
```

## Attribution / licensing

The icons currently in `svg/` were derived from the
[Nucleo](https://nucleoapp.com/) library. If you redistribute this repo, make
sure your icon licensing permits it, or replace the SVGs in `svg/` with your own
(or a freely licensed set such as [Lucide](https://lucide.dev/)).
