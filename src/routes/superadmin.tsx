import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Building2, Cog, Wallet, Tag, BarChart3,
  ShieldCheck, Settings, MapPin, Users2, ClipboardList, Bell,
  Gavel, UserCog, Megaphone, Dumbbell, Layers
} from "lucide-react";
import { useRequireAuth } from "@/lib/guards";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/superadmin")({ component: SuperLayout });

function SuperLayout() {
  const { profile, loading } = useRequireAuth("superadmin");
  const [academyName, setAcademyName] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.academy_id) {
      supabase
        .from("academies")
        .select("name")
        .eq("id", profile.academy_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.name) setAcademyName(data.name);
        });
    }
  }, [profile?.academy_id]);

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
      userMeta={academyName ? `${academyName} · Superadmin` : "Academy Superadmin"}
      accentClass="text-superadmin"
      accentBg="bg-superadmin/10"
      dotColor="bg-superadmin"
      notificationTo="/superadmin/notifications"
      themeClass="theme-superadmin-dark"
      navSections={[
        {
          label: "Platform",
          items: [
            { to: "", label: "Academy Overview", icon: Building2 },
            { to: "athletes", label: "Boxers", icon: Users2 },
            { to: "academies", label: "Centers", icon: MapPin },
            { to: "config", label: "Academy Config", icon: Cog },
            { to: "fees", label: "Fee Structure", icon: Wallet },
            { to: "class-assigning", label: "Scheduling", icon: ClipboardList },
            { to: "judges", label: "Judges", icon: Gavel },
            { to: "fitness-catalog", label: "Fitness Catalog", icon: Dumbbell },
            { to: "categories", label: "Categories", icon: Layers },
          ],
        },
        {
          label: "Admin",
          items: [
            { to: "users", label: "User Management", icon: ShieldCheck },
            { to: "reports", label: "All Reports", icon: BarChart3 },
            { to: "announcements", label: "Ads & Notices", icon: Megaphone },
            { to: "notifications", label: "Notifications", icon: Bell },
            { to: "settings", label: "System Settings", icon: Settings },
          ],
        },
      ]}
    />
  );
}
