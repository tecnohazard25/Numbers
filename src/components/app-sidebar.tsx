"use client";

import {
  Building2,
  Users,
  LayoutDashboard,
  LogOut,
  Shield,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

interface AppSidebarProps {
  roles: string[];
  userName: string;
}

export function AppSidebar({ roles, userName }: AppSidebarProps) {
  const pathname = usePathname();

  const superadminItems: NavItem[] = [
    { title: "Organization", url: "/superadmin", icon: Building2 },
  ];

  const orgAdminItems: NavItem[] = [
    { title: "Utenti", url: "/org/users", icon: Users },
  ];

  const commonItems: NavItem[] = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  ];

  const isSuperadmin = roles.includes("superadmin");
  const isOrgAdmin = roles.includes("org_admin");

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
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
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
            <SidebarGroupLabel>Organizzazione</SidebarGroupLabel>
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
        <SidebarGroup>
          <SidebarGroupLabel>Generale</SidebarGroupLabel>
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
        <div className="text-sm text-muted-foreground mb-2 truncate">
          {userName}
        </div>
        <form action={logoutAction}>
          <Button variant="outline" size="sm" className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Esci
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
