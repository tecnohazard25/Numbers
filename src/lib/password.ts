export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export const PASSWORD_REQUIREMENTS =
  "Minimo 8 caratteri, una maiuscola, una minuscola, un numero e un carattere speciale";

export const PASSWORD_REQUIREMENTS_KEY = "auth.passwordRequirements";

export function validatePassword(password: string): string | null {
  if (!PASSWORD_REGEX.test(password)) {
    return PASSWORD_REQUIREMENTS;
  }
  return null;
}
