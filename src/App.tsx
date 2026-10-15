import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/atoms/Button";
import { ValuePill } from "@/components/atoms/ValuePill";
import GlideMenu from "@/components/primitives/GlideMenu";
import TaskRows from "@/components/primitives/TaskRows";
import LoadingState from "@/components/primitives/LoadingState";
import { connect, importQuestions, type GameState, type LifelineKey, type Phase, type Question, type Tier } from "@/lib/client";

const LETTERS = ["A", "B", "C", "D"] as const;
const TIERS = 20;

const PHASE_HINT: Record<Phase, string> = {
  idle: "Seat the next contestant to put their name card on screen.",
  intro: "Name card is up. Show the question when the host is ready.",
  question: "Question is on screen. Reveal the answers one at a time or all at once.",
  answers: "Wait for their final answer, then click it to lock it in.",
  locked: "Locked in. Reveal the result when the host says so.",
  correct: "Correct. Next sends them out and moves the ladder up.",
  wrong: "Wrong. Next lets the same contestant try again with that option gone.",
  won: "Someone hit the top. Reset to play again.",
};

const PHASE_TONE: Record<Phase, "neutral" | "green" | "orange" | "red" | "accent"> = {
  idle: "neutral", intro: "accent", question: "accent", answers: "accent", locked: "orange", correct: "green", wrong: "red", won: "green",
};

