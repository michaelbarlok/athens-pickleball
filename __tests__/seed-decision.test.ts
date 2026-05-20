import {
  seedParticipantsForSession,
  type SeedablePlayer,
} from "@/lib/shootout-engine";

/**
 * seedParticipantsForSession — the single seeding-decision function
 * shared by the Check-In preview, the Check-In Seed button, and the
 * server-side auto-seed. Pins the continuation-vs-ranking decision so
 * the three callers can never silently disagree.
 */

function player(
  id: string,
  step: number,
  targetCourtNext: number | null
): SeedablePlayer {
  return {
    id,
    currentStep: step,
    winPct: 50,
    lastPlayedAt: null,
    totalSessions: 5,
    targetCourtNext,
    seedSource: targetCourtNext != null ? "previous_court" : "ranking_sheet",
  };
}

// 8 players → 2 courts of 4.
function eight(targets: (number | null)[]): SeedablePlayer[] {
  return targets.map((t, i) => player(`p${i + 1}`, i + 1, t));
}

describe("seedParticipantsForSession", () => {
  test("session 1 (not a continuation) → ranking mode", () => {
    const r = seedParticipantsForSession({
      players: eight([null, null, null, null, null, null, null, null]),
      numCourts: 2,
      isContinuation: false,
      isDynamicRanking: false,
    });
    expect(r.mode).toBe("ranking");
    expect(r.positions).toHaveLength(8);
    // Ranking sort by step asc → p1..p4 on court 1, p5..p8 on court 2.
    const court1 = r.positions.filter((p) => p.courtNumber === 1).map((p) => p.playerId);
    expect(court1.sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  test("Court Promotion continuation with targets → continuation mode, anchored", () => {
    const r = seedParticipantsForSession({
      players: eight([2, 2, 2, 2, 1, 1, 1, 1]),
      numCourts: 2,
      isContinuation: true,
      isDynamicRanking: false,
    });
    expect(r.mode).toBe("continuation");
    expect(r.noneHaveTargets).toBe(false);
    // p1..p4 targeted court 2, p5..p8 targeted court 1 — anchored there.
    const court1 = r.positions.filter((p) => p.courtNumber === 1).map((p) => p.playerId);
    const court2 = r.positions.filter((p) => p.courtNumber === 2).map((p) => p.playerId);
    expect(court1.sort()).toEqual(["p5", "p6", "p7", "p8"]);
    expect(court2.sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  test("Dynamic Ranking continuation → ranking mode (ignores targets)", () => {
    const r = seedParticipantsForSession({
      players: eight([2, 2, 2, 2, 1, 1, 1, 1]),
      numCourts: 2,
      isContinuation: true,
      isDynamicRanking: true,
    });
    expect(r.mode).toBe("ranking");
  });

  test("continuation where the court count grew → ranking mode", () => {
    // Targets all point at courts 1-2, but the session now has 3
    // courts — the old layout is stale, re-seed from ranking.
    const players: SeedablePlayer[] = Array.from({ length: 12 }, (_, i) =>
      player(`p${i + 1}`, i + 1, i < 6 ? 1 : 2)
    );
    const r = seedParticipantsForSession({
      players,
      numCourts: 3,
      isContinuation: true,
      isDynamicRanking: false,
    });
    expect(r.courtsGrew).toBe(true);
    expect(r.mode).toBe("ranking");
  });

  test("continuation with only SOME targets missing → still continuation mode", () => {
    // One target-less sub among seven anchored players. seedSameDaySession
    // handles the mix (anchored + ranking-slotted), so we stay in
    // continuation mode and noneHaveTargets is false.
    const r = seedParticipantsForSession({
      players: eight([2, 2, 2, 2, 1, 1, 1, null]),
      numCourts: 2,
      isContinuation: true,
      isDynamicRanking: false,
    });
    expect(r.mode).toBe("continuation");
    expect(r.noneHaveTargets).toBe(false);
    expect(r.positions).toHaveLength(8);
  });

  test("continuation with NO targets at all → continuation mode but noneHaveTargets flag set", () => {
    // The flag is the caller's cue to refuse (server auto-seed) — the
    // function itself still returns positions.
    const r = seedParticipantsForSession({
      players: eight([null, null, null, null, null, null, null, null]),
      numCourts: 2,
      isContinuation: true,
      isDynamicRanking: false,
    });
    expect(r.mode).toBe("continuation");
    expect(r.noneHaveTargets).toBe(true);
  });
});
