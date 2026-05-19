import { computePoolStandings } from "@/lib/tournament-bracket";

/**
 * Defensive-skip tests for `computePoolStandings`. The bracket PUT
 * route validates score arrays thoroughly before flipping a match
 * to status='completed', but the standings function is also called
 * from the live bracket view on every render — if a malformed row
 * ever lands (direct DB edit, future code path that skips
 * validation, one-off fix gone wrong), we want it skipped with a
 * warning rather than silently corrupting the standings.
 */

const TEAM_A = "team-a";
const TEAM_B = "team-b";
const TEAM_C = "team-c";
const TEAM_D = "team-d";

function goodMatch(p1: string, p2: string, s1: number, s2: number) {
  return {
    player1_id: p1,
    player2_id: p2,
    winner_id: s1 > s2 ? p1 : p2,
    score1: [s1],
    score2: [s2],
    status: "completed",
  };
}

function silenceWarnings() {
  const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
  return spy;
}

describe("computePoolStandings — malformed completed matches", () => {
  let warnSpy: ReturnType<typeof silenceWarnings>;
  beforeEach(() => {
    warnSpy = silenceWarnings();
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("skips a completed match with empty score arrays + warns", () => {
    const matches = [
      goodMatch(TEAM_A, TEAM_B, 11, 5),
      // Empty arrays + winner_id set → defensive-skip.
      {
        player1_id: TEAM_A,
        player2_id: TEAM_C,
        winner_id: TEAM_A,
        score1: [],
        score2: [],
        status: "completed",
      },
      goodMatch(TEAM_B, TEAM_C, 11, 9),
    ];

    const s = computePoolStandings(matches);
    // C should NOT have been bumped to 0-1 by the malformed row.
    const c = s.find((r) => r.id === TEAM_C);
    expect(c).toBeDefined();
    expect(c!.wins).toBe(0);
    // C's only counted match: 9 vs B's 11 → loss, diff -2.
    expect(c!.losses).toBe(1);
    expect(c!.pointDiff).toBe(-2);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("skips mismatched-length score arrays + warns", () => {
    const matches = [
      goodMatch(TEAM_A, TEAM_B, 11, 5),
      {
        player1_id: TEAM_A,
        player2_id: TEAM_C,
        winner_id: TEAM_A,
        score1: [11, 11],
        score2: [9], // mismatched
        status: "completed",
      },
    ];

    const s = computePoolStandings(matches);
    // C didn't actually lose — the malformed row is skipped.
    const c = s.find((r) => r.id === TEAM_C);
    expect(c).toBeDefined();
    expect(c!.wins).toBe(0);
    expect(c!.losses).toBe(0);
    expect(c!.pointDiff).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("skips non-numeric score values + warns", () => {
    // Cast through unknown — we're exercising the runtime guard on
    // data shapes the static type would reject. A direct DB edit or
    // a buggy JSON parse could land strings here in production.
    const matches = [
      {
        player1_id: TEAM_A,
        player2_id: TEAM_B,
        winner_id: TEAM_A,
        score1: ["11"],
        score2: [9],
        status: "completed",
      },
    ] as unknown as Parameters<typeof computePoolStandings>[0];

    const s = computePoolStandings(matches);
    const a = s.find((r) => r.id === TEAM_A);
    expect(a!.wins).toBe(0);
    expect(a!.pointDiff).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("skips negative-score arrays + warns", () => {
    const matches = [
      {
        player1_id: TEAM_A,
        player2_id: TEAM_B,
        winner_id: TEAM_A,
        score1: [11],
        score2: [-1],
        status: "completed",
      },
    ];

    const s = computePoolStandings(matches);
    expect(s.find((r) => r.id === TEAM_A)!.wins).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("a clean match alongside a malformed one is still counted correctly", () => {
    // Belt-and-suspenders: a single bad row shouldn't poison the
    // rest of the standings.
    const matches = [
      goodMatch(TEAM_A, TEAM_B, 11, 7),  // A 1-0 +4
      goodMatch(TEAM_A, TEAM_C, 11, 5),  // A 2-0 +10
      goodMatch(TEAM_A, TEAM_D, 11, 3),  // A 3-0 +18
      goodMatch(TEAM_B, TEAM_C, 11, 9),  // B 1-1 -2, C 0-2 -8
      goodMatch(TEAM_B, TEAM_D, 11, 8),  // B 2-1 +1, D 0-2 -11
      // Malformed game between C and D — skipped. C and D each stay
      // at the records they already had.
      {
        player1_id: TEAM_C,
        player2_id: TEAM_D,
        winner_id: TEAM_C,
        score1: [],
        score2: [],
        status: "completed",
      },
    ];

    const s = computePoolStandings(matches);
    const a = s.find((r) => r.id === TEAM_A)!;
    const b = s.find((r) => r.id === TEAM_B)!;
    const c = s.find((r) => r.id === TEAM_C)!;
    const d = s.find((r) => r.id === TEAM_D)!;

    expect(a.wins).toBe(3);
    expect(a.losses).toBe(0);
    expect(a.pointDiff).toBe(18);

    expect(b.wins).toBe(2);
    expect(b.losses).toBe(1);
    expect(b.pointDiff).toBe(1);

    // C and D both didn't get a phantom win/loss from the bad row.
    expect(c.wins).toBe(0);
    expect(c.losses).toBe(2);
    expect(c.pointDiff).toBe(-8);

    expect(d.wins).toBe(0);
    expect(d.losses).toBe(2);
    expect(d.pointDiff).toBe(-11);
  });
});
