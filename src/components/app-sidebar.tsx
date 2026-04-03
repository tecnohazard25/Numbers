"use client";

import {
  Building2,
  CircleUserRound,
  Contact2,
  EyeOff,
  Settings,
  Users,
  LayoutDashboard,
  LogOut,
  Shield,
} from "lucide-react";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";
import type { ImpersonationInfo } from "@/components/app-layout";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/context";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

interface AppSidebarProps {
  roles: string[];
  userName: string;
  impersonating?: ImpersonationInfo | null;
}

export function AppSidebar({ roles, userName, impersonating }: AppSidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [isRestoring, setIsRestoring] = useState(false);

  async function handleStopImpersonation() {
    setIsRestoring(true);
    const res = await fetch("/api/impersonate", { method: "DELETE" });
    const data = await res.json();
    if (data.error) {
      setIsRestoring(false);
      return;
    }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.verifyOtp({
      token_hash: data.tokenHash,
      type: "magiclink",
    });
    window.location.href = "/superadmin";
  }

  const superadminItems: NavItem[] = [
    { title: t("sidebar.organizations"), url: "/superadmin", icon: Building2 },
  ];

  const orgAdminItems: NavItem[] = [
    { title: t("sidebar.users"), url: "/org/users", icon: Users },
  ];

  const commonItems: NavItem[] = [
    { title: t("sidebar.dashboard"), url: "/dashboard", icon: LayoutDashboard },
  ];

  const anagraficaItems: NavItem[] = [
    { title: t("sidebar.subjects"), url: "/subjects", icon: Contact2 },
  ];

  const settingsItems: NavItem[] = [
    { title: t("sidebar.settings"), url: "/settings", icon: Settings },
  ];

  const isSuperadmin = roles.includes("superadmin");
  const isOrgAdmin = roles.includes("user_manager");
  const hasAnagraficaAccess =
    roles.includes("business_analyst") ||
    roles.includes("accountant");

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6" />
          <span className="font-semibold text-lg">Numbers</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isSuperadmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("sidebar.superAdmin")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {superadminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={pathname === item.url}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {isOrgAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("sidebar.userManagement")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {orgAdminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={pathname === item.url}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {hasAnagraficaAccess && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("sidebar.registry")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {anagraficaItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={pathname.startsWith(item.url)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {roles.includes("accountant") && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("sidebar.configuration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={pathname.startsWith(item.url)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.general")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {commonItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton render={<Link href={item.url} />} isActive={pathname === item.url}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Link
          href="/change-password"
          className="flex items-center gap-2 text-sm text-muted-foreground mb-2 truncate hover:text-foreground transition-colors"
          title={t("sidebar.changePassword")}
        >
          <CircleUserRound className="h-4 w-4 shrink-0" />
          <span className="truncate">{userName}</span>
        </Link>
        {impersonating ? (
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full border-amber-600 text-amber-600 hover:bg-amber-600 hover:text-white"
            )}
            onClick={handleStopImpersonation}
            disabled={isRestoring}
          >
            <EyeOff className="h-4 w-4 mr-2" />
            {isRestoring ? t("impersonation.restoring") : t("impersonation.backToSuperadmin")}
          </button>
        ) : (
          <form action={logoutAction}>
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full"
              )}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("auth.logout")}
            </button>
          </form>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
