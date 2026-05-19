import {
  computeCrossPoolSeeding,
  type PoolStandingRow,
} from "@/lib/tournament-bracket";

/**
 * Cross-pool seeding edge cases — pin behavior when pools have
 * very different sizes (3-team vs 6-team), so a future refactor
 * can't silently flip the tiebreaker order.
 *
 * The platform constrains pool sizes between 3 and 6 (or up to 7
 * in the special 7-team case). The 3-vs-6 case is the realistic
 * extreme an organizer can produce via the numPools override.
 */

function row(
  id: string,
  wins: number,
  losses: number,
  pointDiff: number
): PoolStandingRow {
  return { id, wins, losses, pointDiff, tiebreakerReason: null };
}

describe("computeCrossPoolSeeding — disparate pool sizes", () => {
  test("more wins from a bigger pool ranks higher than fewer wins at 100% from a smaller pool", () => {
    // 3-team pool: A goes 2-0 (every game a win, but only 2 games)
    // 6-team pool: B goes 3-2 (more wins overall, but lost twice)
    //
    // Wins desc primary: 3 > 2 → B (3-2) ranks above A (2-0). This
    // is the deliberate platform choice — more confirmed wins
    // outweigh a small-pool perfect record. The losses-asc step
    // only fires when wins tie.
    const seeded = computeCrossPoolSeeding([
      {
        bracket: "pool_1",
        standings: [row("A", 2, 0, 14), row("Aa", 1, 1, 0), row("Ab", 0, 2, -14)],
        takeCount: 1,
      },
      {
        bracket: "pool_2",
        standings: [
          row("B", 3, 2, 8),
          row("Ba", 3, 2, 4),
          row("Bb", 2, 3, -2),
          row("Bc", 1, 4, -5),
          row("Bd", 1, 4, -5),
        ],
        takeCount: 1,
      },
    ]);

    expect(seeded.length).toBe(2);
    expect(seeded[0].id).toBe("B");
    expect(seeded[1].id).toBe("A");
  });

  test("same wins, fewer losses (smaller pool) advances", () => {
    // 3-team pool: A goes 2-0 (perfect, 2 games)
    // 5-team pool: B goes 2-2 (split, 4 games)
    //
    // Wins tied at 2 → losses asc fires → 0 < 2 → A first.
    // Tiebreaker reason should explicitly cite the record-strength
    // step so the Review Advancement UI can explain it to organizers.
    const seeded = computeCrossPoolSeeding([
      {
        bracket: "pool_1",
        standings: [row("A", 2, 0, 14), row("Aa", 1, 1, 0), row("Ab", 0, 2, -14)],
        takeCount: 1,
      },
      {
        bracket: "pool_2",
        standings: [
          row("B", 2, 2, 5),
          row("Ba", 2, 2, 2),
          row("Bb", 2, 2, -1),
          row("Bc", 2, 2, -6),
        ],
        takeCount: 1,
      },
    ]);

    expect(seeded[0].id).toBe("A");
    expect(seeded[1].id).toBe("B");
    expect(seeded[0].tiebreakerReason).toBe(
      "Better record — same wins, fewer losses"
    );
  });

  test("same record across pools resolves via stable hash, deterministically", () => {
    // Two teams from different pools fully tied on (wins, losses,
    // pointDiff). The stable hash decides — and the *same* inputs
    // must always produce the *same* output on every render, otherwise
    // the bracket would re-shuffle each refresh.
    const input = [
      {
        bracket: "pool_1",
        standings: [row("zzz-team", 2, 1, 5), row("Aa", 1, 2, -5)],
        takeCount: 1,
      },
      {
        bracket: "pool_2",
        standings: [row("aaa-team", 2, 1, 5), row("Ba", 1, 2, -5)],
        takeCount: 1,
      },
    ];

    const first = computeCrossPoolSeeding(input);
    const second = computeCrossPoolSeeding(input);
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(first[0].tiebreakerReason).toBe(
      "Coin flip (different pools — these teams never played each other)"
    );
  });

  test("same-pool tie on (wins, losses, pointDiff) preserves the underlying pool order", () => {
    // When two teams from the SAME pool tie on every cross-pool stat,
    // the function falls back to their original pool standings
    // position — i.e. whatever H2H already decided.
    const seeded = computeCrossPoolSeeding([
      {
        bracket: "pool_1",
        standings: [
          // P1 was placed #1 in the pool by H2H; P2 #2. Both 2-1 +5.
          row("P1", 2, 1, 5),
          row("P2", 2, 1, 5),
          row("P3", 0, 2, -10),
        ],
        takeCount: 2,
      },
      {
        bracket: "pool_2",
        // No bigger records to interleave; this pool's #1 has worse
        // stats so they slot in after the pool_1 pair.
        standings: [row("Q1", 1, 2, -3), row("Q2", 0, 3, -10)],
        takeCount: 1,
      },
    ]);

    expect(seeded.map((r) => r.id)).toEqual(["P1", "P2", "Q1"]);
    expect(seeded[0].tiebreakerReason).toBe(
      "Higher head-to-head finish (same pool)"
    );
  });

  test("takeCount exceeding standings length is harmless", () => {
    // Edge case: organizer asked for top 3, but the pool only had
    // 2 teams (e.g. after forfeit-cascade reduced the pool). slice()
    // simply returns what's available — no crash, no phantom entries.
    const seeded = computeCrossPoolSeeding([
      {
        bracket: "pool_1",
        standings: [row("A", 1, 0, 3), row("B", 0, 1, -3)],
        takeCount: 3, // asks for 3 but only 2 exist
      },
      {
        bracket: "pool_2",
        standings: [row("C", 1, 0, 5)],
        takeCount: 1,
      },
    ]);

    expect(seeded.length).toBe(3);
    expect(seeded.map((r) => r.id).sort()).toEqual(["A", "B", "C"]);
  });

  test("empty input returns empty output without throwing", () => {
    expect(computeCrossPoolSeeding([])).toEqual([]);
  });

  test("3-pool mix with mismatched sizes seeds correctly end-to-end", () => {
    // Realistic 13-team division: 3 pools sized 5-4-4. Take top 2
    // from each → 6 playoff seeds. Verify the merge sorts by the
    // expected chain.
    const seeded = computeCrossPoolSeeding([
      {
        bracket: "pool_1",
        // 5-team: max 4 wins per team.
        standings: [
          row("A1", 4, 0, 20),
          row("A2", 3, 1, 8),
          row("A3", 2, 2, 0),
          row("A4", 1, 3, -10),
          row("A5", 0, 4, -18),
        ],
        takeCount: 2,
      },
      {
        bracket: "pool_2",
        // 4-team: max 3 wins per team.
        standings: [
          row("B1", 3, 0, 18),
          row("B2", 2, 1, 4),
          row("B3", 1, 2, -6),
          row("B4", 0, 3, -16),
        ],
        takeCount: 2,
      },
      {
        bracket: "pool_3",
        standings: [
          row("C1", 3, 0, 15),
          row("C2", 2, 1, 6),
          row("C3", 1, 2, -7),
          row("C4", 0, 3, -14),
        ],
        takeCount: 2,
      },
    ]);

    // Expected merge:
    //   #1: A1 (4-0) — most wins, the rest fall in order
    //   #2: B1 (3-0) and C1 (3-0) — 3-0 each, then C1 vs B1 by stable
    //      hash. Both 3-0 +X (B1=+18, C1=+15) → B1 above C1 on diff.
    //   #4: A2 (3-1) — 3 wins like B1/C1 but with one loss, so the
    //      losses-asc step puts it after both. Then A2 by diff
    //      tiebreaker against itself doesn't apply.
    //   #5: B2 (2-1) — 2 wins, 1 loss
    //   #6: C2 (2-1) — 2 wins, 1 loss, lower diff than B2 (B2=+4 vs
    //      C2=+6) — actually C2 has BETTER diff. Let me recheck below.

    // Re-derive: 3-wins cluster is {B1: 3-0 +18, C1: 3-0 +15, A2: 3-1 +8}
    //   Wins tied at 3. Losses asc → B1, C1 (0L) before A2 (1L).
    //   Within 0L: diff desc → B1 (+18) > C1 (+15).
    //   So 3-wins ordering: B1, C1, A2.
    // 2-wins cluster: {B2: 2-1 +4, C2: 2-1 +6}
    //   Wins tied, losses tied → diff desc → C2 (+6) > B2 (+4).
    //
    // Final: A1, B1, C1, A2, C2, B2.
    expect(seeded.map((r) => r.id)).toEqual(["A1", "B1", "C1", "A2", "C2", "B2"]);

    // A2's tiebreaker should explicitly cite the record-strength step
    // because it sits below C1 (3-0) at 3-1.
    const a2 = seeded.find((r) => r.id === "A2");
    expect(a2).toBeDefined();
    // Wait — A2 is at index 3, the one immediately above it is C1
    // (index 2). The walk sets the reason on the HIGHER row (C1),
    // not A2. C1 has no reason because B1 vs C1 is settled by diff.
    // A2 vs C2 below has different wins → no reason set on A2 either.
    // Document this so a future reader doesn't get tripped up:
    expect(a2!.tiebreakerReason).toBeNull();
  });
});
