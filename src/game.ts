export const TIERS = 20;

export type Question = { text: string; answers: string[]; correct: number };
export type Tier = { label: string; milestone: boolean; note?: string };
export type LifelineKey = 'fifty' | 'chat' | 'phone' | 'swap';
export type Phase = 'idle' | 'intro' | 'question' | 'answers' | 'locked' | 'correct' | 'wrong' | 'won';
export type GameState = {
  ladder: Tier[];
  questions: Question[];
  tier: number;
  contestant: string;
  phase: Phase;
  lifelines: Record<LifelineKey, boolean>;
  winners: { name: string; tier: number; label: string }[];
  sound: boolean;
  cue: { name: string | null; seq: number };
  revealed: number;
  selected: number | null;
  eliminated: boolean[];
  activeLifeline: LifelineKey | null;
  poll: number[] | null;
  phoneEndsAt: number | null;
};
type Payload = Record<string, any>;

export const DEFAULT_LADDER: Tier[] = [
  '100', '200', '300', '500', '1,000',
  '2,000', '4,000', '8,000', '16,000', '32,000',
  '50,000', '75,000', '100,000', '150,000', '250,000',
  '350,000', '500,000', '650,000', '800,000', '1,000,000',
].map((label, i) => ({ label, milestone: i === 4 || i === 9 || i === 14 || i === 19 }));
DEFAULT_LADDER[19].note = 'Yugi donates 100 subs';

export const PHONE_SECONDS = 30;
const MAX_HISTORY = 40;

function freshRound(): Pick<GameState, 'revealed' | 'selected' | 'eliminated' | 'activeLifeline' | 'poll' | 'phoneEndsAt'> {
  return {
    revealed: 0,
    selected: null,
    eliminated: [false, false, false, false],
    activeLifeline: null,
    poll: null,
    phoneEndsAt: null,
  };
}

function freshLifelines(): Record<LifelineKey, boolean> {
  return { fifty: false, chat: false, phone: false, swap: false };
}

export function initialState(questions: Question[]): GameState {
  return {
    ladder: DEFAULT_LADDER.map((t) => ({ ...t })),
    questions,
    tier: 0,
    contestant: '',
    phase: 'idle',
    lifelines: freshLifelines(),
    winners: [],
    sound: true,
    cue: { name: null, seq: 0 },
    ...freshRound(),
  };
}

function cue(state: GameState, name: string) {
  state.cue = { name, seq: state.cue.seq + 1 };
}

function currentQuestion(state: GameState) {
  return state.questions[state.tier] || null;
}

export function normalizeQuestion(q: { text?: unknown; answers?: unknown; correct?: unknown }): Question {
  const answers: string[] = Array.isArray(q.answers) ? q.answers.slice(0, 4).map((a: unknown) => String(a ?? '').trim()) : [];
  while (answers.length < 4) answers.push('');
  const c = Number(q.correct);
  const correct = Number.isInteger(c) && c >= 0 && c < 4 ? c : 0;
  return { text: String(q.text ?? '').trim(), answers, correct };
}

