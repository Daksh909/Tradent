import type { Metadata } from "next";
import Link from "next/link";
import { getTradingData, tradingAgentOptions, type TradingData } from "@tradent/agent";
import type { BarTimeframe, BrokerAdapter } from "@tradent/broker";
import { AgentSwitcher } from "@/components/agent-switcher";
import { DecisionCard, describeOrder } from "@/components/decision-card";
import { PageHeader } from "@/components/page-header";
import { TradingChart, type ChartBar, type ChartMarker } from "@/components/trading-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBroker } from "@/lib/broker";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatDateTime, formatSignedPct, formatUsd, signClass } from "@/lib/format";

export const metadata: Metadata = { title: "Trading" };
export const dynamic = "force-dynamic";

// DEFAULT: how far back each chart interval looks.
const INTERVALS: { key: string; timeframe: BarTimeframe; days: number }[] = [
  { key: "1m", timeframe: "1Min", days: 2 },
  { key: "5m", timeframe: "5Min", days: 5 },
  { key: "15m", timeframe: "15Min", days: 10 },
  { key: "1h", timeframe: "1Hour", days: 30 },
  { key: "1D", timeframe: "1Day", days: 365 },
];

// Broker order statuses that are finished; anything else counts as open.
const DONE = new Set(["filled", "canceled", "expired", "rejected", "replaced", "done_for_day"]);

type Search = { version?: string; symbol?: string; tf?: string };
type Result<T> = { ok: true; value: T } | { ok: false; message: string };

async function attempt<T>(broker: BrokerAdapter | null, fn: (b: BrokerAdapter) => Promise<T>): Promise<Result<T>> {
  if (!broker) return { ok: false, message: "Market data is unavailable: the broker keys aren't configured." };
  try {
    return { ok: true, value: await fn(broker) };
  } catch (e) {
    // The broker's error stays in the server log; the page says only that data is missing.
    console.error("Trading page broker call failed:", e);
    return { ok: false, message: "The broker didn't answer, so this part is unavailable right now." };
  }
}

const seconds = (iso: string | Date) => Math.floor(new Date(iso).getTime() / 1000);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const user = (await getCurrentUser())!;
  const db = getDb();
  const options = await tradingAgentOptions(db, user.id);
  const versionId = options.find((o) => o.versionId === q.version)?.versionId ?? options[0]?.versionId;
  const data = versionId ? await getTradingData(db, user.id, versionId) : null;

  return (
    <>
      <PageHeader title="Trading" description="One agent's paper account: its chart, orders, fills and every decision.">
        {data && <AgentSwitcher options={options} value={data.version.versionId} />}
      </PageHeader>
      {!data ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No agent to show yet. Listed agents from the Library, and your own forward tests, appear here.
        </div>
      ) : (
        <Workspace data={data} q={q} />
      )}
    </>
  );
}

