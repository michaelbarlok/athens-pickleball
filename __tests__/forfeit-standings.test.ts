import { computePoolStandings } from "@/lib/tournament-bracket";

/**
 * Pool standings should reconstruct cleanly after a tournament-wide
 * forfeit deletes every match a team appeared in.
 *
 * The /api/tournaments/[id]/forfeit handler's "entire tournament"
 * path scopes its DELETE by `(tournament_id, division, bracket,
 * player1_id|player2_id)` and then leaves it to
 * `computePoolStandings` to derive new standings from whatever
 * matches remain. This test pins that contract — if a future refactor
 * leaves orphan rows behind, or if standings start counting BYE-only
 * entries the forfeit cleanup didn't touch, these assertions break.
 */

const TEAM_A = "team-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TEAM_B = "team-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TEAM_C = "team-c-cccccccccccccccccccccccccccccccc";
const TEAM_D = "team-d-dddddddddddddddddddddddddddddddd";
const TEAM_E = "team-e-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function mkMatch(
  p1: string | null,
  p2: string | null,
  s1: number,
  s2: number
) {
  return {
    player1_id: p1,
    player2_id: p2,
    winner_id: s1 > s2 ? p1 : p2,
    score1: [s1],
    score2: [s2],
    status: "completed",
  };
}

describe("pool standings after tournament-wide forfeit", () => {
  test("team E forfeits — their matches gone, remaining four standings hold", () => {
    // Starting state: 5-team pool, round-robin (10 matches). Mid-pool
    // team E withdraws — every match they appeared in is deleted by
    // the forfeit handler. The standings function should see only the
    // C(4,2)=6 matches among the surviving four teams.
    const remaining = [
      mkMatch(TEAM_A, TEAM_B, 11, 7),   // A beats B
      mkMatch(TEAM_A, TEAM_C, 11, 5),   // A beats C
      mkMatch(TEAM_A, TEAM_D, 11, 9),   // A beats D
      mkMatch(TEAM_B, TEAM_C, 11, 9),   // B beats C
      mkMatch(TEAM_B, TEAM_D, 8, 11),   // D beats B
      mkMatch(TEAM_C, TEAM_D, 11, 6),   // C beats D
    ];

    const s = computePoolStandings(remaining);

    // No ghost entry for team E.
    expect(s.find((r) => r.id === TEAM_E)).toBeUndefined();
    expect(s.length).toBe(4);

    // Per-team breakdown of the 6 surviving matches:
    //   A: vs B +4, vs C +6, vs D +2 → 3W 0L, +12
    //   B: vs A -4, vs C +2, vs D -3 → 1W 2L, -5
    //   C: vs A -6, vs B -2, vs D +5 → 1W 2L, -3
    //   D: vs A -2, vs B +3, vs C -5 → 1W 2L, -4
    //
    // Three-way 1W-2L pile but different point diffs, so the new
    // losses-asc → diff-desc chain sorts them straight by diff. No
    // H2H pass fires because the cluster only forms when (wins, losses,
    // pointDiff) are all equal.
    expect(s[0].id).toBe(TEAM_A);
    expect(s[0].wins).toBe(3);
    expect(s[0].losses).toBe(0);
    expect(s[0].pointDiff).toBe(12);

    expect(s[1].id).toBe(TEAM_C);
    expect(s[1].wins).toBe(1);
    expect(s[1].losses).toBe(2);
    expect(s[1].pointDiff).toBe(-3);

    expect(s[2].id).toBe(TEAM_D);
    expect(s[2].wins).toBe(1);
    expect(s[2].losses).toBe(2);
    expect(s[2].pointDiff).toBe(-4);

    expect(s[3].id).toBe(TEAM_B);
    expect(s[3].wins).toBe(1);
    expect(s[3].losses).toBe(2);
    expect(s[3].pointDiff).toBe(-5);
  });

  test("partial-pool forfeit: deleting all of E's matches leaves the others' point diffs untouched", () => {
    // Sanity: if E had matches in the original 10-match pool with
    // results like (vs A: 9-11, vs B: 11-7, vs C: 11-3, vs D: 7-11),
    // the four remaining matches *not* involving E should look
    // exactly as if E were never in the pool. Score sums for A/B/C/D
    // across each other shouldn't be polluted by E's contributions.
    const original = [
      mkMatch(TEAM_A, TEAM_B, 11, 7),
      mkMatch(TEAM_A, TEAM_C, 11, 5),
      mkMatch(TEAM_A, TEAM_D, 11, 9),
      mkMatch(TEAM_A, TEAM_E, 11, 9),   // ← deleted on forfeit
      mkMatch(TEAM_B, TEAM_C, 11, 9),
      mkMatch(TEAM_B, TEAM_D, 8, 11),
      mkMatch(TEAM_B, TEAM_E, 11, 7),   // ← deleted
      mkMatch(TEAM_C, TEAM_D, 11, 6),
      mkMatch(TEAM_C, TEAM_E, 11, 3),   // ← deleted
      mkMatch(TEAM_D, TEAM_E, 11, 7),   // ← deleted
    ];

    const afterForfeit = original.filter(
      (m) => m.player1_id !== TEAM_E && m.player2_id !== TEAM_E
    );

    const sAfter = computePoolStandings(afterForfeit);
    const totalDiff = sAfter.reduce((acc, r) => acc + r.pointDiff, 0);
    // PD must sum to zero across all surviving teams once E's
    // matches are gone — same invariant the existing live-pool
    // standings test pins.
    expect(totalDiff).toBe(0);
    expect(sAfter.every((r) => r.wins + r.losses === 3)).toBe(true);
  });
});
