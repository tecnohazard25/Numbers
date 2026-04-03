import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";

interface AppLayoutProps {
  children: React.ReactNode;
  roles: string[];
  userName: string;
}

export function AppLayout({ children, roles, userName }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar roles={roles} userName={userName} />
      <main className="flex-1 flex flex-col min-h-screen">
        <div className="flex items-center p-4 border-b md:hidden">
          <SidebarTrigger />
        </div>
        <div className="p-4 md:p-6 lg:p-8 flex-1 flex flex-col min-h-0">{children}</div>
      </main>
      <Toaster />
    </SidebarProvider>
  );
}
