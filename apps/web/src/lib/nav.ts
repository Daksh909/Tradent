import { BarChart3, Blocks, BookOpen, CandlestickChart, FlaskConical, Settings, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown only to developers. */
  developerOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { title: "Discover", items: [{ title: "Library", url: "/library", icon: BookOpen }] },
  {
    title: "Build",
    items: [
      { title: "Studio", url: "/studio", icon: Blocks, developerOnly: true },
      { title: "Forward tests", url: "/forward-tests", icon: FlaskConical, developerOnly: true },
    ],
  },
  {
    title: "Trade",
    items: [
      { title: "Trading", url: "/trading", icon: CandlestickChart },
      { title: "Portfolio", url: "/portfolio", icon: Wallet },
    ],
  },
  {
    title: "Account",
    items: [
      { title: "Spend", url: "/spend", icon: BarChart3, developerOnly: true },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function navFor(isDeveloper: boolean): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => isDeveloper || !i.developerOnly) })).filter((g) => g.items.length > 0);
}
