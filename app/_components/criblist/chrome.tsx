"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import {
  IconArrowLeftFill18,
  IconArrowRightFill18,
  IconHeartFillDuo18,
} from "@/_components/ui/icons";
import { cn } from "@/_lib/utils";
import type { ApartmentCard } from "./model";

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-semibold tracking-[-0.5px]">criblist</span>
      <span aria-hidden className="translate-y-[1px] text-[0.85em]">
        🌉
      </span>
    </span>
  );
}

export function Header({
  saved,
  onOpenSaved,
  onHome,
}: {
  saved: ApartmentCard[];
  onOpenSaved: () => void;
  onHome: () => void;
}) {
  const previews = saved.slice(0, 3);
  return (
    <header className="flex h-[88px] w-full items-center justify-center pt-4">
      <div className="inline-flex h-9 items-center gap-3">
        <button
          type="button"
          onClick={onHome}
          className="flex h-9 items-center outline-none transition-opacity hover:opacity-70"
          aria-label="criblist home"
        >
          <Wordmark className="text-[19px]" />
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
    </header>
  );
}

export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-5 py-10 text-center">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
        <span className="text-[12px] font-medium text-muted-foreground">
          real listings, live across san francisco
        </span>
        <a
          href="https://context.dev"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-medium text-secondary underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
        >
          powered by context.dev
        </a>
      </div>
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
