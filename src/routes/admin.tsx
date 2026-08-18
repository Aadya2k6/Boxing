import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { LayoutGrid, Users, Wallet, Receipt, Bell, Settings, CalendarCheck, Swords, Gavel } from "lucide-react";
import { useRequireAuth } from "@/lib/guards";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { profile, loading } = useRequireAuth("admin");
  if (loading) return <div className="min-h-screen bg-background grid place-items-center"><span className="size-6 border-2 border-info border-t-transparent rounded-full animate-spin" /></div>;
  return (
    <DashboardLayout
      basePath="/admin"
      role="Admin"
      themeClass="theme-admin-dark"
      userName={profile?.full_name ?? "Admin"}
      userMeta="Academy Director"
      accentClass="text-info"
      accentBg="bg-info/10"
      dotColor="bg-info"
      notificationTo="/admin/notifications"
      navSections={[
        {
          label: "Workspace",
          items: [
            { to: "", label: "Overview", icon: LayoutGrid },
            { to: "athletes", label: "Athletes", icon: Users },
            { to: "fees", label: "Fee Management", icon: Wallet },
            { to: "invoices", label: "Invoices", icon: Receipt },
            { to: "attendance", label: "Attendance & Leaves", icon: CalendarCheck },
            { to: "scheduling", label: "Scheduling", icon: CalendarCheck },
            { to: "bouts", label: "Bout Management", icon: Swords },
            { to: "judges", label: "Judges", icon: Gavel },
          ],
        },
        {
          label: "Account",
          items: [
            { to: "notifications", label: "Notifications", icon: Bell },
            { to: "settings", label: "Settings", icon: Settings },
          ],
        },
      ]}
    />
  );
}
