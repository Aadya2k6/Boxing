import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/boxos-admin/notifications")({
  component: BoxosAdminNotifications,
});

function BoxosAdminNotifications() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Platform-wide notifications and alerts"
      />

      <div className="bento-card p-12 text-center">
        <Bell className="size-12 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
        <div className="font-display font-bold text-lg">No Notifications Yet</div>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          Notifications will appear here once the system starts generating platform alerts.
        </p>
      </div>
    </div>
  );
}
