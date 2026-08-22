import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/dashboard/DashboardLayout";
import {
  Heart,
  Baby,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Shield,
  Info,
  Loader2,
  Lock,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/athlete/declaration")({
  component: DeclarationPage,
});

interface DeclarationRecord {
  id: string;
  status: "pending_window" | "open" | "submitted" | "missed" | "not_required";
  window_opens_at: string | null;
  submitted_at: string | null;
  notes: string | null;
  ring_sessions: { id: string; name: string; scheduled_at: string } | null;
}

const STATUS_CONFIG = {
  pending_window: {
    label: "Upcoming",
    icon: Clock,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    description: "Declaration window opens 24h before the session.",
  },
  open: {
    label: "Action Required",
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    description: "Please submit your declaration before the session starts.",
  },
  submitted: {
    label: "Submitted",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    description: "Your declaration has been submitted successfully.",
  },
  missed: {
    label: "Missed",
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    description: "Declaration window closed. Contact your coach.",
  },
  not_required: {
    label: "Not Required",
    icon: CheckCircle2,
    color: "text-muted-foreground",
    bg: "bg-muted/30 border-border",
    description: "No declaration needed for this session.",
  },
};

function DeclarationPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState<string | null>(null);
  const [boxerProfileId, setBoxerProfileId] = useState<string | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationRecord[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  async function loadData() {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: ap } = await supabase
        .from("boxer_profiles")
        .select("id, gender")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!ap) { setLoading(false); return; }

      setGender(ap.gender ?? null);
      setBoxerProfileId(ap.id);

      if (ap.gender?.toLowerCase() !== "female") {
        setLoading(false);
        return;
      }

      const { data: decls } = await supabase
        .from("pregnancy_declarations")
        .select(`
          id, status, window_opens_at, submitted_at, notes,
          ring_sessions(id, name, scheduled_at)
        `)
        .eq("boxer_profile_id", ap.id)
        .order("window_opens_at", { ascending: false })
        .limit(30);

      setDeclarations((decls as any[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(declarationId: string) {
    setSubmitting(declarationId);
    try {
      const { error } = await supabase
        .from("pregnancy_declarations")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", declarationId);

      if (error) throw error;
      await loadData();
    } catch (e) {
      console.error("Failed to submit declaration:", e);
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Non-female athletes: show restricted page
  if (!gender || gender.toLowerCase() !== "female") {
    return (
      <>
        <PageHeader
          title="Declaration"
          subtitle="Pre-session fitness declarations"
        />
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <div className="size-16 rounded-2xl bg-muted/20 flex items-center justify-center">
            <Lock className="size-7 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Not Applicable</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Pre-session declarations are only required for female athletes.
            </p>
          </div>
        </div>
      </>
    );
  }

  const pending = declarations.filter((d) => d.status === "open");
  const upcoming = declarations.filter((d) => d.status === "pending_window");
  const past = declarations.filter(
    (d) => d.status === "submitted" || d.status === "missed" || d.status === "not_required"
  );

  return (
    <>
      <PageHeader
        title="Declaration"
        subtitle="Pre-session fitness & pregnancy declarations"
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 mb-6">
        <Shield className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Why declarations matter — </span>
          Indian boxing regulations require adult female athletes to declare fitness status
          (including pregnancy status) before each training session. This is mandatory for your safety.
        </div>
      </div>

      {/* Action required */}
      {pending.length > 0 && (
        <SectionCard title="Action Required" className="mb-4">
          <div className="space-y-3">
            {pending.map((d) => {
              const cfg = STATUS_CONFIG[d.status];
              const Icon = cfg.icon;
              const session = d.ring_sessions;
              const sessionDate = session?.scheduled_at
                ? new Date(session.scheduled_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—";
              const sessionTime = session?.scheduled_at
                ? new Date(session.scheduled_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-3 border rounded-xl px-4 py-3.5 ${cfg.bg}`}
                >
                  <Baby className="size-5 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">
                      {session?.name || "Training Session"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sessionDate} {sessionTime && `· ${sessionTime}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSubmit(d.id)}
                    disabled={submitting === d.id}
                    className="shrink-0 flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    {submitting === d.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <>
                        Submit <ChevronRight className="size-3" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <SectionCard title="Upcoming" className="mb-4">
          <div className="space-y-2">
            {upcoming.map((d) => {
              const session = d.ring_sessions;
              const windowDate = d.window_opens_at
                ? new Date(d.window_opens_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })
                : "—";

              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 bg-muted/10"
                >
                  <Calendar className="size-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {session?.name || "Training Session"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Declaration window opens {windowDate}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    Upcoming
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* No pending / upcoming */}
      {pending.length === 0 && upcoming.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="size-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Heart className="size-5 text-emerald-400" />
          </div>
          <div>
            <div className="font-semibold text-sm">All clear</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              No pending declarations right now.
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {past.length > 0 && (
        <SectionCard title="History">
          <div className="space-y-2">
            {past.map((d) => {
              const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.not_required;
              const Icon = cfg.icon;
              const session = d.ring_sessions;
              const submittedDate = d.submitted_at
                ? new Date(d.submitted_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : null;
              const sessionDate = session?.scheduled_at
                ? new Date(session.scheduled_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—";

              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${cfg.bg}`}
                >
                  <Icon className={`size-4 shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {session?.name || "Training Session"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sessionDate}
                      {submittedDate && ` · Submitted ${submittedDate}`}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}
                  >
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {declarations.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Info className="size-8 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm mb-1">No declarations yet</div>
            <div className="text-xs text-muted-foreground max-w-xs">
              Declarations are automatically created by the system before each training session.
              Check back closer to your next session.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
