// Public display vocabulary only. Scores and term assignments come from the server.
export const rarities = [
  { points: 0, chargeGain: 0, id: 'unscored', label: 'Unscored', symbol: '○' },
  { points: 10, chargeGain: 2, id: 'classic', label: 'Classic', symbol: '●', hint: 'A common first thought.' },
  { points: 15, chargeGain: 3, id: 'clever', label: 'Clever', symbol: '⚭', hint: 'A familiar second choice.' },
  { points: 30, chargeGain: 6, id: 'student', label: 'Student', symbol: '△', hint: 'A detail from coursework.' },
  { points: 60, chargeGain: 11, id: 'resident', label: 'Resident', symbol: '✛', hint: 'A less familiar example.' },
  { points: 85, chargeGain: 19, id: 'specialist', label: 'Specialist', symbol: '◆', hint: 'A specialty-specific find.' },
  { points: 100, chargeGain: 24, id: 'doctor', label: 'Are you a doctor?', symbol: '✦', hint: 'A deep cut for this prompt.' },
];
export const relayChargeTarget = 100;

const byPoints = new Map(rarities.map(tier => [tier.points, tier]));
export function rarityFor(points) {
  return byPoints.get(points) ?? rarities[0];
}
