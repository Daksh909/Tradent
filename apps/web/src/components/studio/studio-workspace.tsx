"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ChatTurn, Draft, DraftStrategy, SmokeTestResult, StrategyType, StudioAgent } from "@tradent/agent";
import { blocksFrom, builderChat, saveStudioDraft, startStudioForwardTest, studioSmokeTest } from "@/app/(app)/studio/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cadenceText, StudioCanvas, type NodeKey } from "./studio-canvas";

export interface StudioProps {
  initialDraft: Draft;
  agents: StudioAgent[];
  /** Listed agents whose blocks can be combined into this one. */
  library: { versionId: string; label: string }[];
  smokeTests: { runId: string; startedAt: string; result: SmokeTestResult | null }[];
  /** Estimated AI dollars a month, by model and cadence. */
  costTable: Record<string, Record<number, number>>;
  cadences: number[];
  spentThisMonth: number;
  cap: number;
}

const TOOLS: [string, string][] = [
  ["get_quotes", "Quotes (IEX real-time)"],
  ["get_bars", "Price bars"],
  ["get_option_chain", "Option chain"],
  ["get_recent_fills", "Recent fills"],
];
const STRATEGY_TYPES: [StrategyType, string][] = [
  ["entry_rule", "Entry rule"],
  ["exit_rule", "Exit rule"],
  ["signal", "Signal"],
  ["tradingview_alert", "TradingView alert"],
  ["tool_setup", "Tool setup"],
];
const MODELS: [Draft["model"], string][] = [
  ["haiku", "Claude Haiku 5.5"],
  ["sonnet", "Claude Sonnet 5.5"],
  ["opus", "Claude Opus 5.5"],
];

// A save reopens the page on the saved version, which remounts this component; the notice carries over.
let carriedNotice: { tone: "ok" | "error"; text: string } | null = null;

