"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@/_components/ui/icon";
import {
  IconArrowRightFill18,
  IconChevronDownFill18,
  IconHouseSearchFill24,
  IconPlusFill18,
} from "@/_components/ui/icons";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";
import {
  EASE,
  NEIGHBORHOODS,
  formatSearchLabel,
  type LaundryPreference,
  type Preferences,
} from "./model";
import { ProviderSources } from "./provider-sources";

export function SearchSetup({
  preferences,
  error,
  onChange,
  onSearch,
}: {
  preferences: Preferences;
  error: string | null;
  onChange: (patch: Partial<Preferences>) => void;
  onSearch: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [areasOpen, setAreasOpen] = useState(false);

  const toggleNeighborhood = (neighborhood: string) => {
    const selected = preferences.neighborhoods.includes(neighborhood);
    onChange({
      neighborhoods: selected
        ? preferences.neighborhoods.filter((value) => value !== neighborhood)
        : [...preferences.neighborhoods, neighborhood],
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-6 lowercase"
    >
      <div className="mb-7 text-center">
        <h1 className="mx-auto max-w-[420px] text-balance text-[38px] font-medium leading-[0.98] tracking-[-1.8px] sm:text-[48px]">
          the sf hunt, minus the hunting.
        </h1>
        <p className="mx-auto mt-4 max-w-[350px] text-pretty text-[14px] leading-[20px] text-secondary">
          tell criblist what you want. it pulls listings that are live right
          now and hands you a deck to swipe through.
        </p>
        <ProviderSources />
      </div>

      <PanelCard radius={22} className="p-4 sm:p-5">
        <Field label="i'm looking for">
          <ChoiceGroup
            segmented
            value={preferences.bedrooms}
            options={[
              ["studio", "studio"],
              ["1", "1 bed"],
              ["2", "2 beds"],
              ["3+", "3+ beds"],
            ]}
            onChange={(bedrooms) =>
              onChange({ bedrooms: bedrooms as Preferences["bedrooms"] })
            }
          />
        </Field>

        <div className="mt-4">
          <Field label="monthly budget">
            <BudgetRange
              minimum={preferences.budgetMin}
              maximum={preferences.budgetMax}
              onMinimumChange={(budgetMin) => onChange({ budgetMin })}
              onMaximumChange={(budgetMax) => onChange({ budgetMax })}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="neighborhoods">
            <button
              type="button"
              onClick={() => setAreasOpen((open) => !open)}
              className="nook-input flex w-full items-center justify-between text-left"
            >
              <span className="truncate">
                {preferences.neighborhoods.length === 0
                  ? "anywhere in sf"
                  : preferences.neighborhoods.join(", ")}
              </span>
              <Icon
                glyph={IconChevronDownFill18}
                size={16}
                className={cn(
                  "shrink-0 text-secondary transition-transform duration-200",
                  areasOpen && "rotate-180",
                )}
              />
            </button>
          </Field>
          <AnimatePresence initial={false}>
            {areasOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="no-scrollbar mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-[16px] bg-surface-sunken p-3">
                  <Choice
                    active={preferences.neighborhoods.length === 0}
                    onClick={() => onChange({ neighborhoods: [] })}
                  >
                    all sf
                  </Choice>
                  {NEIGHBORHOODS.map((neighborhood) => (
                    <Choice
                      key={neighborhood}
                      active={preferences.neighborhoods.includes(neighborhood)}
                      onClick={() => toggleNeighborhood(neighborhood)}
                    >
                      {neighborhood}
                    </Choice>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          className="mt-4 flex w-full items-center justify-between border-t border-border/80 pt-3.5 text-[12px] font-medium text-secondary outline-none transition-colors hover:text-foreground"
        >
          <span>{moreOpen ? "hide must-haves" : "add must-haves"}</span>
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full bg-surface-sunken text-secondary transition-transform duration-200",
              moreOpen && "rotate-45",
            )}
          >
            <Icon glyph={IconPlusFill18} size={14} />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {moreOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="grid gap-5 pt-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="move-in">
                    <SelectInput
                      value={preferences.moveIn}
                      onChange={(value) =>
                        onChange({ moveIn: value as Preferences["moveIn"] })
                      }
                      options={[
                        ["now", "now"],
                        ["30 days", "within 30 days"],
                        ["60 days", "within 60 days"],
                        ["flexible", "flexible"],
                      ]}
                    />
                  </Field>
                  <Field label="bathrooms">
                    <SelectInput
                      value={String(preferences.bathroomsMin)}
                      onChange={(value) =>
                        onChange({ bathroomsMin: Number(value) })
                      }
                      options={[
                        ["1", "1+"],
                        ["1.5", "1.5+"],
                        ["2", "2+"],
                        ["2.5", "2.5+"],
                      ]}
                    />
                  </Field>
                </div>
                <Field label="laundry">
                  <ChoiceGroup
                    value={preferences.laundry}
                    options={[
                      ["any", "any"],
                      ["in-building", "in building"],
                      ["in-unit", "in unit"],
                    ]}
                    onChange={(laundry) =>
                      onChange({ laundry: laundry as LaundryPreference })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2.5">
                  <Toggle
                    label="dishwasher"
                    checked={preferences.dishwasher}
                    onChange={(dishwasher) => onChange({ dishwasher })}
                  />
                  <Toggle
                    label="pet friendly"
                    checked={preferences.pets}
                    onChange={(pets) => onChange({ pets })}
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <p className="mt-5 rounded-[12px] bg-danger/10 px-3 py-2.5 text-[12px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <PrimaryButton onClick={onSearch} className="mt-4 h-11 w-full">
          build my deck
          <Icon glyph={IconArrowRightFill18} size={16} />
        </PrimaryButton>
      </PanelCard>
    </motion.section>
  );
}

export function Searching({ preferences }: { preferences: Preferences }) {
  const [step, setStep] = useState(0);
  const steps = useMemo(
    () => [
      "scanning live listings",
      "opening the promising ones",
      "verifying every detail",
      "shuffling your deck",
    ],
    [],
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => setStep((index) => Math.min(steps.length - 1, index + 1)),
      4500,
    );
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center py-10 text-center lowercase"
    >
      <div className="relative h-56 w-48">
        <motion.div
          animate={{ rotate: [6, 3, 6], y: [0, -4, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 translate-x-4 rounded-[24px] bg-card/60 shadow-card-1"
        />
        <motion.div
          animate={{ rotate: [-4, -2, -4], y: [0, -2, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="absolute inset-0 -translate-x-3 rounded-[24px] bg-card/80 shadow-card-1"
        />
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 overflow-hidden rounded-[24px] bg-card p-2.5 shadow-card-2"
        >
          <div className="h-36 animate-pulse rounded-[16px] bg-muted" />
          <div className="mx-1.5 mt-3.5 h-3 w-24 animate-pulse rounded-full bg-muted" />
          <div className="mx-1.5 mt-2 h-2.5 w-16 animate-pulse rounded-full bg-muted/70" />
        </motion.div>
      </div>

      <div className="mt-10 h-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <p className="text-[18px] font-medium tracking-[-0.4px]">
              {steps[step]}…
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-secondary">
              {formatSearchLabel(preferences)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

export function SearchComplete({
  savedCount,
  hasResults,
  onEdit,
  onFindMore,
  onViewSaved,
}: {
  savedCount: number;
  hasResults: boolean;
  onEdit: () => void;
  onFindMore: () => void;
  onViewSaved: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-6 lowercase"
    >
      <PanelCard radius={26} className="p-6 text-center sm:p-8">
        <span className="grid size-14 place-items-center rounded-[18px] bg-surface-sunken text-foreground/70">
          <Icon glyph={IconHouseSearchFill24} size={24} />
        </span>
        <h1 className="mt-5 text-[26px] font-medium leading-[1.1] tracking-[-0.9px]">
          {!hasResults
            ? "no clean matches yet"
            : savedCount === 0
              ? "that's the batch"
              : `${savedCount} in your shortlist`}
        </h1>
        <p className="mx-auto mt-3 max-w-[360px] text-[13px] leading-[19px] text-secondary">
          {!hasResults
            ? "try loosening one must-have. criblist won't pad your deck with dead or mismatched listings."
            : savedCount === 0
              ? "you've been through every live listing that fit. pull a fresh batch or adjust your search."
              : "open the originals whenever you're ready, or keep hunting for more."}
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          {savedCount > 0 ? (
            <PrimaryButton onClick={onViewSaved} className="w-full">
              view shortlist ({savedCount})
            </PrimaryButton>
          ) : null}
          <button
            type="button"
            onClick={onFindMore}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-card text-[13px] font-medium shadow-button transition-colors hover:bg-button-hover"
          >
            pull a fresh batch
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex h-11 w-full items-center justify-center text-[13px] font-medium text-secondary transition-colors hover:text-foreground"
          >
            tune search
          </button>
        </div>
      </PanelCard>
    </motion.section>
  );
}

function PanelCard({
  radius = 20,
  className,
  children,
}: {
  radius?: number;
  className?: string;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useSquircle(surfaceRef, radius, { wrapperRef });
  return (
    <div ref={wrapperRef} className="relative">
      <div
        ref={surfaceRef}
        style={{ borderRadius: radius }}
        className={cn("bg-card shadow-elevated", className)}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-2 block text-[11px] font-semibold tracking-[0.04em] text-secondary">
        {label}
      </span>
      {children}
    </div>
  );
}

function ChoiceGroup({
  value,
  options,
  onChange,
  segmented = false,
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  segmented?: boolean;
}) {
  return (
    <div
      className={cn(
        segmented
          ? "grid grid-cols-4 gap-1 rounded-[15px] bg-surface-sunken p-1"
          : "flex flex-wrap gap-1.5",
      )}
    >
      {options.map(([optionValue, label]) => (
        <Choice
          key={optionValue}
          active={value === optionValue}
          onClick={() => onChange(optionValue)}
          segmented={segmented}
        >
          {label}
        </Choice>
      ))}
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
  segmented = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  segmented?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        segmented
          ? "w-full rounded-[11px] px-1 py-2.5 text-[12px]"
          : "rounded-full px-3.5 py-2 text-[13px]",
        active
          ? "bg-foreground text-card shadow-button"
          : segmented
            ? "text-secondary hover:bg-card/70 hover:text-foreground"
            : "bg-surface-sunken text-foreground hover:bg-control-active",
      )}
    >
      {children}
    </button>
  );
}

function BudgetRange({
  minimum,
  maximum,
  onMinimumChange,
  onMaximumChange,
}: {
  minimum: number;
  maximum: number;
  onMinimumChange: (value: number) => void;
  onMaximumChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-[14px] bg-input-muted shadow-input focus-within:bg-card focus-within:shadow-input-focus">
      <label className="flex min-w-0 flex-col px-3.5 py-2">
        <span className="text-[9px] font-medium tracking-[0.04em] text-muted-foreground">
          from
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[13px] text-secondary">$</span>
          <input
            type="number"
            min={0}
            max={20_000}
            step={100}
            value={minimum}
            onChange={(event) =>
              onMinimumChange(
                Math.min(20_000, Number(event.target.value) || 0),
              )
            }
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium tracking-[0.2px] tabular-nums outline-none"
          />
        </span>
      </label>
      <span aria-hidden className="my-2.5 w-px bg-border" />
      <label className="flex min-w-0 flex-col px-3.5 py-2">
        <span className="text-[9px] font-medium tracking-[0.04em] text-muted-foreground">
          up to
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[13px] text-secondary">$</span>
          <input
            type="number"
            min={1_000}
            max={20_000}
            step={100}
            value={maximum}
            onChange={(event) =>
              onMaximumChange(
                Math.min(20_000, Number(event.target.value) || 0),
              )
            }
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium tracking-[0.2px] tabular-nums outline-none"
          />
        </span>
      </label>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="nook-input w-full appearance-none pr-9"
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
      <Icon
        glyph={IconChevronDownFill18}
        size={16}
        className="pointer-events-none absolute top-3.5 right-3 text-secondary"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-12 items-center justify-between rounded-[14px] px-3.5 text-[13px] font-medium transition-colors",
        checked
          ? "bg-foreground text-card shadow-button"
          : "bg-surface-sunken text-foreground hover:bg-control-active",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full transition-colors",
          checked ? "bg-card" : "bg-card/70",
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full transition-colors",
            checked ? "bg-foreground" : "bg-transparent",
          )}
        />
      </span>
    </button>
  );
}

function PrimaryButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", duration: 0.14, bounce: 0 }}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[13px] font-medium text-card shadow-button transition-opacity hover:opacity-90",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
