export const ROLE_LABELS: Record<string, string> = {
  superadmin: "roles.superadmin",
  user_manager: "roles.userManager",
  business_analyst: "roles.businessAnalyst",
  accountant: "roles.accountant",
};

export function getRoleLabel(roleName: string): string {
  return ROLE_LABELS[roleName] ?? roleName;
}
