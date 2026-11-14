import { TOTAL_PITCHES, CONTACT_PROGRESS, RESULTS, PITCH_TYPES, PITCH_CHARGE_MS, choosePitch, judgeSwing, judgePitch, newRound, newPitchingRound, recordResult, recordPitchResult } from './engine.js';

const $ = (id) => document.getElementById(id);
const canvas = $('field');
const ctx = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const bestKeys = { bat: 'night-slugger-best-v1', pitch: 'night-slugger-pitch-best-v1' };
const bestScores = { bat: 0, pitch: 0 };
for (const key of Object.keys(bestKeys)) {
  try {
    const saved = Number(localStorage.getItem(bestKeys[key]));
    if (Number.isFinite(saved)) bestScores[key] = Math.max(0, saved);
  } catch { /* Private browsing can disable storage. */ }
}
let mode = 'bat';
let best = bestScores.bat;
let selectedPitch = 'fastball';
let pendingPitchResult = null;
let round = newRound();
let phase = 'ready';
let paused = false;
let phaseStarted = 0;
let time = 0;
let previousFrame = performance.now();
let pitch = choosePitch();
let currentResult = null;
let swingAt = -10000;
let soundEnabled = false;
let audio = null;
let wasNewBest = false;
let background;

function announce(message) { $('announcer').textContent = message; }
function currentTime() { return time + (paused ? 0 : Math.min(60, performance.now() - previousFrame)); }
function overlay(id, visible) { $(id).hidden = !visible; }

const battingRules = $('rulesList').innerHTML;
const battingScores = $('scoringGuide').innerHTML;
function updatePitchPicker() {
  document.querySelectorAll('.pitch-option').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.pitch === selectedPitch));
    button.disabled = phase === 'flight' || paused;
  });
  $('pitchDescription').textContent = PITCH_TYPES.find((item) => item.id === selectedPitch).description;
}

function showPitchLabel() {
  $('pitchType').textContent = pitch.name;
  $('pitchSpeed').textContent = pitch.speed;
}

function selectMode(nextMode) {
  if (mode === nextMode) return;
  mode = nextMode;
  document.body.dataset.mode = mode;
  phase = 'ready';
  paused = false;
  pendingPitchResult = null;
  currentResult = null;
  swingAt = -10000;
  round = mode === 'pitch' ? newPitchingRound() : newRound();
  best = bestScores[mode];
  $('batMode').setAttribute('aria-pressed', String(mode === 'bat'));
  $('pitchMode').setAttribute('aria-pressed', String(mode === 'pitch'));
  overlay('pitchPicker', mode === 'pitch');
  ['endOverlay', 'pauseOverlay', 'fieldCallout', 'pitchLabel'].forEach((id) => overlay(id, false));
  overlay('startOverlay', true);
  $('swingButton').disabled = true;
  $('timingTrack').classList.remove('is-live');
  $('timingMarker').style.left = '0%';
  $('statusText').textContent = '等待開賽';
  const pitching = mode === 'pitch';
  $('page-title').innerHTML = pitching ? '今晚，<span>掌控每一次出手。</span>' : '今晚，<span>揮出完美一擊。</span>';
  $('introCopy').textContent = pitching ? '站上投手丘，選擇你的球路。九次出手，讓打者追不上。' : '九顆球，一次成名的機會。走進打擊區，讓球飛越夜空。';
  $('statLabel').innerHTML = pitching ? '好球 <small>STRIKE</small>' : '全壘打 <small>HR</small>';
  $('actionLabel').textContent = pitching ? '投球' : '揮棒';
  $('actionKey').textContent = pitching ? 'PITCH / SPACE' : 'SWING / SPACE';
  $('timingHint').textContent = pitching ? '進入橘區，立即出手' : '進入綠區，立即揮棒';
  $('timingTrack').setAttribute('aria-label', pitching ? '投球時機：白色指標進入橘色區域時出手' : '揮棒時機：白色指標進入綠色區域時揮棒');
  canvas.setAttribute('aria-label', pitching ? '夜間棒球場：你是投手，控制出手時機對戰電腦打者' : '夜間棒球場：球飛向本壘亮圈時揮棒');
  $('startKicker').textContent = pitching ? 'OWN THE MOUND' : 'STEP UP TO THE PLATE';
  $('startTitle').textContent = pitching ? '這次，換你投球。' : '輪到你上場。';
  $('startDescription').innerHTML = pitching ? '先選球種，指標接近橘區中心時出手。<br>投得越準，電腦打者越難擊中。' : '當球接近本壘亮圈<br>點一下，揮出你的全壘打。';
  $('startHint').textContent = pitching ? '手機點「投球」· 電腦按空白鍵' : '手機點擊 · 電腦按空白鍵';
  $('fieldCaption').textContent = pitching ? '選擇球種，準備站上投手丘' : '鎖定進壘時機，準備揮棒';
  $('rulesList').innerHTML = pitching ? '<li><span>01</span><div><strong>選擇你的球路</strong><p>直球、滑球、變速球，各有不同球速與飛行軌跡。每局固定 9 球。</p></div></li><li><span>02</span><div><strong>亮區出手</strong><p>白色指標進入橘區時，點球場、「投球」或按空白鍵。每球只能出手一次。</p></div></li><li><span>03</span><div><strong>壓制電腦打者</strong><p>精準出手可讓打者揮空；稍有偏差會被敲安打，太早、太晚或未出手算暴投。</p></div></li>' : battingRules;
  $('scoringGuide').innerHTML = pitching ? '<div><span class="legend perfect"></span><span>精準好球</span><strong>+500</strong></div><div><span class="legend great"></span><span>壓制打者</span><strong>+200</strong></div><div><span class="legend contact"></span><span>被敲安打</span><strong>+0</strong></div><div><span class="legend miss"></span><span>暴投 / 未出手</span><strong>+0</strong></div>' : battingScores;
  $('coachTip').innerHTML = pitching ? '盯住橘區中心。<br>穩住節奏再出手。' : '別急著揮棒。<br>等球來找你。';
  updatePitchPicker();
  renderScore();
  announce(`已切換${pitching ? '投球' : '打擊'}模式，按開始挑戰進行新的一局。`);
}

