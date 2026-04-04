"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useTranslation } from "@/lib/i18n/context";
import { useTheme } from "next-themes";

interface StatsData {
  summary: { totalIn: number; totalOut: number; net: number; transactionCount: number };
  monthly: { month: string; totalIn: number; totalOut: number }[];
  balanceTrend: { month: string; balance: number }[];
  topCosts: { name: string; amount: number }[];
  topRevenues: { name: string; amount: number }[];
  pieData: { name: string; value: number }[];
}

const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#6366f1",
  "#84cc16", "#a855f7",
];

interface Props {
  orgId: string;
  collectionResourceId: string;
  locale: string;
}

export function TransactionDashboard({ orgId, collectionResourceId, locale }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const textColor = isDark ? "#a1a1aa" : "#71717a";
  const gridColor = isDark ? "#27272a" : "#e4e4e7";

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ orgId });
      if (collectionResourceId) params.set("collectionResourceId", collectionResourceId);
      const res = await fetch(`/api/transactions/stats?${params}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, [orgId, collectionResourceId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const fmtCurrency = (v: number) =>
    v.toLocaleString(locale, { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const date = new Date(+y, +mo - 1);
    return date.toLocaleDateString(locale, { month: "short", year: "2-digit" });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">{t("common.loading")}</div>;
  }

  if (!data || data.summary.transactionCount === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("transactions.totalIn")}</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">{fmtCurrency(data.summary.totalIn)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("transactions.totalOut")}</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">{fmtCurrency(data.summary.totalOut)}</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("transactions.netBalance")}</p>
          <p className={`text-lg font-bold ${data.summary.net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {fmtCurrency(data.summary.net)}
          </p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("transactions.title")}</p>
          <p className="text-lg font-bold">{data.summary.transactionCount}</p>
        </div>
      </div>

      {/* Charts grid */}
      {data.monthly.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly income vs expenses */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">{t("transactions.directionIn")} vs {t("transactions.directionOut")}</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fill: textColor, fontSize: 11 }} />
                <YAxis tick={{ fill: textColor, fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => fmtCurrency(Number(value))}
                  labelFormatter={(label) => fmtMonth(String(label))}
                  contentStyle={{ backgroundColor: isDark ? "#18181b" : "#fff", border: `1px solid ${gridColor}`, borderRadius: 8 }}
                />
                <Bar dataKey="totalIn" name={t("transactions.directionIn")} fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalOut" name={t("transactions.directionOut")} fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Balance trend */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">{t("transactions.balance")}</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.balanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fill: textColor, fontSize: 11 }} />
                <YAxis tick={{ fill: textColor, fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => fmtCurrency(Number(value))}
                  labelFormatter={(label) => fmtMonth(String(label))}
                  contentStyle={{ backgroundColor: isDark ? "#18181b" : "#fff", border: `1px solid ${gridColor}`, borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top costs */}
        {data.topCosts.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">Top {t("transactions.directionOut")}</h3>
            <div className="space-y-2">
              {data.topCosts.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-2 rounded-full shrink-0"
                    style={{ width: `${Math.max((item.amount / data.topCosts[0].amount) * 100, 8)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate flex-1 min-w-0" title={item.name}>{item.name}</span>
                  <span className="text-red-600 dark:text-red-400 shrink-0 font-medium">{fmtCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top revenues */}
        {data.topRevenues.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">Top {t("transactions.directionIn")}</h3>
            <div className="space-y-2">
              {data.topRevenues.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-2 rounded-full shrink-0"
                    style={{ width: `${Math.max((item.amount / data.topRevenues[0].amount) * 100, 8)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate flex-1 min-w-0" title={item.name}>{item.name}</span>
                  <span className="text-green-600 dark:text-green-400 shrink-0 font-medium">{fmtCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pie by account */}
        {data.pieData.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">{t("transactions.account")}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {data.pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => fmtCurrency(Number(value))}
                  contentStyle={{ backgroundColor: isDark ? "#18181b" : "#fff", border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
