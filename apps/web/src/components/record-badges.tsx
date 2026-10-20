import type { PublicVersion } from "@tradent/agent";
import { Badge } from "@/components/ui/badge";
import { MODEL_LABELS, cadenceLabel } from "@/lib/format";

export function RecordBadges({ v }: { v: PublicVersion }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {v.youngRecord && (
        <Badge variant="outline" className="border-paper text-paper" title="Fewer than 90 trading days of forward testing" data-testid="young-record">
          Young record
        </Badge>
      )}
      <Badge variant="secondary">{MODEL_LABELS[v.model]}</Badge>
      <Badge variant="secondary">{cadenceLabel(v.cadenceMinutes)}</Badge>
      {v.instruments.map((i) => (
        <Badge key={i} variant="outline">
          {i === "equity" ? "Equities" : "Options"}
        </Badge>
      ))}
    </div>
  );
}
