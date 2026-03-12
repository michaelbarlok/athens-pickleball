/**
 * ELO Rating System
 * Pickleball-specific rating engine mapped to the 2.0–5.0 USAP scale.
 */

const K = 32; // K-factor — higher = faster rating change for new players
const BASE_ELO = 1500;
const MIN_DISPLAY = 2.0;
const MAX_DISPLAY = 5.0;
const ELO_RANGE_LOW = 800;
const ELO_RANGE_HIGH = 2200;

/**
 * Calculate expected score for player A vs player B.
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ELO rating after a game.
 * @param actual - 1 for win, 0 for loss, 0.5 for draw
 */
export function newRating(
  current: number,
  expected: number,
  actual: number
): number {
  return current + K * (actual - expected);
}

/**
 * Map internal ELO points to the 2.0–5.0 display scale.
 */
export function eloToDisplayRating(elo: number): number {
  const normalized = (elo - ELO_RANGE_LOW) / (ELO_RANGE_HIGH - ELO_RANGE_LOW);
  const clamped = Math.max(0, Math.min(1, normalized));
  const display = MIN_DISPLAY + clamped * (MAX_DISPLAY - MIN_DISPLAY);
  return Math.round(display * 10) / 10;
}

/**
 * Calculate ELO updates for a doubles game.
 * The weaker player in each team gains/loses slightly more.
 */
export function calculateDoublesEloUpdate(
  team1Ratings: [number, number],
  team2Ratings: [number, number],
  team1Won: boolean
): {
  team1Deltas: [number, number];
  team2Deltas: [number, number];
} {
  const team1Avg = (team1Ratings[0] + team1Ratings[1]) / 2;
  const team2Avg = (team2Ratings[0] + team2Ratings[1]) / 2;

  const expected1 = expectedScore(team1Avg, team2Avg);
  const expected2 = expectedScore(team2Avg, team1Avg);

  const actual1 = team1Won ? 1 : 0;
  const actual2 = team1Won ? 0 : 1;

  const baseDelta1 = K * (actual1 - expected1);
  const baseDelta2 = K * (actual2 - expected2);

  // Weight: weaker player gets slightly more of the delta
  const team1Spread = Math.abs(team1Ratings[0] - team1Ratings[1]);
  const team2Spread = Math.abs(team2Ratings[0] - team2Ratings[1]);

  function splitDelta(
    delta: number,
    ratings: [number, number],
    spread: number
  ): [number, number] {
    if (spread < 50) return [delta, delta]; // Nearly equal — even split
    const weaker = ratings[0] < ratings[1] ? 0 : 1;
    const stronger = 1 - weaker;
    const factor = Math.min(0.3, spread / 1000); // Cap asymmetry at 30%
    const result: [number, number] = [0, 0];
    result[weaker] = delta * (1 + factor);
    result[stronger] = delta * (1 - factor);
    return result;
  }

  return {
    team1Deltas: splitDelta(baseDelta1, team1Ratings, team1Spread),
    team2Deltas: splitDelta(baseDelta2, team2Ratings, team2Spread),
  };
}

export { BASE_ELO };
