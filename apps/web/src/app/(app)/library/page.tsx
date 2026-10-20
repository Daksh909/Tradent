import type { Metadata } from "next";
import Link from "next/link";
import { listLibraryAgents, listLibraryStrategies, type LibraryFilters } from "@tradent/agent";
import type { AgentModel } from "@tradent/core";
import { PageHeader } from "@/components/page-header";
import { RecordBadges } from "@/components/record-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/lib/db";
import { MODEL_LABELS, cadenceLabel, formatPct, formatSignedPct, signClass } from "@/lib/format";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

const STRATEGY_TYPES: Record<string, string> = {
  entry_rule: "Entry rule",
  exit_rule: "Exit rule",
  signal: "Signal",
  tradingview_alert: "TradingView alert",
  tool_setup: "Tool setup",
};

type Search = { tab?: string; model?: string; cadence?: string; instrument?: string };

function parseFilters(q: Search): LibraryFilters {
  return {
    model: q.model && q.model in MODEL_LABELS ? (q.model as AgentModel) : undefined,
    cadenceMinutes: q.cadence && /^\d+$/.test(q.cadence) ? Number(q.cadence) : undefined,
    instrument: q.instrument === "equity" || q.instrument === "option" ? q.instrument : undefined,
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const db = getDb();
  const filters = parseFilters(q);
  const [all, strategies] = await Promise.all([listLibraryAgents(db), listLibraryStrategies(db)]);
  const agents = await listLibraryAgents(db, filters);
  const cadences = [...new Set(all.map((a) => a.cadenceMinutes))].sort((a, b) => a - b);
  const filtered = Boolean(filters.model || filters.cadenceMinutes || filters.instrument);

  return (
    <>
      <PageHeader title="Library" description="Agents and strategies you can follow or build on. Every record is a paper forward test." />
      <Tabs defaultValue={q.tab === "strategies" ? "strategies" : "agents"}>
        <TabsList>
          <TabsTrigger value="agents">Agents ({all.length})</TabsTrigger>
          <TabsTrigger value="strategies">Strategies ({strategies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4 pt-2">
          <form className="flex flex-wrap items-end gap-3 text-sm" data-testid="library-filters">
            <FilterSelect name="instrument" label="Instrument" value={q.instrument} options={[["equity", "Equities"], ["option", "Options"]]} />
            <FilterSelect name="model" label="Model" value={q.model} options={Object.entries(MODEL_LABELS)} />
            <FilterSelect name="cadence" label="Cadence" value={q.cadence} options={cadences.map((c) => [String(c), cadenceLabel(c)])} />
            <Button type="submit" size="sm" variant="secondary">
              Apply
            </Button>
            {filtered && (
              <Button asChild size="sm" variant="ghost">
                <Link href="/library">Clear</Link>
              </Button>
            )}
          </form>

          {agents.length === 0 ? (
            <Empty>
              {filtered
                ? "No listed agent matches these filters."
                : "No agent is listed yet. An agent is listed after 30 trading days and at least 20 trades of forward testing."}
            </Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((a) => (
                <Link key={a.agentId} href={`/agents/${a.agentId}`} className="group" data-testid="agent-card">
                  <Card className="h-full transition-colors group-hover:border-foreground/30">
                    <CardHeader>
                      <CardTitle>
                        {a.agentName} <span className="font-normal text-muted-foreground">v{a.version}</span>
                      </CardTitle>
                      <CardDescription>by {a.ownerName}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="line-clamp-3 text-sm">{a.publicSummary}</p>
                      <dl className="grid grid-cols-4 gap-2 text-sm tabular-nums">
                        <Stat label="Return">
                          <span className={signClass(a.totalReturn)}>{formatSignedPct(a.totalReturn, 1)}</span>
                        </Stat>
                        <Stat label="Max drawdown">{formatPct(a.maxDrawdown)}</Stat>
                        <Stat label="Trades">{a.trades}</Stat>
                        <Stat label="Days">{a.tradingDays}</Stat>
                      </dl>
                      <RecordBadges v={a} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="strategies" className="pt-2">
          {strategies.length === 0 ? (
            <Empty>No strategies yet. Developers publish strategies from Studio.</Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {strategies.map((st) => (
                <Card key={st.strategyId} data-testid="strategy-card">
                  <CardHeader>
                    <CardTitle>
                      {st.name} <span className="font-normal text-muted-foreground">v{st.latestVersion}</span>
                    </CardTitle>
                    <CardDescription>
                      {STRATEGY_TYPES[st.type] ?? st.type} · by {st.ownerName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>{st.publicDescription}</p>
                    <p className="text-muted-foreground">
                      {st.listedAgents.length === 0 ? "Not used by a listed agent yet." : "Used by "}
                      {st.listedAgents.map((a, i) => (
                        <span key={a.agentId}>
                          {i > 0 && ", "}
                          <Link href={`/agents/${a.agentId}`} className="text-foreground underline-offset-4 hover:underline">
                            {a.agentName}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-8 rounded-md border bg-background px-2">
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