function renderScore() {
  $('score').textContent = String(round.score).padStart(4, '0');
  $('homeRuns').textContent = mode === 'pitch' ? round.strikes : round.homeRuns;
  $('bestScore').textContent = String(best).padStart(4, '0');
  $('pitchNumber').textContent = phase === 'ready' ? 0 : Math.min(TOTAL_PITCHES, round.results.length + (['countdown', 'pitch', 'charge', 'flight'].includes(phase) ? 1 : 0));
  $('pitchHistory').replaceChildren(...Array.from({ length: TOTAL_PITCHES }, (_, i) => {
    const dot = document.createElement('span');
    const result = round.results[i];
    const active = !result && i === round.results.length && ['pitch', 'countdown', 'charge', 'flight'].includes(phase);
    dot.className = `pitch-dot ${result?.kind || ''} ${active ? 'current' : ''}`;
    dot.textContent = !result ? i + 1 : mode === 'pitch' ? (result.success ? 'S' : result.batterOutcome === 'hit' ? 'H' : 'B') : (result.kind === 'perfect' ? 'H' : result.kind === 'miss' ? '×' : '✓');
    dot.title = `第 ${i + 1} 球：${result ? `${result.label}，${result.points} 分` : active ? '進行中' : '等待投球'}`;
    dot.setAttribute('aria-label', dot.title);
    return dot;
  }));
}

function initializeAudio() {
  if (!soundEnabled) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { soundEnabled = false; }
}

function playTone(kind) {
  if (!soundEnabled || !audio) return;
  const notes = kind === 'perfect' ? [523, 659, 784, 1046] : kind === 'great' ? [523, 784] : kind === 'contact' ? [440, 660] : kind === 'pitch' ? [260] : [180, 130];
  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + index * 0.085;
    oscillator.type = kind === 'miss' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.07, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.21);
  });
}

function startRound() {
  initializeAudio();
  round = mode === 'pitch' ? newPitchingRound() : newRound();
  paused = false;
  wasNewBest = false;
  currentResult = null;
  pendingPitchResult = null;
  swingAt = -10000;
  ['startOverlay', 'endOverlay', 'pauseOverlay'].forEach((id) => overlay(id, false));
  nextPitch();
  $('stadium').focus({ preventScroll: true });
  announce(`新的九球${mode === 'pitch' ? '投球' : '打擊'}挑戰開始，準備第一球。`);
}

function nextPitch() {
  phase = 'countdown';
  phaseStarted = currentTime();
  pitch = mode === 'pitch' ? { ...PITCH_TYPES.find((item) => item.id === selectedPitch) } : choosePitch();
  currentResult = null;
  pendingPitchResult = null;
  $('swingButton').disabled = true;
  $('timingTrack').classList.remove('is-live');
  $('timingMarker').style.left = '0%';
  showPitchLabel();
  overlay('pitchLabel', true);
  overlay('fieldCallout', false);
  $('fieldCaption').textContent = mode === 'pitch' ? '選好球路 · 等指標進入橘區再出手' : '盯緊來球 · 每球只有一次揮棒機會';
  $('statusText').textContent = `第 ${round.results.length + 1} 球 · 準備`;
  renderScore();
  updatePitchPicker();
}

