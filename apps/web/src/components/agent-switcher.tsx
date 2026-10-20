"use client";

import { useRouter } from "next/navigation";
import type { TradingAgentOption } from "@tradent/agent";

export function AgentSwitcher({ options, value }: { options: TradingAgentOption[]; value: string }) {
  const router = useRouter();
  const own = options.filter((o) => o.own);
  const listed = options.filter((o) => !o.own);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Agent</span>
      <select
        className="h-8 max-w-64 rounded-md border bg-background px-2"
        value={value}
        onChange={(e) => router.push(`/trading?version=${e.target.value}`)}
        data-testid="agent-switcher"
      >
        {own.length > 0 && (
          <optgroup label="Your forward tests">
            {own.map((o) => (
              <option key={o.versionId} value={o.versionId}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        {listed.length > 0 && (
          <optgroup label="Library">
            {listed.map((o) => (
              <option key={o.versionId} value={o.versionId}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
