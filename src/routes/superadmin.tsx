import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Building2, Cog, Wallet, Tag, Undo2, BarChart3,
  ShieldCheck, Settings, MapPin, Users2, ClipboardList, Bell, CalendarCheck,
  Swords, Gavel, Layers
} from "lucide-react";
import { useRequireAuth } from "@/lib/guards";

export const Route = createFileRoute("/superadmin")({ component: SuperLayout });

function SuperLayout() {
  const { profile, loading } = useRequireAuth("superadmin");
  if (loading) return (
    <div className="min-h-screen bg-background grid place-items-center">
      <span className="size-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return (
    <DashboardLayout
      basePath="/superadmin"
      role="Superadmin"
      userName={profile?.full_name ?? "Superadmin"}
      userMeta="Platform Owner"
      accentClass="text-superadmin"
      accentBg="bg-subtle"
      dotColor="bg-superadmin"
      notificationTo="/superadmin/notifications"
      navSections={[
        {
          label: "Platform",
          items: [
            { to: "", label: "Academy Overview", icon: Building2 },
            { to: "athletes", label: "Athletes", icon: Users2 },
            { to: "academies", label: "Academy Locations", icon: MapPin },
            { to: "config", label: "Academy Config", icon: Cog },
            { to: "fees", label: "Fee Structure", icon: Wallet },
            { to: "discounts", label: "Discounts & Penalties", icon: Tag },
            { to: "class-assigning", label: "Class Assigning", icon: ClipboardList },
            { to: "bouts", label: "Bout Management", icon: Swords },
            { to: "judges", label: "External Judges", icon: Gavel },
            { to: "categories", label: "Age & Weight Categories", icon: Layers },
          ],
        },
        {
          label: "Admin",
          items: [
            { to: "users", label: "User Management", icon: ShieldCheck },
            { to: "reports", label: "All Reports", icon: BarChart3 },
            { to: "notifications", label: "Notifications", icon: Bell },
            { to: "settings", label: "System Settings", icon: Settings },
          ],
        },
      ]}
    />
  );
}