async function Workspace({ data, q }: { data: TradingData; q: Search }) {
  const broker = getBroker();
  const symbol = data.symbols.includes(q.symbol ?? "") ? q.symbol! : data.symbols[0]!;
  const interval = INTERVALS.find((i) => i.key === q.tf) ?? INTERVALS[3]!;
  const watch = data.symbols.slice(0, 10);
  const account = data.externalAccountId;

  const [quotes, daily, series, chain, positions, summary] = await Promise.all([
    attempt(broker, (b) => b.getLatestQuotes(watch)),
    attempt(broker, (b) => Promise.all(watch.map((s) => b.getBars(s, "1Day", { start: daysAgo(10) })))),
    attempt(broker, (b) => b.getBars(symbol, interval.timeframe, { start: daysAgo(interval.days) })),
    attempt(broker, (b) => b.getOptionChain(symbol)),
    account ? attempt(broker, (b) => b.getPositions(account)) : Promise.resolve<Result<never[]>>({ ok: true, value: [] }),
    account ? attempt(broker, (b) => b.getAccount(account)) : Promise.resolve<Result<null>>({ ok: true, value: null }),
  ]);

  const bars: ChartBar[] = series.ok ? series.value.bars.map((b) => ({ ...b, time: seconds(b.time) })) : [];
  const markers: ChartMarker[] = [];
  for (const f of data.fills.filter((f) => f.symbol === symbol && f.instrument === "equity")) {
    const t = seconds(f.filledAt);
    const bar = bars.findLast((b) => b.time <= t);
    if (bar) markers.push({ time: bar.time, price: f.price, side: f.side, quantity: f.quantity, decisionId: f.decisionId });
  }
  const href = (patch: Partial<Search>) => `/trading?${new URLSearchParams({ version: data.version.versionId, symbol, tf: interval.key, ...patch })}`;
  const openOrders = data.orders.filter((o) => !DONE.has(o.brokerStatus ?? ""));

  return (
    <div className="grid gap-4 xl:grid-cols-[14rem_1fr_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Watchlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm tabular-nums" data-testid="watchlist">
          {!quotes.ok && <p className="text-xs text-muted-foreground">{quotes.message}</p>}
          {watch.map((s) => {
            const quote = quotes.ok ? quotes.value.find((x) => x.symbol === s) : undefined;
            const closes = daily.ok ? daily.value.find((x) => x.symbol === s)?.bars.map((b) => b.close) : undefined;
            const last = quote ? (quote.bid + quote.ask) / 2 : undefined;
            const prev = closes && closes.length >= 2 ? closes[closes.length - 2]! : undefined;
            const change = last !== undefined && prev ? last / prev - 1 : null;
            return (
              <Link key={s} href={href({ symbol: s })} className={`block rounded-md px-2 py-1.5 hover:bg-accent ${s === symbol ? "bg-accent" : ""}`}>
                <div className="flex justify-between font-medium">
                  <span>{s}</span>
                  <span>{last === undefined ? "–" : formatUsd(last)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{quote?.source ?? "No quote"}</span>
                  <span className={signClass(change)}>{formatSignedPct(change)}</span>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardContent>
          <Tabs defaultValue="chart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="chart">Chart</TabsTrigger>
                <TabsTrigger value="options">Option chain</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-1 text-sm">
                <span className="mr-2 font-medium">{symbol}</span>
                {INTERVALS.map((i) => (
                  <Link key={i.key} href={href({ tf: i.key })} className={`rounded px-2 py-0.5 ${i.key === interval.key ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                    {i.key}
                  </Link>
                ))}
              </div>
            </div>
            <TabsContent value="chart" className="space-y-2">
              {series.ok && bars.length > 0 ? (
                <>
                  <TradingChart bars={bars} markers={markers} />
                  <p className="text-xs text-muted-foreground">
                    {series.value.source} · Arrows mark this agent&apos;s fills at their price; click one to open its decision.
                  </p>
                </>
              ) : (
                <p className="py-24 text-center text-sm text-muted-foreground" data-testid="chart-unavailable">
                  {series.ok ? `No ${interval.key} bars for ${symbol} in this period.` : series.message}
                </p>
              )}
            </TabsContent>
            <TabsContent value="options">
              {!chain.ok ? (
                <p className="py-24 text-center text-sm text-muted-foreground">{chain.message}</p>
              ) : chain.value.contracts.length === 0 ? (
                <p className="py-24 text-center text-sm text-muted-foreground">No option contracts returned for {symbol}.</p>
              ) : (
                <div className="max-h-[26rem] overflow-y-auto">
                  <Table className="tabular-nums">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract</TableHead>
                        <TableHead className="text-right">Bid</TableHead>
                        <TableHead className="text-right">Ask</TableHead>
                        <TableHead className="text-right">Last</TableHead>
                        <TableHead className="text-right">IV</TableHead>
                        <TableHead className="text-right">Delta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chain.value.contracts.slice(0, 200).map((c) => (
                        <TableRow key={c.contractSymbol}>
                          <TableCell>{c.contractSymbol}</TableCell>
                          <TableCell className="text-right">{c.bid === null ? "–" : formatUsd(c.bid)}</TableCell>
                          <TableCell className="text-right">{c.ask === null ? "–" : formatUsd(c.ask)}</TableCell>
                          <TableCell className="text-right">{c.lastPrice === null ? "–" : formatUsd(c.lastPrice)}</TableCell>
                          <TableCell className="text-right">{c.impliedVolatility === null ? "–" : `${(c.impliedVolatility * 100).toFixed(1)}%`}</TableCell>
                          <TableCell className="text-right">{c.delta === null ? "–" : c.delta.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="pt-2 text-xs text-muted-foreground">{chain.value.source}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="xl:row-span-2">
        <CardHeader>
          <CardTitle>Decisions</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[48rem] space-y-2 overflow-y-auto" data-testid="decision-feed">
          {data.decisions.length === 0 ? <p className="text-sm text-muted-foreground">No decisions yet.</p> : data.decisions.map((d) => <DecisionCard key={d.id} d={d} />)}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardContent>
          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Open orders ({openOrders.length})</TabsTrigger>
              <TabsTrigger value="fills">Fills ({data.fills.length})</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
            </TabsList>
            <TabsContent value="positions" className="pt-2">
              {!positions.ok ? (
                <p className="text-sm text-muted-foreground">{positions.message}</p>
              ) : positions.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open positions.</p>
              ) : (
                <Table className="tabular-nums">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Avg entry</TableHead>
                      <TableHead className="text-right">Market value</TableHead>
                      <TableHead className="text-right">Unrealized P&amp;L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.value.map((p) => (
                      <TableRow key={p.symbol}>
                        <TableCell>{p.symbol}</TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                        <TableCell className="text-right">{formatUsd(p.avgEntryPrice)}</TableCell>
                        <TableCell className="text-right">{formatUsd(p.marketValue)}</TableCell>
                        <TableCell className={`text-right ${signClass(p.unrealizedPl)}`}>
                          {p.unrealizedPl > 0 ? "+" : p.unrealizedPl < 0 ? "−" : ""}
                          {formatUsd(Math.abs(p.unrealizedPl))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="orders" className="pt-2">
              {openOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open orders.</p>
              ) : (
                <Table className="tabular-nums">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Placed</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>{formatDateTime(o.createdAt)}</TableCell>
                        <TableCell>{describeOrder({ ...o, limitPrice: o.limitPrice ?? undefined })}</TableCell>
                        <TableCell>{o.brokerStatus}</TableCell>
                        <TableCell>
                          <a href={`#decision-${o.decisionId}`} className="underline-offset-4 hover:underline">
                            View
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            <TabsContent value="fills" className="pt-2">
              {data.fills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fills yet. Fills come only from the broker.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <Table className="tabular-nums" data-testid="fills-table">
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
                      {data.fills.map((f) => (
                        <TableRow key={f.fillId}>
                          <TableCell>{formatDateTime(f.filledAt)}</TableCell>
                          <TableCell className={f.side === "buy" ? "text-gain" : "text-loss"}>{f.side === "buy" ? "Buy" : "Sell"}</TableCell>
                          <TableCell>{f.symbol}</TableCell>
                          <TableCell className="text-right">{f.quantity}</TableCell>
                          <TableCell className="text-right">{formatUsd(f.price)}</TableCell>
                          <TableCell>
                            <a href={`#decision-${f.decisionId}`} className="underline-offset-4 hover:underline">
                              View
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="account" className="pt-2">
              {!summary.ok ? (
                <p className="text-sm text-muted-foreground">{summary.message}</p>
              ) : !summary.value ? (
                <p className="text-sm text-muted-foreground">This version has no paper account yet.</p>
              ) : (
                <dl className="grid max-w-lg grid-cols-3 gap-3 text-sm tabular-nums">
                  {(
                    [
                      ["Cash", summary.value.cash],
                      ["Equity", summary.value.equity],
                      ["Buying power", summary.value.buyingPower],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{formatUsd(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Badge variant="outline" className="mt-3">
                Simulated broker account
              </Badge>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
