import { resolveCustomerId, type CustomerId } from "@/lib/customers/resolve";

export type ChartBrandColors = {
  brand400: string;
  brand500: string;
  brand600: string;
  brand800: string;
  grid: string;
  axis: string;
  plotFill: string;
  limit: string;
  series: readonly [string, string, string];
};

const DEMO: ChartBrandColors = {
  brand400: "#5b8ad0",
  brand500: "#3d6fb5",
  brand600: "#001838",
  brand800: "#061528",
  grid: "#e2e8f2",
  axis: "#5b6b82",
  plotFill: "#ffffff",
  limit: "#dc2626",
  series: ["#001838", "#3d6fb5", "#5b8ad0"],
};

const MJ: ChartBrandColors = {
  brand400: "#5b4fe0",
  brand500: "#403ac8",
  brand600: "#133782",
  brand800: "#13122e",
  grid: "#e5e5e5",
  axis: "#5c5c72",
  plotFill: "#ffffff",
  limit: "#dc2626",
  series: ["#133782", "#403ac8", "#5b4fe0"],
};

const CONVERGENT: ChartBrandColors = {
  brand400: "#3aabd9",
  brand500: "#009ddc",
  brand600: "#0079c1",
  brand800: "#043e64",
  grid: "#d5e6f0",
  axis: "#4d6a80",
  plotFill: "#ffffff",
  limit: "#dc2626",
  series: ["#0079c1", "#009ddc", "#3aabd9"],
};

const BY_PACK: Record<CustomerId, ChartBrandColors> = {
  demo: DEMO,
  mj: MJ,
  convergent: CONVERGENT,
};

export function chartBrandColors(
  packId: CustomerId = resolveCustomerId()
): ChartBrandColors {
  return BY_PACK[packId];
}

export function seriesFill(colors: ChartBrandColors, seriesIndex: number): string {
  return colors.series[seriesIndex % colors.series.length]!;
}
