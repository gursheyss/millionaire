export type Question = { text: string; answers: string[]; correct: number };
export type Tier = { label: string; milestone: boolean; note?: string };
export type Phase = "idle" | "intro" | "question" | "answers" | "locked" | "correct" | "wrong" | "won";
export type LifelineKey = "fifty" | "chat" | "phone" | "swap";
export type GameState = {
  ladder: Tier[];
  questions: Question[];
  tier: number;
  contestant: string;
  phase: Phase;
  lifelines: Record<LifelineKey, boolean>;
  winners: { name: string; tier: number; label: string }[];
  sound: boolean;
  revealed: number;
  selected: number | null;
  eliminated: boolean[];
  activeLifeline: LifelineKey | null;
  poll: number[] | null;
  phoneEndsAt: number | null;
};

type Handlers = {
  onState: (state: GameState, meta: { clients: number; needsKey: boolean }) => void;
  onOpen: () => void;
  onClose: () => void;
};

export function connect(handlers: Handlers) {
  let ws: WebSocket | null = null;
  const pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let retry = 1000;
  let key = localStorage.getItem("controlKey") || "";

  function open() {
    const proto = location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(proto + location.host + "/game");
    ws.onopen = () => { retry = 1000; handlers.onOpen(); };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") { handlers.onState(msg.state, { clients: msg.clients, needsKey: Boolean(msg.needsKey) }); return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === "ok") p.resolve(); else p.reject(new Error(msg.error));
    };
    ws.onclose = () => { handlers.onClose(); setTimeout(open, retry); retry = Math.min(retry * 2, 10000); };
    ws.onerror = () => ws?.close();
  }
  open();

  return {
    send(name: string, payload: Record<string, unknown> = {}) {
      return new Promise<void>((resolve, reject) => {
        if (!ws || ws.readyState !== 1) return reject(new Error("Not connected"));
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws!.send(JSON.stringify({ type: "action", id, name, payload, key }));
      });
    },
    setKey(k: string) { key = k; localStorage.setItem("controlKey", k); },
    getKey() { return key; },
  };
}

export async function importQuestions(url: string, body: Record<string, string>, key: string): Promise<Question[]> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-control-key": key }, body: JSON.stringify(body) });
  const j = (await r.json()) as { error?: string; questions: Question[] };
  if (!r.ok) throw new Error(j.error || r.statusText);
  if (!j.questions.length) throw new Error("No questions found");
  return j.questions;
}
