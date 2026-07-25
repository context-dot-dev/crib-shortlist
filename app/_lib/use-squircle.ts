"use client";

import { useSmoothCorners } from "@lisse/react";
import type { RefObject } from "react";

export interface UseSquircleOptions {
	/**
	 * `position: relative` ancestor that hosts the SVG overlay for shadow /
	 * border effects. When provided, Lisse's `autoEffects` is enabled, which
	 * extracts every CSS `box-shadow` and `border` layer from the inner
	 * element via `parseBoxShadow` and re-renders them as SVG that traces
	 * the squircle silhouette exactly, including spread, multiple layers,
	 * and inset shadows. Without a wrapper, `clip-path` would crop the
	 * native CSS shadow against the element's painted box and you'd get a
	 * shadowless squircle.
	 */
	wrapperRef?: RefObject<HTMLElement | null>;
}

/**
 * Apply a Figma-quality squircle clip-path to a referenced element. Uses
 * the @lisse/react smooth-corners hook with Figma's standard smoothing
 * factor (0.6) so the rendered curvature matches what designers draw.
 *
 * For elements that need a visible shadow, pass `{ wrapperRef }`; see
 * the field doc on `UseSquircleOptions.wrapperRef` for the rationale.
 *
 * @param ref     element to clip to a squircle
 * @param radius  CSS pixels for all four corners
 * @param options optional `wrapperRef` to enable SVG shadow/border auto-extract
 */
function useSquircle(
	ref: RefObject<HTMLElement | null>,
	radius: number,
	options?: UseSquircleOptions,
): void {
	const wrapperRef = options?.wrapperRef;
	useSmoothCorners(
		ref,
		{ radius, smoothing: 0.6 },
		{
			autoEffects: Boolean(wrapperRef),
			wrapperRef,
		},
	);
}

export { useSquircle };
