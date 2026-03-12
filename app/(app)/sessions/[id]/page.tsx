"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import type { ShootoutSession, SessionParticipant, GameResult } from "@/types/database";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  checking_in: "Check-In Open",
  seeding: "Seeding Courts",
  round_active: "Round In Progress",
  round_complete: "Round Complete",
  session_complete: "Session Complete",
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  checking_in: "bg-yellow-100 text-yellow-700",
  seeding: "bg-blue-100 text-blue-700",
  round_active: "bg-green-100 text-green-700",
  round_complete: "bg-purple-100 text-purple-700",
  session_complete: "bg-gray-100 text-gray-700",
};

export default function PlayerSessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const [session, setSession] = useState<(ShootoutSession & { group: { name: string }; sheet: { event_date: string; location: string } }) | null>(null);
  const [participants, setParticipants] = useState<(SessionParticipant & { player: { display_name: string; avatar_url: string | null } })[]>([]);
  const [scores, setScores] = useState<GameResult[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [myCourt, setMyCourt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (profile) setMyPlayerId(profile.id);

      const { data: sess } = await supabase
        .from("shootout_sessions")
        .select("*, group:shootout_groups(name), sheet:signup_sheets(event_date, location)")
        .eq("id", sessionId)
        .single();
      setSession(sess as any);

      const { data: parts } = await supabase
        .from("session_participants")
        .select("*, player:profiles(display_name, avatar_url)")
        .eq("session_id", sessionId)
        .order("court_number", { ascending: true });

      if (parts) {
        setParticipants(parts as any);
        const me = parts.find((p: any) => p.player_id === profile?.id);
        if (me) setMyCourt((me as any).court_number);
      }

      const { data: gameScores } = await supabase
        .from("game_results")
        .select("*")
        .eq("session_id", sessionId)
        .order("round_number")
        .order("pool_number");
      setScores(gameScores ?? []);

      setLoading(false);
    }
    fetchData();
  }, [sessionId, supabase]);

  // Realtime subscriptions
  useEffect(() => {
    const sessionChannel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shootout_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          setSession((prev) => prev ? { ...prev, ...payload.new } : prev);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` },
        () => {
          // Re-fetch participants on any change
          supabase
            .from("session_participants")
            .select("*, player:profiles(display_name, avatar_url)")
            .eq("session_id", sessionId)
            .order("court_number", { ascending: true })
            .then(({ data }) => {
              if (data) {
                setParticipants(data as any);
                const me = data.find((p: any) => p.player_id === myPlayerId);
                if (me) setMyCourt((me as any).court_number);
              }
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_results", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setScores((prev) => [...prev, payload.new as GameResult]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, supabase, myPlayerId]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading session...</div>;
  if (!session) return <div className="text-center py-12 text-gray-500">Session not found.</div>;

  // Group participants by court
  const courts = new Map<number, typeof participants>();
  for (const p of participants) {
    if (p.court_number == null) continue;
    const list = courts.get(p.court_number) ?? [];
    list.push(p);
    courts.set(p.court_number, list);
  }
  const sortedCourts = Array.from(courts.entries()).sort(([a], [b]) => a - b);

  const myCourtScores = scores.filter((s) => s.pool_number === myCourt);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{session.group?.name}</h1>
        <p className="text-sm text-gray-600">
          {session.sheet?.event_date &&
            new Date(session.sheet.event_date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          {session.sheet?.location && ` — ${session.sheet.location}`}
        </p>
      </div>

      {/* Status + Round */}
      <div className="flex items-center gap-4">
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[session.status] ?? "bg-gray-100 text-gray-700"}`}>
          {STATUS_LABELS[session.status] ?? session.status}
        </span>
        <span className="text-sm text-gray-600">Round {session.current_round}</span>
        {session.num_courts > 0 && (
          <span className="text-sm text-gray-600">{session.num_courts} courts</span>
        )}
      </div>

      {/* My Court Assignment */}
      {myCourt != null && (
        <div className="card bg-brand-50 border border-brand-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-700">Your Court Assignment</p>
              <p className="text-3xl font-bold text-brand-900">Court {myCourt}</p>
            </div>
            {(session.status === "round_active" || session.status === "round_complete") && (
              <Link href={`/sessions/${sessionId}/score`} className="btn-primary">
                Enter Score
              </Link>
            )}
          </div>
          {/* Court mates */}
          <div className="mt-3 flex flex-wrap gap-2">
            {participants
              .filter((p) => p.court_number === myCourt && p.player_id !== myPlayerId)
              .map((p) => (
                <span key={p.id} className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                  {p.player?.display_name}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* All Courts */}
      {sortedCourts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Court Assignments</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sortedCourts.map(([courtNum, courtPlayers]) => (
              <div
                key={courtNum}
                className={`card ${courtNum === myCourt ? "ring-2 ring-brand-500" : ""}`}
              >
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Court {courtNum}</h3>
                <ul className="space-y-1">
                  {courtPlayers.map((p) => (
                    <li
                      key={p.id}
                      className={`text-sm ${p.player_id === myPlayerId ? "font-semibold text-brand-700" : "text-gray-600"}`}
                    >
                      {p.player?.display_name}
                      {p.pool_finish != null && (
                        <span className="ml-2 text-xs text-gray-400">
                          {p.pool_finish === 1 ? "1st" : p.pool_finish === 2 ? "2nd" : p.pool_finish === 3 ? "3rd" : `${p.pool_finish}th`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scores for my court */}
      {myCourtScores.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Scores — Court {myCourt}</h2>
          <div className="space-y-2">
            {myCourtScores.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <span className="text-sm text-gray-600">Round {s.round_number}</span>
                <span className="font-mono text-lg font-semibold">
                  {s.score_a} – {s.score_b}
                </span>
                <span>
                  {s.is_confirmed ? (
                    <span className="badge-green">Confirmed</span>
                  ) : s.is_disputed ? (
                    <span className="badge-red">Disputed</span>
                  ) : (
                    <span className="badge-yellow">Pending</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session status messages */}
      {session.status === "created" && (
        <div className="card text-center text-gray-500">
          <p>This session hasn&apos;t started yet. Check-in will open soon.</p>
        </div>
      )}
      {session.status === "checking_in" && !myCourt && (
        <div className="card text-center text-gray-500">
          <p>Check-in is open. Please check in with the session organizer.</p>
        </div>
      )}
      {session.status === "seeding" && (
        <div className="card text-center text-gray-500">
          <p>Courts are being assigned. Your court number will appear here shortly.</p>
        </div>
      )}
      {session.status === "session_complete" && (
        <div className="card text-center">
          <p className="text-gray-700 font-medium">Session complete!</p>
          {participants.find((p) => p.player_id === myPlayerId) && (() => {
            const me = participants.find((p) => p.player_id === myPlayerId);
            if (!me || me.step_after == null) return null;
            const diff = me.step_before - me.step_after;
            return (
              <p className="mt-2 text-sm text-gray-600">
                Your step: {me.step_before} → {me.step_after}
                {diff > 0 && <span className="text-green-600 font-medium"> (↑ moved up {diff})</span>}
                {diff < 0 && <span className="text-red-600 font-medium"> (↓ moved down {Math.abs(diff)})</span>}
                {diff === 0 && <span className="text-gray-500"> (no change)</span>}
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
