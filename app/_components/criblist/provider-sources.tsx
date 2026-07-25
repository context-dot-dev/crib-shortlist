"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FadeImage } from "@/_components/ui/fade-image";
import { cn } from "@/_lib/utils";
import {
  fallbackProviderBrands,
  LISTING_PROVIDERS,
  type ProviderBrand,
} from "../../../shared/providers";
import {
  CITY_CONFIG,
  type CityId,
} from "../../../shared/cities";

export function ProviderSources({
  city,
  placement = "hero",
}: {
  city: CityId;
  placement?: "hero" | "header";
}) {
  const [enrichedProviders, setEnrichedProviders] = useState<{
    city: CityId;
    providers: ProviderBrand[];
  } | null>(null);
  const reduceMotion = useReducedMotion();
  const providers =
    enrichedProviders?.city === city
      ? enrichedProviders.providers
      : fallbackProviderBrands(city);

  useEffect(() => {
    const cityProviders = LISTING_PROVIDERS.filter(
      (provider) => provider.city === city,
    );
    const controller = new AbortController();
    fetch(`/api/provider-brands?v=6&city=${city}`, {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("provider brands unavailable");
        return response.json() as Promise<{ providers?: ProviderBrand[] }>;
      })
      .then((result) => {
        if (result.providers?.length === cityProviders.length) {
          setEnrichedProviders({
            city,
            providers: result.providers,
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [city]);

  const sourceCount = providers.length;

  return (
    <motion.section
      aria-label="live apartment sources"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "nook-provider-sources flex flex-col",
        placement === "header"
          ? "items-end gap-1.5"
          : "mt-6 items-center gap-3 lg:hidden",
      )}
    >
      <div className="group flex items-center">
        {providers.map((provider, index) => {
          const accent = provider.color ?? provider.accent;
          return (
            <motion.a
              key={provider.sourceId}
              href={provider.url}
              target="_blank"
              rel="noreferrer"
              title={`browse ${provider.title}`}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.4,
                delay: reduceMotion ? 0 : 0.22 + index * 0.07,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              style={{ zIndex: sourceCount - index }}
              className={cn(
                "group/coin relative rounded-full outline-none transition-[margin] duration-300 ease-out first:ml-0 hover:z-20 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group-hover:ml-1 group-hover:first:ml-0",
                placement === "header" ? "-ml-2" : "-ml-2.5",
              )}
            >
              <span
                className={cn(
                  "grid place-items-center overflow-hidden rounded-full border-2 border-background bg-card shadow-swatch transition duration-300 ease-out group-hover/coin:-translate-y-1.5 group-hover/coin:scale-110 group-hover/coin:shadow-[0_10px_20px_-6px_rgba(63,48,38,0.3)]",
                  placement === "header" ? "size-8" : "size-10",
                )}
                style={{ backgroundColor: `${accent}14` }}
              >
                {provider.logoUrl ? (
                  <FadeImage
                    src={provider.logoUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={cn(
                      "object-contain",
                      placement === "header" ? "size-[18px]" : "size-[22px]",
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "font-bold uppercase leading-none",
                      placement === "header" ? "text-[11px]" : "text-[14px]",
                    )}
                    style={{ color: accent }}
                  >
                    {provider.label.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 -translate-y-0.5 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[9px] font-medium text-card opacity-0 shadow-card-1 transition-all duration-200 group-hover/coin:-translate-y-0 group-hover/coin:opacity-100">
                {provider.label}
              </span>
            </motion.a>
          );
        })}
      </div>

      <p
        className={cn(
          "inline-flex items-center gap-1.5 font-medium text-secondary",
          placement === "header" ? "text-[10px]" : "text-[11px]",
        )}
      >
        <span>
          {sourceCount} live {CITY_CONFIG[city].shortLabel} sources ·{" "}
          <a
            href="https://context.dev"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            via context.dev
          </a>
        </span>
      </p>
    </motion.section>
  );
}
