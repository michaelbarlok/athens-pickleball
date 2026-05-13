"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { render } from "@react-email/render";
import TournamentAnnouncement from "@/emails/TournamentAnnouncement";
import { getDivisionLabel } from "@/lib/divisions";
import { useRouter } from "next/navigation";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
};

const TYPE_LABELS: Record<string, string> = {
  singles: "Singles",
  doubles: "Doubles",
};

interface TournamentMeta {
  id: string;
  title: string;
  start_date: string | null;
  start_time?: string | null;
  /** IANA zone the tournament is scheduled in. Drives the preview's
   *  wall-clock formatting so the organizer sees the same strings
   *  recipients will get, regardless of where the organizer's browser
   *  is. */
  timezone?: string | null;
  location: string;
  format: string;
  type: string;
  divisions?: string[] | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  entry_fee?: number | null;
  payment_options?: { method?: string; detail?: string }[] | null;
  logo_url?: string | null;
}

const FALLBACK_TZ = "America/New_York";

interface Props {
  tournament: TournamentMeta;
  className?: string;
  /** Visual variant — "card" trims the button to fit on a tournament
   *  card; "header" is the full-width version on the detail page. */
  variant?: "card" | "header";
}

const MAX_CUSTOM = 1000;

function formatDateLabel(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  // Bare YYYY-MM-DD: render the calendar date directly so the preview
  // matches what a DATE column means (no zone shift).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeLabel(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatTimeLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  // start_time is a bare wall-clock HH:MM[:SS] in the tournament's zone,
  // so we render it as-is. No zone conversion needed — there's no
  // instant to project from.
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return null;
  const suffix = hour >= 12 ? "pm" : "am";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

export function TournamentNotifyMembersButton({
  tournament,
  className,
  variant = "card",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(0);
  const [dailyQuotaUsed, setDailyQuotaUsed] = useState<number>(0);
  const [dailyQuotaLimit, setDailyQuotaLimit] = useState<number>(0);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Portal target — server renders nothing, client mounts on
  // document.body so the modal isn't a DOM descendant of the
  // tournament card. Critical: TournamentCard's `.card` class lifts
  // on hover via `transform`, and a transformed ancestor makes
  // `position: fixed` descendants position relative to that ancestor
  // instead of the viewport, which manifested as the modal flickering
  // between center and top-left as the mouse moved over the card.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tz = tournament.timezone ?? FALLBACK_TZ;
  const baseEmailProps = useMemo(
    () => ({
      tournamentTitle: tournament.title,
      tournamentId: tournament.id,
      tournamentLogoUrl: tournament.logo_url ?? null,
      startDateLabel: formatDateLabel(tournament.start_date, tz),
      startTimeLabel: formatTimeLabel(tournament.start_time),
      location: tournament.location,
      formatLabel: FORMAT_LABELS[tournament.format] ?? tournament.format,
      typeLabel: TYPE_LABELS[tournament.type] ?? tournament.type,
      divisionLabels: (tournament.divisions ?? []).map((c) => getDivisionLabel(c)),
      registrationOpensLabel: formatDateTimeLabel(
        tournament.registration_opens_at,
        tz
      ),
      registrationClosesLabel: formatDateTimeLabel(
        tournament.registration_closes_at,
        tz
      ),
      entryFee: tournament.entry_fee ?? null,
      paymentOptions: tournament.payment_options ?? [],
    }),
    [tournament, tz]
  );

  // When the modal opens, grab the recipient count + cooldown state.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/tournaments/${tournament.id}/notify-members`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setRecipientCount(data.recipientCount ?? null);
          setCooldownRemainingMs(data.cooldownRemainingMs ?? 0);
          setDailyQuotaUsed(data.dailyQuotaUsed ?? 0);
          setDailyQuotaLimit(data.dailyQuotaLimit ?? 0);
        }
      } catch {
        /* non-fatal — modal still works without the count */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tournament.id]);

  // Re-render the preview whenever the message changes. Debounced so
  // each keystroke doesn't spawn a render.
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(async () => {
      try {
        const html = await render(
          <TournamentAnnouncement
            {...baseEmailProps}
            customMessage={customMessage}
          />
        );
        setPreviewHtml(html);
      } catch (e) {
        console.error("Preview render failed:", e);
      }
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [open, customMessage, baseEmailProps]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function close() {
    setOpen(false);
    setConfirming(false);
    setError(null);
    setSuccess(null);
  }

  async function handleSend(opts?: { testMode?: boolean }) {
    const testMode = opts?.testMode === true;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournament.id}/notify-members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customMessage, testMode }),
        }
      );
      // Defensive parse: a Vercel function timeout returns an HTML 504
      // page, which makes res.json() throw with the cryptic "Unexpected
      // token '<'" — we'd rather show a clear message.
      let data: { error?: string; sent?: number } = {};
      try {
        data = await res.json();
      } catch {
        setError(
          res.status === 504
            ? "Send timed out — try again. Some members may have been emailed."
            : `Send failed (${res.status}). Try again.`
        );
        setSending(false);
        setConfirming(false);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to send");
        setSending(false);
        setConfirming(false);
        return;
      }
      setSuccess(
        testMode
          ? `Test sent to ${data.sent ?? 0} site admin${data.sent === 1 ? "" : "s"}. Check your inbox.`
          : `Sent to ${data.sent ?? 0} members.`
      );
      setSending(false);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
      setSending(false);
      setConfirming(false);
    }
  }

  const cooldownActive = cooldownRemainingMs > 0;
  const cooldownMinutes = Math.ceil(cooldownRemainingMs / 60000);

  // Stop the modal-trigger button from triggering the parent <Link>
  // when it lives inside TournamentCard.
  function handleOpenClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  const buttonLabel = (
    <span className="inline-flex items-center gap-1.5">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-3.5 w-3.5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
      Notify Members
    </span>
  );

  return (
    <>
      <button
        type="button"
        onClick={handleOpenClick}
        className={
          className ??
          (variant === "header"
            ? "btn-secondary text-sm"
            : "w-full text-center mt-2 rounded-md border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 transition-colors")
        }
      >
        {buttonLabel}
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-3xl overflow-y-auto rounded-none sm:rounded-xl bg-surface-raised ring-1 ring-surface-border p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-dark-100">
                  Notify members
                </h2>
                <p className="text-xs text-surface-muted mt-0.5 truncate">
                  Email broadcast about{" "}
                  <span className="text-dark-200 font-medium">
                    {tournament.title}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-surface-muted hover:text-dark-200 text-xl leading-none px-2 -mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Recipient count + cooldown banner */}
            <div className="rounded-md border border-surface-border bg-surface-overlay px-3 py-2 mb-4 text-xs">
              {recipientCount === null ? (
                <span className="text-surface-muted">
                  Loading recipient count…
                </span>
              ) : (
                <span className="text-dark-200">
                  This will email{" "}
                  <span className="font-semibold text-brand-vivid">
                    {recipientCount}
                  </span>{" "}
                  active member{recipientCount === 1 ? "" : "s"} (test users
                  excluded).
                </span>
              )}
              {cooldownActive && (
                <p className="mt-1 text-amber-400">
                  Just sent. Please wait {cooldownMinutes} minute
                  {cooldownMinutes === 1 ? "" : "s"} before sending again.
                </p>
              )}
              {dailyQuotaLimit > 0 && (
                <p
                  className={`mt-1 ${
                    dailyQuotaUsed >= dailyQuotaLimit
                      ? "text-red-400"
                      : dailyQuotaUsed >= dailyQuotaLimit - 1
                        ? "text-amber-400"
                        : "text-surface-muted"
                  }`}
                >
                  Daily quota: {dailyQuotaUsed} of {dailyQuotaLimit} broadcasts
                  used in the last 24 hours.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Compose */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-dark-200">
                  Custom message{" "}
                  <span className="text-surface-muted font-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) =>
                    setCustomMessage(e.target.value.slice(0, MAX_CUSTOM))
                  }
                  rows={8}
                  className="input w-full"
                  placeholder="Add a short note for members. Tournament details are auto-included below."
                />
                <div className="flex items-center justify-between text-[11px] text-surface-muted">
                  <span>Plain text. Line breaks are preserved.</span>
                  <span>
                    {customMessage.length}/{MAX_CUSTOM}
                  </span>
                </div>

                {error && (
                  <div className="alert-danger px-3 py-2 text-xs">{error}</div>
                )}
                {success && (
                  <div className="alert-success px-3 py-2 text-xs">
                    {success}
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="btn-secondary text-sm"
                    disabled={sending}
                  >
                    {success ? "Close" : "Cancel"}
                  </button>
                  {!success && !confirming && (
                    <button
                      type="button"
                      onClick={() => handleSend({ testMode: true })}
                      disabled={sending}
                      className="btn-secondary text-sm"
                      title="Send only to site admins so you can preview the delivered email"
                    >
                      {sending ? "Sending…" : "Test send (admins only)"}
                    </button>
                  )}
                  {!success &&
                    (confirming ? (
                      <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={sending || cooldownActive}
                        className="btn-primary text-sm"
                      >
                        {sending
                          ? "Sending…"
                          : `Confirm — send to ${recipientCount ?? "?"}`}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={cooldownActive || recipientCount === 0}
                        className="btn-primary text-sm"
                      >
                        Send email
                      </button>
                    ))}
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-surface-muted uppercase tracking-wider">
                  Email preview
                </p>
                <div className="rounded-md border border-surface-border overflow-hidden bg-white">
                  <iframe
                    title="Email preview"
                    srcDoc={previewHtml}
                    className="w-full h-[480px] sm:h-[560px] block"
                    sandbox=""
                  />
                </div>
                <p className="text-[11px] text-surface-muted">
                  Each recipient&apos;s &quot;Turn off&quot; link is personalised at
                  send time so it lands them on their own preferences.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
