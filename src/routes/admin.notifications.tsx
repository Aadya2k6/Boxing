import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import {
  CreditCard, AlertTriangle, UserPlus, Bell,
  Banknote, Check, Calendar, Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/notifications")({ component: AdminNotifs });

const typeIcon: Record<string, any> = {
  fee_package_sent: CreditCard,
  cash_pending: Banknote,
  cash_approved: Check,
  payment_reminder: AlertTriangle,
  leave_approved: Calendar,
  leave_rejected: Calendar,
  refund_approved: Check,
  refund_rejected: AlertTriangle,
  default: Bell,
};
const typeTone: Record<string, string> = {
  fee_package_sent: "info", cash_pending: "warning", cash_approved: "success",
  payment_reminder: "danger", leave_approved: "success", leave_rejected: "danger",
  refund_approved: "success", refund_rejected: "warning",
};

function AdminNotifs() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadNotifs();
    const ch = supabase.channel("notifs-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, loadNotifs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  async function loadNotifs() {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifs(data ?? []);
    setLoading(false);
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false);
    loadNotifs();
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  function relTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={unreadCount > 0 ? (
          <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground transition">Mark all read</button>
        ) : undefined}
      />
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : notifs.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="size-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : notifs.map(n => {
          const Icon = typeIcon[n.type] ?? typeIcon.default;
          const tone = typeTone[n.type] ?? "default";
          return (
            <div key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`flex gap-4 px-5 py-4 border-t first:border-0 border-border hover:bg-subtle transition cursor-pointer ${!n.is_read ? "bg-info/[0.02]" : ""}`}>
              <div className={`size-9 rounded-md grid place-items-center shrink-0 ${
                tone === "success" ? "bg-success/10 text-success" :
                tone === "warning" ? "bg-warning/10 text-warning" :
                tone === "danger" ? "bg-destructive/10 text-destructive" :
                tone === "info" ? "bg-info/10 text-info" : "bg-subtle text-muted-foreground"
              }`}>
                <Icon className="size-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  {!n.is_read && <span className="size-1.5 rounded-full bg-info shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{n.body}</div>
              </div>
              <span className="text-xs text-muted-foreground tabular shrink-0 mt-0.5">{relTime(n.created_at)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
