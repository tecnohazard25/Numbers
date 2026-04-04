import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const sdiAccountId = searchParams.get("sdiAccountId");
  const direction = searchParams.get("direction");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const documentType = searchParams.get("documentType");
  const search = searchParams.get("search");

  if (!orgId || !sdiAccountId) {
    return NextResponse.json({ invoices: [] });
  }

  const admin = createAdminClient();

  let query = admin
    .from("invoices")
    .select(`
      id, organization_id, sdi_account_id, direction, document_type,
      number, date, currency, total_taxable, total_vat, total_amount,
      counterpart_name, counterpart_fiscal_code, counterpart_vat,
      payment_method, subject_id, subject_reconciliation_status,
      xml_hash, created_at,
      subjects:subject_id(id, first_name, last_name, business_name, type),
      invoice_payment_schedule(id, due_date, amount, paid_date, paid_amount, transaction_reconciliation_status)
    `)
    .eq("organization_id", orgId)
    .eq("sdi_account_id", sdiAccountId)
    .order("date", { ascending: false });

  if (direction) {
    query = query.eq("direction", direction);
  }
  if (dateFrom) {
    query = query.gte("date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("date", dateTo);
  }
  if (documentType) {
    query = query.eq("document_type", documentType);
  }
  if (search) {
    query = query.or(`number.ilike.%${search}%,counterpart_name.ilike.%${search}%`);
  }

  const { data: invoices, error } = await query;

  if (error) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json({ invoices: [] });
  }

  return NextResponse.json({ invoices: invoices ?? [] });
}
