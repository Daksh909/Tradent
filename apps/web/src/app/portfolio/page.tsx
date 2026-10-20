import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Portfolio" };

export default function Page() {
  return (
    <>
      <PageHeader title="Portfolio" description="Agents you paper-follow with virtual money." />
      <ComingSoon what="Your followed agents, their mirrored trades and your virtual returns." />
    </>
  );
}
