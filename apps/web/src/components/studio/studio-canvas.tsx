"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useTheme } from "next-themes";
import type { Draft } from "@tradent/agent";
import { cn } from "@/lib/utils";

export type NodeKey = "agent" | "data" | "tradingview" | "model" | "risk" | "broker" | `strategy:${number}`;

type BlockData = { kind: string; title: string; detail: string; selected: boolean; muted?: boolean };

const KIND_STYLE: Record<string, string> = {
  data: "border-sky-500/60",
  strategy: "border-violet-500/60",
  tradingview: "border-amber-500/60",
  model: "border-emerald-500/70",
  risk: "border-rose-500/60",
  broker: "border-zinc-400/60",
};

function Block({ data }: NodeProps<Node<BlockData>>) {
  return (
    <div
      className={cn(
        "w-44 rounded-lg border-2 bg-card px-3 py-2 text-card-foreground shadow-sm",
        KIND_STYLE[data.kind],
        data.selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        data.muted && "opacity-50",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{data.kind === "tradingview" ? "TradingView alert" : data.kind}</div>
      <div className="truncate text-sm font-medium">{data.title}</div>
      <div className="truncate text-xs text-muted-foreground">{data.detail}</div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { block: Block };

const TOOL_NAMES: Record<string, string> = { get_quotes: "Quotes", get_bars: "Bars", get_option_chain: "Option chain", get_recent_fills: "Fills" };
const MODEL_NAMES: Record<string, string> = { haiku: "Haiku 5.5", sonnet: "Sonnet 5.5", opus: "Opus 5.5" };

export function cadenceText(m: number) {
  if (m === 1440) return "daily";
  if (m === 390) return "once a session";
  return m % 60 === 0 ? (m === 60 ? "hourly" : `every ${m / 60}h`) : `every ${m} min`;
}

/**
 * The composer canvas: inputs on the left wired into the AI model, then risk
 * limits, then the paper broker. It mirrors the draft; edits happen in the
 * settings pane, so the wiring always matches what is saved.
 */
export function StudioCanvas({ draft, selected, onSelect }: { draft: Draft; selected: NodeKey; onSelect: (k: NodeKey) => void }) {
  const { resolvedTheme } = useTheme();
  const { nodes, edges } = useMemo(() => {
    const inputs: { id: NodeKey; data: Omit<BlockData, "selected"> }[] = [
      {
        id: "data",
        data: {
          kind: "data",
          title: draft.tools.length ? draft.tools.map((t) => TOOL_NAMES[t] ?? t).join(", ") : "No data tools",
          detail: draft.symbols.length ? draft.symbols.join(", ") : "Any symbol",
          muted: draft.tools.length === 0,
        },
      },
      ...draft.strategies.map((st, i) => ({ id: `strategy:${i}` as NodeKey, data: { kind: "strategy", title: st.name || "Untitled strategy", detail: st.description || st.type } })),
      { id: "tradingview", data: { kind: "tradingview", title: draft.tradingViewAlerts ? "Alerts on" : "Alerts off", detail: "Webhook input", muted: !draft.tradingViewAlerts } },
    ];
    const spacing = 92;
    const modelY = ((inputs.length - 1) * spacing) / 2;
    const n: Node<BlockData>[] = [
      ...inputs.map((b, i) => ({ id: b.id, type: "block", position: { x: 0, y: i * spacing }, data: { ...b.data, selected: selected === b.id } })),
      { id: "model", type: "block", position: { x: 230, y: modelY }, data: { kind: "model", title: `AI model: ${MODEL_NAMES[draft.model]}`, detail: cadenceText(draft.cadenceMinutes), selected: selected === "model" } },
      {
        id: "risk",
        type: "block",
        position: { x: 455, y: modelY },
        data: { kind: "risk", title: "Risk limits", detail: `${Math.round(draft.maxPositionPct * 100)}% position, ${Math.round(draft.maxDailyLossPct * 1000) / 10}% daily loss`, selected: selected === "risk" },
      },
      { id: "broker", type: "block", position: { x: 680, y: modelY }, data: { kind: "broker", title: "Broker: Alpaca paper", detail: "Sandbox account", selected: selected === "broker" } },
    ];
    const e: Edge[] = [
      ...inputs.map((b) => ({ id: `${b.id}-model`, source: b.id, target: "model", animated: !b.data.muted, style: b.data.muted ? { strokeDasharray: "4 4" } : undefined })),
      { id: "model-risk", source: "model", target: "risk", animated: true },
      { id: "risk-broker", source: "risk", target: "broker", animated: true },
    ];
    return { nodes: n, edges: e };
  }, [draft, selected]);

  return (
    <div className="h-full min-h-80 w-full" data-testid="studio-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelect(node.id as NodeKey)}
        onPaneClick={() => onSelect("agent")}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
