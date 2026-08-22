import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Building2, BarChart3, Activity, Sliders, Globe, Bell } from "lucide-react";
import { useRequireAuth } from "@/lib/guards";

export const Route = createFileRoute("/boxos-admin")({ component: BoxosAdminLayout });

function BoxosAdminLayout() {
  const { profile, loading } = useRequireAuth("boxos_admin");

  if (loading) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-t-transparent rounded-full animate-spin border-blue-500" />
      </div>
    );
  }

  return (
    <DashboardLayout
      themeClass="theme-boxos-admin-dark"
      basePath="/boxos-admin"
      role="BOXOS Admin"
      userName={profile?.full_name ?? "BOXOS Platform Admin"}
      userMeta="Platform Administrator"
      accentClass="text-blue-400"
      accentBg="bg-blue-500/10"
      dotColor="bg-blue-500"
      navSections={[
        {
          label: "Platform Management",
          items: [
            { to: "", label: "Academies", icon: Building2 },
            { to: "federations", label: "Federations", icon: Globe },
            { to: "reports", label: "Platform Reports", icon: BarChart3 },
            { to: "notifications", label: "Notifications", icon: Bell },
            { to: "activity", label: "Lifecycle Log", icon: Activity },
          ],
        },
        {
          label: "System",
          items: [
            { to: "settings", label: "Platform Settings", icon: Sliders },
          ],
        },
      ]}
      notificationTo="/boxos-admin/notifications"
    />
  );
}
