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
      basePath="/coach"
      role="Coach"
      userName={profile?.full_name ?? "Coach"}
      userMeta="Boxing Coach"
      accentClass="text-primary-dark"
      accentBg="bg-primary/10"
      dotColor="bg-primary"
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
