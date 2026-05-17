"use client";

import Link from "next/link";
import { type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Card primitives — the building blocks every list-card surface
 * (sheet card, group card, tournament card, club card) composes
 * itself from. Goal: every card on the platform reads from the
 * same visual grammar — same chrome, same logo size, same badge
 * placement, same status colors — so the app feels like one
 * cohesive product instead of a collection of independently-
 * evolved screens.
 *
 * These build on the existing globals.css design tokens (`.card`,
 * `.card-accent-*`, `.status-*`, `.badge-*`) rather than replacing
 * them. The primitives are layout + composition; the colors stay
 * in CSS so theme flips work the same.
 */

// ──────────────────────────────────────────────────────────────
// <Card>
// ──────────────────────────────────────────────────────────────
//
// Wraps the existing `.card` chrome and (optionally) a left-edge
// `.card-accent-*` stripe. When `href` is supplied the entire card
// becomes a Link — same pattern sheet/group/tournament cards use
// today, just consolidated so behavior + hover + focus styles are
// guaranteed identical everywhere.
//
// `accent` maps semantic status → existing stripe color:
//   open / member / live  → green
//   warning / inactive    → yellow
//   cancelled / danger    → red
//   in-progress / brand   → brand
//   closed / standalone   → gray (default)
//
// One stripe per card by design — multiple competing color cues
// were the source of much of the visual noise we're cleaning up.
//
export type CardAccent = "open" | "warning" | "cancelled" | "brand" | "gray" | "none";

const ACCENT_CLASS: Record<CardAccent, string> = {
  open: "card-accent-green",
  warning: "card-accent-yellow",
  cancelled: "card-accent-red",
  brand: "card-accent-brand",
  gray: "card-accent-gray",
  none: "",
};

export function Card({
  children,
  href,
  accent = "none",
  className,
  ariaLabel,
}: {
  children: ReactNode;
  /** When set, the entire card becomes a Link. */
  href?: string;
  accent?: CardAccent;
  className?: string;
  ariaLabel?: string;
}) {
  const classes = cn(
    "card flex flex-col gap-3",
    ACCENT_CLASS[accent],
    className
  );
  if (href) {
    return (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return <div className={classes}>{children}</div>;
}

// ──────────────────────────────────────────────────────────────
// <CardHeader>
// ──────────────────────────────────────────────────────────────
//
// Three slots: logo on the left (sized via `logoSize`), the
// title+context block in the middle, and `trailing` on the right
// (status pill, weather chip, member count — whatever the card's
// "top-right meta" is).
//
// `contextLine` is the brand-tinted secondary line — "Part of
// [Club]", "Hosted by [Group]", "by [Creator]" — that we
// established in the last few iterations. Standardizing its
// placement (always directly under the title) ends the current
// inconsistency where some cards put it above the title and
// others put it below.
//
export type LogoSize = "compact" | "standard" | "hero";

const LOGO_PX: Record<LogoSize, number> = {
  compact: 40,
  standard: 56,
  hero: 80,
};

export function CardHeader({
  logo,
  logoSize = "standard",
  title,
  contextLine,
  badges,
  trailing,
}: {
  /** Optional left-side image / icon. Pass a string URL or a custom
   *  ReactNode (e.g. a placeholder div). */
  logo?: string | ReactNode | null;
  logoSize?: LogoSize;
  title: ReactNode;
  /** Small brand-tinted secondary line ("Part of Cleveland Pickleball"). */
  contextLine?: ReactNode;
  /** Inline badge row rendered next to the title (Skills, Ladder, etc.). */
  badges?: ReactNode;
  /** Right-aligned trailing slot: typically the status pill and/or
   *  the weather chip, optionally a date chip. */
  trailing?: ReactNode;
}) {
  const px = LOGO_PX[logoSize];
  return (
    <div className="flex items-start gap-3">
      {logo !== undefined && logo !== null && (
        typeof logo === "string" ? (
          <img
            src={logo}
            alt=""
            width={px}
            height={px}
            className="shrink-0 rounded-lg object-contain bg-surface-overlay p-1 ring-1 ring-surface-border"
            style={{ width: px, height: px } satisfies CSSProperties}
          />
        ) : (
          <div
            className="shrink-0 rounded-lg bg-surface-overlay ring-1 ring-surface-border flex items-center justify-center"
            style={{ width: px, height: px } satisfies CSSProperties}
          >
            {logo}
          </div>
        )
      )}
      <div className="min-w-0 flex-1">
        {contextLine && (
          <p className="text-[11px] text-brand-300 leading-tight mb-0.5">
            {contextLine}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 text-base font-semibold text-dark-100 break-words">
            {title}
          </div>
          {badges}
        </div>
      </div>
      {trailing && <div className="shrink-0 flex items-start gap-2">{trailing}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// <CardBody>
// ──────────────────────────────────────────────────────────────
//
// Vertical stack of metadata rows. Each row is rendered as text-sm
// surface-muted by default — match the existing density of group /
// sheet cards. Pass any ReactNode (typically a few `<Chip>`s, or
// a small grid).
//
export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 text-sm text-surface-muted", className)}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// <CardFooter>
// ──────────────────────────────────────────────────────────────
//
// Left content (counts, creator byline) on the left, primary CTA
// or status note on the right. Lives below the body, separated by
// a thin divider so it visually "anchors" the card.
//
export function CardFooter({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    // `mt-auto` keeps the footer pinned to the bottom of the card when
    // Card is `h-full` inside a grid — without it, short cards would
    // have their footer floating mid-card with empty space below.
    // Card uses flex-col so mt-auto resolves correctly.
    <div
      className={cn(
        "mt-auto pt-3 border-t border-surface-border flex items-center justify-between gap-3 text-xs text-surface-muted",
        className
      )}
    >
      <div className="min-w-0 flex-1">{left}</div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// <CardBadge>
// ──────────────────────────────────────────────────────────────
//
// One pill, four semantic tiers. The intent is to compress today's
// ~10 ad-hoc colored pills down to a deliberate few so each color
// carries consistent meaning across the platform:
//
//   status   — lifecycle position. Maps onto existing .status-*
//              classes (open/closed/cancelled/live/upcoming).
//   identity — what KIND of thing this is. Ladder / Skills /
//              Doubles / Mixed / Private / Member / Admin.
//   warning  — attention required. Unpaid / Withdrawn / Inactive.
//   info     — neutral metadata. Members only / Hosted by /
//              N divisions.
//
// The actual color is a function of (variant, tone) — `tone`
// disambiguates inside identity (Ladder vs Skills both blue, but
// you can use tone="green" or tone="yellow" if you want them
// visually distinct).
//
export type CardBadgeVariant = "status" | "identity" | "warning" | "info";
export type CardBadgeTone = "green" | "blue" | "yellow" | "red" | "gray" | "teal" | "brand";
export type CardBadgeSize = "xs" | "sm" | "md";

const TONE_CLASS: Record<CardBadgeTone, string> = {
  green: "badge-green",
  blue: "badge-blue",
  yellow: "badge-yellow",
  red: "badge-red",
  gray: "badge-gray",
  // Reuse the status pill colors as utility tones for callers that
  // want the same teal/brand wash without the status semantic.
  teal: "status-live",
  brand: "status-upcoming",
};

const SIZE_CLASS: Record<CardBadgeSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-xs px-2 py-0.5",
  md: "text-xs px-2.5 py-1",
};

export function CardBadge({
  children,
  variant,
  tone,
  size = "sm",
  className,
}: {
  children: ReactNode;
  variant: CardBadgeVariant;
  /** Pick a tone within the variant. Defaults: status→green,
   *  identity→blue, warning→yellow, info→gray. */
  tone?: CardBadgeTone;
  size?: CardBadgeSize;
  className?: string;
}) {
  const resolvedTone: CardBadgeTone =
    tone ??
    (variant === "status"
      ? "green"
      : variant === "identity"
        ? "blue"
        : variant === "warning"
          ? "yellow"
          : "gray");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        TONE_CLASS[resolvedTone],
        // Size override AFTER the tone class so the size class wins
        // when both set the same property (the badge-* classes ship
        // with their own default text-xs / px which the size needs
        // to overwrite explicitly).
        SIZE_CLASS[size],
        className
      )}
    >
      {children}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// <Chip>
// ──────────────────────────────────────────────────────────────
//
// Inline gray-text metadata. No background, no border — just text
// + an optional leading icon. Use for date, location, distance,
// weather, counts. Multiple `<Chip>`s naturally read as a · -
// separated row when wrapped in a flex container.
//
export function Chip({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-surface-muted", className)}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
