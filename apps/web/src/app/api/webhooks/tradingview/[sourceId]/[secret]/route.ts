import { receiveAlert } from "@tradent/agent";
import { getDb } from "@/lib/db";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * TradingView alert webhook (CLAUDE.md hard rule 13). The alert is stored for the
 * agent's next decision and nothing else happens: no decision runs and no order is sent.
 * TradingView cancels requests that take over three seconds, so this only writes one row.
 */
export async function POST(req: Request, { params }: { params: Promise<{ sourceId: string; secret: string }> }) {
  const { sourceId, secret } = await params;
  if (!UUID.test(sourceId)) return Response.json({ error: "Unknown webhook or wrong secret" }, { status: 401 });
  const res = await receiveAlert(getDb(), sourceId, secret, await req.text());
  return res.status === 202 ? Response.json({ stored: true }, { status: 202 }) : Response.json({ error: res.error }, { status: res.status });
}