const LIFELINES: { key: LifelineKey; label: string; icon: string; action: string }[] = [
  { key: "fifty", label: "50:50", icon: "/img/fifty.png", action: "lifelineFifty" },
  { key: "chat", label: "Ask the Chat", icon: "/img/chat.png", action: "lifelineChat" },
  { key: "phone", label: "Phone a Friend", icon: "/img/phone.png", action: "lifelinePhone" },
  { key: "swap", label: "Swap Question", icon: "/img/swap.png", action: "lifelineSwap" },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">{children}</span>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card bg-surface p-5 shadow-card ${className}`}>{children}</section>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 rounded-control bg-field px-3 text-[13px] text-ink shadow-inset-field placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent ${props.className ?? ""}`}
    />
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] bg-black/10 px-1.5 py-0.5 font-mono text-[10px] leading-none opacity-80 dark:bg-white/10">{children}</kbd>;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  const seg = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <div className="relative grid rounded-control bg-field p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="tablist">
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[6px] bg-surface shadow-btn transition-transform duration-300 motion-reduce:transition-none"
        style={{ width: `calc((100% - 4px) / ${options.length})`, left: 2, transform: `translateX(${seg * 100}%)`, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
      {options.map((o, i) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={i === seg}
          onClick={() => onChange(o.key)}
          className={`relative z-10 flex h-7 items-center justify-center text-[12.5px] font-medium transition-colors duration-200 ${i === seg ? "text-ink" : "text-ink-3"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
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
  const [setupTab, setSetupTab] = useState<"ladder" | "questions" | "import">("ladder");
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const clientRef = useRef<ReturnType<typeof connect> | null>(null);
  const [key, setKeyState] = useState("");
  const previewWrap = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
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

  useLayoutEffect(() => {
    const el = previewWrap.current;
    if (!el) return;
    const measure = () => setPreviewWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [state === null]);

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
  const seat = () => act("seat", { name }).then((ok) => ok && setName(""));

  type Action = { label: string; action: string; kbd?: string; variant?: "accent" | "warning" | "success" | "secondary" | "danger"; disabled?: boolean };
  const primary: Action | null = !state ? null
    : p === "idle" ? null
    : p === "intro" ? { label: "Show question", action: "showQuestion", kbd: "Q", variant: "accent" }
    : p === "question" ? { label: "Reveal all answers", action: "revealAll", kbd: "A", variant: "accent" }
    : p === "answers" ? (state.revealed < 4 ? { label: "Reveal next answer", action: "revealAnswer", kbd: "R", variant: "accent" } : null)
    : p === "locked" ? { label: "Reveal result", action: "reveal", kbd: "Enter", variant: "warning" }
    : p === "correct" ? { label: state.tier >= TIERS - 1 ? "Crown the millionaire" : "Contestant out, ladder up", action: "next", kbd: "N", variant: "success" }
    : p === "wrong" ? { label: "Same contestant, try again", action: "next", kbd: "N", variant: "success" }
    : null;
  const secondary: Action[] = !state ? []
    : p === "question" ? [{ label: "Reveal one", action: "revealAnswer", kbd: "R" }]
    : p === "answers" && state.revealed < 4 ? [{ label: "Reveal all", action: "revealAll", kbd: "A" }]
    : p === "locked" ? [{ label: "Unlock", action: "deselect", kbd: "Esc" }]
    : [];

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
  const updateQuestion = (i: number, patch: Partial<Question>) => setEditQuestions(questions.map((x, k) => (k === i ? { ...x, ...patch } : x)));
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
      setSetupTab("questions");
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
  const tier = state.ladder[state.tier];

  return (
    <div className="min-h-dvh bg-page text-ink">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em]">Millionaire</h1>
            <span className="block text-[12px] text-ink-3">Control room</span>
          </div>
          <ValuePill tone={connected ? "green" : "red"}>{connected ? "Connected" : "Reconnecting"}</ValuePill>
          <ValuePill><span className="tabular-nums">{clients} {clients === 1 ? "screen" : "screens"} open</span></ValuePill>
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" className="accent-accent" checked={state.sound} onChange={(e) => act("setSound", { enabled: e.target.checked })} />
            Sound
          </label>
          <Field
            type="password"
            aria-label="Control key"
            placeholder="Control key"
            value={key}
            className={`w-40 ${keyBad ? "ring-2 ring-red" : ""}`}
            onChange={(e) => { setKeyState(e.target.value); clientRef.current?.setKey(e.target.value.trim()); setKeyBad(false); }}
          />
          <Button size="sm" variant="secondary" onClick={() => setDark((d) => !d)} aria-pressed={dark}>{dark ? "Light" : "Dark"}</Button>
          <Button size="sm" variant="secondary" onClick={() => window.open("/show", "_blank")}>Open show screen ↗</Button>
        </header>

        <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-6">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Eyebrow>On stage</Eyebrow>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="truncate text-[20px] font-semibold tracking-[-0.01em]">{state.contestant || "Nobody seated"}</span>
                    <ValuePill tone={PHASE_TONE[p]}><span className="uppercase tracking-wide">{p}</span></ValuePill>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-2">{PHASE_HINT[p]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Field
                    placeholder="Discord name"
                    aria-label="Contestant name"
                    value={name}
                    className="w-52"
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") seat(); }}
                  />
                  <Button variant={state.contestant ? "secondary" : "accent"} disabled={p === "won" || !name.trim()} onClick={seat}>Seat</Button>
                  {state.contestant && <Button variant="quiet" onClick={() => act("remove")}>Remove</Button>}
                </div>
              </div>

              <div className="my-5 border-t border-line" />

              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>Question {state.tier + 1} of {TIERS} · {tier?.label}{tier?.note ? ` · ${tier.note}` : ""}</Eyebrow>
                <span className="text-[12px] text-ink-3">{state.revealed}/4 answers shown</span>
              </div>
              <p className="mt-2 text-[18px] font-medium leading-snug text-ink">{q?.text ?? "No question at this tier"}</p>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(q?.answers ?? ["", "", "", ""]).map((a, i) => {
                  const st = answerState(i);
                  const hidden = i >= state.revealed;
                  const mark = st === "locked" ? "Locked" : st === "correct" ? "\u2713 Correct" : st === "wrong" ? "\u2717 Wrong" : st === "eliminated" ? "Out" : i === q?.correct ? "answer" : hidden ? "hidden" : "";
                  return (
                    <button
                      key={i}
                      type="button"
                      data-state={st}
                      aria-label={`${LETTERS[i]}: ${a}${mark ? `, ${mark}` : ""}`}
                      disabled={!(p === "answers" || p === "locked") || state.eliminated[i]}
                      onClick={() => act("select", { index: i })}
                      className={`answer-tile flex h-14 items-center gap-3 rounded-control bg-inset px-3 text-left text-[15px] shadow-hairline transition-[background-color,opacity,scale] duration-150 ease-out enabled:hover:bg-hover enabled:active:scale-[0.98] disabled:cursor-default ${hidden && !st ? "opacity-50" : ""}`}
                    >
                      <span className="answer-letter grid size-7 shrink-0 place-items-center rounded-full bg-surface text-[13px] font-semibold text-orange shadow-hairline" aria-hidden="true">{LETTERS[i]}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{a}</span>
                      <span className="shrink-0 text-[11.5px] font-medium opacity-70" aria-hidden="true">{mark}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {primary && <Button size="lg" variant={primary.variant} onClick={() => act(primary.action)}>{primary.label}{primary.kbd && <Kbd>{primary.kbd}</Kbd>}</Button>}
                {secondary.map((s) => <Button key={s.action} size="lg" variant="secondary" onClick={() => act(s.action)}>{s.label}{s.kbd && <Kbd>{s.kbd}</Kbd>}</Button>)}
                {p === "answers" && state.revealed === 4 && <span className="text-[13px] text-ink-2">Click their answer above, or press <Kbd>1</Kbd>–<Kbd>4</Kbd></span>}
                <Button size="sm" variant="quiet" className="ml-auto" onClick={() => act("undo")}>Undo <Kbd>Z</Kbd></Button>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <Eyebrow>Lifelines</Eyebrow>
                <span className="text-[12px] text-ink-3">Reset for every contestant</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
                      onClick={() => (ll.key === "swap" ? confirm("Swap this question for the next spare?") && act(ll.action) : act(ll.action))}
                      className={`flex flex-col items-center gap-2 rounded-control bg-inset px-3 py-4 text-[13px] font-medium shadow-hairline transition-[background-color,opacity,scale] duration-150 ease-out enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:cursor-default ${active ? "ring-2 ring-accent" : ""} ${!enabled && !used ? "opacity-50" : ""}`}
                    >
                      <img src={ll.icon} alt="" className={`h-10 w-14 object-contain ${used ? "opacity-40 grayscale" : ""}`} />
                      <span className={used ? "text-ink-3 line-through" : ""}>{ll.label}</span>
                      {used && <ValuePill tone="red">Used</ValuePill>}
                    </button>
                  );
                })}
              </div>
              {state.activeLifeline === "chat" && (
                <div className="mt-3 rounded-control bg-inset p-4 shadow-hairline">
                  <p className="text-[13px] text-ink-2">Run a Twitch poll, then type the votes or percentages.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {LETTERS.map((L, i) => (
                      <label key={L} className="flex items-center gap-1.5 text-[13px] font-medium">
                        {L}
                        <Field type="number" min={0} className="w-20 tabular-nums" aria-label={`Votes for ${L}`} value={pollVotes[i]} onChange={(e) => setPollVotes(pollVotes.map((v, k) => (k === i ? e.target.value : v)))} />
                      </label>
                    ))}
                    <Button variant="accent" onClick={() => act("setPoll", { votes: pollVotes.map(Number) })}>Show results</Button>
                    <Button variant="secondary" onClick={() => act("closeLifeline")}>Close poll</Button>
                  </div>
                </div>
              )}
              {state.activeLifeline === "phone" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-inset p-4 shadow-hairline">
                  <Button variant="accent" disabled={Boolean(state.phoneEndsAt)} onClick={() => act("startPhoneTimer")}>Start 30s timer</Button>
                  <Button variant="secondary" onClick={() => act("closeLifeline")}>Hang up</Button>
                  <span className="text-[13px] text-ink-2">Host drags the friend into the call; start the clock when they're ready.</span>
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card className="!p-0 overflow-hidden">
              <div ref={previewWrap} className="relative aspect-video w-full bg-black">
                <iframe className="preview-frame" src="/show?preview=1" title="Show screen preview" style={{ transform: `scale(${previewWidth / 1920})` }} />
              </div>
              <div className="flex flex-wrap items-center gap-2 p-3">
                <Eyebrow>Show screen</Eyebrow>
                <ValuePill tone="accent"><span className="tabular-nums">Tier {state.tier + 1}/{TIERS}</span></ValuePill>
                <span className="ml-auto flex gap-1.5">
                  <Button size="xs" variant="secondary" onClick={() => act("playCue", { name: "main_theme" })}>Theme</Button>
                  <Button size="xs" variant="secondary" onClick={() => act("playCue", { name: "stop" })}>Stop sound</Button>
                  <Button size="xs" variant="danger" onClick={() => confirm("Reset the whole game? Questions and ladder are kept; contestant, tier and winners are cleared.") && act("resetGame")}>Reset game</Button>
                </span>
              </div>
            </Card>

            {winners.length > 0 && (
              <Card>
                <Eyebrow>Cleared so far</Eyebrow>
                <div className="mt-3">
                  <TaskRows variant="List" rows={winners} labels={{ completed: "Out" }} className="max-w-none" />
                </div>
              </Card>
            )}

            <Card>
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Setup</Eyebrow>
                {setupTab === "ladder" && <Button size="xs" variant="accent" disabled={!editLadder} onClick={() => act("setLadder", { ladder }).then((ok) => { if (ok) { setEditLadder(null); say("Ladder saved"); } })}>Save ladder</Button>}
                {setupTab === "questions" && <Button size="xs" variant="accent" disabled={!editQuestions} onClick={() => act("setQuestions", { questions }).then((ok) => { if (ok) { setEditQuestions(null); say("Questions saved"); } })}>Save questions</Button>}
              </div>
              <div className="mt-3">
                <Segmented value={setupTab} onChange={setSetupTab} options={[{ key: "ladder", label: "Prize ladder" }, { key: "questions", label: `Questions (${questions.length})` }, { key: "import", label: "Import" }]} />
              </div>

              {setupTab === "ladder" && (
                <>
                  <div className="mt-3 max-h-[420px] overflow-auto overscroll-contain rounded-control shadow-hairline">
                    <GlideMenu rowSelector="tr">
                      <table className="w-full border-collapse text-[13px]">
                        <thead className="sticky top-0 z-10 bg-surface text-left text-[11px] uppercase tracking-wide text-ink-3">
                          <tr><th className="primitive-table-cell w-10">#</th><th className="primitive-table-cell">Prize</th><th className="primitive-table-cell w-16 text-center">Safe</th></tr>
                        </thead>
                        <tbody>
                          {ladder.map((t, i) => (
                            <tr key={i} className={`border-t border-line ${i === state.tier ? "bg-accent-tint" : ""}`}>
                              <td className="primitive-table-cell font-medium tabular-nums text-ink-3">{i + 1}</td>
                              <td className="primitive-table-cell">
                                <Field className="w-full" aria-label={`Prize for tier ${i + 1}`} value={t.label} onChange={(e) => setEditLadder(ladder.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                                {i === TIERS - 1 && <Field className="mt-1.5 w-full" aria-label="Note for top tier" placeholder="Note shown under the top prize" value={t.note ?? ""} onChange={(e) => setEditLadder(ladder.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))} />}
                              </td>
                              <td className="primitive-table-cell text-center"><input type="checkbox" className="accent-accent" aria-label={`Tier ${i + 1} is a safe haven`} checked={t.milestone} onChange={(e) => setEditLadder(ladder.map((x, k) => (k === i ? { ...x, milestone: e.target.checked } : x)))} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </GlideMenu>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                    <label htmlFor="jump-tier" className="text-ink-2">Jump to</label>
                    <select id="jump-tier" className="h-8 rounded-control bg-field px-2 text-[13px] shadow-inset-field" value={jumpTier} onChange={(e) => setJumpTier(Number(e.target.value))}>
                      {state.ladder.map((t, i) => <option key={i} value={i}>{i + 1} — {t.label}</option>)}
                    </select>
                    <Button size="sm" variant="secondary" onClick={() => act("setTier", { tier: jumpTier })}>Go</Button>
                  </div>
                </>
              )}

              {setupTab === "questions" && (
                <>
                  <p className="mt-3 text-[12.5px] text-ink-3">Rows 1–20 are the ladder in order; anything after is a spare for Swap Question. Tick the radio next to the correct answer.</p>
                  <div className="mt-3 max-h-[520px] overflow-auto overscroll-contain rounded-control shadow-hairline">
                    <div className="divide-y divide-line">
                      {questions.map((row, i) => {
                        const rowName = i >= TIERS ? `spare ${i - TIERS + 1}` : `question ${i + 1}`;
                        return (
                          <div key={i} className={`p-3 ${i === state.tier ? "bg-accent-tint" : ""}`}>
                            <div className="flex items-center gap-2">
                              <span className="w-7 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">{i >= TIERS ? `S${i - TIERS + 1}` : i + 1}</span>
                              <Field className="min-w-0 flex-1" aria-label={`Text of ${rowName}`} value={row.text} onChange={(e) => updateQuestion(i, { text: e.target.value })} />
                              <span className="flex shrink-0 gap-0.5">
                                <Button size="xs" variant="quiet" aria-label={`Move ${rowName} up`} onClick={() => moveQuestion(i, -1)}>↑</Button>
                                <Button size="xs" variant="quiet" aria-label={`Move ${rowName} down`} onClick={() => moveQuestion(i, 1)}>↓</Button>
                                <Button size="xs" variant="quiet" aria-label={`Delete ${rowName}`} onClick={() => setEditQuestions(questions.filter((_, k) => k !== i))}>×</Button>
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 pl-9">
                              {LETTERS.map((L, k) => (
                                <label key={L} className="flex items-center gap-2">
                                  <input type="radio" className="accent-green" name={`correct-${i}`} aria-label={`${L} is correct for ${rowName}`} checked={row.correct === k} onChange={() => updateQuestion(i, { correct: k })} />
                                  <span className="w-3 text-[11px] font-semibold text-ink-3">{L}</span>
                                  <Field className="min-w-0 flex-1" aria-label={`Answer ${L} of ${rowName}`} value={row.answers[k]} onChange={(e) => updateQuestion(i, { answers: row.answers.map((a, j) => (j === k ? e.target.value : a)) })} />
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditQuestions([...questions, { text: "", answers: ["", "", "", ""], correct: 0 }])}>Add question</Button>
                </>
              )}

              {setupTab === "import" && (
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <span className="mb-1.5 block text-[13px] font-medium">From a Google Sheet</span>
                    <div className="flex gap-2">
                      <Field className="min-w-0 flex-1" placeholder="Sheet link, shared as anyone-with-link" aria-label="Google Sheets link" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
                      <Button variant="accent" disabled={!sheetUrl} onClick={() => doImport("/api/import-sheet", { url: sheetUrl })}>Import</Button>
                    </div>
                    <p className="mt-1.5 text-[12px] text-ink-3">One row per question: the question, then four answers (an A) prefix is fine), then optionally the correct letter.</p>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-[13px] font-medium">Or paste CSV</span>
                    <textarea className="min-h-24 w-full rounded-control bg-field p-3 font-mono text-[12px] shadow-inset-field" aria-label="CSV text" placeholder="question, A) …, B) …, C) …, D) …, C" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
                    <Button className="mt-2" variant="secondary" disabled={!csvText.trim()} onClick={() => doImport("/api/parse-csv", { csv: csvText })}>Import pasted CSV</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </main>
      </div>

      <div role="status" aria-live="polite" className={`fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-canvas shadow-overlay transition-opacity duration-150 ${toast ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {toast}
      </div>
    </div>
  );
}
