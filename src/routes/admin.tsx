import { createFileRoute, useLocation } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { LayoutGrid, Users, Wallet, Receipt, Bell, Settings, CalendarCheck, Swords, Gavel } from "lucide-react";
import { useRequireAuth } from "@/lib/guards";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { profile, loading } = useRequireAuth("admin");
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-background grid place-items-center"><span className="size-6 border-2 border-info border-t-transparent rounded-full animate-spin" /></div>;
  const features = profile?.granted_permissions;
  
  const hasFeature = (id: string) => {
    // If granted_permissions is null or completely empty array, 
    // it's likely a legacy admin. Give them access to avoid breaking existing users.
    if (!features || features.length === 0) return true;
    
    // If we specifically set "NONE", they have no permissions
    if (features.includes("NONE")) return false;

    return features.includes(id);
  };

  const path = location.pathname.replace("/admin", "").replace("/", "");
  const isProtectedPath = !["", "notifications", "settings"].includes(path);
  
  const unauthorizedMessage = (isProtectedPath && !hasFeature(path)) 
    ? "You do not have permission to view this section. Please contact your Superadmin to request access." 
    : undefined;

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
      unauthorizedMessage={unauthorizedMessage}
      navSections={[
        {
          label: "Workspace",
          items: [
            { to: "", label: "Overview", icon: LayoutGrid },
            hasFeature("boxers") && { to: "athletes", label: "Boxers", icon: Users },
            hasFeature("fees") && { to: "fees", label: "Fee Management", icon: Wallet },
            hasFeature("fees") && { to: "invoices", label: "Invoices", icon: Receipt },
            hasFeature("attendance") && { to: "attendance", label: "Attendance & Leaves", icon: CalendarCheck },
            hasFeature("coaches") && { to: "coaches", label: "Coaches", icon: Users },
          ].filter(Boolean) as any,
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
