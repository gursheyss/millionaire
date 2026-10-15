import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/atoms/Button";
import { ValuePill } from "@/components/atoms/ValuePill";
import { EntityChip } from "@/components/atoms/EntityChip";
import GlideMenu from "@/components/primitives/GlideMenu";
import TaskRows from "@/components/primitives/TaskRows";
import LoadingState from "@/components/primitives/LoadingState";
import { connect, importQuestions, type GameState, type LifelineKey, type Phase, type Question, type Tier } from "@/lib/client";

const LETTERS = ["A", "B", "C", "D"] as const;
const TIERS = 20;

const PHASE_HINT: Record<Phase, string> = {
  idle: "Seat the next contestant",
  intro: "Name card is up. Show the question when ready",
  question: "Reveal the answers",
  answers: "Wait for their final answer, then click it",
  locked: "Locked in. Reveal the result",
  correct: "Correct. Next sends them out and climbs the ladder",
  wrong: "Wrong. Next lets the same contestant try again",
  won: "Someone hit the top. Reset to play again",
};

const PHASE_TONE: Record<Phase, "neutral" | "green" | "orange" | "red" | "accent"> = {
  idle: "neutral", intro: "accent", question: "accent", answers: "accent", locked: "orange", correct: "green", wrong: "red", won: "green",
};

const LIFELINES: { key: LifelineKey; label: string; icon: string }[] = [
  { key: "fifty", label: "50:50", icon: "/img/fifty.png" },
  { key: "chat", label: "Ask the Chat", icon: "/img/chat.png" },
  { key: "phone", label: "Phone a Friend", icon: "/img/phone.png" },
  { key: "swap", label: "Swap Question", icon: "/img/swap.png" },
];

