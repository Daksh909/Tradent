import type { Metadata } from "next";
import Link from "next/link";
import { getPortfolio, scalePositions, type FollowView } from "@tradent/agent";
import type { Position } from "@tradent/broker";
import { EquityChart } from "@/components/equity-chart";
import { UnfollowButton } from "@/components/follow-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBroker } from "@/lib/broker";
import { getDb } from "@/lib/db";
import { formatDateTime, formatSignedPct, formatUsd, signClass } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Portfolio" };
export const dynamic = "force-dynamic";

const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const ret = (v: FollowView) => v.value / v.virtualAmount - 1;

export default async function Page() {
  const user = (await getCurrentUser())!;
  const p = await getPortfolio(getDb(), user.id);
  const broker = getBroker();

  // The agents' holdings, scaled to this investor; read live from each paper account at the broker.
  const positions = new Map<string, Position[] | null>();
  await Promise.all(
    p.active.map(async (v) => {
      if (!broker || !v.externalAccountId) return positions.set(v.followId, null);
      try {
        positions.set(v.followId, scalePositions(await broker.getPositions(v.externalAccountId), v.scale));
      } catch (e) {
        console.error("Positions unavailable:", e);
        positions.set(v.followId, null);
      }
    }),
  );

  return (
    <>
      <PageHeader title="Portfolio" description="Agents you paper-follow with virtual money. Each follow is a scaled copy of the agent's paper account at the broker." />
      {p.active.length === 0 && p.stopped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="portfolio-empty">
            You don&apos;t follow any agents yet.{" "}
            <Link href="/library" className="underline underline-offset-4">
              Browse the Library
            </Link>{" "}
            and press Follow on paper.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Virtual value" value={formatUsd(p.value)} testId="portfolio-value" />
            <Stat label="Virtual amount followed" value={formatUsd(p.invested)} />
            <Stat label="Return" value={formatSignedPct(p.invested ? p.value / p.invested - 1 : null)} className={signClass(p.invested ? p.value - p.invested : null)} />
          </div>

          {p.active.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Combined value at each close</CardTitle>
              </CardHeader>
              <CardContent>
                <EquityChart points={p.curve.map((pt) => ({ date: pt.date, equity: pt.value }))} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Following</CardTitle>
            </CardHeader>
            <CardContent>
              {p.active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active follows.</p>
              ) : (
                <FollowTable rows={p.active} active />
              )}
            </CardContent>
          </Card>

          {p.active.map((v) => (
            <Card key={v.followId} data-testid="follow-detail">
              <CardHeader>
                <CardTitle>
                  {v.agentName} v{v.version}: your share
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium">Positions</h3>
                  <PositionsTable positions={positions.get(v.followId) ?? null} />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">Mirrored trades</h3>
                  {v.fills.length === 0 ? (
                    <p className="text-sm text-muted-foreground">The agent hasn&apos;t traded since you followed it.</p>
                  ) : (
                    <Table className="tabular-nums" data-testid="mirrored-fills">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead className="text-right">Your qty</TableHead>
                          <TableHead className="text-right">Fill price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {v.fills.map((f) => (
                          <TableRow key={f.fillId}>
                            <TableCell>{formatDateTime(f.filledAt)}</TableCell>
                            <TableCell className="capitalize">{f.side}</TableCell>
                            <TableCell>{f.symbol}</TableCell>
                            <TableCell className="text-right">{qty(f.quantity)}</TableCell>
                            <TableCell className="text-right">{formatUsd(f.price)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Each row is one of the agent&apos;s broker fills, at the broker&apos;s price, with the quantity scaled to your amount.</p>
                </div>
              </CardContent>
            </Card>
          ))}

          {p.stopped.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Stopped follows</CardTitle>
              </CardHeader>
              <CardContent>
                <FollowTable rows={p.stopped} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, className, testId }: { label: string; value: string; className?: string; testId?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${className ?? ""}`} data-testid={testId}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function FollowTable({ rows, active }: { rows: FollowView[]; active?: boolean }) {
  return (
    <Table className="tabular-nums" data-testid={active ? "active-follows" : "stopped-follows"}>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>{active ? "Since" : "Followed"}</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">{active ? "Value at last close" : "Value at stop"}</TableHead>
          <TableHead className="text-right">Return</TableHead>
          {active && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((v) => (
          <TableRow key={v.followId}>
            <TableCell>
              <Link href={`/agents/${v.agentId}?version=${v.versionId}`} className="underline-offset-4 hover:underline">
                {v.agentName} v{v.version}
              </Link>
            </TableCell>
            <TableCell>
              {formatDateTime(v.startedAt)}
              {v.stoppedAt && ` to ${formatDateTime(v.stoppedAt)}`}
            </TableCell>
            <TableCell className="text-right">{formatUsd(v.virtualAmount)}</TableCell>
            <TableCell className="text-right">{formatUsd(v.value)}</TableCell>
            <TableCell className={`text-right ${signClass(ret(v))}`}>{formatSignedPct(ret(v))}</TableCell>
            {active && (
              <TableCell className="text-right">
                <UnfollowButton followId={v.followId} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PositionsTable({ positions }: { positions: Position[] | null }) {
  if (positions === null) return <p className="text-sm text-muted-foreground">Positions are unavailable right now: the broker can&apos;t be read.</p>;
  if (positions.length === 0) return <p className="text-sm text-muted-foreground">The agent holds no positions; your share is all cash.</p>;
  return (
    <>
      <Table className="tabular-nums" data-testid="scaled-positions">
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Your qty</TableHead>
            <TableHead className="text-right">Market value</TableHead>
            <TableHead className="text-right">Unrealized P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos) => (
            <TableRow key={pos.symbol}>
              <TableCell>{pos.symbol}</TableCell>
              <TableCell className="text-right">{qty(pos.quantity)}</TableCell>
              <TableCell className="text-right">{formatUsd(pos.marketValue)}</TableCell>
              <TableCell className={`text-right ${signClass(pos.unrealizedPl)}`}>{formatUsd(pos.unrealizedPl)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Market values come from the agent&apos;s Alpaca paper account (sandbox).</p>
    </>
  );
}
