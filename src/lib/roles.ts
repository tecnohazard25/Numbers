export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  user_manager: "Gestione Utenti",
  business_analyst: "Business Analyst",
  accountant: "Contabile",
};

export function getRoleLabel(roleName: string): string {
  return ROLE_LABELS[roleName] ?? roleName;
}
