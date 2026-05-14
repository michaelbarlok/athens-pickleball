"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Tiny popover-style overflow menu (the three-dot "kebab" pattern).
 *
 * Renders a square ghost button with a vertical ellipsis; clicking it
 * pops a list of items down-and-to-the-left. Click-outside and Escape
 * both close it.
 *
 * The popover renders in a React portal anchored to document.body
 * because the menu often lives inside cards with `overflow: hidden`
 * (e.g. the group page header clips its gradient strip), which would
 * otherwise crop the dropdown. The portal escapes every ancestor
 * overflow boundary; position is computed from the trigger button's
 * bounding rect so the popover stays glued to it.
 *
 * Items can be:
 *   - A plain `{ label, onClick, danger? }` entry — handles its own
 *     close-on-click.
 *   - A `{ render }` entry — for items that need their own modal /
 *     popover (Invite, Leave) where the menu just needs to be a
 *     trigger surface. The component is responsible for handling
 *     its own click and closing the menu before opening its modal.
 */

export type OverflowMenuItem =
  | {
      label: string;
      onClick: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | {
      /** Renders a fully custom row. The provided `close` callback should
       *  be called before any async dialog so the menu doesn't visually
       *  linger behind the modal. */
      render: (close: () => void) => ReactNode;
    };

export function OverflowMenu({
  items,
  ariaLabel = "More actions",
}: {
  items: OverflowMenuItem[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Portal needs document.body, which isn't available during SSR. The
  // mounted gate prevents the server from rendering the popover at all.
  useEffect(() => setMounted(true), []);

  // Position the portal'd popover under the trigger. useLayoutEffect
  // so the menu appears in its final spot on the same frame the user
  // sees `open=true`, without a one-frame jump from (0,0).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        // right-anchored: distance from viewport's right edge to the
        // trigger's right edge. The popover then uses `right: <px>`
        // so it grows leftward, matching the previous in-flow look.
        right: window.innerWidth - rect.right,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary px-2.5"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
          aria-hidden
        >
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {mounted && open && position && createPortal(
        <div
          ref={popoverRef}
          role="menu"
          style={{ top: position.top, right: position.right }}
          className="fixed z-[60] min-w-[12rem] overflow-hidden rounded-lg bg-surface-raised shadow-lg ring-1 ring-surface-border"
        >
          {items.map((item, i) => {
            if ("render" in item) {
              return (
                <div key={i} role="menuitem">
                  {item.render(() => setOpen(false))}
                </div>
              );
            }
            return (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  item.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-dark-100 hover:bg-surface-overlay"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
