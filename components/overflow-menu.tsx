"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Tiny popover-style overflow menu (the three-dot "kebab" pattern).
 *
 * Renders a square ghost button with a vertical ellipsis; clicking it
 * pops a list of items down-and-to-the-left. Click-outside and Escape
 * both close it.
 *
 * Items can be:
 *   - A plain `{ label, onClick, danger? }` entry — handles its own
 *     close-on-click.
 *   - A `{ render }` entry — for items that need their own modal /
 *     popover (Invite, Leave) where the menu just needs to be a
 *     trigger surface. The component is responsible for handling
 *     its own click and closing the menu before opening its modal.
 *
 * Items render as `<button>` by default (or whatever `render` returns).
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
    <div ref={rootRef} className="relative inline-block">
      <button
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

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[12rem] overflow-hidden rounded-lg bg-surface-raised shadow-lg ring-1 ring-surface-border"
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
        </div>
      )}
    </div>
  );
}
