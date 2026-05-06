/**
 * App icon set. Heroicons outline style (stroke 1.5) so every icon
 * shares a single visual language across the UI. Sized via the
 * `className` prop — typical scales:
 *   - text-inline: `h-4 w-4`
 *   - button:      `h-5 w-5`
 *   - hero:        `h-6 w-6`
 *
 * Use these instead of inline emoji glyphs (📍 💡 🐞 🏆 etc.) so
 * rendering is consistent across iOS / Android / Windows / web —
 * emoji fonts vary by platform and don't match the rest of the
 * Heroicons-derived UI.
 */

import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
  "aria-hidden"?: boolean;
}

const baseProps = {
  fill: "none" as const,
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.5,
};

export function MapPinIcon({ className, ...rest }: IconProps) {
  return (
    <svg
      {...baseProps}
      {...rest}
      className={cn("inline-block", className)}
      aria-hidden={rest["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </svg>
  );
}

export function LightbulbIcon({ className, ...rest }: IconProps) {
  return (
    <svg
      {...baseProps}
      {...rest}
      className={cn("inline-block", className)}
      aria-hidden={rest["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
      />
    </svg>
  );
}

export function BugIcon({ className, ...rest }: IconProps) {
  return (
    <svg
      {...baseProps}
      {...rest}
      className={cn("inline-block", className)}
      aria-hidden={rest["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8.25v6.75m0 0a4.5 4.5 0 0 1-4.5-4.5V9a4.5 4.5 0 1 1 9 0v1.5a4.5 4.5 0 0 1-4.5 4.5Zm0 0v3.75m-4.5-9V6a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v.75m-9 0h9m-9 0L5.25 9.75M16.5 6.75l2.25 3M6.75 18l-2.25 1.5m12.75-1.5L19.5 19.5"
      />
    </svg>
  );
}

export function TrophyIcon({ className, ...rest }: IconProps) {
  return (
    <svg
      {...baseProps}
      {...rest}
      className={cn("inline-block", className)}
      aria-hidden={rest["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.672c-.99 0-1.926-.228-2.77-.672"
      />
    </svg>
  );
}
