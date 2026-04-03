import {
  calculateFiscalCode,
  isValidFiscalCode,
  type Person,
} from "codice-fiscale-ts";

interface TaxCodeInput {
  firstName: string;
  lastName: string;
  birthDate: string; // ISO format YYYY-MM-DD
  birthPlace: string; // Municipality name (uppercase)
  gender: "M" | "F";
}

export async function calculateTaxCode(
  input: TaxCodeInput
): Promise<string | null> {
  if (
    !input.firstName ||
    !input.lastName ||
    !input.birthDate ||
    !input.birthPlace ||
    !input.gender
  ) {
    return null;
  }

  try {
    const date = new Date(input.birthDate);
    if (isNaN(date.getTime())) return null;

    const person: Person = {
      firstName: input.firstName.toUpperCase(),
      lastName: input.lastName.toUpperCase(),
      birthDate: date,
      gender: input.gender,
      birthPlace: input.birthPlace.toUpperCase(),
    };

    return await calculateFiscalCode(person);
  } catch {
    return null;
  }
}

export function validateTaxCode(code: string): boolean {
  if (!code || code.length !== 16) return false;
  return isValidFiscalCode(code.toUpperCase());
}
