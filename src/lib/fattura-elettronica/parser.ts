import { XMLParser } from "fast-xml-parser";
import { createHash } from "crypto";
import type { InvoiceDirection, InvoiceDocumentType } from "@/types/supabase";

export interface ParsedInvoiceHeader {
  direction: InvoiceDirection;
  documentType: InvoiceDocumentType;
  number: string;
  date: string;
  currency: string;
  totalTaxable: number;
  totalVat: number;
  totalAmount: number;
  counterpartName: string;
  counterpartFiscalCode: string | null;
  counterpartVat: string | null;
  counterpartAddress: string | null;
  paymentMethod: string | null;
  sdiId: string | null;
}

export interface ParsedInvoiceLine {
  lineNumber: number;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number;
  vatRate: number | null;
  vatNature: string | null;
}

export interface ParsedPaymentSchedule {
  dueDate: string;
  amount: number;
}

export interface ParsedInvoice {
  header: ParsedInvoiceHeader;
  lines: ParsedInvoiceLine[];
  payments: ParsedPaymentSchedule[];
  xmlHash: string;
  xmlContent: string;
}

const DOCUMENT_TYPE_MAP: Record<string, InvoiceDocumentType> = {
  TD01: "invoice",
  TD02: "invoice",
  TD03: "invoice",
  TD06: "invoice",
  TD04: "credit_note",
  TD05: "debit_note",
};

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function toNum(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function buildAddress(sede: Record<string, unknown> | undefined): string | null {
  if (!sede) return null;
  const parts = [
    sede.Indirizzo,
    sede.CAP,
    sede.Comune,
    sede.Provincia ? `(${sede.Provincia})` : null,
    sede.Nazione,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Parse a FatturaPA XML string into structured data.
 * The sdiAccountFiscalCode is used to determine invoice direction.
 */
export function parseFatturaPA(
  xmlContent: string,
  sdiAccountFiscalCode: string
): ParsedInvoice[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseAttributeValue: false,
    trimValues: true,
    isArray: (name) => {
      return [
        "FatturaElettronicaBody",
        "DettaglioLinee",
        "DettaglioPagamento",
        "DatiRiepilogo",
        "DatiPagamento",
      ].includes(name);
    },
  });

  const parsed = parser.parse(xmlContent);
  const fattura = parsed.FatturaElettronica;
  if (!fattura) {
    throw new Error("XML non valido: elemento FatturaElettronica non trovato");
  }

  const header = fattura.FatturaElettronicaHeader;
  if (!header) {
    throw new Error("XML non valido: FatturaElettronicaHeader non trovato");
  }

  // Extract transmitter data
  const trasmissione = header.DatiTrasmissione;
  const sdiId = trasmissione?.ProgressivoInvio?.toString() ?? null;

  // Extract cedente (seller) and cessionario (buyer)
  const cedente = header.CedentePrestatore;
  const cessionario = header.CessionarioCommittente;

  const cedenteDati = cedente?.DatiAnagrafici;
  const cessionarioDati = cessionario?.DatiAnagrafici;

  const cedenteCF = (cedenteDati?.CodiceFiscale ?? "").toString().toUpperCase();
  const cedentePIVA = (cedenteDati?.IdFiscaleIVA?.IdCodice ?? "").toString().toUpperCase();
  const accountCF = sdiAccountFiscalCode.toUpperCase();

  // Determine direction: if cedente matches SDI account → issued, else received
  const isIssued = cedenteCF === accountCF || cedentePIVA === accountCF;

  // Counterpart is the other party
  const counterpartDati = isIssued ? cessionarioDati : cedenteDati;
  const counterpartSede = isIssued ? cessionario?.Sede : cedente?.Sede;

  const counterpartName =
    counterpartDati?.Anagrafica?.Denominazione?.toString() ??
    [counterpartDati?.Anagrafica?.Nome, counterpartDati?.Anagrafica?.Cognome].filter(Boolean).join(" ") ??
    "Sconosciuto";

  const counterpartFiscalCode = counterpartDati?.CodiceFiscale?.toString() ?? null;
  const counterpartVat = counterpartDati?.IdFiscaleIVA?.IdCodice?.toString() ?? null;
  const counterpartAddress = buildAddress(counterpartSede);

  const xmlHash = createHash("sha256").update(xmlContent).digest("hex");

  const bodies = toArray(fattura.FatturaElettronicaBody);
  const results: ParsedInvoice[] = [];

  for (const body of bodies) {
    const datiGenerali = body.DatiGenerali?.DatiGeneraliDocumento;
    if (!datiGenerali) continue;

    const tipoDocumento = datiGenerali.TipoDocumento?.toString() ?? "TD01";
    const documentType = DOCUMENT_TYPE_MAP[tipoDocumento] ?? "invoice";
    const direction: InvoiceDirection = isIssued ? "issued" : "received";

    const numero = datiGenerali.Numero?.toString() ?? "";
    const data = datiGenerali.Data?.toString() ?? "";
    const divisa = datiGenerali.Divisa?.toString() ?? "EUR";
    const importoTotale = toNum(datiGenerali.ImportoTotaleDocumento);

    // Parse lines
    const dettaglioLinee = toArray(body.DatiBeniServizi?.DettaglioLinee);
    const lines: ParsedInvoiceLine[] = dettaglioLinee.map((l: Record<string, unknown>) => ({
      lineNumber: Number(l.NumeroLinea) || 0,
      description: l.Descrizione?.toString() ?? null,
      quantity: toNum(l.Quantita),
      unitPrice: toNum(l.PrezzoUnitario),
      totalPrice: toNum(l.PrezzoTotale) ?? 0,
      vatRate: toNum(l.AliquotaIVA),
      vatNature: l.Natura?.toString() ?? null,
    }));

    // Parse summary for totals
    const riepilogo = toArray(body.DatiBeniServizi?.DatiRiepilogo);
    let totalTaxable = 0;
    let totalVat = 0;
    for (const r of riepilogo) {
      totalTaxable += toNum((r as Record<string, unknown>).ImponibileImporto) ?? 0;
      totalVat += toNum((r as Record<string, unknown>).Imposta) ?? 0;
    }
    const totalAmount = importoTotale !== null ? importoTotale : totalTaxable + totalVat;

    // Parse payments
    const datiPagamento = toArray(body.DatiPagamento);
    const payments: ParsedPaymentSchedule[] = [];
    let paymentMethod: string | null = null;

    for (const dp of datiPagamento) {
      const dettagli = toArray((dp as Record<string, unknown>).DettaglioPagamento);
      for (const det of dettagli) {
        const d = det as Record<string, unknown>;
        if (!paymentMethod && d.ModalitaPagamento) {
          paymentMethod = d.ModalitaPagamento.toString();
        }
        const dueDate = d.DataScadenzaPagamento?.toString();
        const amount = toNum(d.ImportoPagamento);
        if (dueDate && amount != null) {
          payments.push({ dueDate, amount });
        }
      }
    }

    results.push({
      header: {
        direction,
        documentType,
        number: numero,
        date: data,
        currency: divisa,
        totalTaxable,
        totalVat,
        totalAmount,
        counterpartName,
        counterpartFiscalCode,
        counterpartVat,
        counterpartAddress,
        paymentMethod,
        sdiId,
      },
      lines,
      payments,
      xmlHash,
      xmlContent,
    });
  }

  // If no body found, still return empty result
  if (results.length === 0) {
    throw new Error("XML non valido: nessun FatturaElettronicaBody trovato");
  }

  return results;
}
