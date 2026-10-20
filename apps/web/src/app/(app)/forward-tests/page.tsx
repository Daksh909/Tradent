import type { Metadata } from "next";
import Link from "next/link";
import { listForwardTests } from "@tradent/agent";
import { LISTING_MIN_TRADES, LISTING_MIN_TRADING_DAYS } from "@tradent/core";
import { DeveloperOnly } from "@/components/developer-only";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { TestStatus } from "@/components/test-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MODEL_LABELS, formatCost, formatPct, formatSignedPct, formatUsd, signClass } from "@/lib/format";

export const metadata: Metadata = { title: "Forward tests" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return (
    <DeveloperOnly>
      <PageHeader title="Forward tests" description={`Your agent versions on paper accounts. A version is listed after ${LISTING_MIN_TRADING_DAYS} trading days and ${LISTING_MIN_TRADES} trades.`} />
      <Tests />
    </DeveloperOnly>
  );
}

async function Tests() {
  const user = (await getCurrentUser())!;
  const tests = await listForwardTests(getDb(), user.id);
  if (tests.length === 0)
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No forward tests yet. Start one from Studio once a version is ready.</div>;

  return (
    <Table className="tabular-nums" data-testid="forward-tests-table">
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead className="w-44">Trading days</TableHead>
          <TableHead className="w-44">Trades</TableHead>
          <TableHead className="text-right">Equity</TableHead>
          <TableHead className="text-right">Return</TableHead>
          <TableHead className="text-right">Max drawdown</TableHead>
          <TableHead className="text-right">AI spend</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tests.map((t) => (
          <TableRow key={t.versionId}>
            <TableCell>
              <Link href={`/forward-tests/${t.versionId}`} className="font-medium underline-offset-4 hover:underline">
                {t.agentName} v{t.version}
              </Link>
              <div className="text-xs text-muted-foreground">{MODEL_LABELS[t.model]}</div>
            </TableCell>
            <TableCell>
              <div className="mb-1 text-xs">
                {t.tradingDays} of {LISTING_MIN_TRADING_DAYS}
              </div>
              <ProgressBar value={t.progress.days} label="Trading days toward listing" />
            </TableCell>
            <TableCell>
              <div className="mb-1 text-xs">
                {t.trades} of {LISTING_MIN_TRADES}
              </div>
              <ProgressBar value={t.progress.trades} label="Trades toward listing" />
            </TableCell>
            <TableCell className="text-right">{t.equity === null ? "–" : formatUsd(t.equity, true)}</TableCell>
            <TableCell className={`text-right ${signClass(t.totalReturn)}`}>{formatSignedPct(t.totalReturn)}</TableCell>
            <TableCell className="text-right">{formatPct(t.maxDrawdown, 2)}</TableCell>
            <TableCell className="text-right">{formatCost(t.aiSpendUsd)}</TableCell>
            <TableCell>
              <TestStatus t={t} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
