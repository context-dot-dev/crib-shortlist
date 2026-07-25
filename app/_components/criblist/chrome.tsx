"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import {
  IconArrowLeftFill18,
  IconArrowRightFill18,
  IconGithubLogoFill18,
  IconHeartFillDuo18,
} from "@/_components/ui/icons";
import { cn } from "@/_lib/utils";
import type { ApartmentCard } from "./model";
import {
  CITY_CONFIG,
  type CityId,
} from "../../../shared/cities";
import { ProviderSources } from "./provider-sources";

function Wordmark({
  city,
  className,
}: {
  city: CityId;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-semibold tracking-[-0.5px]">criblist</span>
      <span aria-hidden className="translate-y-[1px] text-[0.85em]">
        {CITY_CONFIG[city].emoji}
      </span>
    </span>
  );
}

export function Header({
  city,
  saved,
  onOpenSaved,
  onHome,
}: {
  city: CityId;
  saved: ApartmentCard[];
  onOpenSaved: () => void;
  onHome: () => void;
}) {
  const previews = saved.slice(0, 3);
  return (
    <header className="nook-header relative flex h-[88px] w-full items-center justify-center pt-4">
      <div className="absolute inset-y-0 left-0 flex items-center pt-4">
        <a
          href="https://github.com/context-dot-dev/crib-shortlist"
          target="_blank"
          rel="noreferrer"
          aria-label="open source on github"
          className="group inline-flex h-9 items-center gap-2 rounded-full bg-card px-2.5 text-[12px] font-medium text-secondary shadow-input outline-none transition-colors hover:text-foreground sm:px-3.5"
        >
          <Icon glyph={IconGithubLogoFill18} size={16} />
          <span className="hidden sm:inline">open source</span>
        </a>
      </div>

      <div className="inline-flex h-9 items-center gap-3">
        <button
          type="button"
          onClick={onHome}
          className="flex h-9 items-center outline-none transition-opacity hover:opacity-70"
          aria-label="criblist home"
        >
          <Wordmark city={city} className="text-[19px]" />
        </button>

        <span aria-hidden className="h-4 w-px bg-border" />

        <button
          type="button"
          onClick={onOpenSaved}
          aria-label={`${saved.length} in shortlist`}
          className="group inline-flex h-9 items-center gap-2 text-[12px] font-medium outline-none transition-opacity hover:opacity-70"
        >
          <span className="flex h-6 items-center">
            {previews.length > 0 ? (
              previews.map((apartment, index) => (
                <span
                  key={apartment.url}
                  className={cn(
                    "relative size-6 overflow-hidden rounded-full border-2 border-background bg-muted shadow-swatch",
                    index > 0 && "-ml-2",
                  )}
                  style={{ zIndex: previews.length - index }}
                >
                  <span className="absolute inset-0 grid place-items-center text-swatch-coral">
                    <Icon glyph={IconHeartFillDuo18} size={14} />
                  </span>
                  {apartment.images[0] ? (
                    <FadeImage
                      src={apartment.images[0]}
                      alt=""
                      className="relative size-full object-cover"
                    />
                  ) : null}
                </span>
              ))
            ) : (
              <span className="grid size-6 place-items-center rounded-full bg-swatch-coral/10 text-swatch-coral">
                <Icon glyph={IconHeartFillDuo18} size={14} />
              </span>
            )}
          </span>
          <span className="hidden text-secondary transition-colors group-hover:text-foreground sm:inline">
            shortlist
          </span>
          <motion.span
            key={saved.length}
            initial={{ scale: 1.45 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
            className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 py-1 text-[9px] font-semibold leading-none text-card tabular-nums"
          >
            {saved.length}
          </motion.span>
        </button>
      </div>

      <div className="absolute inset-y-0 right-0 hidden items-center lg:flex">
        <ProviderSources city={city} placement="header" />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="nook-footer flex flex-col items-center gap-5 py-10 text-center">
      <a
        href="https://context.dev"
        target="_blank"
        rel="noreferrer"
        aria-label="visit context.dev"
        className="mt-1 w-[220px] origin-center -rotate-1 transition duration-300 hover:rotate-0 hover:scale-[1.02] md:hidden"
      >
        <FadeImage
          src="/context-fortune.png"
          alt="built using Context.dev"
          className="h-auto w-full drop-shadow-[0_10px_16px_rgba(56,45,34,0.12)]"
        />
      </a>
    </footer>
  );
}

function KeyCap({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <kbd
      className={cn(
        "grid h-6 min-w-6 place-items-center rounded-[7px] bg-card font-sans text-[10px] font-semibold text-secondary shadow-input",
        wide && "px-2 tracking-[0.08em]",
      )}
    >
      {children}
    </kbd>
  );
}

/** Desktop-only cheat sheet for the deck's keyboard shortcuts. */
export function KeyboardHints() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="pointer-events-none fixed bottom-12 left-12 z-20 hidden flex-col items-start gap-2 lg:flex"
    >
      <div className="flex items-center gap-2">
        <KeyCap>
          <Icon glyph={IconArrowLeftFill18} size={12} />
        </KeyCap>
        <span className="text-[12px] font-medium text-secondary">pass</span>
      </div>
      <div className="flex items-center gap-2">
        <KeyCap>
          <Icon glyph={IconArrowRightFill18} size={12} />
        </KeyCap>
        <span className="text-[12px] font-medium text-secondary">
          add to shortlist
        </span>
      </div>
      <div className="flex items-center gap-2">
        <KeyCap wide>space</KeyCap>
        <span className="text-[12px] font-medium text-secondary">
          open details
        </span>
      </div>
    </motion.div>
  );
}

export function ContextFortune() {
  return (
    <a
      href="https://context.dev"
      target="_blank"
      rel="noreferrer"
      aria-label="visit context.dev"
      className="group fixed right-12 bottom-12 z-20 hidden w-[230px] origin-bottom-right -rotate-1 outline-none transition duration-300 hover:rotate-0 hover:scale-[1.03] focus-visible:rotate-0 focus-visible:scale-[1.03] md:block"
    >
      <FadeImage
        src="/context-fortune.png"
        alt="built using Context.dev"
        className="h-auto w-full drop-shadow-[0_10px_16px_rgba(56,45,34,0.12)] transition-[filter] duration-300 group-hover:drop-shadow-[0_14px_22px_rgba(56,45,34,0.18)]"
      />
    </a>
  );
}
