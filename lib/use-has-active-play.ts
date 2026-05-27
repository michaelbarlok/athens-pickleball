"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Pulse-the-Play-tab plumbing shared between the desktop sidebar
 * and the mobile bottom nav. Single source of truth so they can't
 * disagree about when a player has something live to play.
 *
 * Cases that count as "active":
 *   - A shootout (ladder) session the viewer is checked into AND the
 *     session is mid-flight (any non-complete, non-created status).
 *   - A shootout session where the viewer is on the roster AND the
 *     session is in status="checking_in". This is the "tap to say
 *     I'm here" cue — without it the pulse wouldn't fire until an
 *     admin checked the player in manually.
 *   - A free-play session the viewer is checked into.
 *   - An in-progress tournament division the viewer is registered in.
 *
 * Re-checks on route change + window focus/visibility so the cue
 * dismisses without a hard refresh once the viewer taps Play.
 */
export function useHasActivePlay(profileId: string): boolean {
  const { supabase } = useSupabase();
  const pathname = usePathname();
  const [hasActive, setHasActive] = useState(false);

  const check = useCallback(async () => {
    const { data: shootout } = await supabase
      .from("session_participants")
      .select("checked_in, session:shootout_sessions(id, status)")
      .eq("player_id", profileId)
      .limit(10);
    if (
      (shootout ?? []).some((p: any) => {
        const s = p.session?.status;
        if (!s) return false;
        if (p.checked_in && !["session_complete", "created"].includes(s)) return true;
        if (s === "checking_in") return true;
        return false;
      })
    ) {
      setHasActive(true);
      return;
    }

    const { data: freePlay } = await supabase
      .from("free_play_session_players")
      .select("session:free_play_sessions!inner(id, status)")
      .eq("player_id", profileId)
      .limit(10);
    if ((freePlay ?? []).some((r: any) => r.session?.status === "active")) {
      setHasActive(true);
      return;
    }

    // In-progress tournament with a division the viewer is in.
    // Multi-division registrations mean a player can have several
    // rows per tournament — we have to look at ALL of them, not just
    // the first, otherwise the pulse misses when row[0]'s division
    // is inactive but row[1]'s is live.
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("tournament_id, division, status, tournament:tournaments(status)")
      .or(`player_id.eq.${profileId},partner_id.eq.${profileId}`)
      .neq("status", "withdrawn");
    const candidates = (regs ?? []).filter(
      (r: any) => r.tournament?.status === "in_progress"
    ) as { tournament_id: string; division: string }[];
    if (candidates.length > 0) {
      const tournamentIds = Array.from(
        new Set(candidates.map((c) => c.tournament_id))
      );
      const { data: activeRows } = await supabase
        .from("tournament_active_divisions")
        .select("tournament_id, division")
        .in("tournament_id", tournamentIds);
      const activeSet = new Set(
        (activeRows ?? []).map((r: any) => `${r.tournament_id}:${r.division}`)
      );
      if (
        candidates.some((c) => activeSet.has(`${c.tournament_id}:${c.division}`))
      ) {
        setHasActive(true);
        return;
      }
    }

    setHasActive(false);
  }, [supabase, profileId]);

  // Re-check on route change — covers both fresh page loads and
  // client-side navigations (the layout server component is cached
  // so it won't recompute on its own).
  useEffect(() => {
    check();
  }, [check, pathname]);

  // Re-check when the tab gains focus — catches the "phone was
  // backgrounded, session started in the meantime" case without
  // needing a realtime subscription here.
  useEffect(() => {
    function onFocus() {
      check();
    }
    function onVis() {
      if (document.visibilityState === "visible") check();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [check]);

  return hasActive;
}

/**
 * Pure pathname matcher. Any route that means "you're already
 * looking at your live play surface" — sidebar/mobile-nav use this
 * to suppress the pulse (no point cueing the tab the user is
 * already on).
 */
export function isLivePlayPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/sessions/active")) return true;
  if (/^\/sessions\/[^/]+(?:\/|$)/.test(pathname)) return true;
  if (/^\/tournaments\/[^/]+\/live(?:\/|$)/.test(pathname)) return true;
  if (/^\/groups\/[^/]+\/session(?:\/|$)/.test(pathname)) return true;
  return false;
}

/**
 * Convenience wrapper: returns the single boolean both navs use to
 * decide whether to pulse the Play tab — "the viewer has live play
 * AND isn't already on that surface."
 */
export function usePlayShouldPulse(profileId: string): boolean {
  const hasActive = useHasActivePlay(profileId);
  const pathname = usePathname();
  const viewingActive = useMemo(() => isLivePlayPath(pathname), [pathname]);
  return hasActive && !viewingActive;
}
