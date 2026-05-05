import { LoadingSpinner } from "@/components/loading-spinner";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for the ad-hoc `<p>Loading...</p>` blocks used
 * by client-fetching pages while their data is in flight. The
 * page-level loading.tsx skeletons cover the route load itself; this
 * one covers the post-mount fetch window inside client components.
 *
 * Centred spinner + optional label in the same muted tone as the
 * old text. Looks the same on every page that uses it.
 */
export function CenteredSpinner({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-surface-muted",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner className="h-6 w-6" />
      {label && <p className="text-sm">{label}</p>}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
