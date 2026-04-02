"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createUserAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Non autorizzato" };
  }

  const { roles, profile: currentProfile } = currentUser;

  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organizationId = formData.get("organizationId") as string;
  const selectedRoles = formData.getAll("roles") as string[];

  if (!firstName || !lastName || !email) {
    return { error: "Nome, cognome e email sono obbligatori" };
  }

  const isSuperadmin = roles.includes("superadmin");
  const isOrgAdmin = roles.includes("org_admin");

  // Org admin can only create in their own org
  const targetOrgId = isSuperadmin
    ? organizationId
    : currentProfile.organization_id;

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  // Org admin cannot assign superadmin or org_admin roles
  if (
    isOrgAdmin &&
    !isSuperadmin &&
    selectedRoles.some((r) => r === "superadmin" || r === "org_admin")
  ) {
    return { error: "Non puoi assegnare questo ruolo" };
  }

  const admin = createAdminClient();

  // Create auth user
  let authUser;
  let authError;

  if (process.env.NODE_ENV === "development") {
    const result = await admin.auth.admin.createUser({
      email,
      password: "TempPass1!",
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        organization_id: targetOrgId,
      },
    });
    authUser = result.data;
    authError = result.error;
  } else {
    const result = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        first_name: firstName,
        last_name: lastName,
        organization_id: targetOrgId,
      },
    });
    authUser = result.data;
    authError = result.error;
  }

  if (authError || !authUser.user) {
    return { error: `Errore nella creazione: ${authError?.message}` };
  }

  // Upsert profile directly (don't rely on DB trigger)
  await admin.from("profiles").upsert({
    id: authUser.user.id,
    first_name: firstName,
    last_name: lastName,
    organization_id: targetOrgId,
  });

  // Assign roles
  if (selectedRoles.length > 0) {
    const { data: roleRecords } = await admin
      .from("roles")
      .select("id, name")
      .in("name", selectedRoles);

    if (roleRecords) {
      await admin.from("user_roles").insert(
        roleRecords.map((r) => ({
          user_id: authUser.user.id,
          role_id: r.id,
          assigned_by: currentUser.user.id,
        }))
      );
    }
  }

  revalidatePath("/superadmin/users");
  revalidatePath("/org/users");
  return { success: true };
}

export async function updateUserAction(
  userId: string,
  data: {
    firstName: string;
    lastName: string;
    roles: string[];
    passwordExpiresAt: string;
    newPassword?: string;
  }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Non autorizzato" };
  }

  const { roles: currentRoles } = currentUser;
  const isSuperadmin = currentRoles.includes("superadmin");
  const isOrgAdmin = currentRoles.includes("org_admin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  // Update profile
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      first_name: data.firstName,
      last_name: data.lastName,
      password_expires_at: data.passwordExpiresAt,
    })
    .eq("id", userId);

  if (profileError) {
    return { error: "Errore nell'aggiornamento del profilo" };
  }

  // Update password if provided
  if (data.newPassword) {
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (pwError) {
      return { error: `Errore nell'aggiornamento della password: ${pwError.message}` };
    }
    // Set password as expired so user must change it at first login
    await admin
      .from("profiles")
      .update({ password_expires_at: new Date(0).toISOString() })
      .eq("id", userId);
  }

  // Update roles: remove all, then re-assign
  await admin.from("user_roles").delete().eq("user_id", userId);

  if (data.roles.length > 0) {
    const { data: roleRecords } = await admin
      .from("roles")
      .select("id, name")
      .in("name", data.roles);

    if (roleRecords && roleRecords.length > 0) {
      await admin.from("user_roles").insert(
        roleRecords.map((r) => ({
          user_id: userId,
          role_id: r.id,
          assigned_by: currentUser.user.id,
        }))
      );
    }
  }

  revalidatePath("/superadmin/users");
  revalidatePath("/org/users");
  return { success: true };
}

export async function toggleUserAction(userId: string, isActive: boolean) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Non autorizzato" };
  }

  const { roles, profile: currentProfile } = currentUser;

  const isSuperadmin = roles.includes("superadmin");
  const isOrgAdmin = roles.includes("org_admin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  // If org_admin, check user belongs to same org
  if (isOrgAdmin && !isSuperadmin) {
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (
      !targetProfile ||
      targetProfile.organization_id !== currentProfile.organization_id
    ) {
      return { error: "Non autorizzato" };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    return { error: "Errore nell'aggiornamento" };
  }

  revalidatePath("/superadmin/users");
  revalidatePath("/org/users");
  return { success: true };
}

export async function deleteUserAction(userId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Non autorizzato" };
  }

  const { roles, profile: currentProfile } = currentUser;
  const isSuperadmin = roles.includes("superadmin");
  const isOrgAdmin = roles.includes("org_admin");

  if (!isSuperadmin && !isOrgAdmin) {
    return { error: "Non autorizzato" };
  }

  const admin = createAdminClient();

  // If org_admin, check user belongs to same org
  if (isOrgAdmin && !isSuperadmin) {
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (
      !targetProfile ||
      targetProfile.organization_id !== currentProfile.organization_id
    ) {
      return { error: "Non autorizzato" };
    }
  }

  // Cannot delete yourself
  if (userId === currentUser.user.id) {
    return { error: "Non puoi eliminare te stesso" };
  }

  // Delete auth user (cascades to profiles and user_roles)
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    return { error: "Errore nell'eliminazione dell'utente" };
  }

  revalidatePath("/superadmin/users");
  revalidatePath("/org/users");
  return { success: true };
}
