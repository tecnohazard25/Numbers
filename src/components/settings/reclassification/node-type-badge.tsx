"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/context";
import type { ReclassificationNodeSign } from "@/types/supabase";

export function NodeSignIndicator({ sign }: { sign: ReclassificationNodeSign }) {
  const { t } = useTranslation();

  const label = sign === "positive"
    ? t("reclassification.node.positive")
    : t("reclassification.node.negative");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 cursor-default ${
              sign === "positive"
                ? "bg-emerald-500 dark:bg-emerald-400"
                : "bg-red-500 dark:bg-red-400"
            }`}
          />
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