function releasePitch() {
  phase = mode === 'pitch' ? 'charge' : 'pitch';
  phaseStarted = time;
  $('swingButton').disabled = false;
  $('timingTrack').classList.add('is-live');
  $('statusText').textContent = mode === 'pitch' ? '抓準出手時機' : '球來了！';
  if (mode === 'bat') playTone('pitch');
}

function swing() {
  if (mode === 'pitch') { throwPitch(); return; }
  if (phase !== 'pitch' || paused) return;
  const now = currentTime();
  swingAt = now;
  const elapsed = now - phaseStarted;
  settle(judgeSwing(elapsed, pitch.duration), now);
}

function throwPitch(unplayed = false) {
  if (phase !== 'charge' || paused) return;
  const now = currentTime();
  const elapsed = now - phaseStarted;
  pendingPitchResult = { ...judgePitch(elapsed), unplayed };
  phase = 'flight';
  phaseStarted = now;
  $('swingButton').disabled = true;
  $('timingTrack').classList.remove('is-live');
  $('timingMarker').style.left = `${Math.min(100, elapsed / PITCH_CHARGE_MS * 100)}%`;
  $('statusText').textContent = '已出手 · 電腦打者準備揮棒';
  $('fieldCaption').textContent = `${pitch.name} · ${pitch.speed} km/h`;
  updatePitchPicker();
  playTone('pitch');
}

function settlePitch() {
  if (phase !== 'flight' || !pendingPitchResult) return;
  const result = pendingPitchResult;
  phase = 'result';
  phaseStarted = time;
  swingAt = time - 80;
  currentResult = { ...result, ballProgress: CONTACT_PROGRESS };
  pendingPitchResult = null;
  round = recordPitchResult(round, result);
  $('calloutEnglish').textContent = result.english;
  $('calloutDetail').textContent = result.success ? `打者揮空 · +${result.points} PTS` : result.batterOutcome === 'hit' ? '電腦打者擊出安打 · +0 PTS' : result.unplayed ? '未出手 · +0 PTS' : '出手偏離亮區 · +0 PTS';
  $('fieldCallout').dataset.kind = result.kind;
  overlay('fieldCallout', true);
  $('statusText').textContent = result.label;
  $('fieldCaption').textContent = result.success ? '漂亮！打者追不上這一球。' : result.batterOutcome === 'hit' ? '這球被擊中了，再接近橘區中心一些。' : result.unplayed ? '超過出手時間，這球算暴投。' : result.offset < 0 ? '太早出手，下一球再等一下。' : '太晚出手，下一球提早一些。';
  announce(`第 ${round.results.length} 球，${result.label}，加 ${result.points} 分。目前 ${round.score} 分。`);
  playTone(result.kind === 'contact' ? 'miss' : result.kind);
  renderScore();
  updatePitchPicker();
}

function settle(result, now = time) {
  if (phase !== 'pitch') return;
  phase = 'result'; // Lock this pitch before updating score or scheduling the next one.
  const progress = Math.min(1.05, (now - phaseStarted) / pitch.duration);
  currentResult = { ...result, ballProgress: progress };
  phaseStarted = now;
  round = recordResult(round, result);
  $('swingButton').disabled = true;
  $('timingTrack').classList.remove('is-live');
  $('timingMarker').style.left = `${Math.max(0, Math.min(100, progress * 100))}%`;
  const missText = result.unplayed ? '這球沒揮到，再盯緊一點。' : result.offset < 0 ? '揮得太早了，等球再近一些。' : '慢了一點，下一球提早揮。';
  $('calloutEnglish').textContent = result.english;
  $('calloutDetail').textContent = result.kind === 'miss' ? (result.unplayed ? '未揮棒' : result.offset < 0 ? '太早揮棒' : '太晚揮棒') : `+${result.points} PTS · ${result.distance} m`;
  $('fieldCallout').dataset.kind = result.kind;
  overlay('fieldCallout', true);
  $('statusText').textContent = result.kind === 'miss' ? '調整節奏，再來一球' : result.label;
  $('fieldCaption').textContent = result.kind === 'miss' ? missText : result.kind === 'perfect' ? '漂亮！這球飛越了全壘打牆。' : '擊中！再接近綠區中心一點。';
  announce(`第 ${round.results.length} 球，${result.kind === 'miss' ? missText : `${result.label}，加 ${result.points} 分。`}目前 ${round.score} 分。`);
  if (result.kind !== 'miss' && !reducedMotion.matches) {
    $('stadium').classList.remove('is-hit');
    void $('stadium').offsetWidth;
    $('stadium').classList.add('is-hit');
  }
  playTone(result.kind);
  renderScore();
}

