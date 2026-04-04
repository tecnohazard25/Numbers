"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/context";
import type { TransactionDirection } from "@/types/supabase";

interface TransactionDirectionBadgeProps {
  direction: TransactionDirection;
}

export function TransactionDirectionBadge({ direction }: TransactionDirectionBadgeProps) {
  const { t } = useTranslation();

  return (
    <Badge
      className={
        direction === "in"
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      }
    >
      {direction === "in" ? t("transactions.directionIn") : t("transactions.directionOut")}
    </Badge>
  );
}
