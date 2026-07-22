"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import {
  IconArrowLeftFill18,
  IconBathtubFillDuo18,
  IconBedDoubleFillDuo18,
  IconChevronLeftFill18,
  IconHeartFill18,
  IconHeartFillDuo18,
  IconHouseSearchFill24,
  IconWashingMachineFill24,
  type IconProps,
} from "@/_components/ui/icons";
import { cn } from "@/_lib/utils";
import {
  MONEY,
  formatBedrooms,
  formatLaundry,
  type ApartmentCard,
  type Decision,
} from "./model";

export function ApartmentDeck({
  apartment,
  nextApartment,
  afterNext,
  currentIndex,
  total,
  canUndo,
  onDecision,
  onDetails,
  onUndo,
}: {
  apartment: ApartmentCard;
  nextApartment?: ApartmentCard;
  afterNext?: ApartmentCard;
  currentIndex: number;
  total: number;
  canUndo: boolean;
  onDecision: (kind: Decision["kind"]) => void;
  onDetails: () => void;
  onUndo: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-11, 11]);
  const passOpacity = useTransform(x, [-130, -30], [1, 0]);
  const saveOpacity = useTransform(x, [30, 130], [0, 1]);
  const behindScale = useTransform(x, [-160, 0, 160], [1, 0.94, 1]);
  const behindY = useTransform(x, [-160, 0, 160], [0, 16, 0]);
  const behindOpacity = useTransform(x, [-150, 0, 150], [1, 0.62, 1]);
  const [animating, setAnimating] = useState(false);

  const remaining = total - currentIndex;

  const commit = useCallback(
    (kind: Decision["kind"]) => {
      if (animating) return;
      setAnimating(true);
      const target = kind === "save" ? 900 : -900;
      if (reduceMotion) {
        x.set(0);
        setAnimating(false);
        onDecision(kind);
        return;
      }
      void animate(x, target, {
        type: "spring",
        stiffness: 550,
        damping: 60,
        velocity: kind === "save" ? 400 : -400,
      }).then(() => {
        x.jump(0);
        setAnimating(false);
        onDecision(kind);
      });
    },
    [animating, onDecision, reduceMotion, x],
  );

  const settleBack = useCallback(() => {
    void animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
  }, [x]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-4"
    >
      <DeckProgress total={total} index={currentIndex} remaining={remaining} />

      <div className="relative mt-5">
        {/* Depth: two resting cards peeking behind the live one. Both are
            full listings so nothing looks blank while a card flies away. */}
        {afterNext ? (
          <div
            className="absolute inset-x-0 top-0 origin-top"
            style={{ transform: "translateY(28px) scale(0.88)", opacity: 0.5 }}
          >
            <StaticCard apartment={afterNext} />
          </div>
        ) : null}
        {nextApartment ? (
          <motion.div
            style={{ scale: behindScale, y: behindY, opacity: behindOpacity }}
            className="absolute inset-x-0 top-0 origin-top"
          >
            <StaticCard apartment={nextApartment} priority />
          </motion.div>
        ) : null}

        <motion.article
          drag={reduceMotion || animating ? false : "x"}
          style={{ x, rotate }}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            if (info.offset.x < -110 || info.velocity.x < -600) commit("pass");
            else if (info.offset.x > 110 || info.velocity.x > 600) commit("save");
            else settleBack();
          }}
          whileDrag={{ cursor: "grabbing" }}
          className="relative z-10 cursor-grab touch-pan-y overflow-hidden rounded-[26px] bg-card shadow-elevated"
        >
          <DeckGallery apartment={apartment} onOpen={onDetails}>
            <motion.span
              style={{ opacity: saveOpacity }}
              className="pointer-events-none absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full bg-swatch-coral px-3 py-1.5 text-[12px] font-semibold tracking-[0.04em] text-white shadow-card-2"
            >
              <Icon glyph={IconHeartFill18} size={14} /> keep
            </motion.span>
            <motion.span
              style={{ opacity: passOpacity }}
              className="pointer-events-none absolute top-4 left-4 z-20 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold tracking-[0.04em] text-white shadow-card-2"
            >
              pass
            </motion.span>
          </DeckGallery>

          <CardInfo apartment={apartment} />
        </motion.article>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <DeckButton tone="pass" onClick={() => commit("pass")}>
          pass
        </DeckButton>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="undo last swipe"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-card text-secondary shadow-button transition-colors hover:bg-button-hover disabled:opacity-35"
        >
          <Icon glyph={IconChevronLeftFill18} size={18} />
        </button>
        <DeckButton tone="save" onClick={() => commit("save")}>
          keep
        </DeckButton>
      </div>

      <button
        type="button"
        onClick={onDetails}
        className="mx-auto mt-4 text-[12px] font-medium text-secondary underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
      >
        see full details
      </button>
    </motion.section>
  );
}

