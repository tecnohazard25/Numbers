import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubjectWithDetails } from "@/types/supabase";

interface SimilarGroup {
  key: string;
  reason: string;
  subjects: SubjectWithDetails[];
}

function getSubjectName(s: SubjectWithDetails): string {
  if (s.type === "person") {
    return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim().toLowerCase();
  }
  return (s.business_name ?? "").trim().toLowerCase();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ groups: [] });
  }

  const admin = createAdminClient();

  const { data: subjects, error } = await admin
    .from("subjects")
    .select(
      "*, subject_addresses(*), subject_contacts(*), subject_tags(*, tags(*))"
    )
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !subjects) {
    return NextResponse.json({ groups: [] });
  }

  const typedSubjects = subjects as SubjectWithDetails[];
  const grouped = new Map<string, { reason: string; subjects: SubjectWithDetails[] }>();

  // Helper to add a pair to a group
  function addToGroup(key: string, reason: string, a: SubjectWithDetails, b: SubjectWithDetails) {
    if (!grouped.has(key)) {
      grouped.set(key, { reason, subjects: [] });
    }
    const group = grouped.get(key)!;
    if (!group.subjects.find((s) => s.id === a.id)) group.subjects.push(a);
    if (!group.subjects.find((s) => s.id === b.id)) group.subjects.push(b);
  }

  // 1. Group by identical tax_code
  const byTaxCode = new Map<string, SubjectWithDetails[]>();
  for (const s of typedSubjects) {
    if (s.tax_code) {
      const key = s.tax_code.trim().toUpperCase();
      if (!byTaxCode.has(key)) byTaxCode.set(key, []);
      byTaxCode.get(key)!.push(s);
    }
  }
  for (const [tc, subs] of byTaxCode) {
    if (subs.length >= 2) {
      for (let i = 1; i < subs.length; i++) {
        addToGroup(`tc:${tc}`, "tax_code", subs[0], subs[i]);
      }
    }
  }

  // 2. Group by identical vat_number
  const byVat = new Map<string, SubjectWithDetails[]>();
  for (const s of typedSubjects) {
    if (s.vat_number) {
      const key = s.vat_number.trim().toUpperCase();
      if (!byVat.has(key)) byVat.set(key, []);
      byVat.get(key)!.push(s);
    }
  }
  for (const [vat, subs] of byVat) {
    if (subs.length >= 2) {
      for (let i = 1; i < subs.length; i++) {
        addToGroup(`vat:${vat}`, "vat_number", subs[0], subs[i]);
      }
    }
  }

  // 3. Group by identical name (normalized)
  const byName = new Map<string, SubjectWithDetails[]>();
  for (const s of typedSubjects) {
    const name = getSubjectName(s);
    if (name.length < 2) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(s);
  }
  for (const [name, subs] of byName) {
    if (subs.length >= 2) {
      // Check if already grouped by tax/vat
      const alreadyGrouped = subs.every((s) =>
        Array.from(grouped.values()).some((g) => g.subjects.find((gs) => gs.id === s.id))
      );
      if (!alreadyGrouped) {
        for (let i = 1; i < subs.length; i++) {
          addToGroup(`name:${name}`, "name", subs[0], subs[i]);
        }
      }
    }
  }

  // Convert to array, only groups with 2+ subjects
  const groups: SimilarGroup[] = Array.from(grouped.entries())
    .map(([key, val]) => ({ key, reason: val.reason, subjects: val.subjects }))
    .filter((g) => g.subjects.length >= 2);

  return NextResponse.json({ groups });
}
