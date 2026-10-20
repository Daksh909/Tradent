import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getForwardTest } from "@tradent/agent";
import { LISTING_MIN_TRADES, LISTING_MIN_TRADING_DAYS } from "@tradent/core";
import { setAgentKilled } from "@/app/actions";
import { DecisionCard } from "@/components/decision-card";
import { DeveloperOnly } from "@/components/developer-only";
import { EquityChart } from "@/components/equity-chart";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MODEL_LABELS, cadenceLabel, formatCost, formatPct, formatSignedPct, formatUsd, signClass } from "@/lib/format";
import { TestStatus } from "@/components/test-status";

export const metadata: Metadata = { title: "Forward test" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ versionId: string }> }) {
  return (
    <DeveloperOnly>
      <Detail versionId={(await params).versionId} />
    </DeveloperOnly>
  );
}

async function Detail({ versionId }: { versionId: string }) {
  const user = (await getCurrentUser())!;
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) notFound();
  const detail = await getForwardTest(getDb(), user.id, versionId);
  if (!detail) notFound();
  const { test: t, dailyMetrics, decisions, chainBreak } = detail;

  return (
    <>
      <PageHeader title={`${t.agentName} v${t.version}`} description={`${MODEL_LABELS[t.model]} · ${cadenceLabel(t.cadenceMinutes)} · ${t.decisions} decisions`}>
        <div className="flex items-center gap-2">
          <TestStatus t={t} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/trading?version=${t.versionId}`}>Open in Trading</Link>
          </Button>
          <form action={setAgentKilled.bind(null, t.agentId, !t.killed)}>
            <Button type="submit" size="sm" variant={t.killed ? "default" : "destructive"} data-testid="kill-switch">
              {t.killed ? "Restart agent" : "Stop agent"}
            </Button>
          </form>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Equity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm tabular-nums sm:grid-cols-4">
              <Stat label="Return">
                <span className={signClass(t.totalReturn)}>{formatSignedPct(t.totalReturn)}</span>
              </Stat>
              <Stat label="Equity">{t.equity === null ? "–" : formatUsd(t.equity, true)}</Stat>
              <Stat label="Max drawdown">{formatPct(t.maxDrawdown, 2)}</Stat>
              <Stat label="AI spend">{formatCost(t.aiSpendUsd)}</Stat>
            </dl>
            <EquityChart points={dailyMetrics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Listing progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm tabular-nums">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Trading days</span>
                <span>
                  {t.tradingDays} of {LISTING_MIN_TRADING_DAYS}
                </span>
              </div>
              <ProgressBar value={t.progress.days} label="Trading days toward listing" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Trades</span>
                <span>
                  {t.trades} of {LISTING_MIN_TRADES}
                </span>
              </div>
              <ProgressBar value={t.progress.trades} label="Trades toward listing" />
            </div>
            <p className={chainBreak === -1 ? "text-gain" : "text-loss"} data-testid="chain-status">
              {chainBreak === -1
                ? `Decision log verified: all ${t.decisions} entries' hashes chain correctly.`
                : `Decision log check failed at entry ${chainBreak + 1}. The record may have been altered.`}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily metrics</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">Written after each market close.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table className="tabular-nums" data-testid="daily-metrics">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Equity</TableHead>
                      <TableHead className="text-right">Day</TableHead>
                      <TableHead className="text-right">Max drawdown</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...dailyMetrics].reverse().map((m) => (
                      <TableRow key={m.date}>
                        <TableCell>{m.date}</TableCell>
                        <TableCell className="text-right">{formatUsd(m.equity)}</TableCell>
                        <TableCell className={`text-right ${signClass(m.dailyReturn)}`}>{formatSignedPct(m.dailyReturn)}</TableCell>
                        <TableCell className="text-right">{formatPct(m.maxDrawdown, 2)}</TableCell>
                        <TableCell className="text-right">{m.tradeCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision log</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto">
            {decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions yet.</p>
            ) : (
              decisions.map((d) => <DecisionCard key={d.id} d={d} tokens={{ input: d.inputTokens, output: d.outputTokens }} />)
            )}
          </CardContent>
        </Card>
      </div>
    </>
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