function DeckProgress({
  total,
  index,
  remaining,
}: {
  total: number;
  index: number;
  remaining: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }).map((_, position) => (
          <span
            key={position}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              position < index
                ? "bg-foreground/35"
                : position === index
                  ? "bg-foreground"
                  : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] font-medium text-secondary">
        {remaining} left
      </span>
    </div>
  );
}

function DeckGallery({
  apartment,
  onOpen,
  children,
}: {
  apartment: ApartmentCard;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [hover, setHover] = useState(false);

  const images = apartment.images.filter((url) => !failed.includes(url));
  const safeIndex = images.length === 0 ? 0 : index % images.length;
  const src = images[safeIndex];
  const hasMultiple = images.length > 1;

  const go = (delta: number) =>
    setIndex((current) => (current + delta + images.length) % images.length);

  return (
    <div className="relative">
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative aspect-[5/4] overflow-hidden bg-muted"
      >
        {src ? (
          <FadeImage
            src={src}
            alt={apartment.name}
            loading="eager"
            fetchPriority="high"
            onError={() => {
              setFailed((current) => [...current, src]);
              setIndex(0);
            }}
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-[12px] font-medium text-secondary">
            photo unavailable
          </div>
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.28)_0%,transparent_32%,transparent_55%,rgba(0,0,0,0.76)_100%)]"
        />

        <span className="absolute top-3.5 left-3.5 z-10 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold shadow-input backdrop-blur">
          {apartment.matchScore}% fit
        </span>
        {apartment.provider ? (
          <span className="absolute top-3.5 right-3.5 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
            {apartment.provider}
          </span>
        ) : null}

        {hasMultiple ? (
          <>
            <div className="absolute inset-x-3.5 top-12 z-10 flex gap-1">
              {images.slice(0, 8).map((url, position) => (
                <span
                  key={url}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    position === safeIndex ? "bg-white" : "bg-white/40",
                  )}
                />
              ))}
            </div>
            <span className="absolute top-3.5 right-3.5 z-10 mt-7 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              {safeIndex + 1}/{images.length}
            </span>
            <button
              type="button"
              aria-label="previous photo"
              onClick={(event) => {
                event.stopPropagation();
                go(-1);
              }}
              className="group absolute inset-y-0 left-0 z-10 flex w-1/4 items-center justify-start pl-2"
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full bg-white/90 text-foreground shadow-input transition-opacity",
                  hover ? "opacity-100" : "opacity-0",
                )}
              >
                <Icon glyph={IconChevronLeftFill18} size={16} />
              </span>
            </button>
            <button
              type="button"
              aria-label="next photo"
              onClick={(event) => {
                event.stopPropagation();
                go(1);
              }}
              className="group absolute inset-y-0 right-0 z-10 flex w-1/4 items-center justify-end pr-2"
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full bg-white/90 text-foreground shadow-input transition-opacity",
                  hover ? "opacity-100" : "opacity-0",
                )}
              >
                <Icon glyph={IconChevronLeftFill18} size={16} className="rotate-180" />
              </span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          aria-label="open details"
          onClick={onOpen}
          className="absolute inset-x-1/4 inset-y-0 z-0"
        />

        <PhotoIdentity apartment={apartment} />

        {children}
      </div>
    </div>
  );
}

