/**
 * Superadmin Bout Management — platform-wide view
 * §6.10 of screens-website.md: "same screens as §5.y, platform-wide view instead of one academy's.
 * Don't build two separate implementations."
 *
 * This page reuses the same UI as admin.bouts.tsx with an academy-scope picker added at the top.
 * TODO: when wiring to backend, add .eq("academy_id", selectedAcademyId) to all queries instead of the
 * superadmin's all-academy view being the default.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import {
  Plus, X, Clock, Users, AlertTriangle, Check, Swords, Edit2, CheckCircle, Building2
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/bouts")({ component: SuperadminBouts });

const STUB_ACADEMIES = ["All Academies", "BOXOS Academy Mumbai", "Ring Masters Delhi", "Champion's Corner Pune"];

interface Bout {
  id: string;
  boutNumber: number;
  redCorner: string;
  blueCorner: string;
  ageCategory: string;
  weightCategory: string;
  status: "scheduled" | "weigh-in" | "active" | "completed";
  coachAssigned: string | null;
  judgeCount: number;
  roundCount: number;
  roundDuration: number;
  academy: string;
}

const STUB_BOUTS: Bout[] = [
  {
    id: "b1", boutNumber: 1, redCorner: "Aisha Khan", blueCorner: "Priya Sharma",
    ageCategory: "Youth (17–18)", weightCategory: "60 kg", status: "scheduled",
    coachAssigned: "Coach Ravi", judgeCount: 3, roundCount: 3, roundDuration: 120,
    academy: "BOXOS Academy Mumbai",
  },
  {
    id: "b2", boutNumber: 2, redCorner: "Meera Nair", blueCorner: "Divya Rao",
    ageCategory: "Senior (19+)", weightCategory: "54 kg", status: "active",
    coachAssigned: null, judgeCount: 3, roundCount: 5, roundDuration: 120,
    academy: "Ring Masters Delhi",
  },
  {
    id: "b3", boutNumber: 3, redCorner: "Sana Sheikh", blueCorner: "Lakshmi Devi",
    ageCategory: "Junior (15–16)", weightCategory: "46 kg", status: "completed",
    coachAssigned: "Coach Arjun", judgeCount: 3, roundCount: 3, roundDuration: 120,
    academy: "Champion's Corner Pune",
  },
];

function statusBadge(s: Bout["status"]) {
  const map: Record<Bout["status"], any> = { scheduled: "info", "weigh-in": "warning", active: "success", completed: "neutral" };
  return <span className={`badge badge-${map[s]}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

function SuperadminBouts() {
  const [selectedAcademy, setSelectedAcademy] = useState(STUB_ACADEMIES[0]);

  const filtered = selectedAcademy === "All Academies"
    ? STUB_BOUTS
    : STUB_BOUTS.filter(b => b.academy === selectedAcademy);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Bout Management"
        subtitle="Platform-wide view of all bouts across academies"
        actions={
          <button
            onClick={() => toast.info("TODO: Add Bout — wire to backend")}
            className="inline-flex items-center gap-2 bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-dark/90 transition shadow-card cursor-pointer"
          >
            <Plus className="size-4" /> Add Bout
          </button>
        }
      />

      {/* Academy filter */}
      <div className="flex items-center gap-3">
        <Building2 className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
        <select value={selectedAcademy} onChange={e => setSelectedAcademy(e.target.value)} className="input-premium max-w-xs">
          {STUB_ACADEMIES.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <Swords className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No bouts for this academy</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(bout => (
            <div key={bout.id} className="bento-card p-5">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-display font-bold text-sm">Bout #{bout.boutNumber}</span>
                    {statusBadge(bout.status)}
                    <span className="badge badge-neutral">{bout.ageCategory}</span>
                    <span className="badge badge-neutral">{bout.weightCategory}</span>
                    <span className="badge badge-gold flex items-center gap-1"><Building2 className="size-2.5" />{bout.academy}</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap mt-2">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-red-500 shrink-0" />
                      <AvatarInitials name={bout.redCorner} size="sm" />
                      <span className="text-sm font-semibold">{bout.redCorner}</span>
                    </div>
                    <span className="text-muted-foreground font-bold text-sm">vs</span>
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-blue-500 shrink-0" />
                      <AvatarInitials name={bout.blueCorner} size="sm" />
                      <span className="text-sm font-semibold">{bout.blueCorner}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="size-3" />{bout.roundCount}R × {bout.roundDuration}s</span>
                    <span className="flex items-center gap-1"><Users className="size-3" />{bout.judgeCount} judges</span>
                    {bout.coachAssigned
                      ? <span className="flex items-center gap-1"><CheckCircle className="size-3 text-success" />{bout.coachAssigned}</span>
                      : <span className="flex items-center gap-1 text-warning"><AlertTriangle className="size-3" />No coach</span>}
                  </div>
                </div>
                <button onClick={() => toast.info("TODO: wire edit bout")} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated flex items-center gap-1 cursor-pointer shrink-0"><Edit2 className="size-3" />Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
