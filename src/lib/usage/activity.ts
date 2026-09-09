import { and, gte, lt, notInArray, sql } from "drizzle-orm";
import { userActivityDays } from "@/db/schema";
import { CUSTOMER_INSTANCE_LABELS, getCustomerPack } from "@/lib/customers/packs";
import { isInternalOperator } from "@/lib/ops/internal-operators";
import {
  currentYearMonthUtc,
  isoWeekBoundsUtc,
  monthCycleBoundsUtc,
  utcDateKey,
} from "@/lib/ai/usage/cycle";

export const PRESENCE_HEARTBEAT_MAX_SECONDS = 120;

export function clampPresenceSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(PRESENCE_HEARTBEAT_MAX_SECONDS, Math.max(0, Math.floor(n)));
}

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

export type ActivityUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  deactivatedAt: Date | null;
};

export type ActivityTimeBucket = {
  userId: string;
  activeSeconds: number;
};

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

export function assembleUserActivityRows(input: {
  users: readonly ActivityUser[];
  week: readonly ActivityTimeBucket[];
  month: readonly ActivityTimeBucket[];
}): UserActivityRow[] {
  const weekByUser = new Map(
    input.week.map((row) => [row.userId, Math.max(0, row.activeSeconds)])
  );
  const monthByUser = new Map(
    input.month.map((row) => [row.userId, Math.max(0, row.activeSeconds)])
  );
  const visible = input.users.filter((user) => !isInternalOperator(user));
  const rowsById = new Map<string, UserActivityRow>();

  for (const user of visible) {
    if (user.deactivatedAt) continue;
    rowsById.set(user.id, {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      weekActiveSeconds: weekByUser.get(user.id) ?? 0,
      monthActiveSeconds: monthByUser.get(user.id) ?? 0,
    });
  }

  for (const user of visible) {
    if (rowsById.has(user.id)) continue;
    const weekSeconds = weekByUser.get(user.id) ?? 0;
    const monthSeconds = monthByUser.get(user.id) ?? 0;
    if (weekSeconds === 0 && monthSeconds === 0) continue;
    rowsById.set(user.id, {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      weekActiveSeconds: weekSeconds,
      monthActiveSeconds: monthSeconds,
    });
  }

  return [...rowsById.values()].sort((a, b) => {
    if (b.monthActiveSeconds !== a.monthActiveSeconds) {
      return b.monthActiveSeconds - a.monthActiveSeconds;
    }
    if (b.weekActiveSeconds !== a.weekActiveSeconds) {
      return b.weekActiveSeconds - a.weekActiveSeconds;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function recordPresenceSeconds(
  userId: string,
  seconds: number,
  at = new Date()
): Promise<void> {
  const billed = clampPresenceSeconds(seconds);
  if (billed < 1) return;

  const { db } = await import("@/db");
  const dayUtc = utcDateKey(at);
  await db
    .insert(userActivityDays)
    .values({
      userId,
      dayUtc,
      activeSeconds: billed,
      lastHeartbeatAt: at,
    })
    .onConflictDoUpdate({
      target: [userActivityDays.userId, userActivityDays.dayUtc],
      set: {
        activeSeconds: sql`${userActivityDays.activeSeconds} + ${billed}`,
        lastHeartbeatAt: at,
      },
    });
}

async function sumSecondsByUser(
  startDay: string,
  endDayExclusive: string
): Promise<ActivityTimeBucket[]> {
  const { db } = await import("@/db");
  const rows = await db
    .select({
      userId: userActivityDays.userId,
      activeSeconds: sql<number>`coalesce(sum(${userActivityDays.activeSeconds}), 0)::int`,
    })
    .from(userActivityDays)
    .where(
      and(
        gte(userActivityDays.dayUtc, startDay),
        lt(userActivityDays.dayUtc, endDayExclusive)
      )
    )
    .groupBy(userActivityDays.userId);

  return rows.map((row) => ({
    userId: row.userId,
    activeSeconds: Number(row.activeSeconds ?? 0),
  }));
}

async function countDistinctUsers(
  startDay: string,
  endDayExclusive: string,
  excludeUserIds: string[]
): Promise<number> {
  const { db } = await import("@/db");
  const filters = [
    gte(userActivityDays.dayUtc, startDay),
    lt(userActivityDays.dayUtc, endDayExclusive),
    sql`${userActivityDays.activeSeconds} > 0`,
  ];
  if (excludeUserIds.length > 0) {
    filters.push(notInArray(userActivityDays.userId, excludeUserIds));
  }
  const [row] = await db
    .select({
      count: sql<number>`count(distinct ${userActivityDays.userId})::int`,
    })
    .from(userActivityDays)
    .where(and(...filters));
  return Number(row?.count ?? 0);
}

export async function getUserActivityReport(
  now = new Date()
): Promise<UserActivityReport> {
  const { db } = await import("@/db");
  const pack = getCustomerPack();
  const yearMonth = currentYearMonthUtc(now);
  const { cycleStart, cycleEnd } = monthCycleBoundsUtc(yearMonth);
  const { weekStart, weekEnd } = isoWeekBoundsUtc(now);
  const today = utcDateKey(now);
  const tomorrow = utcDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const weekStartKey = utcDateKey(weekStart);
  const weekEndKey = utcDateKey(weekEnd);
  const monthStartKey = utcDateKey(cycleStart);
  const monthEndKey = utcDateKey(cycleEnd);

  const users = await db.query.workspaceUsers.findMany({
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      deactivatedAt: true,
    },
  });
  const operatorIds = users
    .filter((user) => isInternalOperator(user))
    .map((user) => user.id);

  const [week, month, dailyActiveUsers, weeklyActiveUsers, monthlyActiveUsers] =
    await Promise.all([
      sumSecondsByUser(weekStartKey, weekEndKey),
      sumSecondsByUser(monthStartKey, monthEndKey),
      countDistinctUsers(today, tomorrow, operatorIds),
      countDistinctUsers(weekStartKey, weekEndKey, operatorIds),
      countDistinctUsers(monthStartKey, monthEndKey, operatorIds),
    ]);

  const operatorIdSet = new Set(operatorIds);
  const assembled = assembleUserActivityRows({
    users,
    week: week.filter((row) => !operatorIdSet.has(row.userId)),
    month: month.filter((row) => !operatorIdSet.has(row.userId)),
  });

  return {
    instanceId: pack.id,
    instanceLabel: CUSTOMER_INSTANCE_LABELS[pack.id],
    productName: pack.branding.productName,
    today,
    yearMonth,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    cycleStart: cycleStart.toISOString(),
    cycleEnd: cycleEnd.toISOString(),
    dailyActiveUsers,
    weeklyActiveUsers,
    monthlyActiveUsers,
    weekTotalSeconds: assembled.reduce(
      (sum, row) => sum + row.weekActiveSeconds,
      0
    ),
    monthTotalSeconds: assembled.reduce(
      (sum, row) => sum + row.monthActiveSeconds,
      0
    ),
    users: assembled,
  };
}
