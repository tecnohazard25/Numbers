"use client";

import { useTranslation } from "@/lib/i18n/context";

interface TransactionTotalsProps {
  totalIn: number;
  totalOut: number;
  locale: string;
}

export function TransactionTotals({ totalIn, totalOut, locale }: TransactionTotalsProps) {
  const { t } = useTranslation();
  const net = totalIn - totalOut;

  const fmt = (v: number) =>
    v.toLocaleString(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    });

  return (
    <div className="flex flex-wrap gap-4 sm:gap-8 rounded-lg border p-3 sm:p-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("transactions.totalIn")}:</span>
        <span className="font-semibold text-green-600 dark:text-green-400">{fmt(totalIn)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("transactions.totalOut")}:</span>
        <span className="font-semibold text-red-600 dark:text-red-400">{fmt(totalOut)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("transactions.netBalance")}:</span>
        <span
          className={`font-semibold ${
            net >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {fmt(net)}
        </span>
      </div>
    </div>
  );
}
