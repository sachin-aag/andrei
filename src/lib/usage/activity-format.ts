export type UserActivityRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  weekActiveSeconds: number;
  monthActiveSeconds: number;
};

export type UserActivityReport = {
  instanceId: "demo" | "mj" | "convergent";
  instanceLabel: string;
  productName: string;
  today: string;
  yearMonth: string;
  weekStart: string;
  weekEnd: string;
  cycleStart: string;
  cycleEnd: string;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  weekTotalSeconds: number;
  monthTotalSeconds: number;
  users: UserActivityRow[];
};

export function formatActiveDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours === 0) {
    return remainSeconds === 0
      ? `${minutes}m`
      : `${minutes}m ${remainSeconds}s`;
  }
  if (remainMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainMinutes}m`;
}
