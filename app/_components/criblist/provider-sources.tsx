"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FadeImage } from "@/_components/ui/fade-image";
import {
  fallbackProviderBrands,
  LISTING_PROVIDERS,
  type ProviderBrand,
} from "../../../shared/providers";

const PROVIDER_BRANDS_ENDPOINT = "/api/provider-brands?v=4";

export function ProviderSources() {
  const [providers, setProviders] = useState(fallbackProviderBrands);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetch(PROVIDER_BRANDS_ENDPOINT, {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("provider brands unavailable");
        return response.json() as Promise<{ providers?: ProviderBrand[] }>;
      })
      .then((result) => {
        if (result.providers?.length === LISTING_PROVIDERS.length) {
          setProviders(result.providers);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const sourceCount = providers.length;

  return (
    <motion.section
      aria-label="live apartment sources"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="mt-6 flex flex-col items-center gap-3"
    >
      <div className="group flex items-center">
        {providers.map((provider, index) => {
          const accent = provider.color ?? provider.accent;
          return (
            <motion.a
              key={provider.domain}
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
              className="group/coin relative -ml-2.5 rounded-full outline-none transition-[margin] duration-300 ease-out first:ml-0 hover:z-20 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group-hover:ml-1 group-hover:first:ml-0"
            >
              <span
                className="grid size-10 place-items-center overflow-hidden rounded-full border-2 border-background bg-card shadow-swatch transition duration-300 ease-out group-hover/coin:-translate-y-1.5 group-hover/coin:scale-110 group-hover/coin:shadow-[0_10px_20px_-6px_rgba(63,48,38,0.3)]"
                style={{ backgroundColor: `${accent}14` }}
              >
                {provider.logoUrl ? (
                  <FadeImage
                    src={provider.logoUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-[22px] object-contain"
                  />
                ) : (
                  <span
                    className="text-[14px] font-bold uppercase leading-none"
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

      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-secondary">
        <span>
          {sourceCount} live sf sources ·{" "}
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
