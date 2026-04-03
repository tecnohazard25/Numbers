"use server";

// IBAN length per country (ISO 3166-1 alpha-2)
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20, BR: 29,
  BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EG: 29, SV: 28,
  EE: 20, FO: 18, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23, GR: 27, GL: 18,
  GT: 28, HU: 28, IS: 26, IQ: 23, IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20,
  XK: 20, KW: 30, LV: 21, LB: 28, LY: 25, LI: 21, LT: 20, LU: 20, MT: 31,
  MR: 27, MU: 30, MD: 24, MC: 27, ME: 22, NL: 18, MK: 19, NO: 15, PK: 24,
  PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, LC: 32, SM: 27, SA: 24, RS: 22,
  SC: 31, SK: 24, SI: 19, ES: 24, SD: 18, SE: 24, CH: 21, TL: 23, TN: 24,
  TR: 26, UA: 29, AE: 23, GB: 22, VA: 22, VG: 24,
};

function mod97(iban: string): number {
  // Move first 4 chars to end, replace letters with digits (A=10, B=11, ...)
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 65 && code <= 90 ? (code - 55).toString() : ch;
    })
    .join("");

  // Compute mod 97 on the large number (process in chunks)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder;
}

export async function validateIbanAction(
  iban: string
): Promise<{ valid: boolean; error?: string }> {
  if (!iban) return { valid: false, error: "IBAN obbligatorio" };

  // Normalize: remove spaces/dashes, uppercase
  const cleaned = iban.replace(/[\s-]/g, "").toUpperCase();

  // Basic format check: 2 letters + 2 digits + alphanumeric
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
    return { valid: false, error: "Formato IBAN non valido" };
  }

  // Country code check
  const country = cleaned.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[country];
  if (!expectedLength) {
    return { valid: false, error: `Codice paese non supportato: ${country}` };
  }

  // Length check
  if (cleaned.length !== expectedLength) {
    return {
      valid: false,
      error: `Lunghezza IBAN non corretta per ${country}: attesi ${expectedLength} caratteri, trovati ${cleaned.length}`,
    };
  }

  // MOD-97 checksum validation (ISO 7064)
  if (mod97(cleaned) !== 1) {
    return { valid: false, error: "Checksum IBAN non valido" };
  }

  return { valid: true };
}
