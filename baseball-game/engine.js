export const TOTAL_PITCHES = 9;
export const CONTACT_PROGRESS = 0.82;
export const WINDOWS = Object.freeze({ perfect: 0.045, great: 0.10, contact: 0.16 });
export const PITCH_CHARGE_MS = 1800;
export const PITCH_TYPES = Object.freeze([
  Object.freeze({
    id: 'fastball',
    name: '直球',
    speed: 150,
    duration: 1100,
    curve: 0,
    description: '球速最快，軌跡直接。',
  }),
  Object.freeze({
    id: 'slider',
    name: '滑球',
    speed: 136,
    duration: 1380,
    curve: -0.72,
    description: '後段橫向位移，迷惑打者。',
  }),
  Object.freeze({
    id: 'changeup',
    name: '變速球',
    speed: 118,
    duration: 1700,
    curve: 0.24,
    description: '用慢速差打亂揮棒節奏。',
  }),
]);
export const RESULTS = Object.freeze({
  perfect: { label: '全壘打！', english: 'HOME RUN', points: 500, distance: 128 },
  great: { label: '漂亮安打！', english: 'GREAT HIT', points: 200, distance: 87 },
  contact: { label: '擦棒安打', english: 'NICE CONTACT', points: 100, distance: 46 },
  miss: { label: '揮空了', english: 'SWING & MISS', points: 0, distance: 0 },
});

const PITCH_RESULTS = Object.freeze({
  perfect: Object.freeze({ label: '精準好球', english: 'STRIKE', points: 500, distance: 0, batterOutcome: 'miss' }),
  great: Object.freeze({ label: '壓制打者', english: 'GOOD PITCH', points: 200, distance: 0, batterOutcome: 'miss' }),
  contact: Object.freeze({ label: '被敲安打', english: 'BASE HIT', points: 0, distance: 70, batterOutcome: 'hit' }),
  miss: Object.freeze({ label: '暴投', english: 'WILD PITCH', points: 0, distance: 0, batterOutcome: 'miss' }),
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

export function judgePitch(elapsedMs, durationMs = PITCH_CHARGE_MS) {
  const offset = elapsedMs / durationMs - CONTACT_PROGRESS;
  const error = Math.abs(offset);
  const epsilon = 1e-9;
  const kind = error <= WINDOWS.perfect + epsilon ? 'perfect'
    : error <= WINDOWS.great + epsilon ? 'great'
    : error <= WINDOWS.contact + epsilon ? 'contact' : 'miss';
  return {
    kind,
    offset,
    ...PITCH_RESULTS[kind],
    success: kind === 'perfect' || kind === 'great',
  };
}

export function newRound() {
  return { score: 0, results: [], homeRuns: 0, hits: 0, combo: 0, maxCombo: 0 };
}

export function newPitchingRound() {
  return { score: 0, results: [], strikes: 0, hitsAllowed: 0, perfects: 0 };
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

export function recordPitchResult(round, result) {
  if (round.results.length >= TOTAL_PITCHES) return round;
  return {
    score: round.score + result.points,
    results: [...round.results, result],
    strikes: round.strikes + Number(result.success),
    hitsAllowed: round.hitsAllowed + Number(result.batterOutcome === 'hit'),
    perfects: round.perfects + Number(result.kind === 'perfect'),
  };
}

export function choosePitch(random = Math.random) {
  const fast = random() > 0.64;
  return { duration: fast ? 1150 + random() * 160 : 1450 + random() * 230, name: fast ? '快速球' : '直球', speed: fast ? 148 : 132 };
}
