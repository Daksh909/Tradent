import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { activeFollow, DEFAULT_FOLLOW_USD, getAgentDetail, MAX_FOLLOW_USD, MIN_FOLLOW_USD } from "@tradent/agent";
import { EquityChart } from "@/components/equity-chart";
import { FollowButton } from "@/components/follow-button";
import { PageHeader } from "@/components/page-header";
import { RecordBadges } from "@/components/record-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatDateTime, formatPct, formatSignedPct, formatUsd, signClass } from "@/lib/format";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// Readable names for the agent tools defined in packages/agent.
const TOOL_LABELS: Record<string, string> = {
  get_quotes: "Quotes",
  get_bars: "Price bars",
  get_option_chain: "Option chain",
  get_recent_fills: "Recent fills",
  propose_orders: "Propose orders (checked by guardrails)",
};

type Params = { params: Promise<{ agentId: string }>; searchParams: Promise<{ version?: string }> };

async function load({ params, searchParams }: Params) {
  const { agentId } = await params;
  const { version } = await searchParams;
  if (!UUID.test(agentId)) return null;
  return getAgentDetail(getDb(), agentId, version && UUID.test(version) ? version : undefined);
}

export async function generateMetadata(p: Params): Promise<Metadata> {
  const detail = await load(p);
  return { title: detail?.name ?? "Agent" };
}

export default async function Page(p: Params) {
  const [detail, user] = await Promise.all([load(p), getCurrentUser()]);
  if (!detail) notFound();
  const v = detail.selected;

  return (
    <>
      <PageHeader title={detail.name} description={`by ${detail.ownerName}`}>
        <div className="flex gap-2">
          {user && v?.listed && !detail.killed && (
            <FollowButton
              versionId={v.versionId}
              agentName={detail.name}
              following={await activeFollow(getDb(), user.id, v.versionId)}
              min={MIN_FOLLOW_USD}
              max={MAX_FOLLOW_USD}
              suggested={DEFAULT_FOLLOW_USD}
            />
          )}
          {user?.isDeveloper && v?.listed && (
            <Button asChild variant="outline" data-testid="fork-button">
              <Link href={`/studio?fork=${v.versionId}`}>Fork in Studio</Link>
            </Button>
          )}
        </div>
      </PageHeader>

      {detail.killed && (
        <p className="mb-4 rounded-md border border-loss/40 bg-loss/10 p-3 text-sm">This agent was stopped by its developer or an admin. Its record is kept as it was.</p>
      )}

      <div className="mb-6 space-y-3">
        <p className="max-w-3xl">{detail.publicSummary}</p>
        {v && <RecordBadges v={v} />}
        {detail.versions.length > 1 && (
          <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Versions">
            {detail.versions.map((ver) => (
              <Link
                key={ver.versionId}
                href={`/agents/${detail.agentId}?version=${ver.versionId}`}
                className={`rounded-md border px-2 py-0.5 ${ver.versionId === v?.versionId ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                v{ver.version}
                {ver.listed ? "" : " (testing)"}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!v ? (
        <p className="text-sm text-muted-foreground">This agent has no versions yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Equity, v{v.version}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm tabular-nums sm:grid-cols-5">
                <Stat label="Return">
                  <span className={signClass(v.totalReturn)}>{formatSignedPct(v.totalReturn)}</span>
                </Stat>
                <Stat label="Equity">{v.equity === null ? "–" : formatUsd(v.equity, true)}</Stat>
                <Stat label="Max drawdown">{formatPct(v.maxDrawdown)}</Stat>
                <Stat label="Trades">{v.trades}</Stat>
                <Stat label="Trading days">{v.tradingDays}</Stat>
              </dl>
              <EquityChart points={detail.equityCurve} />
              <p className="text-xs text-muted-foreground">
                Paper forward test on a simulated broker account starting at {formatUsd(v.startingCash, true)}. Fills come from the broker sandbox.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Risk limits</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <Row label="Max per position">{formatPct(v.riskLimits.maxPositionPct, 0)} of equity</Row>
                  <Row label="Daily loss stop">{formatPct(v.riskLimits.maxDailyLossPct, 0)}</Row>
                  <Row label="Symbols">{v.riskLimits.allowedSymbols.length ? v.riskLimits.allowedSymbols.join(", ") : "Any equity or listed option"}</Row>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Strategies and tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {detail.strategies.length === 0 ? (
                  <p className="text-muted-foreground">No strategies attached.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.strategies.map((st) => (
                      <li key={st.strategyId}>
                        <span className="font-medium">
                          {st.name} v{st.version}
                        </span>
                        <p className="text-muted-foreground">{st.publicDescription}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {v.tools.map((t) => (
                    <Badge key={t} variant="outline">
                      {TOOL_LABELS[t] ?? t}
                    </Badge>
                  ))}
                </div>
                <p className="text-muted-foreground">Data: {v.dataSources.join(", ") || "none"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lineage</CardTitle>
              </CardHeader>
              <CardContent className="text-sm" data-testid="lineage">
                {detail.parents.length === 0 ? (
                  <p className="text-muted-foreground">Built from scratch, with no parent agents.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col gap-1">
                      {detail.parents.map((par) => (
                        <Link key={par.versionId} href={`/agents/${par.agentId}?version=${par.versionId}`} className="rounded-md border px-2 py-1 hover:bg-accent">
                          {par.agentName} v{par.version}
                        </Link>
                      ))}
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                    <span className="rounded-md border bg-accent px-2 py-1 font-medium">
                      {detail.name} v{v.version}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Trades</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.trades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trades yet.</p>
              ) : (
                <Table className="tabular-nums" data-testid="trades-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filled</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.trades.map((t) => (
                      <TableRow key={t.fillId} id={`decision-${t.decisionId}`}>
                        <TableCell>{formatDateTime(t.filledAt)}</TableCell>
                        <TableCell className={t.side === "buy" ? "text-gain" : "text-loss"}>{t.side === "buy" ? "Buy" : "Sell"}</TableCell>
                        <TableCell>
                          {t.symbol}
                          {t.instrument === "option" && <span className="text-muted-foreground"> (option)</span>}
                        </TableCell>
                        <TableCell className="text-right">{t.quantity}</TableCell>
                        <TableCell className="text-right">{formatUsd(t.price)}</TableCell>
                        <TableCell className="max-w-md whitespace-normal">
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">Decided {formatDateTime(t.decidedAt)}</summary>
                            <p className="mt-1">{t.reasoning ?? "No reasoning recorded."}</p>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
