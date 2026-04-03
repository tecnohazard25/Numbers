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

export function generatePassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*_+-=";
  const all = upper + lower + digits + symbols;

  // Ensure at least one of each required type
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  // Fill remaining with random chars
  for (let i = chars.length; i < 12; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }

  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
