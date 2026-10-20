import type { ForwardTest } from "@tradent/agent";
import { Badge } from "@/components/ui/badge";

export function TestStatus({ t }: { t: Pick<ForwardTest, "killed" | "listed" | "youngRecord"> }) {
  if (t.killed) return <Badge variant="outline" className="border-loss/50 text-loss">Stopped</Badge>;
  if (t.listed) return <Badge variant="outline" className="border-gain/50 text-gain">Listed{t.youngRecord ? " · young record" : ""}</Badge>;
  return <Badge variant="outline">Testing</Badge>;
}
