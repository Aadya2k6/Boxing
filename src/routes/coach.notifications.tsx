import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Bell, AlertTriangle, Check, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/coach/notifications")({ component: CoachNotifications });

function CoachNotifications() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadNotifs();

    const ch = supabase
      .channel("notifs-coach-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, loadNotifs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  async function loadNotifs() {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false });
      setNotifs(data ?? []);

      // Mark all as read
      const unread = (data ?? []).filter(n => !n.is_read).map(n => n.id);
      if (unread.length > 0) {
        await supabase.from("notifications").update({ is_read: true }).in("id", unread);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Important updates and alerts"
        actions={
          notifs.length > 0 && (
            <button
              onClick={async () => {
                const toastId = toast.loading("Clearing notifications...");
                await supabase.from("notifications").delete().eq("recipient_id", user?.id);
                loadNotifs();
                toast.success("Notifications cleared", { id: toastId });
              }}
              className="text-xs font-semibold px-3 py-1.5 border border-border rounded-lg hover:bg-elevated transition cursor-pointer"
            >
              Clear all
            </button>
          )
        }
      />

      <div className="space-y-3">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : notifs.length === 0 ? (
          <div className="bento-card p-12 text-center">
            <Bell className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
            <div className="font-semibold text-muted-foreground">All caught up</div>
            <div className="text-sm text-muted-foreground mt-1">No new notifications</div>
          </div>
        ) : (
          notifs.map(n => (
            <div key={n.id} className="bento-card p-4 flex gap-4">
              <div className={`size-10 rounded-xl grid place-items-center shrink-0 ${!n.is_read ? "bg-info/10 text-info" : "bg-elevated text-muted-foreground"}`}>
                <Bell className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{n.title}</div>
                <div className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{n.body}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  {new Date(n.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
