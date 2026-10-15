import * as v from 'valibot';
import { defineRoom } from 'void/ws';
import { Game, initialState, normalizeQuestion, type GameState } from '../src/game';
import defaultQuestions from '../src/questions.default.json';

const ClientMessage = v.object({
  type: v.literal('action'),
  id: v.number(),
  name: v.string(),
  payload: v.optional(v.record(v.string(), v.any())),
  key: v.optional(v.string()),
});

const ServerMessage = v.variant('type', [
  v.object({ type: v.literal('state'), state: v.any(), clients: v.number(), needsKey: v.boolean() }),
  v.object({ type: v.literal('ok'), id: v.number() }),
  v.object({ type: v.literal('error'), id: v.number(), error: v.string() }),
]);

type Saved = { state: GameState; history: GameState[] };

let game: Game | null = null;

function count(it: Iterable<unknown>) { let n = 0; for (const _ of it) n++; return n; }

async function load(storage: { get<T>(key: string): Promise<T | undefined> }) {
  if (game) return game;
  const saved = await storage.get<Saved>('game');
  game = saved
    ? new Game(saved.state, saved.history)
    : new Game(initialState(defaultQuestions.map((q) => normalizeQuestion(q))));
  return game;
}

export default defineRoom({
  name: 'millionaire-game',
  messages: { client: ClientMessage, server: ServerMessage },

  async onConnect(ctx) {
    const g = await load(ctx.storage);
    const controlKey = (ctx.env as { CONTROL_KEY?: string }).CONTROL_KEY ?? '';
    await ctx.connection.send({ type: 'state', state: g.state, clients: count(ctx.room.getConnections()), needsKey: Boolean(controlKey) });
  },

  async onMessage(ctx, event) {
    const g = await load(ctx.storage);
    const controlKey = (ctx.env as { CONTROL_KEY?: string }).CONTROL_KEY ?? '';
    if (controlKey && event.key !== controlKey) {
      await ctx.connection.send({ type: 'error', id: event.id, error: 'Bad control key' });
      return;
    }
    try {
      g.dispatch(event.name, event.payload ?? {});
    } catch (e) {
      await ctx.connection.send({ type: 'error', id: event.id, error: (e as Error).message });
      return;
    }
    await ctx.storage.put('game', { state: g.state, history: g.history } satisfies Saved);
    await ctx.room.broadcast({ type: 'state', state: g.state, clients: count(ctx.room.getConnections()), needsKey: Boolean(controlKey) });
    await ctx.connection.send({ type: 'ok', id: event.id });
  },

  async onClose(ctx) {
    const g = await load(ctx.storage);
    const controlKey = (ctx.env as { CONTROL_KEY?: string }).CONTROL_KEY ?? '';
    await ctx.room.broadcast({ type: 'state', state: g.state, clients: count(ctx.room.getConnections()), needsKey: Boolean(controlKey) });
  },
});
