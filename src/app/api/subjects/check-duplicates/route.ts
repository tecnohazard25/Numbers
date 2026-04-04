import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ duplicates: [], similar: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  // Verify user belongs to the requested organization
  if (orgId && currentUser.profile.organization_id !== orgId) {
    return NextResponse.json({ duplicates: [], similar: [] }, { status: 403 });
  }
  const taxCode = searchParams.get("taxCode");
  const vatNumber = searchParams.get("vatNumber");
  const firstName = searchParams.get("firstName");
  const lastName = searchParams.get("lastName");
  const businessName = searchParams.get("businessName");
  const excludeId = searchParams.get("excludeId");

  // Escape PostgreSQL ilike wildcards
  const escapeIlike = (s: string) => s.replace(/[%_\\]/g, "\\$&");

  if (!orgId) {
    return NextResponse.json({ duplicates: [], similar: [] });
  }

  const admin = createAdminClient();

  // 1. Exact duplicates: same CF or same P.IVA
  const duplicates: { id: string; name: string; field: "tax_code" | "vat_number" }[] = [];

  if (taxCode) {
    let query = admin
      .from("subjects")
      .select("id, first_name, last_name, business_name, type")
      .eq("organization_id", orgId)
      .eq("tax_code", taxCode);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query;
    if (data?.length) {
      for (const s of data) {
        const name = s.type === "person"
          ? `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim()
          : s.business_name ?? "";
        duplicates.push({ id: s.id, name, field: "tax_code" });
      }
    }
  }

  if (vatNumber) {
    let query = admin
      .from("subjects")
      .select("id, first_name, last_name, business_name, type")
      .eq("organization_id", orgId)
      .eq("vat_number", vatNumber);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query;
    if (data?.length) {
      for (const s of data) {
        const name = s.type === "person"
          ? `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim()
          : s.business_name ?? "";
        duplicates.push({ id: s.id, name, field: "vat_number" });
      }
    }
  }

  // 2. Similar subjects: same name (fuzzy)
  const similar: { id: string; name: string; taxCode: string | null; vatNumber: string | null }[] = [];

  if (firstName && lastName) {
    let query = admin
      .from("subjects")
      .select("id, first_name, last_name, tax_code, vat_number, type")
      .eq("organization_id", orgId)
      .eq("type", "person")
      .ilike("first_name", escapeIlike(firstName))
      .ilike("last_name", escapeIlike(lastName));
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query;
    if (data?.length) {
      for (const s of data) {
        // Skip if already in duplicates
        if (duplicates.some((d) => d.id === s.id)) continue;
        similar.push({
          id: s.id,
          name: `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim(),
          taxCode: s.tax_code,
          vatNumber: s.vat_number,
        });
      }
    }
  }

  if (businessName) {
    let query = admin
      .from("subjects")
      .select("id, business_name, tax_code, vat_number, type")
      .eq("organization_id", orgId)
      .neq("type", "person")
      .ilike("business_name", escapeIlike(businessName));
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query;
    if (data?.length) {
      for (const s of data) {
        if (duplicates.some((d) => d.id === s.id)) continue;
        similar.push({
          id: s.id,
          name: s.business_name ?? "",
          taxCode: s.tax_code,
          vatNumber: s.vat_number,
        });
      }
    }
  }

  return NextResponse.json({ duplicates, similar });
}