const money = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export function StudioWorkspace(props: StudioProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(props.initialDraft);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<NodeKey>("agent");
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(() => {
    const n = carriedNotice;
    carriedNotice = null;
    return n;
  });
  const [smoke, setSmoke] = useState(props.smokeTests);
  const [pending, startTransition] = useTransition();

  const versions = props.agents.flatMap((a) => a.versions.map((v) => ({ ...v, agentId: a.agentId, name: a.name })));
  const base = versions.find((v) => v.versionId === draft.baseVersionId);
  const locked = Boolean(base?.lockedAt);
  const nextVersion = draft.agentId ? Math.max(0, ...versions.filter((v) => v.agentId === draft.agentId).map((v) => v.version)) + 1 : 1;
  const estimate = props.costTable[draft.model]?.[draft.cadenceMinutes] ?? 0;

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const updateStrategy = (i: number, patch: Partial<DraftStrategy>) => update({ strategies: draft.strategies.map((st, j) => (j === i ? { ...st, ...patch } : st)) });

  function send() {
    const text = message.trim();
    if (!text) return;
    const history: ChatTurn[] = [...chat, { role: "user", text }];
    setChat(history);
    setMessage("");
    startTransition(async () => {
      const { agentId: _a, baseVersionId: _b, parentVersionIds: _p, ...current } = draft;
      const res = await builderChat(history, chat.length || draft.instructions ? current : {});
      if (!res.ok) {
        setChat((c) => [...c, { role: "assistant", text: res.error }]);
        return;
      }
      setChat((c) => [...c, { role: "assistant", text: `${res.value.reply}\n\nAI cost: ${money(res.value.costUsd)}` }]);
      // Blocks taken from other agents stay; drafted blocks are replaced by the new draft's.
      const kept = draft.strategies.filter((st) => st.fromVersionId);
      update({ ...res.value.draft, strategies: [...kept, ...res.value.draft.strategies] });
    });
  }

  function save() {
    startTransition(async () => {
      const res = await saveStudioDraft(draft);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setDirty(false);
      carriedNotice = { tone: "ok", text: `Saved as version ${res.value.version}.` };
      setNotice(carriedNotice);
      router.replace(`/studio?version=${res.value.versionId}`);
      router.refresh();
    });
  }

  function startTest() {
    if (!draft.baseVersionId) return;
    if (!confirm(`Start the forward test for version ${base?.version}? The version is locked from then on; later edits become a new version.`)) return;
    startTransition(async () => {
      const res = await startStudioForwardTest(draft.baseVersionId!);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setNotice({ tone: "ok", text: "Forward test started. It runs on its own paper account during market hours." });
      router.refresh();
    });
  }

  function runSmoke() {
    if (!draft.baseVersionId) return;
    startTransition(async () => {
      const res = await studioSmokeTest(draft.baseVersionId!);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setSmoke((s) => [{ runId: res.value.runId, startedAt: new Date().toISOString(), result: res.value }, ...s]);
      setNotice(null);
    });
  }

  function combine(versionId: string) {
    if (!versionId) return;
    startTransition(async () => {
      const res = await blocksFrom(versionId);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      const b = res.value;
      const have = new Set(draft.strategies.map((st) => st.strategyVersionId).filter(Boolean));
      update({
        strategies: [...draft.strategies, ...b.strategies.filter((st) => !have.has(st.strategyVersionId))],
        tools: [...new Set([...draft.tools, ...b.tools])],
        parentVersionIds: [...new Set([...draft.parentVersionIds, versionId])],
      });
      setNotice({ tone: "ok", text: `Added the blocks and tools from ${b.name} v${b.version}. It's recorded as a parent.` });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={draft.baseVersionId ?? ""}
          onChange={(e) => router.push(e.target.value ? `/studio?version=${e.target.value}` : "/studio?new=1")}
          data-testid="version-picker"
        >
          <option value="">New agent</option>
          {props.agents.map((a) => (
            <optgroup key={a.agentId} label={a.name}>
              {a.versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {a.name} v{v.version}
                  {v.lockedAt ? " (forward testing)" : " (draft)"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {draft.parentVersionIds.length > 0 && <Badge variant="outline">{draft.parentVersionIds.length === 1 ? "1 parent" : `${draft.parentVersionIds.length} parents`}</Badge>}
        {locked && (
          <span className="text-sm text-muted-foreground" data-testid="locked-note">
            v{base?.version} is locked by its forward test; saving creates v{nextVersion}.
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={save} disabled={pending} data-testid="save-version">
            {locked || !draft.baseVersionId ? `Save as v${nextVersion}` : dirty ? `Save v${base?.version}` : "Saved"}
          </Button>
          <Button size="sm" onClick={startTest} disabled={pending || !draft.baseVersionId || locked || dirty} title={dirty ? "Save first" : undefined} data-testid="start-forward-test">
            Start forward test
          </Button>
        </div>
      </div>
      {notice && (
        <p className={`rounded-md border px-3 py-2 text-sm ${notice.tone === "error" ? "border-loss/50 text-loss" : "border-gain/40"}`} role="status" data-testid="studio-notice">
          {notice.text}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[18rem_1fr_20rem]">
        <section className="flex h-[32rem] flex-col rounded-lg border" aria-label="Chat builder">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Describe your strategy</h2>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" data-testid="builder-chat">
            {chat.length === 0 && (
              <p className="text-muted-foreground">
                Describe a manual strategy in plain words, for example &ldquo;Buy SPY when RSI(14) is under 30 and price is above the 200-day average; exit at +3% or after 5 days.&rdquo; Claude drafts the agent for you to edit.
              </p>
            )}
            {chat.map((t, i) => (
              <p key={i} className={`whitespace-pre-wrap rounded-md p-2 ${t.role === "user" ? "ml-6 bg-accent" : "mr-6 border"}`}>
                {t.text}
              </p>
            ))}
            {pending && chat[chat.length - 1]?.role === "user" && <p className="text-muted-foreground">Drafting…</p>}
          </div>
          <form
            className="flex gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe or refine…" aria-label="Message to the builder" />
            <Button type="submit" size="sm" disabled={pending || !message.trim()}>
              Send
            </Button>
          </form>
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            Uses Sonnet 5.5. AI used this month: {money(props.spentThisMonth)} of ${props.cap}.
          </p>
        </section>

        <section className="h-[32rem] overflow-hidden rounded-lg border" aria-label="Composer canvas">
          <StudioCanvas draft={draft} selected={selected} onSelect={setSelected} />
        </section>

        <section className="h-[32rem] space-y-3 overflow-y-auto rounded-lg border p-3 text-sm" aria-label="Block settings" data-testid="settings-pane">
          <Settings
            draft={draft}
            selected={selected}
            update={update}
            updateStrategy={updateStrategy}
            removeStrategy={(i) => {
              update({ strategies: draft.strategies.filter((_, j) => j !== i) });
              setSelected("agent");
            }}
            estimate={estimate}
            cadences={props.cadences}
          />
          <div className="space-y-2 border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                update({ strategies: [...draft.strategies, { name: "New strategy", type: "entry_rule", description: "" }] });
                setSelected(`strategy:${draft.strategies.length}`);
              }}
            >
              Add strategy block
            </Button>
            {props.library.length > 0 && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Combine: add blocks from a listed agent</span>
                <select className="h-8 w-full rounded-md border bg-background px-2" value="" onChange={(e) => combine(e.target.value)} data-testid="combine-picker">
                  <option value="">Pick an agent…</option>
                  {props.library.map((l) => (
                    <option key={l.versionId} value={l.versionId}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border p-3" aria-label="Smoke test" data-testid="smoke-test">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Smoke test</h2>
            <p className="text-xs text-muted-foreground">
              One decision on the latest market data against a scratch $100,000 account. Only you see it; it never sends orders or enters the trust record. Its AI cost counts toward your cap.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={runSmoke} disabled={pending || !draft.baseVersionId || dirty} title={dirty || !draft.baseVersionId ? "Save first" : undefined} data-testid="run-smoke-test">
            Run smoke test
          </Button>
        </div>
        {smoke.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {smoke.map((r) => (
              <li key={r.runId} className="rounded-md border p-2" data-testid="smoke-result">
                {!r.result ? (
                  <span className="text-muted-foreground">Didn&apos;t finish.</span>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{r.result.guardrailResult === "approved" ? "Orders would pass guardrails" : r.result.guardrailResult === "rejected" ? "Guardrails would reject" : "No trade"}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.startedAt).toLocaleString()} · {r.result.modelId} · {r.result.inputTokens + r.result.outputTokens} tokens · {money(r.result.costUsd)}
                      </span>
                    </div>
                    <p className="mt-1">{r.result.reasoning ?? "No reasoning returned."}</p>
                    {r.result.guardrailReasons.map((g) => (
                      <p key={g} className="text-loss">
                        {g}
                      </p>
                    ))}
                    <p className="text-xs text-muted-foreground">Tools used: {r.result.toolsUsed.join(", ") || "none"}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {base?.lockedAt && (
        <p className="text-sm">
          <Link href={`/forward-tests/${base.versionId}`} className="underline underline-offset-4">
            View v{base.version}&apos;s forward test
          </Link>
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Settings({
  draft,
  selected,
  update,
  updateStrategy,
  removeStrategy,
  estimate,
  cadences,
}: {
  draft: Draft;
  selected: NodeKey;
  update: (p: Partial<Draft>) => void;
  updateStrategy: (i: number, p: Partial<DraftStrategy>) => void;
  removeStrategy: (i: number) => void;
  estimate: number;
  cadences: number[];
}) {
  if (selected.startsWith("strategy:")) {
    const i = Number(selected.split(":")[1]);
    const st = draft.strategies[i];
    if (!st) return null;
    const shared = Boolean(st.strategyVersionId);
    return (
      <div className="space-y-3">
        <h3 className="font-semibold">Strategy block</h3>
        {shared && <p className="text-xs text-muted-foreground">A saved strategy{st.fromVersionId ? " from another agent" : ""}; it's reused as is.</p>}
        <Field label="Name">
          <Input value={st.name} disabled={shared} onChange={(e) => updateStrategy(i, { name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="h-9 w-full rounded-md border bg-background px-2" value={st.type} disabled={shared} onChange={(e) => updateStrategy(i, { type: e.target.value as StrategyType })}>
            {STRATEGY_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Public description">
          <textarea className="min-h-20 w-full rounded-md border bg-background p-2" value={st.description} disabled={shared} onChange={(e) => updateStrategy(i, { description: e.target.value })} />
        </Field>
        <Button size="sm" variant="ghost" className="text-loss" onClick={() => removeStrategy(i)}>
          Remove block
        </Button>
      </div>
    );
  }
  switch (selected) {
    case "data":
      return (
        <div className="space-y-3">
          <h3 className="font-semibold">Data sources</h3>
          {TOOLS.map(([t, label]) => (
            <label key={t} className="flex items-center gap-2">
              <input type="checkbox" checked={draft.tools.includes(t)} onChange={(e) => update({ tools: e.target.checked ? [...draft.tools, t] : draft.tools.filter((x) => x !== t) })} />
              {label}
            </label>
          ))}
          <Field label="Symbols the agent may trade (comma separated; empty means any)">
            <Input defaultValue={draft.symbols.join(", ")} key={draft.symbols.join(",")} onBlur={(e) => update({ symbols: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} data-testid="symbols-input" />
          </Field>
        </div>
      );
    case "tradingview":
      return (
        <div className="space-y-3">
          <h3 className="font-semibold">TradingView alerts</h3>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.tradingViewAlerts} onChange={(e) => update({ tradingViewAlerts: e.target.checked })} />
            Pass my TradingView alerts to the agent
          </label>
          <p className="text-xs text-muted-foreground">An alert never places an order by itself; it is shown to the agent at its next decision. The webhook address arrives with the TradingView step.</p>
        </div>
      );
    case "model":
      return (
        <div className="space-y-3">
          <h3 className="font-semibold">AI model</h3>
          <Field label="Model">
            <select className="h-9 w-full rounded-md border bg-background px-2" value={draft.model} onChange={(e) => update({ model: e.target.value as Draft["model"] })} data-testid="model-select">
              {MODELS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cadence during market hours">
            <select className="h-9 w-full rounded-md border bg-background px-2" value={draft.cadenceMinutes} onChange={(e) => update({ cadenceMinutes: Number(e.target.value) })}>
              {cadences.map((c) => (
                <option key={c} value={c}>
                  {cadenceText(c)}
                </option>
              ))}
            </select>
          </Field>
          <p className="rounded-md bg-muted p-2 text-xs" data-testid="cost-estimate">
            Estimated AI cost: about ${estimate.toFixed(2)} a month, assuming 8,000 input and 1,000 output tokens per decision.
          </p>
          <Field label="Instructions (private to you)">
            <textarea className="min-h-48 w-full rounded-md border bg-background p-2 font-mono text-xs" value={draft.instructions} onChange={(e) => update({ instructions: e.target.value })} data-testid="instructions" />
          </Field>
        </div>
      );
    case "risk":
      return (
        <div className="space-y-3">
          <h3 className="font-semibold">Risk limits</h3>
          <p className="text-xs text-muted-foreground">You can tighten the platform limits (20% per position, 5% daily loss), never loosen them. Guardrails check every order outside the model.</p>
          <Field label="Max per position, % of equity">
            <Input type="number" min={1} max={20} step={1} value={Math.round(draft.maxPositionPct * 100)} onChange={(e) => update({ maxPositionPct: Math.min(20, Number(e.target.value)) / 100 })} />
          </Field>
          <Field label="Daily loss stop, %">
            <Input type="number" min={0.5} max={5} step={0.5} value={Math.round(draft.maxDailyLossPct * 1000) / 10} onChange={(e) => update({ maxDailyLossPct: Math.min(5, Number(e.target.value)) / 100 })} />
          </Field>
        </div>
      );
    case "broker":
      return (
        <div className="space-y-2">
          <h3 className="font-semibold">Broker</h3>
          <p>Alpaca Broker API sandbox. Starting the forward test opens and funds this version&apos;s own paper account with $100,000 of simulated cash.</p>
          <p className="text-xs text-muted-foreground">Paper only: there is no live trading.</p>
        </div>
      );
    default:
      return (
        <div className="space-y-3">
          <h3 className="font-semibold">Agent</h3>
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} data-testid="agent-name" />
          </Field>
          <Field label="Public summary (investors see this)">
            <textarea className="min-h-24 w-full rounded-md border bg-background p-2" value={draft.publicSummary} onChange={(e) => update({ publicSummary: e.target.value })} data-testid="public-summary" />
          </Field>
          <p className="text-xs text-muted-foreground">Click a block on the canvas to change it.</p>
        </div>
      );
  }
}