function finishRound() {
  phase = 'finished';
  wasNewBest = round.score > best;
  if (wasNewBest) {
    best = round.score;
    bestScores[mode] = best;
    try { localStorage.setItem(bestKeys[mode], String(best)); } catch { /* Keep best for this session. */ }
  }
  $('finalScore').textContent = round.score.toLocaleString();
  $('endTitle').textContent = mode === 'pitch' ? (round.strikes >= 7 ? '今晚的王牌投手。' : round.strikes >= 4 ? '漂亮壓制打者。' : '下一局，穩住出手。') : round.homeRuns >= 5 ? '今晚的全壘打王。' : round.score >= 1500 ? '看台為你歡呼。' : round.score > 0 ? '漂亮的一局。' : '下一局，抓回節奏。';
  $('endSummary').textContent = mode === 'pitch' ? `好球 ${round.strikes} 球 · 被安打 ${round.hitsAllowed} 支 · 精準出手 ${round.perfects} 次` : `全壘打 ${round.homeRuns} 支 · 其他安打 ${round.hits - round.homeRuns} 支 · 命中率 ${Math.round(round.hits / TOTAL_PITCHES * 100)}%`;
  overlay('newBest', wasNewBest);
  overlay('fieldCallout', false);
  overlay('endOverlay', true);
  $('statusText').textContent = '九球挑戰完成';
  renderScore();
  announce(`比賽結束，得分 ${round.score}，${mode === 'pitch' ? `好球 ${round.strikes} 球` : `全壘打 ${round.homeRuns} 支`}。${wasNewBest ? '刷新最高分！' : ''}`);
  $('playAgain').focus({ preventScroll: true });
}

function pauseGame() {
  if (!['countdown', 'pitch', 'charge', 'flight', 'result'].includes(phase) || paused) return;
  paused = true;
  overlay('pauseOverlay', true);
  $('swingButton').disabled = true;
  $('resumeButton').focus({ preventScroll: true });
  updatePitchPicker();
}

function resumeGame() {
  paused = false;
  previousFrame = performance.now();
  overlay('pauseOverlay', false);
  // Replay an interrupted pitch without spending a ball; no background-time penalty.
  if (['pitch', 'countdown', 'charge', 'flight'].includes(phase)) nextPitch();
  updatePitchPicker();
  $('stadium').focus({ preventScroll: true });
  announce('比賽繼續。');
}