function Card({ title, children, className = "", action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-card bg-surface shadow-card ${className}`} aria-label={title}>
      <header className="primitive-card-bar flex items-center justify-between border-b border-line">
        <h2 className="text-[13px] font-medium text-ink-2">{title}</h2>
        {action}
      </header>
      <div className="primitive-card-pad">{children}</div>
    </section>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-8 rounded-control bg-field px-2.5 text-[13px] text-ink shadow-inset-field placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent ${props.className ?? ""}`}
    />
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ml-1 rounded-chip bg-field px-1 font-mono text-[11px] text-ink-3 shadow-hairline">{children}</kbd>;
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [clients, setClients] = useState(0);
  const [needsKey, setNeedsKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [keyBad, setKeyBad] = useState(false);
  const [name, setName] = useState("");
  const [pollVotes, setPollVotes] = useState(["0", "0", "0", "0"]);
  const [editQuestions, setEditQuestions] = useState<Question[] | null>(null);
  const [editLadder, setEditLadder] = useState<Tier[] | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [csvText, setCsvText] = useState("");
  const [jumpTier, setJumpTier] = useState(0);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const clientRef = useRef<ReturnType<typeof connect> | null>(null);
  const [key, setKeyState] = useState("");
  const [previewScale, setPreviewScale] = useState(0.25);
  const previewWrap = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setPreviewScale(el.clientWidth / 1920));
    ro.observe(el);
  }, []);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    const c = connect({
      onState: (s, meta) => { setState(s); setClients(meta.clients); setNeedsKey(meta.needsKey); },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    clientRef.current = c;
    setKeyState(c.getKey());
  }, []);

  useEffect(() => {
    if (needsKey && !key) say("Enter the control key (top right) before using the controls");
  }, [needsKey, key, say]);

  useEffect(() => {
    document.documentElement.classList.add("theme-switching");
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    requestAnimationFrame(() => document.documentElement.classList.remove("theme-switching"));
  }, [dark]);

  const act = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    const c = clientRef.current;
    if (!c) return Promise.resolve(false);
    return c.send(action, payload).then(() => true, (e: Error) => { setKeyBad(/control key/i.test(e.message)); say(e.message); return false; });
  }, [say]);

  const q = useMemo(() => state?.questions[state.tier] ?? null, [state]);
  const p = state?.phase ?? "idle";

  const answerState = (i: number): "locked" | "correct" | "wrong" | "eliminated" | "" => {
    if (!state || !q) return "";
    if ((p === "correct" || p === "wrong") && i === q.correct) return "correct";
    if (p === "wrong" && state.selected === i) return "wrong";
    if (p === "locked" && state.selected === i) return "locked";
    if (state.eliminated[i]) return "eliminated";
    return "";
  };

  const canReveal = p === "question" || (p === "answers" && (state?.revealed ?? 0) < 4);
  const nextLabel = p === "wrong" ? "Same contestant, try again" : p === "correct" ? ((state?.tier ?? 0) >= TIERS - 1 ? "Crown the millionaire" : "Contestant out, ladder up") : p === "intro" ? "Show question" : "Next";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || e.metaKey || e.ctrlKey || !state) return;
      const k = e.key.toLowerCase();
      if (k >= "1" && k <= "4") { const i = Number(k) - 1; if ((p === "answers" || p === "locked") && !state.eliminated[i]) act("select", { index: i }); }
      else if (k === "q" && state.contestant && p !== "won" && p !== "locked") act("showQuestion");
      else if (k === "r" && canReveal) act("revealAnswer");
      else if (k === "a" && canReveal) act("revealAll");
      else if (k === "enter" && p === "locked") act("reveal");
      else if (k === "escape" && p === "locked") act("deselect");
      else if (k === "n" && (p === "correct" || p === "wrong" || p === "intro")) act("next");
      else if (k === "z") act("undo");
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, p, canReveal, act]);

  const questions = editQuestions ?? state?.questions ?? [];
  const ladder = editLadder ?? state?.ladder ?? [];

  const updateQuestion = (i: number, patch: Partial<Question>) => {
    const qs = questions.map((x, k) => (k === i ? { ...x, ...patch } : x));
    setEditQuestions(qs);
  };
  const moveQuestion = (i: number, dir: -1 | 1) => {
    const qs = questions.slice();
    const j = i + dir;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    setEditQuestions(qs);
  };

  const doImport = async (url: string, body: Record<string, string>) => {
    try {
      const qs = await importQuestions(url, body, key);
      setEditQuestions(qs);
      say(`Loaded ${qs.length} questions. Check the correct answers, then save.`);
    } catch (e) { say((e as Error).message); }
  };

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label="Connecting to the game server" />
      </div>
    );
  }

  const winners = state.winners.slice(-6).reverse().map((w, i) => ({
    key: `${w.name}-${w.tier}-${i}`,
    label: w.name,
    amount: w.label,
    status: "done" as const,
    details: [{ label: `Cleared question ${w.tier + 1}`, meta: w.label }],
  }));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-5 py-2.5">
          <h1 className="mr-auto text-[15px] font-semibold">Millionaire Control</h1>
          <ValuePill tone={connected ? "green" : "red"}>{connected ? "Connected" : "Reconnecting"}</ValuePill>
          <ValuePill>{clients} clients</ValuePill>
          <ValuePill tone="accent"><span className="tabular-nums">Tier {state.tier + 1}/{TIERS}</span></ValuePill>
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" className="accent-accent" checked={state.sound} onChange={(e) => act("setSound", { enabled: e.target.checked })} />
            Sound on show
          </label>
          <Button size="sm" variant="secondary" onClick={() => act("undo")}>Undo<Kbd>Z</Kbd></Button>
          <Field
            type="password"
            aria-label="Control key"
            placeholder="Control key"
            value={key}
            className={keyBad ? "ring-2 ring-red" : ""}
            onChange={(e) => { setKeyState(e.target.value); clientRef.current?.setKey(e.target.value.trim()); setKeyBad(false); }}
          />
          <Button size="sm" variant="quiet" onClick={() => setDark((d) => !d)} aria-pressed={dark}>{dark ? "Light" : "Dark"}</Button>
          <a className="text-[13px] font-medium text-accent-ink" href="/show" target="_blank" rel="noreferrer">Open show screen</a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1700px] grid-cols-1 gap-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-4">
          <Card title="Contestant" action={<ValuePill tone={PHASE_TONE[p]}><span className="uppercase tracking-wide">{p}</span></ValuePill>}>
            <p className="mb-3 text-[13px] text-ink-2">{PHASE_HINT[p]}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Field
                className="min-w-0 flex-1"
                placeholder="Discord name of the person on stage"
                aria-label="Contestant name"
                value={name}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") act("seat", { name }).then((ok) => ok && setName("")); }}
              />
              <Button variant="accent" disabled={p === "won"} onClick={() => act("seat", { name }).then((ok) => ok && setName(""))}>Seat contestant</Button>
              <Button variant="danger" disabled={!state.contestant} onClick={() => act("remove")}>Remove</Button>
              {state.contestant && <EntityChip name={state.contestant} color="var(--accent)" />}
            </div>
          </Card>

          <Card title={`Question ${state.tier + 1} for ${state.ladder[state.tier]?.label ?? ""}`}>
            <p className="mb-3 text-[15px] font-medium">{q?.text ?? "No question at this tier"}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(q?.answers ?? ["", "", "", ""]).map((a, i) => {
                const st = answerState(i);
                const hidden = i >= state.revealed;
                const mark = st === "locked" ? "Locked" : st === "correct" ? "\u2713 Correct" : st === "wrong" ? "\u2717 Wrong" : i === q?.correct ? "correct" : hidden ? "hidden" : "";
                return (
                  <button
                    key={i}
                    type="button"
                    data-state={st}
                    data-hidden={hidden}
                    aria-label={`${LETTERS[i]}: ${a}${mark ? `, ${mark}` : ""}`}
                    disabled={!(p === "answers" || p === "locked") || state.eliminated[i]}
                    onClick={() => act("select", { index: i })}
                    className="answer-tile flex items-center gap-2.5 rounded-control border border-line bg-inset px-3 py-2.5 text-left text-[14px] transition-[background-color,opacity,scale] duration-150 ease-out enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:cursor-not-allowed"
                  >
                    <span className="answer-letter w-4 font-semibold text-orange" aria-hidden="true">{LETTERS[i]}</span>
                    <span className="min-w-0 flex-1 truncate">{a}</span>
                    <span className="shrink-0 text-[11px] font-medium opacity-80" aria-hidden="true">{mark}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="lg" variant="accent" disabled={!state.contestant || p === "won" || p === "locked"} onClick={() => act("showQuestion")}>Show question<Kbd>Q</Kbd></Button>
              <Button size="lg" disabled={!canReveal} onClick={() => act("revealAnswer")}>Reveal next answer<Kbd>R</Kbd></Button>
              <Button size="lg" disabled={!canReveal} onClick={() => act("revealAll")}>Reveal all<Kbd>A</Kbd></Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="lg" variant="warning" disabled={p !== "locked"} onClick={() => act("reveal")}>Reveal result<Kbd>Enter</Kbd></Button>
              <Button size="lg" disabled={p !== "locked"} onClick={() => act("deselect")}>Unlock answer<Kbd>Esc</Kbd></Button>
              <Button size="lg" variant="success" disabled={!(p === "correct" || p === "wrong" || p === "intro")} onClick={() => act("next")}>{nextLabel}<Kbd>N</Kbd></Button>
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">Click an answer (or press 1–4) to lock it as the final answer, then reveal. A wrong answer greys that option and the same contestant goes again; a right one sends them out and moves the ladder up.</p>
          </Card>

          <Card title="Lifelines">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LIFELINES.map((ll) => {
                const used = state.lifelines[ll.key];
                const enabled = !used && (ll.key === "swap" ? p === "question" || p === "answers" : p === "answers");
                const active = state.activeLifeline === ll.key;
                return (
                  <button
                    key={ll.key}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={active}
                    onClick={() => (ll.key === "swap" ? confirm("Swap this question for the next spare?") && act("lifelineSwap") : act(ll.key === "fifty" ? "lifelineFifty" : ll.key === "chat" ? "lifelineChat" : "lifelinePhone"))}
                    className={`flex flex-col items-center gap-1.5 rounded-control border border-line bg-inset p-3 text-[13px] font-medium transition-[background-color,opacity,scale] duration-150 ease-out enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:opacity-50 ${active ? "ring-2 ring-accent" : ""}`}
                  >
                    <img src={ll.icon} alt="" className={`h-10 w-14 object-contain ${used ? "grayscale" : ""}`} />
                    <span className={used ? "line-through" : ""}>{ll.label}{used ? " (used)" : ""}</span>
                  </button>
                );
              })}
            </div>
            {state.activeLifeline === "chat" && (
              <div className="mt-3 rounded-control bg-inset p-3">
                <p className="mb-2 text-[13px] text-ink-2">Run a Twitch poll, then type the votes or percentages:</p>
                <div className="flex flex-wrap items-center gap-2">
                  {LETTERS.map((L, i) => (
                    <label key={L} className="flex items-center gap-1 text-[13px]">
                      {L}
                      <Field type="number" min={0} className="w-20 tabular-nums" aria-label={`Votes for ${L}`} value={pollVotes[i]} onChange={(e) => setPollVotes(pollVotes.map((v, k) => (k === i ? e.target.value : v)))} />
                    </label>
                  ))}
                  <Button variant="accent" onClick={() => act("setPoll", { votes: pollVotes.map(Number) })}>Show results</Button>
                  <Button onClick={() => act("closeLifeline")}>Close poll</Button>
                </div>
              </div>
            )}
            {state.activeLifeline === "phone" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-inset p-3">
                <Button variant="accent" disabled={Boolean(state.phoneEndsAt)} onClick={() => act("startPhoneTimer")}>Start 30s timer</Button>
                <Button onClick={() => act("closeLifeline")}>Hang up</Button>
                <span className="text-[13px] text-ink-2">Host drags the friend into the call; start the clock when they're ready.</span>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Show preview">
            <div ref={previewWrap} className="relative aspect-video w-full overflow-hidden rounded-control bg-black">
              <iframe className="preview-frame" src="/show?preview=1" title="Show screen preview" style={{ transform: `scale(${previewScale})` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => act("playCue", { name: "main_theme" })}>Play theme</Button>
              <Button size="sm" onClick={() => act("playCue", { name: "stop" })}>Stop all sound</Button>
              <Button size="sm" variant="danger" className="ml-auto" onClick={() => confirm("Reset the whole game? Questions and ladder are kept; contestant, tier and winners are cleared.") && act("resetGame")}>Reset game</Button>
            </div>
          </Card>

          {winners.length > 0 && (
            <Card title="Cleared so far">
              <TaskRows variant="List" rows={winners} labels={{ completed: "Out" }} className="max-w-none" />
            </Card>
          )}

          <Card
            title="Prize ladder"
            action={<Button size="xs" variant="accent" disabled={!editLadder} onClick={() => act("setLadder", { ladder }).then((ok) => { if (ok) { setEditLadder(null); say("Ladder saved"); } })}>Save ladder</Button>}
          >
            <div className="max-h-72 overflow-auto overscroll-contain rounded-control shadow-hairline">
              <GlideMenu rowSelector="tr">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-wide text-ink-3">
                    <tr><th className="primitive-table-cell w-10">#</th><th className="primitive-table-cell">Prize</th><th className="primitive-table-cell">Note (top only)</th><th className="primitive-table-cell w-14">Safe</th></tr>
                  </thead>
                  <tbody>
                    {ladder.map((t, i) => (
                      <tr key={i} className={`border-t border-line ${i === state.tier ? "bg-accent-tint" : ""}`}>
                        <td className="primitive-table-cell font-medium tabular-nums text-orange">{i + 1}</td>
                        <td className="primitive-table-cell"><Field className="w-full" aria-label={`Prize for tier ${i + 1}`} value={t.label} onChange={(e) => setEditLadder(ladder.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} /></td>
                        <td className="primitive-table-cell">{i === TIERS - 1 && <Field className="w-full" aria-label="Note for top tier" value={t.note ?? ""} onChange={(e) => setEditLadder(ladder.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))} />}</td>
                        <td className="primitive-table-cell"><input type="checkbox" className="accent-accent" aria-label={`Tier ${i + 1} is a safe haven`} checked={t.milestone} onChange={(e) => setEditLadder(ladder.map((x, k) => (k === i ? { ...x, milestone: e.target.checked } : x)))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlideMenu>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <label htmlFor="jump-tier" className="text-ink-2">Jump to tier</label>
              <select id="jump-tier" className="h-8 rounded-control bg-field px-2 text-[13px] shadow-inset-field" value={jumpTier} onChange={(e) => setJumpTier(Number(e.target.value))}>
                {state.ladder.map((t, i) => <option key={i} value={i}>{i + 1} — {t.label}</option>)}
              </select>
              <Button size="sm" onClick={() => act("setTier", { tier: jumpTier })}>Go</Button>
            </div>
          </Card>

          <Card
            title="Questions"
            action={<Button size="xs" variant="accent" disabled={!editQuestions} onClick={() => act("setQuestions", { questions }).then((ok) => { if (ok) { setEditQuestions(null); say("Questions saved"); } })}>Save questions</Button>}
          >
            <div className="flex flex-wrap gap-2">
              <Field className="min-w-0 flex-1" placeholder="Google Sheets link (shared as anyone-with-link)" aria-label="Google Sheets link" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
              <Button size="sm" onClick={() => doImport("/api/import-sheet", { url: sheetUrl })}>Import from sheet</Button>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[13px] text-ink-2">Paste CSV instead</summary>
              <textarea className="mt-2 min-h-20 w-full rounded-control bg-field p-2 font-mono text-[12px] shadow-inset-field" aria-label="CSV text" placeholder="question, A) …, B) …, C) …, D) …, correct letter (optional)" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
              <Button size="sm" className="mt-2" onClick={() => doImport("/api/parse-csv", { csv: csvText })}>Import pasted CSV</Button>
            </details>
            <p className="my-3 text-[12.5px] text-ink-3">Rows 1–20 are the ladder in order; anything after row 20 is a spare used by Swap Question. Pick the correct answer with the radio button. {questions.length} questions, {Math.max(0, questions.length - TIERS)} spare.</p>
            <div className="max-h-[520px] overflow-auto overscroll-contain rounded-control shadow-hairline">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-wide text-ink-3">
                  <tr><th className="primitive-table-cell w-10">#</th><th className="primitive-table-cell">Question</th>{LETTERS.map((L) => <th key={L} className="primitive-table-cell">{L}</th>)}<th className="primitive-table-cell w-24"></th></tr>
                </thead>
                <tbody>
                  {questions.map((row, i) => {
                    const rowName = i >= TIERS ? `spare ${i - TIERS + 1}` : `question ${i + 1}`;
                    return (
                      <tr key={i} className={`border-t border-line align-middle ${i === state.tier ? "bg-accent-tint" : ""}`}>
                        <td className="primitive-table-cell tabular-nums text-ink-3">{i >= TIERS ? `S${i - TIERS + 1}` : i + 1}</td>
                        <td className="primitive-table-cell"><Field className="w-full" aria-label={`Text of ${rowName}`} value={row.text} onChange={(e) => updateQuestion(i, { text: e.target.value })} /></td>
                        {LETTERS.map((L, k) => (
                          <td key={L} className="primitive-table-cell">
                            <span className="flex items-center gap-1">
                              <input type="radio" className="accent-green" name={`correct-${i}`} aria-label={`${L} is correct for ${rowName}`} checked={row.correct === k} onChange={() => updateQuestion(i, { correct: k })} />
                              <Field className="w-full" aria-label={`Answer ${L} of ${rowName}`} value={row.answers[k]} onChange={(e) => updateQuestion(i, { answers: row.answers.map((a, j) => (j === k ? e.target.value : a)) })} />
                            </span>
                          </td>
                        ))}
                        <td className="primitive-table-cell whitespace-nowrap">
                          <Button size="xs" variant="quiet" aria-label={`Move ${rowName} up`} onClick={() => moveQuestion(i, -1)}>↑</Button>
                          <Button size="xs" variant="quiet" aria-label={`Move ${rowName} down`} onClick={() => moveQuestion(i, 1)}>↓</Button>
                          <Button size="xs" variant="quiet" aria-label={`Delete ${rowName}`} onClick={() => setEditQuestions(questions.filter((_, k) => k !== i))}>×</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button size="sm" className="mt-3" onClick={() => setEditQuestions([...questions, { text: "", answers: ["", "", "", ""], correct: 0 }])}>Add row</Button>
          </Card>
        </div>
      </main>

      <div role="status" aria-live="polite" className={`fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-canvas shadow-overlay transition-opacity duration-150 ${toast ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {toast}
      </div>
    </div>
  );
}
