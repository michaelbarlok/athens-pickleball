import Link from "next/link";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Small uppercase line above the title (e.g. "Tournament" / "Admin"). */
  eyebrow?: string;
  /** Main page title. */
  title: string;
  /** Optional subtitle / description shown below the title. */
  subtitle?: string;
  /** Right-aligned actions (typically a primary CTA). On narrow widths
   *  the actions wrap to a new row below the title block. */
  actions?: React.ReactNode;
  /** Optional back link rendered above the eyebrow. Used on detail
   *  pages that want a "← Back to X" affordance without rolling
   *  their own breadcrumb. */
  backHref?: string;
  backLabel?: string;
  className?: string;
}

/**
 * Standard page header used on every top-level listing and admin
 * page. Replaces the ad-hoc `<div className="flex items-center
 * justify-between"><h1 ...>Title</h1><Link className="btn-primary">
 * Action</Link></div>` pattern that drifted across pages.
 *
 * Uses the existing typography utilities (`.text-eyebrow`,
 * `.text-heading`, `.text-caption`) so the visual scale stays in
 * sync with the rest of the site.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  backHref,
  backLabel = "Back",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center text-sm text-surface-muted hover:text-dark-200 transition-colors"
          >
            ← {backLabel}
          </Link>
        )}
        {eyebrow && <p className="text-eyebrow text-brand-vivid">{eyebrow}</p>}
        <h1 className="text-heading break-words">{title}</h1>
        {subtitle && (
          <p className="text-sm text-surface-muted max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