$('startButton').addEventListener('click', startRound);
$('restartButton').addEventListener('click', startRound);
$('playAgain').addEventListener('click', startRound);
$('swingButton').addEventListener('click', swing);
$('stadium').addEventListener('click', (event) => { if (!event.target.closest('button')) swing(); });
$('resumeButton').addEventListener('click', resumeGame);
$('batMode').addEventListener('click', () => selectMode('bat'));
$('pitchMode').addEventListener('click', () => selectMode('pitch'));
document.querySelectorAll('.pitch-option').forEach((button) => button.addEventListener('click', () => {
  if (phase === 'flight' || paused) return;
  selectedPitch = button.dataset.pitch;
  if (['ready', 'countdown', 'charge'].includes(phase)) {
    pitch = { ...PITCH_TYPES.find((item) => item.id === selectedPitch) };
    showPitchLabel();
  }
  updatePitchPicker();
  if (phase !== 'ready' && phase !== 'finished') $('stadium').focus({ preventScroll: true });
}));
$('soundButton').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  initializeAudio();
  $('soundButton').setAttribute('aria-pressed', String(soundEnabled));
  $('soundButton').setAttribute('aria-label', soundEnabled ? '關閉音效' : '開啟音效');
  if (soundEnabled) playTone('great');
  if (['countdown', 'pitch', 'charge', 'flight', 'result'].includes(phase) && !paused) $('stadium').focus({ preventScroll: true });
});
window.addEventListener('keydown', (event) => {
  if (paused && event.code === 'Tab') {
    event.preventDefault();
    $('resumeButton').focus({ preventScroll: true });
    return;
  }
  if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  // Preserve normal keyboard activation for other focused controls.
  if (event.target.closest('button,a') && event.target.id !== 'swingButton') return;
  event.preventDefault();
  if (paused) resumeGame();
  else if (phase === 'ready' || phase === 'finished') startRound();
  else swing();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('pagehide', pauseGame);

// The stadium is drawn locally, so the entire game works without downloaded assets.
function polygon(c, points, fill, stroke, width = 1) {
  c.beginPath();
  points.forEach(([x, y], index) => index ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function ellipse(c, x, y, rx, ry, fill, stroke, width = 1) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function line(c, points, color, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function buildBackground() {
  background = document.createElement('canvas');
  background.width = 1500; background.height = 930;
  const c = background.getContext('2d');
  c.scale(1.5, 1.5);
  const sky = c.createLinearGradient(0, 0, 0, 290);
  sky.addColorStop(0, '#152c40'); sky.addColorStop(0.62, '#4c7375'); sky.addColorStop(1, '#8e9d8a');
  c.fillStyle = sky; c.fillRect(0, 0, 1000, 620);
  for (let i = 0; i < 45; i++) {
    const x = (i * 127.13 + 31) % 1000, y = (i * 53.7 + 20) % 145;
    ellipse(c, x, y, i % 4 === 0 ? 1.2 : 0.6, i % 4 === 0 ? 1.2 : 0.6, '#dce9d777');
  }
  ellipse(c, 745, 62, 20, 20, '#e7edce');
  ellipse(c, 752, 56, 20, 20, '#213b4d');
  // A softly layered city skyline beyond the outfield.
  for (let i = 0; i < 38; i++) {
    const x = i * 31 - 60, h = 25 + (i * 37) % 65;
    c.fillStyle = i % 3 === 0 ? '#304e59' : '#3a5b62'; c.fillRect(x, 190 - h, 24, h);
    for (let yy = 194 - h; yy < 182; yy += 11) for (let xx = x + 5; xx < x + 22; xx += 8) {
      if ((Math.round(xx + yy) % 4) !== 0) { c.fillStyle = '#e0d69a22'; c.fillRect(xx, yy, 2, 3); }
    }
  }
  // Floodlights and their quiet cones of light.
  [100, 900].forEach((x) => {
    polygon(c, [[x - 40, 87], [x + 40, 87], [x + 220, 350], [x - 220, 350]], '#e7f7cb06');
    line(c, [[x, 90], [x, 230]], '#314f55', 5);
    line(c, [[x - 22, 230], [x, 92], [x + 22, 230]], '#44656b', 2);
    c.fillStyle = '#253f4d'; c.fillRect(x - 49, 70, 98, 28);
    for (let j = 0; j < 8; j++) {
      c.shadowBlur = 13; c.shadowColor = '#eaffbf'; c.fillStyle = '#e7f0c7';
      c.fillRect(x - 42 + j * 11, 76, 7, 6); c.fillRect(x - 42 + j * 11, 87, 7, 5);
    }
    c.shadowBlur = 0;
  });
  // Deep curved stands, individual seats, and a luminous outfield wall.
  c.fillStyle = '#1c3441'; c.fillRect(0, 180, 1000, 100);
  for (let row = 0; row < 6; row++) {
    const y = 183 + row * 12;
    line(c, [[0, y + 8], [1000, y + 8]], '#5d828438', 1);
    for (let col = 0; col < 102; col++) {
      const x = col * 10 + (row % 2) * 4;
      c.fillStyle = ['#638c89', '#8fada2', '#c8b285', '#476d70', '#304d5b'][(col * 13 + row * 7) % 5];
      c.globalAlpha = .6; c.fillRect(x, y + 1, 3, 4); c.globalAlpha = 1;
    }
  }
  c.fillStyle = '#213f46'; c.fillRect(0, 252, 1000, 37);
  c.fillStyle = '#a1c281'; c.fillRect(0, 251, 1000, 3);
  c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#aec5ad';
  c.fillText('MOONLIGHT', 128, 275); c.fillText('NIGHT SLUGGER', 500, 275); c.fillText('128 m', 871, 275);
  // Center field score screen.
  c.fillStyle = '#142e37'; c.fillRect(420, 137, 160, 88);
  c.strokeStyle = '#5b8285'; c.lineWidth = 3; c.strokeRect(420, 137, 160, 88);
  c.fillStyle = '#c1ef75'; c.font = 'bold 17px sans-serif'; c.fillText('PLAY BALL', 500, 170);
  c.fillStyle = '#6d9490'; c.font = '8px sans-serif'; c.fillText('HOME OF THE NIGHT SLUGGERS', 500, 191);
  c.fillStyle = '#b2c5a9'; c.font = '9px monospace'; c.fillText('★  N I G H T  G A M E  ★', 500, 211);
  // Outfield stripes follow the perspective of the diamond.
  c.fillStyle = '#316c50'; c.fillRect(0, 289, 1000, 331);
  for (let i = -4; i < 8; i++) {
    polygon(c, [[i * 160, 289], [(i + 1) * 160, 289], [500 + ((i + 1) * 160 - 500) * 2.3, 620], [500 + (i * 160 - 500) * 2.3, 620]], i % 2 ? '#397a57' : '#326f50');
  }
  const glow = c.createRadialGradient(500, 400, 40, 500, 400, 600);
  glow.addColorStop(0, '#d4ef8d0d'); glow.addColorStop(1, '#061e2b55');
  c.fillStyle = glow; c.fillRect(0, 289, 1000, 331);
  // Infield clay, grass, foul lines and the four bases.
  polygon(c, [[500, 288], [751, 411], [500, 584], [249, 411]], '#b19775');
  polygon(c, [[500, 325], [674, 411], [500, 531], [326, 411]], '#44845d');
  polygon(c, [[500, 548], [310, 418], [319, 407], [500, 530], [681, 407], [690, 418]], '#c7ac86');
  line(c, [[0, 250], [500, 552], [1000, 250]], '#dfdfbaaa', 2.1);
  line(c, [[436, 620], [436, 569], [469, 548], [469, 596]], '#e6e1c17a', 1.5);
  line(c, [[531, 596], [531, 548], [564, 569], [564, 620]], '#e6e1c17a', 1.5);
  ellipse(c, 500, 544, 50, 26, '#bca27d');
  ellipse(c, 500, 410, 34, 14, '#c5ab83');
  c.fillStyle = '#eae7cc'; c.fillRect(490, 408, 20, 4);
  [[500, 302], [711, 412], [289, 412]].forEach(([x, y]) => polygon(c, [[x, y - 5], [x + 8, y], [x, y + 5], [x - 8, y]], '#e8e6cd'));
  polygon(c, [[489, 547], [511, 547], [511, 555], [500, 561], [489, 555]], '#eeecd7');
  // A pair of distant fielders establish scale.
  drawFielder(c, 228, 328, .45); drawFielder(c, 779, 329, .45); drawFielder(c, 621, 349, .5);
}

function drawFielder(c, x, y, scale) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  ellipse(c, 0, 22, 18, 5, '#102f3355');
  line(c, [[-6, 3], [-10, 24]], '#dce7d9', 8); line(c, [[6, 3], [9, 24]], '#dce7d9', 8);
  polygon(c, [[-12, -26], [12, -26], [10, 5], [-10, 5]], '#dce7d9');
  ellipse(c, 0, -35, 8, 10, '#c69f7c'); c.fillStyle = '#133d46'; c.fillRect(-10, -44, 20, 8);
  line(c, [[-11, -20], [-18, -2]], '#dae4d5', 6); line(c, [[11, -20], [19, -1]], '#dae4d5', 6);
  ellipse(c, -18, -1, 7, 6, '#b58a54'); c.restore();
}

function drawPitcher() {
  const preparing = phase === 'countdown' || phase === 'charge';
  const prep = preparing ? Math.min(1, (time - phaseStarted) / 850) : phase === 'flight' ? Math.max(0, 1 - (time - phaseStarted) / 300) : 0;
  if (mode === 'pitch') {
    ellipse(ctx, 500, 412, 42, 19, '#ff865d10', '#ffa885bb', 2);
    ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffd0aa'; ctx.fillText('YOU', 500, 340); ctx.restore();
  }
  ctx.save(); ctx.translate(500, 391); ctx.scale(.65, .65);
  ellipse(ctx, 0, 31, 19, 6, '#17332f55');
  line(ctx, [[-7, 7], [-12, 31]], '#dde8df', 10); line(ctx, [[7, 7], [10 + prep * 14, 31 - prep * 12]], '#dde8df', 10);
  polygon(ctx, [[-15, -29], [15, -29], [11, 9], [-11, 9]], '#dce5d6');
  ctx.fillStyle = '#ea8663'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('9', 0, -4);
  ellipse(ctx, 0, -39, 9, 11, '#c8a081'); ctx.fillStyle = '#e77e5a'; ctx.fillRect(-11, -49, 22, 8);
  line(ctx, [[-13, -23], [-21, -9 - prep * 15]], '#e5e9d6', 8);
  line(ctx, [[13, -23], [23 + prep * 5, -6 - prep * 36]], '#e5e9d6', 8);
  ellipse(ctx, -21, -7 - prep * 15, 8, 7, '#a77b50'); ctx.restore();
}

function drawBatter() {
  const elapsed = time - swingAt;
  const swinging = elapsed >= 0 && elapsed < 330;
  const progress = swinging ? elapsed / 330 : 0;
  ctx.save(); ctx.translate(422, 520);
  ellipse(ctx, 4, 48, 40, 12, '#112d3466');
  line(ctx, [[-9, 6], [-20, 43]], '#dfebdb', 16); line(ctx, [[12, 7], [27, 42]], '#dfebdb', 16);
  line(ctx, [[-20, 43], [-30, 45]], '#142b38', 10); line(ctx, [[27, 42], [35, 44]], '#142b38', 10);
  polygon(ctx, [[-25, -46], [14, -47], [23, 13], [-19, 13]], '#e7efdf');
  polygon(ctx, [[-25, -46], [-15, -47], [-10, 11], [-19, 13]], '#b1c8b8');
  ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#254646'; ctx.textAlign = 'center'; ctx.fillText('27', 0, -8);
  line(ctx, [[-18, 13], [21, 13]], '#28414a', 4);
  ellipse(ctx, -2, -63, 15, 18, '#cfa888');
  ctx.fillStyle = '#174953'; ctx.beginPath(); ctx.arc(-2, -66, 18, Math.PI, Math.PI * 2); ctx.lineTo(17, -59); ctx.lineTo(-20, -59); ctx.fill();
  line(ctx, [[-13, -34], [12, -20], [29, -36]], '#e7efdf', 12);
  line(ctx, [[12, -38], [28, -34]], '#cfa888', 10);
  ctx.save(); ctx.translate(27, -34);
  ctx.rotate(swinging ? -.55 + Math.sin(progress * Math.PI * .85) * 2.4 : -.55);
  line(ctx, [[0, 5], [5, -60]], '#c79556', 8);
  line(ctx, [[5, -30], [7, -75]], '#e4ba7c', 13);
  line(ctx, [[0, 5], [1, -12]], '#443c37', 5);
  ctx.restore();
  if (swinging && progress < .65 && !reducedMotion.matches) {
    ctx.beginPath(); ctx.arc(31, -14, 75, -.4, 1.3); ctx.strokeStyle = '#e8f4ae55'; ctx.lineWidth = 8 * (1 - progress); ctx.stroke();
  }
  ctx.restore();
}

function ballPosition(progress) {
  const q = progress / CONTACT_PROGRESS;
  const curve = mode === 'pitch' ? pitch.curve * 100 : 24;
  const wildOffset = mode === 'pitch' && (pendingPitchResult || currentResult)?.kind === 'miss' ? ((pendingPitchResult || currentResult).offset < 0 ? -75 : 75) * q * q : 0;
  return { x: 500 + Math.sin(q * Math.PI) * curve + wildOffset, y: 388 + Math.pow(Math.max(0, q), 1.8) * 150, radius: 4 + Math.pow(q, 2) * 8 };
}

function drawBall(x, y, radius, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.shadowColor = '#f4ffc4'; ctx.shadowBlur = radius > 8 ? 11 : 3;
  ellipse(ctx, x, y, radius, radius, '#fbf3d8'); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#d97b68'; ctx.lineWidth = Math.max(.7, radius * .13);
  ctx.beginPath(); ctx.arc(x - radius * .5, y, radius * .65, -.9, .9); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + radius * .5, y, radius * .65, Math.PI - .9, Math.PI + .9); ctx.stroke();
  ctx.restore();
}

function drawFrame() {
  ctx.clearRect(0, 0, 1000, 620);
  ctx.drawImage(background, 0, 0, 1000, 620);
  drawPitcher();
  const flying = phase === 'pitch' || phase === 'flight';
  const progress = flying ? (time - phaseStarted) / pitch.duration : 0;
  // The bright circle marks the exact batting point.
  const near = flying && Math.abs(progress - CONTACT_PROGRESS) < .11;
  const pulse = reducedMotion.matches ? 0 : Math.sin(time / 180) * 2;
  ellipse(ctx, 500, 542, 28 + (near ? 5 : pulse), 14 + (near ? 2 : pulse / 2), near ? (mode === 'pitch' ? '#ff865d30' : '#c1ef7530') : '#d7efca08', near ? (mode === 'pitch' ? '#ffad89' : '#d6ff9c') : '#b9d3a36b', near ? 3 : 1.5);
  if (flying) {
    const b = ballPosition(progress);
    if (!reducedMotion.matches) {
      for (let i = 3; i > 0; i--) {
        const t = ballPosition(Math.max(0, progress - i * .022));
        ellipse(ctx, t.x, t.y, t.radius * .75, t.radius * .75, `rgba(239,249,217,${.16 - i * .035})`);
      }
    }
    ellipse(ctx, b.x + 7, 545 + progress * 12, b.radius * 1.4, b.radius * .4, '#122e3544');
    drawBall(b.x, b.y, b.radius);
  }
  drawBatter();
  if (phase === 'result' && currentResult) {
    const age = time - phaseStarted;
    if (mode === 'bat' ? currentResult.kind !== 'miss' : currentResult.batterOutcome === 'hit') {
      const t = Math.min(1.4, age / 1500);
      const isHomeRun = mode === 'bat' && currentResult.kind === 'perfect';
      const x = 500 + (isHomeRun ? 260 : -190) * t;
      const y = 538 - (isHomeRun ? 900 : 560) * t + (isHomeRun ? 450 : 390) * t * t;
      if (!reducedMotion.matches) {
        for (let i = 5; i > 0; i--) {
          const tt = Math.max(0, t - i * .025);
          ellipse(ctx, 500 + (isHomeRun ? 260 : -190) * tt, 538 - (isHomeRun ? 900 : 560) * tt + (isHomeRun ? 450 : 390) * tt * tt, Math.max(1, 9 - tt * 7), Math.max(1, 9 - tt * 7), `rgba(216,249,152,${.20 - i * .03})`);
        }
      }
      drawBall(x, y, Math.max(2.5, 12 - t * 9));
      if (age < 280) {
        ctx.save(); ctx.globalAlpha = 1 - age / 280;
        for (let i = 0; i < 10; i++) {
          const angle = i * Math.PI / 5;
          const distance = 18 + age / 8;
          line(ctx, [[500 + Math.cos(angle) * distance, 538 + Math.sin(angle) * distance], [500 + Math.cos(angle) * (distance + 12), 538 + Math.sin(angle) * (distance + 12)]], '#eaffb0', 3);
        }
        ctx.restore();
      }
      if (isHomeRun && !reducedMotion.matches) {
        ctx.save();
        for (let i = 0; i < 24; i++) {
          const xx = (i * 113.7 + age * (i % 2 ? .025 : -.025) + 1000) % 1000;
          const yy = ((age * .13 + i * 23) % 650) - 50;
          ctx.fillStyle = ['#c1ef75', '#f5d49b', '#82cbbc'][i % 3]; ctx.globalAlpha = .8;
          ctx.fillRect(xx, yy, 3, 7);
        }
        ctx.restore();
      }
    } else if (age < 400) {
      const b = ballPosition(Math.min(1.2, currentResult.ballProgress + age / pitch.duration));
      drawBall(b.x, b.y, b.radius, Math.max(0, 1 - age / 400));
    }
  }
  if (phase === 'countdown') {
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#e7f5d4';
    ctx.shadowColor = '#102531'; ctx.shadowBlur = 12;
    ctx.font = 'italic bold 24px sans-serif'; ctx.fillText('READY', 500, 326);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#d5e5cb'; ctx.fillText(`PITCH  ${round.results.length + 1} / 9`, 500, 347); ctx.restore();
  }
  if (phase === 'charge') {
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#ffd8b5'; ctx.shadowColor = '#102531'; ctx.shadowBlur = 10;
    ctx.font = 'italic bold 23px sans-serif'; ctx.fillText('FIND YOUR RELEASE', 500, 270);
    ctx.font = '13px sans-serif'; ctx.fillText('指標進入橘區中心，立即投球', 500, 296); ctx.restore();
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.round(bounds.width * dpr); canvas.height = Math.round(bounds.height * dpr);
  ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 620, 0, 0);
  drawFrame();
}

function tick(now) {
  const delta = Math.max(0, Math.min(80, now - previousFrame));
  previousFrame = now;
  if (!paused) {
    time += delta;
    if (phase === 'countdown' && time - phaseStarted >= 1000) releasePitch();
    if (phase === 'pitch') {
      const progress = (time - phaseStarted) / pitch.duration;
      $('timingMarker').style.left = `${Math.min(100, progress * 100)}%`;
      if (progress > 1.035) settle({ kind: 'miss', offset: 1, unplayed: true, ...RESULTS.miss });
    }
    if (phase === 'charge') {
      const progress = (time - phaseStarted) / PITCH_CHARGE_MS;
      $('timingMarker').style.left = `${Math.min(100, progress * 100)}%`;
      if (progress > 1.035) throwPitch(true);
    }
    if (phase === 'flight' && (time - phaseStarted) / pitch.duration >= CONTACT_PROGRESS) settlePitch();
    if (phase === 'result' && time - phaseStarted >= 1900) {
      if (round.results.length === TOTAL_PITCHES) finishRound();
      else nextPitch();
    }
    drawFrame();
  }
  requestAnimationFrame(tick);
}

buildBackground();
renderScore();
resize();
new ResizeObserver(resize).observe($('stadium'));
requestAnimationFrame(tick);
