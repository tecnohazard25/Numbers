import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";

export interface ImpersonationInfo {
  userId: string;
  name: string;
  email: string;
  organizationId: string | null;
}

interface AppLayoutProps {
  children: React.ReactNode;
  roles: string[];
  userName: string;
  impersonating?: ImpersonationInfo | null;
}

export function AppLayout({ children, roles, userName, impersonating }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar roles={roles} userName={userName} impersonating={impersonating} />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex items-center p-4 border-b md:hidden">
          <SidebarTrigger />
        </div>
        <div className="p-4 md:p-6 lg:p-8 flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
      </main>
      <Toaster />
    </SidebarProvider>
  );
}
