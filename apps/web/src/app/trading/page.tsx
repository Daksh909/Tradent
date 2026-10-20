import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Trading" };

export default function Page() {
  return (
    <>
      <PageHeader title="Trading" description="Charts, orders and fills for an agent's paper account." />
      <ComingSoon what="Candlestick chart with every agent order on it, linked to the AI's reasoning." />
    </>
  );
}
