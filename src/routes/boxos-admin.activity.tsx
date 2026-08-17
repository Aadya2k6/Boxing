import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { supabase, AcademyLifecycleEvent, Academy } from "@/lib/supabase";
import { fetchAcademies, fetchLifecycleEvents } from "@/lib/platform-store";
import {
  Activity,
  Search,
  Filter,
  Building2,
  Calendar,
  Loader2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Archive,
  CheckCircle2,
  PlusCircle,
  Sliders,
  UserPlus,
} from "lucide-react";

export const Route = createFileRoute("/boxos-admin/activity")({ component: PlatformActivityLogPage });

function eventTypeBadge(type: AcademyLifecycleEvent["event_type"]) {
  switch (type) {
    case "created":
      return <span className="badge badge-success flex items-center gap-1"><PlusCircle className="size-2.5" />Created</span>;
    case "suspended":
      return <span className="badge badge-warning flex items-center gap-1"><ShieldAlert className="size-2.5" />Suspended</span>;
    case "reactivated":
      return <span className="badge badge-success flex items-center gap-1"><CheckCircle2 className="size-2.5" />Reactivated</span>;
    case "archived":
      return <span className="badge badge-neutral flex items-center gap-1"><Archive className="size-2.5" />Archived</span>;
    case "hard_deleted":
      return <span className="badge badge-danger flex items-center gap-1">Hard Deleted</span>;
    case "superadmin_invited":
      return <span className="badge badge-info flex items-center gap-1"><UserPlus className="size-2.5" />Superadmin Invited</span>;
    case "settings_changed":
      return <span className="badge badge-neutral flex items-center gap-1"><Sliders className="size-2.5" />Settings Changed</span>;
    default:
      return <span className="badge badge-neutral">{type}</span>;
  }
}

function PlatformActivityLogPage() {
  const [events, setEvents] = useState<(AcademyLifecycleEvent & { academy_name?: string })[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAcademy, setSelectedAcademy] = useState("all");
  const [selectedEventType, setSelectedEventType] = useState("all");

  useEffect(() => {
    loadActivityLog();

    const channel = supabase
      .channel("boxos-admin-lifecycle-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "academy_lifecycle_events" }, loadActivityLog)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadActivityLog() {
    setLoading(true);
    try {
      // 1. Fetch Academies map
      const acRes = await fetchAcademies();
      const acList = acRes.data;
      setAcademies(acList);

      const acMap: Record<string, string> = {};
      acList.forEach(a => {
        acMap[a.id] = a.name;
      });

      // 2. Fetch Lifecycle events
      const evs = await fetchLifecycleEvents();

      const enriched = evs.map(e => ({
        ...e,
        academy_name: acMap[e.academy_id] || "Unknown / Deleted Academy",
      }));

      setEvents(enriched);
    } catch (err: any) {
      console.error("Error loading activity log:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = events.filter(e => {
    const matchQ =
      !search ||
      e.academy_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.reason?.toLowerCase().includes(search.toLowerCase());

    const matchA = selectedAcademy === "all" || e.academy_id === selectedAcademy;
    const matchE = selectedEventType === "all" || e.event_type === selectedEventType;

    return matchQ && matchA && matchE;
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Platform Lifecycle Log"
        subtitle="Chronological audit trail of all academy state transitions and platform-level operations"
        actions={
          <button
            onClick={loadActivityLog}
            className="size-9 rounded-xl border border-border bg-surface hover:bg-elevated grid place-items-center text-muted-foreground hover:text-foreground transition cursor-pointer"
            title="Refresh Log"
          >
            <RefreshCw className="size-4" />
          </button>
        }
      />

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by academy or reason…"
            className="input-premium pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedAcademy}
            onChange={e => setSelectedAcademy(e.target.value)}
            className="input-premium text-xs max-w-xs"
          >
            <option value="all">All Academies</option>
            {academies.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={selectedEventType}
            onChange={e => setSelectedEventType(e.target.value)}
            className="input-premium text-xs max-w-xs capitalize"
          >
            <option value="all">All Event Types</option>
            <option value="created">Created</option>
            <option value="suspended">Suspended</option>
            <option value="reactivated">Reactivated</option>
            <option value="archived">Archived</option>
            <option value="hard_deleted">Hard Deleted</option>
            <option value="superadmin_invited">Superadmin Invited</option>
            <option value="settings_changed">Settings Changed</option>
          </select>
        </div>
      </div>

      {/* Activity Table */}
      <SectionCard title="Event History" subtitle={`${filtered.length} event record${filtered.length !== 1 ? "s" : ""}`}>
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="size-6 animate-spin mx-auto text-fuchsia-600 mb-2" />
            <div className="text-xs text-muted-foreground">Streaming live lifecycle events…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="size-8 text-muted-foreground/40 mx-auto mb-2" strokeWidth={1.5} />
            <div className="text-sm text-muted-foreground">No lifecycle events match current filters</div>
          </div>
        ) : (
          <DataTable
            headers={["Academy", "Event Type", "Reason / Description", "Timestamp", ""]}
            rows={filtered.map(ev => [
              <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                <span>{ev.academy_name}</span>
              </div>,
              eventTypeBadge(ev.event_type),
              <span className="text-xs text-muted-foreground max-w-md block truncate" title={ev.reason ?? ""}>
                {ev.reason || "—"}
              </span>,
              <span className="text-xs text-muted-foreground tabular whitespace-nowrap">
                {new Date(ev.created_at).toLocaleString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>,
              <Link
                to="/boxos-admin/academies/$academyId"
                params={{ academyId: ev.academy_id }}
                className="p-1 hover:text-fuchsia-600 transition inline-block"
                title="View Academy"
              >
                <ExternalLink className="size-3.5 text-muted-foreground hover:text-fuchsia-600" />
              </Link>,
            ])}
          />
        )}
      </SectionCard>
    </div>
  );
}
