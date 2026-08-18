import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Radio, Users, CalendarCheck, Bell, Settings } from "lucide-react";
import { useRequireAuth } from "@/lib/guards";

export const Route = createFileRoute("/coach")({ component: CoachLayout });

function CoachLayout() {
  const { profile, loading } = useRequireAuth("coach");
  if (loading)
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <span className="size-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--color-coach)", borderTopColor: "transparent" }} />
      </div>
    );
  return (
    <DashboardLayout
      themeClass="theme-coach-dark"
      basePath="/coach"
      role="Coach"
      userName={profile?.full_name ?? "Coach"}
      userMeta="Boxing Coach"
      accentClass="text-coach"
      accentBg="bg-coach/10"
      dotColor="bg-coach"
      notificationTo="/coach/notifications"
      navSections={[
        {
          label: "Today",
          items: [
            { to: "", label: "Rings", icon: Radio },
            { to: "boxers", label: "My Boxers", icon: Users },
            { to: "attendance", label: "Attendance", icon: CalendarCheck },
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
