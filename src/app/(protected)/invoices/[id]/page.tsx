"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, FileCode2, ListOrdered, CalendarClock, Loader2 } from "lucide-react";
import { getInvoiceDetailAction } from "@/app/actions/invoices";
import { SummaryTab } from "./_components/summary-tab";
import { LinesTab } from "./_components/lines-tab";
import { PaymentsTab } from "./_components/payments-tab";
import { XmlTab } from "./_components/xml-tab";
import { useTranslation } from "@/lib/i18n/context";
import type { InvoiceWithDetails, Subject } from "@/types/supabase";

const TABS = [
  { key: "summary", icon: FileText, labelKey: "invoices.detail.summary" },
  { key: "lines", icon: ListOrdered, labelKey: "invoices.detail.lines" },
  { key: "schedule", icon: CalendarClock, labelKey: "invoices.detail.schedule" },
  { key: "xml", icon: FileCode2, labelKey: "invoices.detail.xml" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  const loadInvoice = useCallback(async () => {
    const res = await getInvoiceDetailAction(invoiceId);
    if ("error" in res || !res.invoice) {
      router.push("/invoices");
      return;
    }
    setInvoice(res.invoice as InvoiceWithDetails);
    setLoading(false);
  }, [invoiceId, router]);

  useEffect(() => {
    async function init() {
      const userRes = await fetch("/api/user-info");
      const userData = await userRes.json();
      const roles: string[] = userData.roles ?? [];
      setCanWrite(roles.includes("accountant"));
      const oid = userData.profile?.organization_id;
      setOrgId(oid);

      // Load subjects for manual linking
      if (oid) {
        const subRes = await fetch(`/api/subjects?orgId=${oid}&limit=1000`);
        const subData = await subRes.json();
        setSubjects(subData.subjects ?? []);
      }
    }
    init();
    loadInvoice();
  }, [loadInvoice]);

  if (loading || !invoice) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => router.push("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("common.back")}
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t("invoices.detail.title")} — {invoice.number}
        </h1>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
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
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "summary" && (
          <SummaryTab invoice={invoice} subjects={subjects} onUpdate={loadInvoice} />
        )}
        {activeTab === "lines" && (
          <LinesTab lines={invoice.invoice_lines} direction={invoice.direction} invoiceId={invoiceId} canWrite={canWrite} onUpdate={loadInvoice} />
        )}
        {activeTab === "schedule" && (
          <PaymentsTab payments={invoice.invoice_payment_schedule} invoiceId={invoiceId} canWrite={canWrite} onUpdate={loadInvoice} />
        )}
        {activeTab === "xml" && (
          <XmlTab xmlContent={invoice.xml_content} invoiceNumber={invoice.number} />
        )}
      </div>
    </div>
  );
}
