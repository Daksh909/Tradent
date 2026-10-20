"use client";

import { useEffect, useState } from "react";
import type { MarketStatusResponse } from "@/app/api/market-status/route";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// DEFAULT: the top bar refreshes market status every minute.
const REFRESH_MS = 60_000;

function newYork(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET";
}

export function MarketStatus() {
  const [data, setData] = useState<MarketStatusResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/market-status", { cache: "no-store" })
        .then((r) => r.json() as Promise<MarketStatusResponse>)
        .then((d) => alive && setData(d))
        .catch(() => alive && setData({ status: "unavailable", reason: "Could not reach the server" }));
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const label = !data ? "Market" : data.status === "open" ? "Market open" : data.status === "closed" ? "Market closed" : "Market status unavailable";
  let detail = "Checking the market clock";
  if (data?.status === "open") detail = `US equities regular session. Closes ${newYork(data.nextClose)}. Source: ${data.source}.`;
  else if (data?.status === "closed") detail = `Opens ${newYork(data.nextOpen)}. Source: ${data.source}.`;
  else if (data?.status === "unavailable") detail = data.reason;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid="market-status" data-status={data?.status ?? "loading"} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", data?.status === "open" ? "bg-gain" : data?.status === "closed" ? "bg-loss" : "bg-muted-foreground/50")}
          />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}
