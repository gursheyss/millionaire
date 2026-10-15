import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, initialState, TIERS } from '../src/game.ts';
import { parseCsv, rowsToQuestions, sheetCsvUrl } from '../src/csv.ts';

function questions(n: number) {
  return Array.from({ length: n }, (_, i) => ({ text: 'Q' + (i + 1), answers: ['a', 'b', 'c', 'd'], correct: i % 4 }));
}

function setupLocked(game: Game, index: number) {
  game.dispatch('seat', { name: 'viewer1' });
  game.dispatch('showQuestion');
  game.dispatch('revealAll');
  game.dispatch('select', { index });
}

test('wrong answer greys the option, keeps contestant and tier', () => {
  const game = new Game(initialState(questions(22)));
  setupLocked(game, 1);
  game.dispatch('reveal');
  assert.equal(game.state.phase, 'wrong');
  assert.equal(game.state.eliminated[1], true);
  game.dispatch('next');
  assert.equal(game.state.phase, 'answers');
  assert.equal(game.state.contestant, 'viewer1');
  assert.equal(game.state.tier, 0);
  assert.throws(() => game.dispatch('select', { index: 1 }), /eliminated/);
});

test('correct answer removes contestant and climbs the ladder', () => {
  const game = new Game(initialState(questions(22)));
  setupLocked(game, 0);
  game.dispatch('reveal');
  assert.equal(game.state.phase, 'correct');
  game.dispatch('next');
  assert.equal(game.state.phase, 'idle');
  assert.equal(game.state.contestant, '');
  assert.equal(game.state.tier, 1);
  assert.deepEqual(game.state.winners.map((w) => w.name), ['viewer1']);
});

test('winning the last tier ends the game', () => {
  const game = new Game(initialState(questions(22)));
  game.dispatch('setTier', { tier: TIERS - 1 });
  setupLocked(game, (TIERS - 1) % 4);
  game.dispatch('reveal');
  assert.equal(game.state.cue.name, 'you_won_million');
  game.dispatch('next');
  assert.equal(game.state.phase, 'won');
});

test('fifty-fifty removes two wrong answers and is single use', () => {
  const game = new Game(initialState(questions(22)));
  game.dispatch('seat', { name: 'v' });
  game.dispatch('showQuestion');
  game.dispatch('revealAll');
  game.dispatch('lifelineFifty');
  const gone = game.state.eliminated.filter(Boolean).length;
  assert.equal(gone, 2);
  assert.equal(game.state.eliminated[0], false);
  assert.throws(() => game.dispatch('lifelineFifty'), /already used/);
});

test('lifelines reset for each new contestant', () => {
  const game = new Game(initialState(questions(22)));
  game.dispatch('seat', { name: 'v' });
  game.dispatch('showQuestion');
  game.dispatch('revealAll');
  game.dispatch('lifelinePhone');
  game.dispatch('startPhoneTimer');
  assert.ok(game.state.phoneEndsAt > Date.now());
  game.dispatch('closeLifeline');
  game.dispatch('seat', { name: 'w' });
  assert.equal(game.state.lifelines.phone, false);
});

test('swap pulls in the first spare and keeps the old question as a spare', () => {
  const game = new Game(initialState(questions(22)));
  game.dispatch('seat', { name: 'v' });
  game.dispatch('showQuestion');
  game.dispatch('lifelineSwap');
  assert.equal(game.state.questions[0].text, 'Q21');
  assert.equal(game.state.questions[21].text, 'Q1');
  assert.equal(game.state.questions.length, 22);
  const noSpares = new Game(initialState(questions(20)));
  noSpares.dispatch('seat', { name: 'v' });
  noSpares.dispatch('showQuestion');
  assert.throws(() => noSpares.dispatch('lifelineSwap'), /spare/);
});

test('poll normalizes votes to percentages', () => {
  const game = new Game(initialState(questions(22)));
  game.dispatch('seat', { name: 'v' });
  game.dispatch('showQuestion');
  game.dispatch('revealAll');
  game.dispatch('lifelineChat');
  game.dispatch('setPoll', { votes: [10, 30, 50, 10] });
  assert.deepEqual(game.state.poll, [10, 30, 50, 10]);
});

test('undo restores the previous state', () => {
  const game = new Game(initialState(questions(22)));
  game.dispatch('seat', { name: 'v' });
  game.dispatch('showQuestion');
  game.dispatch('undo');
  assert.equal(game.state.phase, 'intro');
  game.dispatch('undo');
  assert.equal(game.state.phase, 'idle');
  assert.throws(() => game.dispatch('undo'), /Nothing/);
});

test('sheet CSV parses the messy column layout and optional correct letter', () => {
  const csv = 'Question,A,B,C,D\n' +
    'Which ocean is the largest on Earth?,A) Atlantic Ocean,B) Indian Ocean,,C) Arctic Ocean,,D) Pacific Ocean,,\n' +
    'Which country gifted the Statue of Liberty?,,A) France,B) Italy,C) Spain,D) Germany,A,,\n' +
    '"Who, me?",A) x,B) y,C) z,D) w,C) z\n';
  const qs = rowsToQuestions(parseCsv(csv));
  assert.equal(qs.length, 3);
  assert.deepEqual(qs[0].answers, ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Pacific Ocean']);
  assert.equal(qs[1].correct, 0);
  assert.equal(qs[2].text, 'Who, me?');
  assert.equal(qs[2].correct, 2);
});

test('sheet URL converts to CSV export with gid', () => {
  assert.equal(
    sheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_123/edit?gid=77#gid=77'),
    'https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=77'
  );
  assert.equal(sheetCsvUrl('https://example.com'), null);
});
