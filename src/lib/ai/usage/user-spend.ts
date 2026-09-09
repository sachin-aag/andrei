import { eq, gte, sql } from "drizzle-orm";
import { aiUsageEvents } from "@/db/schema";
import { CUSTOMER_INSTANCE_LABELS, getCustomerPack } from "@/lib/customers/packs";
import { isInternalOperator } from "@/lib/ops/internal-operators";
import {
  currentYearMonthUtc,
  isoWeekBoundsUtc,
  monthCycleBoundsUtc,
} from "./cycle";
import { roundUsd } from "./estimate-cost";

export { CUSTOMER_INSTANCE_LABELS } from "@/lib/customers/packs";

export type UserSpendRow = {
  userId: string | null;
  name: string;
  email: string | null;
  role: string | null;
  weekSpendUsd: number;
  monthSpendUsd: number;
};

export type UserSpendReport = {
  instanceId: "demo" | "mj" | "convergent";
  instanceLabel: string;
  productName: string;
  yearMonth: string;
  weekStart: string;
  weekEnd: string;
  cycleStart: string;
  cycleEnd: string;
  weekTotalUsd: number;
  monthTotalUsd: number;
  users: UserSpendRow[];
};

export type SpendBucket = {
  userId: string | null;
  spendUsd: number;
};

export type SpendUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  deactivatedAt: Date | null;
};

export function assembleUserSpendRows(input: {
  users: readonly SpendUser[];
  week: readonly SpendBucket[];
  month: readonly SpendBucket[];
}): UserSpendRow[] {
  const weekByUser = new Map<string | null, number>();
  for (const row of input.week) {
    weekByUser.set(row.userId, roundUsd(Number(row.spendUsd ?? 0)));
  }
  const monthByUser = new Map<string | null, number>();
  for (const row of input.month) {
    monthByUser.set(row.userId, roundUsd(Number(row.spendUsd ?? 0)));
  }

  const visible = input.users.filter((user) => !isInternalOperator(user));
  const visibleIds = new Set(visible.map((user) => user.id));
  const rowsById = new Map<string, UserSpendRow>();

  for (const user of visible) {
    if (user.deactivatedAt) continue;
    rowsById.set(user.id, {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      weekSpendUsd: weekByUser.get(user.id) ?? 0,
      monthSpendUsd: monthByUser.get(user.id) ?? 0,
    });
  }

  const spendUserIds = new Set<string | null>([
    ...weekByUser.keys(),
    ...monthByUser.keys(),
  ]);

  for (const userId of spendUserIds) {
    if (userId === null) continue;
    if (rowsById.has(userId)) continue;
    if (!visibleIds.has(userId)) continue;
    const user = visible.find((candidate) => candidate.id === userId);
    if (!user) continue;
    rowsById.set(userId, {
      userId,
      name: user.name,
      email: user.email,
      role: user.role,
      weekSpendUsd: weekByUser.get(userId) ?? 0,
      monthSpendUsd: monthByUser.get(userId) ?? 0,
    });
  }

  const unattributedWeek = weekByUser.get(null) ?? 0;
  const unattributedMonth = monthByUser.get(null) ?? 0;
  const rows = [...rowsById.values()];
  if (unattributedWeek > 0 || unattributedMonth > 0) {
    rows.push({
      userId: null,
      name: "Unattributed",
      email: null,
      role: null,
      weekSpendUsd: unattributedWeek,
      monthSpendUsd: unattributedMonth,
    });
  }

  return rows.sort((a, b) => {
    if (b.monthSpendUsd !== a.monthSpendUsd) {
      return b.monthSpendUsd - a.monthSpendUsd;
    }
    if (b.weekSpendUsd !== a.weekSpendUsd) {
      return b.weekSpendUsd - a.weekSpendUsd;
    }
    return a.name.localeCompare(b.name);
  });
}

async function sumSpendByUser(
  where:
    | ReturnType<typeof eq>
    | ReturnType<typeof gte>
): Promise<SpendBucket[]> {
  const { db } = await import("@/db");
  const rows = await db
    .select({
      userId: aiUsageEvents.userId,
      spendUsd: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
    })
    .from(aiUsageEvents)
    .where(where)
    .groupBy(aiUsageEvents.userId);

  return rows.map((row) => ({
    userId: row.userId,
    spendUsd: roundUsd(Number(row.spendUsd ?? 0)),
  }));
}

export async function getUserSpendReport(
  now = new Date()
): Promise<UserSpendReport> {
  const { db } = await import("@/db");
  const pack = getCustomerPack();
  const yearMonth = currentYearMonthUtc(now);
  const { cycleStart, cycleEnd } = monthCycleBoundsUtc(yearMonth);
  const { weekStart, weekEnd } = isoWeekBoundsUtc(now);

  const [users, week, month] = await Promise.all([
    db.query.workspaceUsers.findMany({
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        deactivatedAt: true,
      },
    }),
    sumSpendByUser(gte(aiUsageEvents.occurredAt, weekStart)),
    sumSpendByUser(eq(aiUsageEvents.yearMonth, yearMonth)),
  ]);

  const operatorIds = new Set(
    users.filter((user) => isInternalOperator(user)).map((user) => user.id)
  );
  const filteredWeek = week.filter(
    (row) => row.userId === null || !operatorIds.has(row.userId)
  );
  const filteredMonth = month.filter(
    (row) => row.userId === null || !operatorIds.has(row.userId)
  );

  const assembled = assembleUserSpendRows({
    users,
    week: filteredWeek,
    month: filteredMonth,
  });

  return {
    instanceId: pack.id,
    instanceLabel: CUSTOMER_INSTANCE_LABELS[pack.id],
    productName: pack.branding.productName,
    yearMonth,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    cycleStart: cycleStart.toISOString(),
    cycleEnd: cycleEnd.toISOString(),
    weekTotalUsd: roundUsd(
      assembled.reduce((sum, row) => sum + row.weekSpendUsd, 0)
    ),
    monthTotalUsd: roundUsd(
      assembled.reduce((sum, row) => sum + row.monthSpendUsd, 0)
    ),
    users: assembled,
  };
}
