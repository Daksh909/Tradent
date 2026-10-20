import { NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";

export const dynamic = "force-dynamic";

export type MarketStatusResponse =
  | { status: "open" | "closed"; nextOpen: string; nextClose: string; source: "Alpaca market clock" }
  | { status: "unavailable"; reason: string };

/** US equities regular-session status from the broker's market clock (CLAUDE.md hard rule 9). */
export async function GET() {
  const broker = getBroker();
  if (!broker) return NextResponse.json<MarketStatusResponse>({ status: "unavailable", reason: "Alpaca sandbox keys are not configured" });
  try {
    const clock = await broker.getClock();
    return NextResponse.json<MarketStatusResponse>({
      status: clock.isOpen ? "open" : "closed",
      nextOpen: clock.nextOpen,
      nextClose: clock.nextClose,
      source: "Alpaca market clock",
    });
  } catch (e) {
    return NextResponse.json<MarketStatusResponse>({ status: "unavailable", reason: (e as Error).message });
  }
}
