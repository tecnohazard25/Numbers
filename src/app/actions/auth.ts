"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { validatePassword } from "@/lib/password";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email e password sono obbligatori" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Credenziali non valide" };
  }

  // Get user roles to determine redirect
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Errore durante il login" };
  }

  const admin = createAdminClient();

  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  const roleNames = (userRoles ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ur: any) => ur.roles?.name as string
  );

  if (roleNames.includes("superadmin")) {
    return { redirectTo: "/superadmin" };
  } else if (roleNames.includes("user_manager")) {
    return { redirectTo: "/org/users" };
  } else {
    return { redirectTo: "/dashboard" };
  }
}

export async function logoutAction() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete("real_superadmin_id");

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPasswordRequestAction(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email obbligatoria" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? "" : ""}${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: "Errore nell'invio dell'email di recupero" };
  }

  return { success: "Email di recupero inviata. Controlla la tua casella di posta." };
}

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (password !== confirmPassword) {
    return { error: "Le password non corrispondono" };
  }

  const validationError = validatePassword(password);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Errore durante il reset della password" };
  }

  // Update password_expires_at
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({
        password_expires_at: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .eq("id", user.id);
  }

  redirect("/login?message=password_reset_success");
}

export async function forceChangePasswordAction(formData: FormData) {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Tutti i campi sono obbligatori" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Le password non corrispondono" };
  }

  const validationError = validatePassword(newPassword);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createClient();

  // Verify current password by re-authenticating
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Sessione non valida" };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { error: "Password attuale non corretta" };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { error: "Errore durante l'aggiornamento della password" };
  }

  // Update password_expires_at
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({
      password_expires_at: new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    })
    .eq("id", user.id);

  // Redirect based on role
  const { data: userRoles } = await admin
    .from("user_roles")
    .select("*, roles(name)")
    .eq("user_id", user.id);

  const roleNames = (userRoles ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ur: any) => ur.roles?.name as string
  );

  if (roleNames.includes("superadmin")) {
    redirect("/superadmin");
  } else if (roleNames.includes("user_manager")) {
    redirect("/org/users");
  } else {
    redirect("/dashboard");
  }
}

export async function updateProfileSettingsAction(settings: {
  locale: string;
  date_format: string;
  time_format: string;
  decimal_separator: string;
  thousands_separator: string;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update(settings)
    .eq("id", currentUser.profile.id);

  if (error) {
    return { error: "Errore nel salvataggio delle impostazioni" };
  }

  revalidatePath("/change-password");
  return { success: true };
}
