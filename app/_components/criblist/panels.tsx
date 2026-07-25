"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import {
  IconArrowRightFill18,
  IconBathtubFillDuo18,
  IconBedDoubleFillDuo18,
  IconCalendarFillDuo18,
  IconChevronLeftFill18,
  IconConciergeFill24,
  IconDishwasherFill24,
  IconDumbbellFill24,
  IconHeartFill18,
  IconHeartFillDuo18,
  IconHouseSearchFill24,
  IconPawFill24,
  IconPlusFill18,
  IconWashingMachineFill24,
  IconWifiFill24,
  type IconProps,
} from "@/_components/ui/icons";
import { useIsMobile } from "@/_lib/use-is-mobile";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";
import {
  EASE,
  MONEY,
  formatBedrooms,
  formatLaundry,
  type ApartmentCard,
} from "./model";
import { CITY_CONFIG } from "../../../shared/cities";

export function DetailDrawer({
  apartment,
  saved,
  onClose,
  onToggleSave,
}: {
  apartment: ApartmentCard;
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
}) {
  const isMobile = useIsMobile();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useSquircle(drawerRef, isMobile ? 0 : 34, {
    wrapperRef: isMobile ? undefined : wrapperRef,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <motion.button
        type="button"
        aria-label="close details"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-swatch-dark/30 backdrop-blur-[3px]"
      />
      <motion.div
        ref={wrapperRef}
        initial={
          isMobile
            ? { transform: "translateY(100%)" }
            : { transform: "translateX(36px)", opacity: 0 }
        }
        animate={
          isMobile
            ? { transform: "translateY(0%)" }
            : { transform: "translateX(0px)", opacity: 1 }
        }
        exit={
          isMobile
            ? { transform: "translateY(100%)" }
            : { transform: "translateX(36px)", opacity: 0 }
        }
        transition={{ type: "spring", duration: 0.38, bounce: 0 }}
        className={cn(
          "absolute",
          isMobile
            ? "inset-x-0 bottom-0 top-14"
            : "top-6 bottom-6 right-6 w-[440px] max-w-[calc(100vw-48px)]",
        )}
      >
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${apartment.name} details`}
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden bg-card",
            isMobile ? "rounded-t-[28px]" : "rounded-[34px] shadow-card-3",
          )}
        >
          <div className="no-scrollbar flex-1 overflow-y-auto">
            <DetailCarousel
              apartment={apartment}
              isMobile={isMobile}
              onClose={onClose}
            />

            <div className="flex flex-col gap-5 p-5">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-secondary">
                      {apartment.neighborhood ??
                        CITY_CONFIG[apartment.city].label}
                    </p>
                    <h2 className="mt-0.5 text-[23px] font-medium leading-[1.12] tracking-[-0.6px]">
                      {apartment.name}
                    </h2>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[22px] font-semibold tracking-[-0.6px]">
                      {apartment.price === null ? "–" : MONEY.format(apartment.price)}
                    </p>
                    <p className="text-[10px] font-medium text-secondary">/ month</p>
                  </div>
                </div>
                {apartment.address ? (
                  <p className="mt-1.5 text-[13px] font-medium text-secondary">
                    {apartment.address}
                  </p>
                ) : null}
              </div>

              <SpecStrip apartment={apartment} />

              <MoveInRow availability={apartment.availability} />

              {apartment.description ? (
                <p className="text-[15px] leading-[22px] text-secondary sm:text-[13px] sm:leading-[20px]">
                  {apartment.description}
                </p>
              ) : null}

              {apartment.matchReasons.length > 0 ? (
                <ReasonList
                  title="why it fits"
                  items={apartment.matchReasons.map(readableReason)}
                />
              ) : null}
              {apartment.catches.length > 0 ? (
                <ReasonList
                  title="worth checking"
                  items={apartment.catches}
                  caution
                />
              ) : null}

              {apartment.amenities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {apartment.amenities.map((amenity) => {
                    const glyph = amenityIcon(amenity);
                    return (
                      <span
                        key={amenity}
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1.5 text-[11px] font-medium text-secondary"
                      >
                        {glyph ? (
                          <Icon
                            glyph={glyph}
                            size={14}
                            className="text-foreground/65"
                          />
                        ) : null}
                        {amenity}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-t border-border bg-card p-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
            <a
              href={apartment.url}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[13px] font-medium text-card shadow-button transition-opacity hover:opacity-90"
            >
              view original listing
              <Icon glyph={IconArrowRightFill18} size={16} className="-rotate-45" />
            </a>
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              aria-label={saved ? "remove from shortlist" : "add to shortlist"}
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-full shadow-button transition-colors",
                saved
                  ? "bg-swatch-coral/15 text-swatch-coral"
                  : "bg-surface-sunken text-secondary hover:bg-control-active",
              )}
            >
              <Icon glyph={saved ? IconHeartFill18 : IconHeartFillDuo18} size={18} />
            </button>
          </div>
        </aside>
      </motion.div>
    </div>
  );
}

function DetailCarousel({
  apartment,
  isMobile,
  onClose,
}: {
  apartment: ApartmentCard;
  isMobile: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);

  const images = apartment.images.filter((url) => !failed.includes(url));
  const count = images.length;
  const safeIndex = count === 0 ? 0 : ((index % count) + count) % count;
  const src = images[safeIndex];
  const hasMultiple = count > 1;

  const go = (delta: number) =>
    setIndex((current) => (current + delta + count) % count);

  return (
    <div className="group relative aspect-[5/4] w-full select-none overflow-hidden bg-muted">
      {src ? (
        <motion.div
          key={src}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: EASE }}
          drag={hasMultiple ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.16}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(1);
            else if (info.offset.x > 60) go(-1);
          }}
          className="size-full cursor-grab active:cursor-grabbing"
        >
          <FadeImage
            src={src}
            alt={apartment.name}
            onError={() => {
              setFailed((current) => [...current, src]);
              setIndex(0);
            }}
            className="pointer-events-none size-full object-cover"
          />
        </motion.div>
      ) : (
        <div className="grid size-full place-items-center text-[12px] font-medium text-secondary">
          photo unavailable
        </div>
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="absolute top-4 left-4 z-10 grid size-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/55"
      >
        <Icon
          glyph={isMobile ? IconChevronLeftFill18 : IconPlusFill18}
          size={16}
          className={isMobile ? "" : "rotate-45"}
        />
      </button>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
        <span className="rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold shadow-input backdrop-blur">
          {apartment.matchScore}% fit
        </span>
        {apartment.provider ? (
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
            {apartment.provider}
          </span>
        ) : null}
      </div>

      {hasMultiple ? (
        <>
          <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-1.5">
            {images.slice(0, 10).map((url, position) => (
              <button
                key={url}
                type="button"
                aria-label={`photo ${position + 1}`}
                onClick={() => setIndex(position)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  position === safeIndex
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/50 hover:bg-white/80",
                )}
              />
            ))}
          </div>
          <span className="absolute right-4 bottom-4 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            {safeIndex + 1}/{count}
          </span>
          <button
            type="button"
            aria-label="previous photo"
            onClick={() => go(-1)}
            className="absolute top-1/2 left-3 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/55 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-70"
          >
            <Icon glyph={IconChevronLeftFill18} size={16} />
          </button>
          <button
            type="button"
            aria-label="next photo"
            onClick={() => go(1)}
            className="absolute top-1/2 right-3 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/55 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-70"
          >
            <Icon glyph={IconChevronLeftFill18} size={16} className="rotate-180" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function SpecStrip({ apartment }: { apartment: ApartmentCard }) {
  const specs: { icon: (props: IconProps) => ReactNode; label: string }[] = [
    { icon: IconBedDoubleFillDuo18, label: formatBedrooms(apartment.bedrooms) },
    {
      icon: IconBathtubFillDuo18,
      label: apartment.bathrooms === null ? "– bath" : `${apartment.bathrooms} bath`,
    },
  ];
  if (apartment.squareFeet) {
    specs.push({
      icon: IconHouseSearchFill24,
      label: `${apartment.squareFeet.toLocaleString()} ft²`,
    });
  }
  specs.push({
    icon: IconWashingMachineFill24,
    label: formatLaundry(apartment.laundry),
  });

  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border border-border bg-surface-sunken">
      {specs.map((spec, position) => (
        <div
          key={spec.label}
          className={cn(
            "flex flex-1 flex-col items-center gap-1.5 px-2 py-3.5 text-center",
            position > 0 ? "border-l border-border" : "",
          )}
        >
          <Icon glyph={spec.icon} size={18} className="text-swatch-coral" />
          <span className="text-[12px] font-medium leading-[14px] tracking-[-0.1px]">
            {spec.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function MoveInRow({ availability }: { availability: string | null }) {
  const displayAvailability = readableAvailability(availability);
  const immediate =
    !displayAvailability ||
    /now|immediate|today/i.test(displayAvailability);
  return (
    <div className="flex items-center gap-2.5 border-y border-border py-3.5">
      <Icon glyph={IconCalendarFillDuo18} size={18} className="text-foreground/60" />
      <span className="text-[13px] font-medium text-foreground">move-in</span>
      <span
        className={cn(
          "ml-auto rounded-full px-2.5 py-1 text-[12px] font-semibold",
          immediate
            ? "bg-swatch-coral/12 text-swatch-coral"
            : "bg-surface-sunken text-foreground",
        )}
      >
        {immediate ? "available now" : displayAvailability}
      </span>
    </div>
  );
}

function readableAvailability(availability: string | null) {
  if (!availability) return availability;
  const timestamp = Date.parse(availability);
  if (!Number.isFinite(timestamp)) return availability;
  if (timestamp <= Date.now()) return "available now";

  const availableDate = new Date(timestamp);
  const includeYear =
    availableDate.getFullYear() !== new Date().getFullYear();
  return `available ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(availableDate).toLowerCase()}`;
}

function readableReason(reason: string) {
  return readableAvailability(reason) ?? reason;
}

export function SavedPanel({
  saved,
  onClose,
  onOpen,
  onRemove,
  onNewSearch,
}: {
  saved: ApartmentCard[];
  onClose: () => void;
  onOpen: (apartment: ApartmentCard) => void;
  onRemove: (url: string) => void;
  onNewSearch: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const share = async () => {
    const savedCities = [
      ...new Set(saved.map((apartment) => apartment.city)),
    ];
    const locationLabel =
      savedCities.length === 1
        ? CITY_CONFIG[savedCities[0]].shortLabel
        : "sf + nyc";
    const text =
      saved.length > 0
        ? `my criblist ${locationLabel} shortlist:\n${saved
            .map((apartment) => `• ${apartment.name} - ${apartment.url}`)
            .join("\n")}`
        : "my criblist shortlist is empty.";
    if (navigator.share) {
      try {
        await navigator.share({ title: "my criblist shortlist", text });
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") {
          return;
        }
      }
    }
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <motion.button
        type="button"
        aria-label="close shortlist"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-swatch-dark/30 backdrop-blur-[3px]"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", duration: 0.42, bounce: 0 }}
        className="relative z-10 flex h-full w-full max-w-[420px] flex-col bg-background shadow-card-3"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <Icon glyph={IconHeartFillDuo18} size={18} className="text-swatch-coral" />
            <h2 className="text-[17px] font-semibold tracking-[-0.4px]">
              shortlist
              <span className="ml-1.5 text-secondary tabular-nums">{saved.length}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="grid size-8 place-items-center rounded-full text-secondary transition-colors hover:bg-button-ghost-hover hover:text-foreground"
          >
            <Icon glyph={IconPlusFill18} size={16} className="rotate-45" />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
          {saved.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="grid size-14 place-items-center rounded-[18px] bg-card text-secondary shadow-card-1">
                <Icon glyph={IconHeartFillDuo18} size={24} />
              </span>
              <p className="mt-4 text-[15px] font-medium">nothing saved yet</p>
              <p className="mt-1.5 text-[13px] leading-[18px] text-secondary">
                swipe right (or tap keep) on a listing and it lands here,
                waiting for you when you come back.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {saved.map((apartment) => (
                <li key={apartment.url}>
                  <div className="flex items-center gap-3 rounded-[16px] bg-card p-2 shadow-card-1">
                    <button
                      type="button"
                      onClick={() => onOpen(apartment)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
                    >
                      <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-muted text-swatch-coral">
                        <Icon glyph={IconHeartFillDuo18} size={20} />
                        {apartment.images[0] ? (
                          <FadeImage
                            src={apartment.images[0]}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium leading-[16px]">
                          {apartment.name}
                        </p>
                        <p className="mt-1 truncate text-[12px] font-medium text-secondary">
                          {apartment.price ? MONEY.format(apartment.price) : "–"}
                          {apartment.neighborhood ? ` · ${apartment.neighborhood}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                          {apartment.matchScore}% fit
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col gap-1 pr-1">
                      <a
                        href={apartment.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="open original listing"
                        className="grid size-8 place-items-center rounded-full text-secondary transition-colors hover:bg-button-ghost-hover hover:text-foreground"
                      >
                        <Icon
                          glyph={IconArrowRightFill18}
                          size={16}
                          className="-rotate-45"
                        />
                      </a>
                      <button
                        type="button"
                        onClick={() => onRemove(apartment.url)}
                        aria-label="remove from shortlist"
                        className="grid size-8 place-items-center rounded-full text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Icon glyph={IconPlusFill18} size={16} className="rotate-45" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
          {saved.length > 0 ? (
            <button
              type="button"
              onClick={() => void share()}
              className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[13px] font-medium text-card shadow-button transition-opacity hover:opacity-90"
            >
              share shortlist
            </button>
          ) : null}
          <button
            type="button"
            onClick={onNewSearch}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-card text-[13px] font-medium shadow-button transition-colors hover:bg-button-hover"
          >
            start a new search
          </button>
        </div>
      </motion.aside>
    </div>
  );
}

function ReasonList({
  title,
  items,
  caution = false,
}: {
  title: string;
  items: string[];
  caution?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.04em] text-secondary">
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 4).map((item) => (
          <li
            key={item}
            className="flex gap-2 text-[12px] font-medium leading-[18px] text-foreground/80 lowercase"
          >
            <span
              className={cn(
                "mt-[6px] size-1.5 shrink-0 rounded-full",
                caution ? "bg-swatch-gold" : "bg-swatch-coral",
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function amenityIcon(label: string) {
  const value = label.toLowerCase();
  if (value.includes("laundry") || value.includes("washer") || value.includes("dryer")) {
    return IconWashingMachineFill24;
  }
  if (value.includes("dishwasher")) return IconDishwasherFill24;
  if (value.includes("pet") || value.includes("dog") || value.includes("cat")) {
    return IconPawFill24;
  }
  if (value.includes("gym") || value.includes("fitness")) return IconDumbbellFill24;
  if (value.includes("wifi") || value.includes("internet")) return IconWifiFill24;
  if (value.includes("concierge") || value.includes("doorman")) {
    return IconConciergeFill24;
  }
  return null;
}
