"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
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
import { CITY_CONFIG } from "../../../shared/cities";

const SWIPE_THRESHOLD = 110;
const FLING_VELOCITY = 600;
const CARD_MAX_WIDTH = 460;

function flyDistance() {
  if (typeof window === "undefined") return 640;
  return (window.innerWidth + CARD_MAX_WIDTH) / 2 + 120;
}

function buzz(milliseconds: number) {
  if (typeof navigator !== "undefined") navigator.vibrate?.(milliseconds);
}

export function ApartmentDeck({
  apartment,
  nextApartment,
  afterNext,
  currentIndex,
  total,
  canUndo,
  lastDecision,
  modalOpen,
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
  lastDecision: Decision["kind"] | null;
  modalOpen: boolean;
  onDecision: (kind: Decision["kind"]) => void;
  onDetails: () => void;
  onUndo: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  // Unclamped so the card keeps tumbling past the drag range as it flies off.
  const rotate = useTransform(x, [-300, 300], [-12, 12], { clamp: false });
  const passOpacity = useTransform(x, [-100, -40], [1, 0]);
  const passScale = useTransform(x, [-100, -40], [1, 0.7]);
  const saveOpacity = useTransform(x, [40, 100], [0, 1]);
  const saveScale = useTransform(x, [40, 100], [0.7, 1]);
  // Corner chips yield early so they're gone before the stamp fully lands.
  const leftChipOpacity = useTransform(x, [30, 70], [1, 0]);
  const rightChipOpacity = useTransform(x, [-70, -30], [0, 1]);
  // The whole stack is derived from the live card's x, so when a fly-out
  // finishes (|x| far past 160) each card is already resting exactly where
  // its successor starts and the index swap is invisible.
  const behindScale = useTransform(x, [-160, 0, 160], [1, 0.94, 1]);
  const behindY = useTransform(x, [-160, 0, 160], [0, 16, 0]);
  const behindOpacity = useTransform(x, [-150, 0, 150], [1, 0.62, 1]);
  const afterScale = useTransform(x, [-160, 0, 160], [0.94, 0.88, 0.94]);
  const afterY = useTransform(x, [-160, 0, 160], [16, 28, 16]);
  const afterOpacity = useTransform(x, [-150, 0, 150], [0.62, 0.5, 0.62]);
  const [animating, setAnimating] = useState(false);

  const dragging = useRef(false);
  // Browsers fire a click on whatever's under the pointer when a drag ends.
  // Without this guard, releasing a swipe over the photo tap zones opens the
  // details drawer or flips photos.
  const suppressTap = useRef(false);
  const pastThreshold = useRef(false);
  useMotionValueEvent(x, "change", (latest) => {
    const past = Math.abs(latest) >= SWIPE_THRESHOLD;
    if (past !== pastThreshold.current) {
      pastThreshold.current = past;
      if (past && dragging.current) buzz(8);
    }
  });

  const remaining = total - currentIndex;

  const commit = useCallback(
    (kind: Decision["kind"], velocity = 0) => {
      if (animating) return;
      if (reduceMotion) {
        onDecision(kind);
        return;
      }
      setAnimating(true);
      buzz(kind === "save" ? 12 : 8);
      const direction = kind === "save" ? 1 : -1;
      void animate(x, direction * flyDistance(), {
        type: "spring",
        stiffness: 210,
        damping: 26,
        velocity,
        restDelta: 6,
        restSpeed: 120,
      }).then(() => {
        // Reset x BEFORE swapping the deck. Motion applies value changes on
        // the next frame, but this callback runs after the current frame's
        // loop — jumping after the swap paints one frame with the incoming
        // card still offscreen (a visible flicker). Jumping first means the
        // flushSync render mounts every card already in its resting pose.
        x.jump(0);
        flushSync(() => onDecision(kind));
        setAnimating(false);
      });
    },
    [animating, onDecision, reduceMotion, x],
  );

  const handleUndo = useCallback(() => {
    if (!canUndo || animating) return;
    if (reduceMotion) {
      onUndo();
      return;
    }
    setAnimating(true);
    const direction = lastDecision === "pass" ? -1 : 1;
    // Same ordering as commit: move x first so the restored card mounts
    // offscreen instead of flashing centered for a frame before animating.
    x.jump(direction * flyDistance());
    flushSync(() => onUndo());
    void animate(x, 0, { type: "spring", stiffness: 260, damping: 30 }).then(
      () => setAnimating(false),
    );
  }, [animating, canUndo, lastDecision, onUndo, reduceMotion, x]);

  const settleBack = useCallback(() => {
    void animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
  }, [x]);

  useEffect(() => {
    if (modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commit("pass");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commit("save");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onDetails();
      } else if (event.key === " ") {
        // Skip when a button has focus so Space still activates it.
        if (target && target.tagName === "BUTTON") return;
        event.preventDefault();
        onDetails();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commit, handleUndo, modalOpen, onDetails]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex w-full max-w-[460px] flex-1 flex-col py-4"
    >
      {/* On phones the deck hugs the header and spare space collects below,
          so the action buttons stay above the fold; sm+ centers vertically. */}
      <div aria-hidden className="max-h-4 flex-1 sm:max-h-none" />
      <DeckProgress total={total} index={currentIndex} remaining={remaining} />

      <div className="relative mt-5">
        {/* Depth: two resting cards peeking behind the live one. Both are
            full listings so nothing looks blank while a card flies away. */}
        {afterNext ? (
          <motion.div
            key={afterNext.url}
            style={{ scale: afterScale, y: afterY, opacity: afterOpacity }}
            className="absolute inset-x-0 top-0 origin-top"
          >
            <StaticCard apartment={afterNext} />
          </motion.div>
        ) : null}
        {nextApartment ? (
          <motion.div
            key={nextApartment.url}
            style={{ scale: behindScale, y: behindY, opacity: behindOpacity }}
            className="absolute inset-x-0 top-0 origin-top"
          >
            <StaticCard apartment={nextApartment} priority />
          </motion.div>
        ) : null}

        <motion.article
          key={apartment.url}
          drag={reduceMotion || animating ? false : "x"}
          style={{ x, rotate }}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.9}
          dragMomentum={false}
          onDragStart={() => {
            dragging.current = true;
            suppressTap.current = true;
          }}
          onDragEnd={(_, info) => {
            dragging.current = false;
            window.setTimeout(() => {
              suppressTap.current = false;
            }, 0);
            if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -FLING_VELOCITY)
              commit("pass", info.velocity.x);
            else if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > FLING_VELOCITY)
              commit("save", info.velocity.x);
            else settleBack();
          }}
          whileDrag={{ scale: 1.02, cursor: "grabbing" }}
          className="relative z-10 cursor-grab touch-pan-y select-none overflow-hidden rounded-[26px] bg-card shadow-elevated"
        >
          <DeckGallery
            apartment={apartment}
            onOpen={onDetails}
            canTap={() => !suppressTap.current && !animating}
            chipFade={{ left: leftChipOpacity, right: rightChipOpacity }}
          >
            {/* Stamps live on the trailing corner so they stay on screen
                while the card slides toward the opposite edge. */}
            <motion.span
              style={{ opacity: saveOpacity, scale: saveScale, rotate: -6 }}
              className="pointer-events-none absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-swatch-coral px-3.5 py-2 text-[13px] font-semibold tracking-[0.04em] text-white shadow-card-2"
            >
              <Icon glyph={IconHeartFill18} size={15} /> keep
            </motion.span>
            <motion.span
              style={{ opacity: passOpacity, scale: passScale, rotate: 6 }}
              className="pointer-events-none absolute top-4 right-4 z-20 rounded-full bg-foreground px-3.5 py-2 text-[13px] font-semibold tracking-[0.04em] text-white shadow-card-2"
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
          onClick={handleUndo}
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
        className="mx-auto mt-1.5 rounded-full px-4 py-2.5 text-[13px] font-medium text-secondary underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
      >
        see full details
      </button>

      <div aria-hidden className="flex-1" />
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
  canTap = () => true,
  chipFade,
  children,
}: {
  apartment: ApartmentCard;
  onOpen: () => void;
  canTap?: () => boolean;
  chipFade?: { left: MotionValue<number>; right: MotionValue<number> };
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

        <motion.span
          style={{ opacity: chipFade?.left }}
          className="absolute top-3.5 left-3.5 z-10 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold shadow-input backdrop-blur"
        >
          {apartment.matchScore}% fit
        </motion.span>
        {apartment.provider ? (
          <motion.span
            style={{ opacity: chipFade?.right }}
            className="absolute top-3.5 right-3.5 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur"
          >
            {apartment.provider}
          </motion.span>
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
            <motion.span
              style={{ opacity: chipFade?.right }}
              className="absolute top-3.5 right-3.5 z-10 mt-7 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
            >
              {safeIndex + 1}/{images.length}
            </motion.span>
            <button
              type="button"
              aria-label="previous photo"
              onClick={(event) => {
                event.stopPropagation();
                if (canTap()) go(-1);
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
                if (canTap()) go(1);
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
          onClick={() => {
            if (canTap()) onOpen();
          }}
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
      label: apartment.bathrooms === null ? "– bath" : `${apartment.bathrooms} bath`,
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
          {apartment.neighborhood ?? CITY_CONFIG[apartment.city].label}
        </p>
        <h2 className="mt-1 line-clamp-2 max-w-[290px] text-[22px] font-medium leading-[1.05] tracking-[-0.65px] drop-shadow-sm">
          {apartment.name}
        </h2>
      </div>
      <div className="shrink-0 pb-0.5 text-right">
        <p className="text-[21px] font-semibold tracking-[-0.6px] drop-shadow-sm">
          {apartment.price === null ? "–" : MONEY.format(apartment.price)}
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
        {apartment.provider ? (
          <span className="absolute top-3.5 right-3.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
            {apartment.provider}
          </span>
        ) : null}
        {count > 1 ? (
          <>
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
            <span className="absolute top-3.5 right-3.5 mt-7 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              1/{count}
            </span>
          </>
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
        "flex h-12 min-w-0 flex-1 max-w-[150px] items-center justify-center gap-2 rounded-full text-[14px] font-medium shadow-button transition-colors",
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
