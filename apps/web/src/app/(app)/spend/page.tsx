import type { Metadata } from "next";
import Link from "next/link";
import { getSpendSummary, listWebhooks } from "@tradent/agent";
import { DeveloperOnly } from "@/components/developer-only";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { WebhookRow } from "@/components/webhook-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MODEL_LABELS, formatCost } from "@/lib/format";

export const metadata: Metadata = { title: "Spend" };
export const dynamic = "force-dynamic";

const monthName = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Page() {
  return (
    <DeveloperOnly>
      <PageHeader title="Spend" description="Your AI spend this month against the free cap, and your agents&apos; TradingView webhooks." />
      <Summary />
    </DeveloperOnly>
  );
}

async function Summary() {
  const user = (await getCurrentUser())!;
  const [s, hooks] = await Promise.all([getSpendSummary(getDb(), user.id), listWebhooks(getDb(), user.id)]);
  const left = Math.max(0, s.cap - s.spent);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{monthName(s.month)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end justify-between gap-4 tabular-nums">
            <div>
              <div className="text-3xl font-bold" data-testid="spent">
                {formatCost(s.spent)}
              </div>
              <div className="text-sm text-muted-foreground">of ${s.cap} free AI use</div>
            </div>
            <div className="text-right text-sm">{formatCost(left)} left</div>
          </div>
          <ProgressBar value={Math.min(1, s.spent / s.cap)} label="AI spend against the monthly cap" />
          {s.atCap ? (
            <p className="rounded-md border border-loss/50 p-3 text-sm text-loss" data-testid="cap-reached">
              You&apos;ve reached this month&apos;s cap. Your agents skip their scheduled decisions, and the Studio builder and smoke tests are paused, until the month turns over (UTC).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">At the cap, your agents skip their scheduled decisions until next month. Their positions stay open.</p>
          )}
          <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums">
            <div>
              <dt className="text-xs text-muted-foreground">Forward-test decisions</dt>
              <dd className="font-medium">{formatCost(s.parts.forwardTests)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Smoke tests</dt>
              <dd className="font-medium">{formatCost(s.parts.smokeTests)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Studio chat builder</dt>
              <dd className="font-medium">{formatCost(s.parts.builder)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past months</CardTitle>
        </CardHeader>
        <CardContent>
          {s.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI use yet.</p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              {s.history.map((h) => (
                <li key={h.month} className="flex justify-between">
                  <span>{monthName(h.month)}</span>
                  <span>{formatCost(h.spent)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>By agent version, this month</CardTitle>
        </CardHeader>
        <CardContent>
          {s.byVersion.length === 0 ? (
            <p className="text-sm text-muted-foreground">No forward-test decisions this month.</p>
          ) : (
            <Table className="tabular-nums" data-testid="spend-by-version">
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Decisions</TableHead>
                  <TableHead className="text-right">AI cost</TableHead>
                  <TableHead className="text-right">Per decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.byVersion.map((v) => (
                  <TableRow key={v.versionId}>
                    <TableCell>
                      <Link href={`/forward-tests/${v.versionId}`} className="underline-offset-4 hover:underline">
                        {v.agentName} v{v.version}
                      </Link>
                    </TableCell>
                    <TableCell>{MODEL_LABELS[v.model]}</TableCell>
                    <TableCell className="text-right">{v.decisions}</TableCell>
                    <TableCell className="text-right">{formatCost(v.costUsd)}</TableCell>
                    <TableCell className="text-right">{formatCost(v.decisions ? v.costUsd / v.decisions : 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>TradingView webhooks</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">
            A TradingView alert sent to an agent&apos;s webhook is stored and handed to its next scheduled decision as an input. It never places an order by itself. The alert message can be JSON or plain text, up to 4 KB.
          </p>
          {hooks.length === 0 ? (
            <p className="mt-3 text-muted-foreground">Create an agent in Studio first.</p>
          ) : (
            <ul className="divide-y" data-testid="webhooks">
              {hooks.map((h) => (
                <WebhookRow key={h.agentId} agentId={h.agentId} agentName={h.agentName} exists={!!h.sourceId} pendingAlerts={h.pendingAlerts} alertsOn={h.alertsOn} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
