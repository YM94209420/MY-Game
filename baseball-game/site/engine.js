export const TOTAL_PITCHES = 9;
export const CONTACT_PROGRESS = 0.82;
export const WINDOWS = Object.freeze({ perfect: 0.045, great: 0.10, contact: 0.16 });
export const RESULTS = Object.freeze({
  perfect: { label: '全壘打！', english: 'HOME RUN', points: 500, distance: 128 },
  great: { label: '漂亮安打！', english: 'GREAT HIT', points: 200, distance: 87 },
  contact: { label: '擦棒安打', english: 'NICE CONTACT', points: 100, distance: 46 },
  miss: { label: '揮空了', english: 'SWING & MISS', points: 0, distance: 0 },
});

export function judgeSwing(elapsedMs, durationMs) {
  const offset = elapsedMs / durationMs - CONTACT_PROGRESS;
  const error = Math.abs(offset);
  const epsilon = 1e-9;
  const kind = error <= WINDOWS.perfect + epsilon ? 'perfect'
    : error <= WINDOWS.great + epsilon ? 'great'
    : error <= WINDOWS.contact + epsilon ? 'contact' : 'miss';
  return { kind, offset, ...RESULTS[kind] };
}

export function newRound() {
  return { score: 0, results: [], homeRuns: 0, hits: 0, combo: 0, maxCombo: 0 };
}

export function recordResult(round, result) {
  if (round.results.length >= TOTAL_PITCHES) return round;
  const combo = result.kind === 'miss' ? 0 : round.combo + 1;
  return {
    score: round.score + result.points,
    results: [...round.results, result],
    homeRuns: round.homeRuns + Number(result.kind === 'perfect'),
    hits: round.hits + Number(result.kind !== 'miss'),
    combo,
    maxCombo: Math.max(round.maxCombo, combo),
  };
}

export function choosePitch(random = Math.random) {
  const fast = random() > 0.64;
  return { duration: fast ? 1150 + random() * 160 : 1450 + random() * 230, name: fast ? '快速球' : '直球', speed: fast ? 148 : 132 };
}
