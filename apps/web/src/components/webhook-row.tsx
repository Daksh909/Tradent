"use client";

import { useState, useTransition } from "react";
import { newWebhookUrl } from "@/app/(app)/spend/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WebhookRow({ agentId, agentName, exists, pendingAlerts, alertsOn }: { agentId: string; agentName: string; exists: boolean; pendingAlerts: number; alertsOn: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="space-y-2 py-3" data-testid="webhook-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{agentName}</div>
          <div className="text-xs text-muted-foreground">
            {exists ? `Webhook on · ${pendingAlerts} alert${pendingAlerts === 1 ? "" : "s"} waiting for the next decision` : "No webhook yet"}
            {!alertsOn && " · TradingView alerts are off for its newest version (turn them on in Studio)"}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="webhook-new"
          onClick={() =>
            startTransition(async () => {
              const r = await newWebhookUrl(agentId);
              if (r.ok) (setUrl(r.url), setError(null));
              else setError(r.error);
            })
          }
        >
          {exists ? "Replace secret" : "Create webhook"}
        </Button>
      </div>
      {url && (
        <div className="space-y-1">
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} data-testid="webhook-url" className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            Paste this into the Webhook URL of your TradingView alert. It contains the secret and is shown only now; replacing the secret stops the old URL. TradingView needs a public address on port 80 or 443, so a localhost URL won&apos;t receive alerts.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-loss">{error}</p>}
    </li>
  );
}
