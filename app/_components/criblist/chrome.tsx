"use client";

import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import { IconHeartFillDuo18 } from "@/_components/ui/icons";
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
    <header className="flex h-[72px] w-full items-center justify-center">
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
                  {apartment.images[0] ? (
                    <FadeImage
                      src={apartment.images[0]}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-swatch-coral">
                      <Icon glyph={IconHeartFillDuo18} size={14} />
                    </span>
                  )}
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
          <span className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 py-1 text-[9px] font-semibold leading-none text-card tabular-nums">
            {saved.length}
          </span>
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
        className="w-[260px] origin-center -rotate-1 transition duration-300 hover:rotate-0 hover:scale-[1.02] md:hidden"
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

export function ContextFortune() {
  return (
    <a
      href="https://context.dev"
      target="_blank"
      rel="noreferrer"
      aria-label="visit context.dev"
      className="group fixed right-7 bottom-7 z-20 hidden w-[270px] origin-bottom-right -rotate-2 outline-none transition duration-300 hover:rotate-0 hover:scale-[1.03] focus-visible:rotate-0 focus-visible:scale-[1.03] md:block"
    >
      <FadeImage
        src="/context-fortune.png"
        alt="built using Context.dev"
        className="h-auto w-full drop-shadow-[0_12px_18px_rgba(56,45,34,0.14)] transition-[filter] duration-300 group-hover:drop-shadow-[0_16px_24px_rgba(56,45,34,0.2)]"
      />
    </a>
  );
}
