import type { ComponentType } from "react";
import type { IconProps as GlyphProps } from "@/_components/ui/icons";
import { cn } from "@/_lib/utils";

export type IconSize = 12 | 14 | 15 | 16 | 18 | 20 | 24;

export interface IconProps
  extends Omit<GlyphProps, "size" | "width" | "height"> {
  glyph: ComponentType<GlyphProps>;
  size?: IconSize;
  /** When provided, the icon is announced to screen readers with this label. */
  label?: string;
}

function Icon({
  glyph: Glyph,
  size = 18,
  label,
  className,
  ...rest
}: IconProps) {
  return (
    <Glyph
      width={size}
      height={size}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn("shrink-0", className)}
      {...rest}
    />
  );
}

export { Icon };
