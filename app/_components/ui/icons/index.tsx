import {
  ArrowLeft,
  ArrowRight,
  Barbell,
  Bathtub,
  Bed,
  CalendarBlank,
  CallBell,
  CaretDown,
  CaretLeft,
  CurrencyDollar,
  Funnel,
  GithubLogo,
  Heart,
  HouseLine,
  Minus,
  PawPrint,
  Plus,
  Sparkle,
  UserSwitch,
  WashingMachine,
  WifiHigh,
  type Icon as PhosphorIcon,
  type IconProps as PhosphorIconProps,
  type IconWeight,
} from "@phosphor-icons/react";

export type IconProps = PhosphorIconProps;

function withDefaults(
  Glyph: PhosphorIcon,
  defaultSize: number,
  defaultWeight: IconWeight,
) {
  return function CriblistIcon({
    size = defaultSize,
    weight = defaultWeight,
    ...props
  }: IconProps) {
    return <Glyph size={size} weight={weight} {...props} />;
  };
}

export const IconArrowLeftFill18 = withDefaults(ArrowLeft, 18, "bold");
export const IconArrowRightFill18 = withDefaults(ArrowRight, 18, "bold");
export const IconBathtubFillDuo18 = withDefaults(Bathtub, 18, "duotone");
export const IconBedDoubleFillDuo18 = withDefaults(Bed, 18, "duotone");
export const IconCalendarFillDuo18 = withDefaults(
  CalendarBlank,
  18,
  "duotone",
);
export const IconChevronDownFill18 = withDefaults(CaretDown, 18, "bold");
export const IconChevronLeftFill18 = withDefaults(CaretLeft, 18, "bold");
export const IconConciergeFill24 = withDefaults(CallBell, 24, "fill");
export const IconCurrencyDollarFillDuo18 = withDefaults(
  CurrencyDollar,
  18,
  "duotone",
);
export const IconDishwasherFill24 = withDefaults(Sparkle, 24, "fill");
export const IconDumbbellFill24 = withDefaults(Barbell, 24, "fill");
export const IconFilterFill18 = withDefaults(Funnel, 18, "fill");
export const IconFilterFillDuo18 = withDefaults(Funnel, 18, "duotone");
export const IconGithubLogoFill18 = withDefaults(GithubLogo, 18, "fill");
export const IconHeartFill18 = withDefaults(Heart, 18, "fill");
export const IconHeartFillDuo18 = withDefaults(Heart, 18, "duotone");
export const IconHouseSearchFill24 = withDefaults(HouseLine, 24, "duotone");
export const IconMinusFill18 = withDefaults(Minus, 18, "bold");
export const IconPawFill24 = withDefaults(PawPrint, 24, "fill");
export const IconPlusFill18 = withDefaults(Plus, 18, "bold");
export const IconUserArrowRightFillDuo18 = withDefaults(
  UserSwitch,
  18,
  "duotone",
);
export const IconWashingMachineFill24 = withDefaults(
  WashingMachine,
  24,
  "fill",
);
export const IconWifiFill24 = withDefaults(WifiHigh, 24, "fill");
