import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeSwing, recordResult, newRound, choosePitch, CONTACT_PROGRESS } from '../site/engine.js';

test('exact contact and timing-window boundaries produce the advertised scores', () => {
  const duration = 1500;
  for (const direction of [-1, 1]) {
    for (const [error, kind, points] of [[0, 'perfect', 500], [0.045, 'perfect', 500], [0.046, 'great', 200], [0.1, 'great', 200], [0.101, 'contact', 100], [0.16, 'contact', 100], [0.161, 'miss', 0]]) {
      const result = judgeSwing((CONTACT_PROGRESS + direction * error) * duration, duration);
      assert.equal(result.kind, kind);
      assert.equal(result.points, points);
    }
  }
});

test('timing is frame-independent and symmetric across pitch speeds', () => {
  for (const duration of [1150, 1500, 1680]) {
    assert.equal(judgeSwing(duration * 0.82, duration).kind, 'perfect');
    assert.equal(judgeSwing(0, duration).kind, 'miss');
    assert.ok(judgeSwing(duration * 0.7, duration).offset < 0);
    assert.ok(judgeSwing(duration, duration).offset > 0);
  }
});

test('nine pitches are counted once each and no tenth result is recorded', () => {
  let round = newRound();
  const homeRun = judgeSwing(1230, 1500);
  for (let i = 0; i < 9; i++) round = recordResult(round, homeRun);
  assert.equal(round.score, 4500);
  assert.equal(round.homeRuns, 9);
  assert.equal(round.hits, 9);
  assert.equal(recordResult(round, homeRun), round);
});

test('a miss breaks the combo, and restart gives a clean round', () => {
  let round = newRound();
  round = recordResult(round, judgeSwing(1230, 1500));
  round = recordResult(round, judgeSwing(1230, 1500));
  round = recordResult(round, judgeSwing(0, 1500));
  assert.equal(round.combo, 0);
  assert.equal(round.maxCombo, 2);
  assert.equal(round.score, 1000);
  assert.deepEqual(newRound(), { score: 0, results: [], homeRuns: 0, hits: 0, combo: 0, maxCombo: 0 });
});

test('pitch selection stays within the playable speed range', () => {
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    const pitch = choosePitch(random);
    assert.ok(pitch.duration >= 1150 && pitch.duration <= 1680);
    assert.ok(['快速球', '直球'].includes(pitch.name));
  }
});