const actions: Record<string, (state: GameState, payload: Payload) => void> = {
  seat(state: GameState, { name }: Payload) {
    const contestant = String(name || '').trim();
    if (!contestant) throw new Error('Contestant name required');
    state.contestant = contestant;
    state.lifelines = freshLifelines();
    Object.assign(state, freshRound());
    state.phase = 'intro';
    cue(state, 'lets_play');
  },

  remove(state: GameState) {
    state.contestant = '';
    state.lifelines = freshLifelines();
    Object.assign(state, freshRound());
    state.phase = 'idle';
    cue(state, 'resign');
  },

  showQuestion(state: GameState) {
    if (!state.contestant) throw new Error('Seat a contestant first');
    if (!currentQuestion(state)) throw new Error('No question at this tier');
    Object.assign(state, freshRound());
    state.phase = 'question';
    cue(state, 'question');
  },

  revealAnswer(state: GameState) {
    if (state.phase !== 'question' && state.phase !== 'answers') throw new Error('Show the question first');
    state.revealed = Math.min(4, state.revealed + 1);
    if (state.revealed === 4) state.phase = 'answers';
  },

  revealAll(state: GameState) {
    if (state.phase !== 'question' && state.phase !== 'answers') throw new Error('Show the question first');
    state.revealed = 4;
    state.phase = 'answers';
  },

  select(state: GameState, { index }: Payload) {
    if (state.phase !== 'answers' && state.phase !== 'locked') throw new Error('Answers are not open');
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Bad answer index');
    if (state.eliminated[index]) throw new Error('That answer is eliminated');
    state.selected = index;
    state.phase = 'locked';
    state.activeLifeline = null;
    cue(state, 'final_answer');
  },

  deselect(state: GameState) {
    if (state.phase !== 'locked') return;
    state.selected = null;
    state.phase = 'answers';
  },

  reveal(state: GameState) {
    if (state.phase !== 'locked') throw new Error('Lock in an answer first');
    const q = currentQuestion(state)!;
    if (state.selected === q.correct) {
      state.phase = 'correct';
      cue(state, state.tier === TIERS - 1 ? 'you_won_million' : 'correct_answer');
      return;
    }
    state.eliminated[state.selected!] = true;
    state.phase = 'wrong';
    cue(state, 'wrong_answer');
  },

  next(state: GameState) {
    if (state.phase === 'wrong') {
      state.selected = null;
      state.phase = 'answers';
      return;
    }
    if (state.phase === 'correct') {
      state.winners.push({ name: state.contestant, tier: state.tier, label: state.ladder[state.tier]!.label });
      state.contestant = '';
      state.lifelines = freshLifelines();
      Object.assign(state, freshRound());
      if (state.tier >= TIERS - 1) {
        state.phase = 'won';
        cue(state, 'winning_theme');
        return;
      }
      state.tier += 1;
      state.phase = 'idle';
      cue(state, 'next');
      return;
    }
    if (state.phase === 'intro') {
      actions.showQuestion!(state, {});
      return;
    }
    throw new Error('Nothing to advance');
  },

  lifelineFifty(state: GameState) {
    if (state.phase !== 'answers') throw new Error('Answers must be open');
    if (state.lifelines.fifty) throw new Error('50:50 already used');
    const q = currentQuestion(state)!;
    const wrong = [0, 1, 2, 3].filter((i) => i !== q.correct && !state.eliminated[i]);
    for (let k = wrong.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [wrong[k], wrong[j]] = [wrong[j], wrong[k]];
    }
    wrong.slice(0, 2).forEach((i) => { state.eliminated[i] = true; });
    state.lifelines.fifty = true;
    cue(state, 'lifelines');
  },

  lifelineChat(state: GameState) {
    if (state.phase !== 'answers') throw new Error('Answers must be open');
    if (state.lifelines.chat) throw new Error('Ask the Chat already used');
    state.lifelines.chat = true;
    state.activeLifeline = 'chat';
    state.poll = null;
    cue(state, 'audience');
  },

  setPoll(state: GameState, { votes }: Payload) {
    if (state.activeLifeline !== 'chat') throw new Error('Ask the Chat is not active');
    const nums = (Array.isArray(votes) ? votes : []).slice(0, 4).map((v) => Math.max(0, Number(v) || 0));
    while (nums.length < 4) nums.push(0);
    const total = nums.reduce((a, b) => a + b, 0) || 1;
    state.poll = nums.map((v) => Math.round((v / total) * 100));
  },

  lifelinePhone(state: GameState) {
    if (state.phase !== 'answers') throw new Error('Answers must be open');
    if (state.lifelines.phone) throw new Error('Phone a Friend already used');
    state.lifelines.phone = true;
    state.activeLifeline = 'phone';
    state.phoneEndsAt = null;
    cue(state, 'paf');
  },

  startPhoneTimer(state: GameState) {
    if (state.activeLifeline !== 'phone') throw new Error('Phone a Friend is not active');
    state.phoneEndsAt = Date.now() + PHONE_SECONDS * 1000;
  },

  lifelineSwap(state: GameState) {
    if (state.phase !== 'question' && state.phase !== 'answers') throw new Error('Question must be on screen');
    if (state.lifelines.swap) throw new Error('Swap already used');
    if (state.questions.length <= TIERS) throw new Error('No spare questions to swap in (add more than 20)');
    const spare = state.questions.splice(TIERS, 1)[0]!;
    const old = state.questions.splice(state.tier, 1, spare)[0];
    state.questions.push(old);
    state.lifelines.swap = true;
    Object.assign(state, freshRound());
    state.phase = 'question';
    cue(state, 'lifelines');
  },

  closeLifeline(state: GameState) {
    state.activeLifeline = null;
    state.phoneEndsAt = null;
    state.poll = null;
  },

  setTier(state: GameState, { tier }: Payload) {
    if (!Number.isInteger(tier) || tier < 0 || tier >= TIERS) throw new Error('Tier must be 0-19');
    state.tier = tier;
    Object.assign(state, freshRound());
    state.phase = state.contestant ? 'intro' : 'idle';
  },

  setQuestions(state: GameState, { questions }: Payload) {
    if (!Array.isArray(questions)) throw new Error('questions must be an array');
    state.questions = questions.map((q: Partial<Question> & Record<string, unknown>) => normalizeQuestion(q));
  },

  setLadder(state: GameState, { ladder }: Payload) {
    if (!Array.isArray(ladder) || ladder.length !== TIERS) throw new Error('ladder must have 20 entries');
    state.ladder = ladder.map((t: Partial<Tier>, i: number) => ({
      label: String(t.label ?? '').trim() || DEFAULT_LADDER[i]!.label,
      milestone: Boolean(t.milestone),
      ...(t.note ? { note: String(t.note).trim() } : {}),
    }));
  },

  setSound(state: GameState, { enabled }: Payload) {
    state.sound = Boolean(enabled);
  },

  playCue(state: GameState, { name }: Payload) {
    cue(state, String(name));
  },

  resetGame(state: GameState) {
    const questions = state.questions;
    const ladder = state.ladder;
    const sound = state.sound;
    Object.assign(state, initialState(questions), { ladder, sound });
  },
};

export class Game {
  state: GameState;
  history: GameState[];

  constructor(state: GameState, history: GameState[] = []) {
    this.state = state;
    this.history = history;
  }

  dispatch(name: string, payload: Payload = {}): GameState {
    if (name === 'undo') {
      const prev = this.history.pop();
      if (!prev) throw new Error('Nothing to undo');
      this.state = prev;
      return this.state;
    }
    const action = actions[name];
    if (!action) throw new Error('Unknown action: ' + name);
    const snapshot = JSON.parse(JSON.stringify(this.state));
    action(this.state, payload);
    this.history.push(snapshot);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    return this.state;
  }
}