function MetaRow({
  apartment,
  className,
}: {
  apartment: ApartmentCard;
  className?: string;
}) {
  const items: { icon: (props: IconProps) => ReactNode; label: string }[] = [
    { icon: IconBedDoubleFillDuo18, label: formatBedrooms(apartment.bedrooms) },
    {
      icon: IconBathtubFillDuo18,
      label: apartment.bathrooms === null ? "— bath" : `${apartment.bathrooms} bath`,
    },
  ];
  if (apartment.squareFeet) {
    items.push({
      icon: IconHouseSearchFill24,
      label: `${apartment.squareFeet.toLocaleString()} ft²`,
    });
  }
  items.push({
    icon: IconWashingMachineFill24,
    label: formatLaundry(apartment.laundry),
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 text-[13px] font-medium text-secondary"
        >
          <Icon glyph={item.icon} size={16} className="text-foreground/65" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function CardInfo({ apartment }: { apartment: ApartmentCard }) {
  return (
    <div className="px-4 pt-3.5 pb-4">
      <MetaRow apartment={apartment} />

      {apartment.matchReasons[0] || apartment.description ? (
        <p className="mt-3 line-clamp-1 border-t border-border/80 pt-3 text-[11px] font-medium leading-[16px] text-secondary lowercase">
          {apartment.matchReasons[0]
            ? apartment.matchReasons.slice(0, 2).join(" · ")
            : apartment.description}
        </p>
      ) : null}
    </div>
  );
}

function PhotoIdentity({ apartment }: { apartment: ApartmentCard }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-5 p-4 text-white">
      <div className="min-w-0 pb-0.5">
        <p className="truncate text-[11px] font-medium text-white/75">
          {apartment.neighborhood ?? "san francisco"}
        </p>
        <h2 className="mt-1 line-clamp-2 max-w-[290px] text-[22px] font-medium leading-[1.05] tracking-[-0.65px] drop-shadow-sm">
          {apartment.name}
        </h2>
      </div>
      <div className="shrink-0 pb-0.5 text-right">
        <p className="text-[21px] font-semibold tracking-[-0.6px] drop-shadow-sm">
          {apartment.price === null ? "—" : MONEY.format(apartment.price)}
        </p>
        <p className="mt-0.5 text-[9px] font-medium text-white/65">monthly</p>
      </div>
    </div>
  );
}

function StaticCard({
  apartment,
  priority = false,
}: {
  apartment: ApartmentCard;
  priority?: boolean;
}) {
  const src = apartment.images[0];
  const count = apartment.images.length;
  return (
    <div className="pointer-events-none overflow-hidden rounded-[26px] bg-card shadow-card-1">
      <div className="relative aspect-[5/4] overflow-hidden bg-muted">
        {src ? (
          <FadeImage
            src={src}
            alt=""
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            className="size-full object-cover"
          />
        ) : null}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.28)_0%,transparent_32%,transparent_55%,rgba(0,0,0,0.76)_100%)]"
        />
        <span className="absolute top-3.5 left-3.5 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold shadow-input backdrop-blur">
          {apartment.matchScore}% fit
        </span>
        {count > 1 ? (
          <div className="absolute inset-x-3.5 top-12 flex gap-1">
            {apartment.images.slice(0, 8).map((url, position) => (
              <span
                key={url}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  position === 0 ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
        ) : null}
        <PhotoIdentity apartment={apartment} />
      </div>
      <CardInfo apartment={apartment} />
    </div>
  );
}

function DeckButton({
  tone,
  onClick,
  children,
}: {
  tone: "pass" | "save";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", duration: 0.14, bounce: 0 }}
      className={cn(
        "flex h-12 min-w-[128px] items-center justify-center gap-2 rounded-full text-[14px] font-medium shadow-button transition-colors",
        tone === "save"
          ? "bg-swatch-coral text-white hover:brightness-105"
          : "bg-card text-foreground hover:bg-button-hover",
      )}
    >
      <Icon
        glyph={tone === "save" ? IconHeartFillDuo18 : IconArrowLeftFill18}
        size={16}
        className={tone === "save" ? "text-white" : "text-secondary"}
      />
      {children}
    </motion.button>
  );
}
