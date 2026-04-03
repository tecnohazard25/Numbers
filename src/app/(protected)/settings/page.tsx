"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Receipt, Tags } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { VatCodesSection } from "./_components/vat-codes-section";
import { TagsSection } from "./_components/tags-section";

const TABS = [
  { key: "vat-codes", icon: Receipt, labelKey: "settings.vatCodes.title" },
  { key: "tags", icon: Tags, labelKey: "settings.tags.title" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("vat-codes");

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const roles: string[] = data.roles ?? [];

      if (!roles.includes("accountant") && !roles.includes("user_manager") && !roles.includes("superadmin")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      setOrgId(data.profile?.organization_id ?? null);
    }
    init();
  }, [router]);

  if (!authorized || !orgId) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" />
        {t("settings.title")}
      </h1>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "vat-codes" && <VatCodesSection orgId={orgId} />}
        {activeTab === "tags" && <TagsSection orgId={orgId} />}
      </div>
    </div>
  );
}
