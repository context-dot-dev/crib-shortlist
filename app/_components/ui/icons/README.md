# Icons

Criblist uses [Phosphor Icons](https://phosphoricons.com/) through the
MIT-licensed `@phosphor-icons/react` package. The aliases in `index.tsx` keep
icon selection and default weights in one place while the shared `Icon`
component handles sizing and accessibility.

When adding an icon, export a project-specific alias from `index.tsx` instead
of importing the package directly from product components.
