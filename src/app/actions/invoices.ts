"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseFatturaPA } from "@/lib/fattura-elettronica/parser";
import { extractXmlFromZip } from "@/lib/fattura-elettronica/zip";

function canManageInvoices(roles: string[]): boolean {
  return roles.includes("accountant");
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  nonXmlIgnored: string[];
  subjectsFound: number;
  subjectsCreated: number;
  errors: string[];
}

export async function importInvoicesAction(formData: FormData): Promise<{ success: true; result: ImportResult } | { error: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageInvoices(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const sdiAccountId = formData.get("sdiAccountId") as string;
  if (!sdiAccountId) return { error: "Account SDI obbligatorio" };

  const admin = createAdminClient();

  // Verify SDI account belongs to org
  const { data: sdiAccount } = await admin
    .from("sdi_accounts")
    .select("id")
    .eq("id", sdiAccountId)
    .eq("organization_id", organizationId)
    .single();

  if (!sdiAccount) return { error: "Account SDI non trovato" };

  // Get organization fiscal_code for direction detection
  const { data: org } = await admin
    .from("organizations")
    .select("fiscal_code, vat_number")
    .eq("id", organizationId)
    .single();

  const orgFiscalCode = org?.fiscal_code || org?.vat_number || "";
  if (!orgFiscalCode) return { error: "CF/P.IVA dell'organizzazione non configurato. Configuralo nelle impostazioni dell'organizzazione." };

  const files = formData.getAll("files") as File[];
  if (files.length === 0) return { error: "Nessun file selezionato" };

  const result: ImportResult = {
    imported: 0,
    duplicates: 0,
    nonXmlIgnored: [],
    subjectsFound: 0,
    subjectsCreated: 0,
    errors: [],
  };

  // Collect all XML contents
  const xmlEntries: { fileName: string; xmlContent: string }[] = [];

  for (const file of files) {
    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const buffer = await file.arrayBuffer();
        const extracted = await extractXmlFromZip(buffer);
        xmlEntries.push(...extracted.xmlFiles);
        result.nonXmlIgnored.push(...extracted.ignoredFiles);
      } else if (file.name.toLowerCase().endsWith(".xml")) {
        const content = await file.text();
        xmlEntries.push({ fileName: file.name, xmlContent: content });
      } else {
        result.nonXmlIgnored.push(file.name);
      }
    } catch (e) {
      result.errors.push(`Errore file ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Process each XML
  for (const entry of xmlEntries) {
    try {
      const invoices = parseFatturaPA(entry.xmlContent, orgFiscalCode);

      for (const inv of invoices) {
        // Check for duplicate by xml_hash
        const { data: existing } = await admin
          .from("invoices")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("xml_hash", inv.xmlHash)
          .maybeSingle();

        if (existing) {
          result.duplicates++;
          continue;
        }

        // Subject reconciliation (SQL)
        let subjectId: string | null = null;
        let subjectReconStatus: "unmatched" | "confirmed" | "created" = "unmatched";

        if (inv.header.counterpartFiscalCode || inv.header.counterpartVat) {
          // Try to find existing subject
          let query = admin
            .from("subjects")
            .select("id")
            .eq("organization_id", organizationId);

          if (inv.header.counterpartFiscalCode) {
            query = query.or(
              `tax_code.ilike.${inv.header.counterpartFiscalCode},vat_number.ilike.${inv.header.counterpartFiscalCode}`
            );
          }
          if (inv.header.counterpartVat && inv.header.counterpartVat !== inv.header.counterpartFiscalCode) {
            query = query.or(
              `tax_code.ilike.${inv.header.counterpartVat},vat_number.ilike.${inv.header.counterpartVat}`
            );
          }

          const { data: foundSubjects } = await query.limit(1);

          if (foundSubjects && foundSubjects.length > 0) {
            subjectId = foundSubjects[0].id;
            subjectReconStatus = "confirmed";
            result.subjectsFound++;
          } else {
            // Auto-create subject
            const isCompany = !!inv.header.counterpartVat;
            const { data: newSubject } = await admin
              .from("subjects")
              .insert({
                organization_id: organizationId,
                type: isCompany ? "company" : "person",
                business_name: isCompany ? inv.header.counterpartName : null,
                last_name: !isCompany ? inv.header.counterpartName : null,
                tax_code: inv.header.counterpartFiscalCode ?? null,
                vat_number: inv.header.counterpartVat ?? null,
                is_active: true,
                created_by: currentUser.profile.id,
              })
              .select("id")
              .single();

            if (newSubject) {
              subjectId = newSubject.id;
              subjectReconStatus = "created";
              result.subjectsCreated++;
            }
          }
        }

        // Insert invoice
        const { data: insertedInvoice, error: invoiceError } = await admin
          .from("invoices")
          .insert({
            organization_id: organizationId,
            sdi_account_id: sdiAccountId,
            direction: inv.header.direction,
            document_type: inv.header.documentType,
            sdi_id: inv.header.sdiId,
            number: inv.header.number,
            date: inv.header.date,
            currency: inv.header.currency,
            total_taxable: inv.header.totalTaxable,
            total_vat: inv.header.totalVat,
            total_amount: inv.header.totalAmount,
            counterpart_name: inv.header.counterpartName,
            counterpart_fiscal_code: inv.header.counterpartFiscalCode,
            counterpart_vat: inv.header.counterpartVat,
            counterpart_address: inv.header.counterpartAddress,
            payment_method: inv.header.paymentMethod,
            subject_id: subjectId,
            subject_reconciliation_status: subjectReconStatus,
            xml_content: inv.xmlContent,
            xml_hash: inv.xmlHash,
            created_by: currentUser.profile.id,
          })
          .select("id")
          .single();

        if (invoiceError) {
          if (invoiceError.code === "23505") {
            result.duplicates++;
          } else {
            result.errors.push(`Errore inserimento fattura ${inv.header.number}: ${invoiceError.message}`);
          }
          continue;
        }

        // Insert lines
        if (inv.lines.length > 0 && insertedInvoice) {
          const lineRows = inv.lines.map((l) => ({
            invoice_id: insertedInvoice.id,
            line_number: l.lineNumber,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unitPrice,
            total_price: l.totalPrice,
            vat_rate: l.vatRate,
            vat_nature: l.vatNature,
          }));

          await admin.from("invoice_lines").insert(lineRows);
        }

        // Insert payment schedule
        if (inv.payments.length > 0 && insertedInvoice) {
          const paymentRows = inv.payments.map((p) => ({
            invoice_id: insertedInvoice.id,
            due_date: p.dueDate,
            amount: p.amount,
          }));

          await admin.from("invoice_payment_schedule").insert(paymentRows);
        }

        result.imported++;
      }
    } catch (e) {
      result.errors.push(`Errore XML ${entry.fileName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  revalidatePath("/invoices");
  return { success: true, result };
}

export async function deleteInvoiceAction(invoiceId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageInvoices(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("invoices")
    .select("organization_id")
    .eq("id", invoiceId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Fattura non trovata" };
  }

  const { error } = await admin
    .from("invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) return { error: `Errore eliminazione: ${error.message}` };

  revalidatePath("/invoices");
  return { success: true };
}

export async function getInvoiceDetailAction(invoiceId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from("invoices")
    .select(`
      *,
      invoice_lines(*),
      invoice_payment_schedule(*),
      subjects:subject_id(id, first_name, last_name, business_name, type),
      sdi_accounts:sdi_account_id(id, name, code)
    `)
    .eq("id", invoiceId)
    .eq("organization_id", currentUser.profile.organization_id!)
    .single();

  if (error || !invoice) return { error: "Fattura non trovata" };

  return { success: true, invoice };
}

export async function updateInvoiceSubjectAction(invoiceId: string, subjectId: string | null) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageInvoices(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("invoices")
    .select("organization_id")
    .eq("id", invoiceId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Fattura non trovata" };
  }

  const { error } = await admin
    .from("invoices")
    .update({
      subject_id: subjectId,
      subject_reconciliation_status: subjectId ? "confirmed" : "unmatched",
    })
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return { success: true };
}

export async function reconcileSubjectsAction() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageInvoices(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  // Get unmatched invoices
  const { data: unmatched } = await admin
    .from("invoices")
    .select("id, counterpart_fiscal_code, counterpart_vat, counterpart_name")
    .eq("organization_id", organizationId)
    .eq("subject_reconciliation_status", "unmatched");

  if (!unmatched || unmatched.length === 0) return { success: true, reconciled: 0, created: 0 };

  // Get all subjects for matching
  const { data: subjects } = await admin
    .from("subjects")
    .select("id, tax_code, vat_number")
    .eq("organization_id", organizationId);

  let reconciled = 0;
  let created = 0;

  for (const inv of unmatched) {
    const cf = inv.counterpart_fiscal_code?.toUpperCase();
    const vat = inv.counterpart_vat?.toUpperCase();

    // Try to find matching subject
    const match = subjects?.find((s) => {
      const sTax = s.tax_code?.toUpperCase();
      const sVat = s.vat_number?.toUpperCase();
      return (cf && (sTax === cf || sVat === cf)) || (vat && (sTax === vat || sVat === vat));
    });

    if (match) {
      await admin
        .from("invoices")
        .update({ subject_id: match.id, subject_reconciliation_status: "confirmed" })
        .eq("id", inv.id);
      reconciled++;
    } else if (cf || vat) {
      // Auto-create subject
      const isCompany = !!vat;
      const { data: newSubject } = await admin
        .from("subjects")
        .insert({
          organization_id: organizationId,
          type: isCompany ? "company" : "person",
          business_name: isCompany ? inv.counterpart_name : null,
          last_name: !isCompany ? inv.counterpart_name : null,
          tax_code: inv.counterpart_fiscal_code ?? null,
          vat_number: inv.counterpart_vat ?? null,
          is_active: true,
          created_by: currentUser.profile.id,
        })
        .select("id")
        .single();

      if (newSubject) {
        await admin
          .from("invoices")
          .update({ subject_id: newSubject.id, subject_reconciliation_status: "created" })
          .eq("id", inv.id);
        created++;
        // Add to local subjects array for next iterations
        subjects?.push({ id: newSubject.id, tax_code: inv.counterpart_fiscal_code, vat_number: inv.counterpart_vat });
      }
    }
  }

  revalidatePath("/invoices");
  return { success: true, reconciled, created };
}

export async function markPaymentPaidAction(
  scheduleId: string,
  paidDate: string,
  paidAmount: number
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageInvoices(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  // Verify ownership via invoice
  const { data: schedule } = await admin
    .from("invoice_payment_schedule")
    .select("invoice_id, invoices!inner(organization_id)")
    .eq("id", scheduleId)
    .single();

  if (!schedule || (schedule as unknown as { invoices: { organization_id: string } }).invoices.organization_id !== currentUser.profile.organization_id) {
    return { error: "Scadenza non trovata" };
  }

  const { error } = await admin
    .from("invoice_payment_schedule")
    .update({ paid_date: paidDate, paid_amount: paidAmount })
    .eq("id", scheduleId);

  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return { success: true };
}
