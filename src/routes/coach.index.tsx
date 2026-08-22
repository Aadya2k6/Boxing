import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect, useRef } from "react";
import {
  Radio, Play, Pause, Square, RotateCcw, X, ChevronDown,
  Phone, AlertTriangle, Baby, Zap, ShieldAlert, Trophy, Clock,
  Users, Edit2, CheckCircle, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/coach/")({ component: CoachRings });

// ── Stub data — TODO: wire to coach_ring_assignments + bouts + Realtime timer channel
interface RingState {
  id: string;
  ringName: string;
  venue: string;
  currentBout: {
    boutNumber: number;
    redCorner: string;
    blueCorner: string;
    ageCategory: string;
    weightCategory: string;
  } | null;
  roundState: "idle" | "active" | "paused" | "rest" | "completed";
  currentRound: number;
  totalRounds: number;
  roundDuration: number; // seconds
  restDuration: number;
  timeLeft: number; // seconds
  knockdownsRed: number;
  knockdownsBlue: number;
  isAssignedJudge: boolean;
}

interface PendingDeclaration {
  boxerName: string;
  sessionName: string;
  timeUntil: string;
  phone: string;
}



function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Individual ring control card
function RingControlCard({ ring: initialRing }: { ring: RingState }) {
  const [ring, setRing] = useState(initialRing);
  const [showLogEvent, setShowLogEvent] = useState(false);
  const [showDecision, setShowDecision] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [redScore, setRedScore] = useState<number | null>(null);
  const [blueScore, setBlueScore] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Client-side countdown — Realtime broadcast in production
  useEffect(() => {
    if (ring.roundState === "active" || ring.roundState === "rest") {
      intervalRef.current = setInterval(() => {
        setRing(r => {
          if (r.timeLeft <= 0) {
            clearInterval(intervalRef.current!);
            return { ...r, roundState: r.roundState === "active" ? "rest" : "idle", timeLeft: r.roundState === "active" ? r.restDuration : r.roundDuration };
          }
          return { ...r, timeLeft: r.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [ring.roundState]);

  function handleStart() {
    setRing(r => ({ ...r, roundState: "active", timeLeft: r.roundDuration }));
    toast.success(`Round ${ring.currentRound} started — ${ring.ringName}`);
  }
  function handlePause() { setRing(r => ({ ...r, roundState: "paused" })); }
  function handleResume() { setRing(r => ({ ...r, roundState: "active" })); }
  function handleEndRound() {
    clearInterval(intervalRef.current!);
    if (ring.currentRound >= ring.totalRounds) {
      setRing(r => ({ ...r, roundState: "completed", timeLeft: 0 }));
      toast.info("All rounds complete — record the decision");
    } else {
      setRing(r => ({ ...r, roundState: "rest", currentRound: r.currentRound + 1, timeLeft: r.restDuration }));
    }
  }

  const roundStateBadge: Record<RingState["roundState"], { label: string; tone: string }> = {
    idle: { label: "Ready", tone: "neutral" },
    active: { label: "Round Active", tone: "success" },
    paused: { label: "Paused", tone: "warning" },
    rest: { label: "Rest Period", tone: "info" },
    completed: { label: "Completed", tone: "neutral" },
  };

  const rs = roundStateBadge[ring.roundState];

  return (
    <div className="bento-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-coach/10 grid place-items-center">
            <Radio className="size-4 text-coach" strokeWidth={1.75} />
          </div>
          <div>
            <div className="font-display font-bold">{ring.ringName}</div>
            <div className="text-xs text-muted-foreground">{ring.venue}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${rs.tone === "success" ? "badge-success" : rs.tone === "warning" ? "badge-warning" : rs.tone === "info" ? "badge-info" : "badge-neutral"}`}>{rs.label}</span>
          <button onClick={() => setExpanded(e => !e)} className="size-7 rounded-md hover:bg-elevated grid place-items-center cursor-pointer">
            <ChevronDown className={`size-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-5">
          {/* Bout summary */}
          {ring.currentBout && (
            <div className="flex items-center gap-4 bg-elevated rounded-xl p-4">
              <div className="flex items-center gap-2 flex-1">
                <span className="size-3 rounded-full bg-red-500 shrink-0" />
                <AvatarInitials name={ring.currentBout.redCorner} size="sm" />
                <span className="font-semibold text-sm">{ring.currentBout.redCorner}</span>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Bout #{ring.currentBout.boutNumber}</div>
                <div className="font-bold">vs</div>
                <div className="flex gap-1 mt-1">
                  <span className="badge badge-neutral text-[9px]">{ring.currentBout.ageCategory}</span>
                  <span className="badge badge-neutral text-[9px]">{ring.currentBout.weightCategory}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <span className="font-semibold text-sm">{ring.currentBout.blueCorner}</span>
                <AvatarInitials name={ring.currentBout.blueCorner} size="sm" />
                <span className="size-3 rounded-full bg-blue-500 shrink-0" />
              </div>
            </div>
          )}

          {ring.currentBout ? (
            <>
              {/* Round indicator + countdown */}
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">
                  {ring.roundState === "rest" ? "Rest" : `Round ${ring.currentRound} of ${ring.totalRounds}`}
                </div>
                <div className={`text-5xl font-display font-bold tabular ${ring.roundState === "active" ? "text-success" : ring.roundState === "rest" ? "text-info" : "text-foreground"}`}>
                  {formatTime(ring.timeLeft)}
                </div>
              </div>

              {/* Control buttons */}
              <div className="flex items-center justify-center gap-3">
                {ring.roundState === "idle" && (
                  <button onClick={handleStart} className="inline-flex items-center gap-2 bg-success text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-success/90 transition cursor-pointer">
                    <Play className="size-4" /> Start Round {ring.currentRound}
                  </button>
                )}
                {ring.roundState === "active" && (
                  <>
                    <button onClick={handlePause} className="inline-flex items-center gap-2 bg-warning text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-warning/90 transition cursor-pointer">
                      <Pause className="size-4" /> Pause
                    </button>
                    <button onClick={handleEndRound} className="inline-flex items-center gap-2 border border-border bg-elevated px-4 py-2.5 rounded-xl font-semibold hover:bg-elevated/80 transition cursor-pointer text-sm">
                      <Square className="size-4" /> End Round
                    </button>
                  </>
                )}
                {ring.roundState === "paused" && (
                  <button onClick={handleResume} className="inline-flex items-center gap-2 bg-success text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-success/90 transition cursor-pointer">
                    <Play className="size-4" /> Resume
                  </button>
                )}
                {ring.roundState === "rest" && (
                  <button onClick={() => setRing(r => ({ ...r, roundState: "idle", timeLeft: r.roundDuration }))} className="inline-flex items-center gap-2 bg-info text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-info/90 transition cursor-pointer">
                    <RotateCcw className="size-4" /> Ready for Round {ring.currentRound}
                  </button>
                )}
              </div>

              {/* Quick-event buttons */}
              {(ring.roundState === "active" || ring.roundState === "paused") && (
                <div className="grid grid-cols-5 gap-2">
                  {["Knockdown", "Warning", "Foul", "Low Blow", "Injury Timeout"].map(evt => (
                    <button
                      key={evt}
                      onClick={() => { toast.info(`${evt} logged`); setShowLogEvent(true); }}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border hover:border-border-strong hover:bg-elevated transition cursor-pointer text-center"
                    >
                      <Zap className="size-4 text-warning" strokeWidth={1.75} />
                      <span className="text-[10px] font-medium leading-tight">{evt}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Knockdown counts */}
              <div className="flex items-center gap-4">
                <div className="flex-1 flex items-center gap-2">
                  <span className="size-3 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">Knockdowns</span>
                  <span className="font-bold">{ring.knockdownsRed}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 justify-end">
                  <span className="font-bold">{ring.knockdownsBlue}</span>
                  <span className="text-xs text-muted-foreground">Knockdowns</span>
                  <span className="size-3 rounded-full bg-blue-500 shrink-0" />
                </div>
              </div>

              {/* Inline scoring form — only if this coach is also a judge */}
              {ring.isAssignedJudge && ring.roundState === "rest" && (
                <div className="border border-border rounded-xl p-4">
                  <div className="text-xs font-semibold mb-3">Score Round {ring.currentRound - 1} (you are a judge)</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><span className="size-2 rounded-full bg-red-500 inline-block" />Red</div>
                      <div className="flex gap-2">
                        {[10, 9, 8, 7].map(s => (
                          <button key={s} onClick={() => setRedScore(s)} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition cursor-pointer ${redScore === s ? "bg-red-500 text-white border-red-500" : "border-border hover:border-border-strong"}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500 inline-block" />Blue</div>
                      <div className="flex gap-2">
                        {[10, 9, 8, 7].map(s => (
                          <button key={s} onClick={() => setBlueScore(s)} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition cursor-pointer ${blueScore === s ? "bg-blue-500 text-white border-blue-500" : "border-border hover:border-border-strong"}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { toast.success("Round score submitted"); setRedScore(null); setBlueScore(null); }}
                    disabled={redScore === null || blueScore === null}
                    className="mt-3 w-full py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 cursor-pointer hover:bg-primary-dark transition"
                  >
                    Submit Round Score
                  </button>
                </div>
              )}

              {/* End Bout button */}
              {ring.roundState === "completed" && (
                <button
                  onClick={() => setShowDecision(true)}
                  className="w-full py-3 bg-destructive text-white rounded-xl font-semibold hover:bg-destructive/90 transition cursor-pointer"
                >
                  End Bout — Record Decision
                </button>
              )}
            </>
          ) : (
            <div className="py-8 text-center border border-dashed border-border rounded-xl">
              <ShieldAlert className="size-8 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} />
              <div className="font-semibold text-muted-foreground">No active bout</div>
              <div className="text-xs text-muted-foreground mt-1">Waiting for the next bout to begin in this ring</div>
            </div>
          )}
        </div>
      )}

      {/* Log Event Modal */}
      {showLogEvent && <LogEventModal onClose={() => setShowLogEvent(false)} />}
      {showDecision && <RecordDecisionModal onClose={() => setShowDecision(false)} />}
    </div>
  );
}

function LogEventModal({ onClose }: { onClose: () => void }) {
  const [eventType, setEventType] = useState("Knockdown");
  const [target, setTarget] = useState<"Red" | "Blue">("Red");
  const [desc, setDesc] = useState("");

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Log Event</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold mb-2">Event Type</div>
            <div className="flex gap-2 flex-wrap">
              {["Knockdown", "Warning", "Foul", "Low Blow", "Injury Timeout"].map(e => (
                <button key={e} onClick={() => setEventType(e)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${eventType === e ? "bg-warning text-white border-warning" : "border-border hover:border-border-strong"}`}>{e}</button>
              ))}
            </div>
            {eventType === "Warning" && <p className="text-xs text-muted-foreground mt-2">⚠ Warning causes a point deduction from the offending boxer's score.</p>}
          </div>
          <div>
            <div className="text-xs font-semibold mb-2">Boxer</div>
            <div className="flex gap-2">
              {(["Red", "Blue"] as const).map(t => (
                <button key={t} onClick={() => setTarget(t)} className={`px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${target === t ? (t === "Red" ? "bg-red-500 text-white border-red-500" : "bg-blue-500 text-white border-blue-500") : "border-border hover:border-border-strong"}`}>{t} Corner</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Description (optional)</span>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="input-premium resize-none" placeholder="Notes about this event…" />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button onClick={() => { toast.success(`${eventType} logged for ${target} Corner`); onClose(); }} className="px-4 py-2 text-sm bg-warning text-white rounded-lg font-semibold cursor-pointer hover:bg-warning/90">Log Event</button>
        </div>
      </div>
    </div>
  );
}

function RecordDecisionModal({ onClose }: { onClose: () => void }) {
  const DECISIONS = ["WP", "RSC", "RSC-I", "ABD", "DSQ", "DQB", "KO", "WO", "DKO", "BDSQ"];
  const [decision, setDecision] = useState("WP");
  const [winner, setWinner] = useState<"Red" | "Blue" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-bold">Record Bout Decision</div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center cursor-pointer"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs font-semibold mb-2">Decision Type</div>
            <div className="flex gap-2 flex-wrap">
              {DECISIONS.map(d => (
                <button key={d} onClick={() => setDecision(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${decision === d ? "bg-primary-dark text-white border-primary-dark" : "border-border hover:border-border-strong"}`}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-2">Winner</div>
            <div className="flex gap-2">
              {(["Red", "Blue"] as const).map(c => (
                <button key={c} onClick={() => setWinner(c)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition cursor-pointer ${winner === c ? (c === "Red" ? "bg-red-500 text-white border-red-500" : "bg-blue-500 text-white border-blue-500") : "border-border hover:border-border-strong"}`}>{c} Corner</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold mb-1.5">Reason / Details</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="input-premium resize-none" placeholder="Reason for decision…" />
          </label>
          <div className="flex items-start gap-3 bg-warning/8 border border-warning/20 rounded-xl p-3">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Irreversible action</div>
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                <span className="text-xs">I confirm this decision is final</span>
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-elevated cursor-pointer">Cancel</button>
          <button
            onClick={() => { toast.success("Decision recorded — bout completed"); onClose(); }}
            disabled={!winner || !confirmed}
            className="px-4 py-2 text-sm bg-destructive text-white rounded-lg disabled:opacity-50 font-semibold cursor-pointer hover:bg-destructive/90"
          >
            Confirm Decision
          </button>
        </div>
      </div>
    </div>
  );
}

function CoachRings() {
  const { profile } = useAuth();
  const [rings, setRings] = useState<RingState[]>([]);
  const [declarations, setDeclarations] = useState<PendingDeclaration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const todayDate = new Date().toISOString().substring(0, 10);
        
        let templatesQuery = supabase.from("ring_schedule_templates").select("id, name");
        if (profile?.academy_id) {
          templatesQuery = templatesQuery.eq("academy_id", profile.academy_id);
        }

        const [templatesRes, sessionsRes, instancesRes, leavesRes, boxersRes, ageCatsRes, weightCatsRes, boutsRes] = await Promise.all([
          templatesQuery,
          supabase.from("ring_sessions").select("*"),
          supabase.from("ring_instances").select("*").eq("date", todayDate).eq("is_cancelled", false),
          supabase.from("leave_applications").select("*, boxer_profiles(full_name, user_id, phone)").eq("status", "pending"),
          supabase.from("boxer_profiles").select("id, full_name, user_id, phone"),
          supabase.from("age_categories").select("*"),
          supabase.from("weight_categories").select("*"),
          supabase.from("bouts").select("*").order("bout_number")
        ]);

        const templates = templatesRes.data || [];
        const templateIds = templates.map((t: any) => t.id);
        
        // Filter sessions by templates belonging to the coach's academy
        const sessions = (sessionsRes.data || []).filter((s: any) => templateIds.includes(s.template_id));
        const instances = instancesRes.data || [];
        const bouts = boutsRes.data || [];
        const boxers = boxersRes.data || [];
        const ageCats = ageCatsRes.data || [];
        const weightCats = weightCatsRes.data || [];
        
        const boxerMap = new Map(boxers.map((b: any) => [b.id, b]));
        const ageMap = new Map(ageCats.map((a: any) => [a.id, a.name]));
        const weightMap = new Map(weightCats.map((w: any) => [w.id, w.name]));

        // Build ring states
        const builtRings: RingState[] = [];
        for (const session of sessions) {
          // See if there's an instance for today
          const inst = instances.find((i: any) => i.template_id === session.template_id);
          const instId = inst ? inst.id : null;
          
          let currentBout = null;
          if (instId) {
            // Find active or first pending bout for this instance
            const ringBouts = bouts.filter((b: any) => b.ring_instance_id === instId);
            const activeBout = ringBouts.find((b: any) => b.status === "in_progress" || b.status === "active") || ringBouts.find((b: any) => b.status === "pending" || !b.status);
            
            if (activeBout) {
              const red = boxerMap.get(activeBout.boxer_red_id);
              const blue = boxerMap.get(activeBout.boxer_blue_id);
              currentBout = {
                boutNumber: activeBout.bout_number || 1,
                redCorner: red?.full_name || "TBD",
                blueCorner: blue?.full_name || "TBD",
                ageCategory: activeBout.age_category_id ? ageMap.get(activeBout.age_category_id) || "" : "",
                weightCategory: activeBout.weight_category_id ? weightMap.get(activeBout.weight_category_id) || "" : "",
              };
            }
          }

          builtRings.push({
            id: session.id,
            ringName: session.name || "Ring",
            venue: session.custom_location || templates.find((t: any) => t.id === session.template_id)?.name || "Main Venue",
            currentBout,
            roundState: "idle",
            currentRound: 1,
            totalRounds: 3, // Defaults unless bout provides it
            roundDuration: 180,
            restDuration: 60,
            timeLeft: 180,
            knockdownsRed: 0,
            knockdownsBlue: 0,
            isAssignedJudge: false,
          });
        }
        setRings(builtRings);

        // Build pending declarations
        const builtDecls: PendingDeclaration[] = (leavesRes.data || []).map((l: any) => {
          const b = l.boxer_profiles || {};
          const d = new Date(l.created_at);
          return {
            boxerName: b.full_name || "Unknown Boxer",
            sessionName: l.reason || "Leave Request",
            timeUntil: d.toLocaleDateString(),
            phone: b.phone || "+91 0000000000"
          };
        });
        setDeclarations(builtDecls);

      } catch (err: any) {
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [profile?.academy_id]);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-8 animate-spin mb-4 text-primary" />
        <p>Loading coach dashboard...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Today's Rings"
        subtitle={`${today} · ${rings.length} ring${rings.length !== 1 ? "s" : ""} assigned`}
      />

      {/* Pending Pregnancy Declarations — persistent, non-dismissable */}
      {declarations.length > 0 && (
        <div className="bento-card p-5 border-warning/30 bg-warning/4">
          <div className="flex items-center gap-2 mb-3">
            <Baby className="size-4 text-warning" strokeWidth={2} />
            <div className="font-semibold text-sm">Declarations Pending</div>
            <span className="badge badge-warning ml-auto">{declarations.length}</span>
          </div>
          <div className="space-y-2">
            {declarations.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <AvatarInitials name={d.boxerName} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{d.boxerName}</div>
                  <div className="text-xs text-muted-foreground">{d.sessionName} · {d.timeUntil}</div>
                </div>
                <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-elevated cursor-pointer">
                  <Phone className="size-3" /> Call
                </a>
                <button onClick={() => toast.info("Swap/Remove sheet — TODO: wire")} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-warning/40 text-warning rounded-lg hover:bg-warning/10 cursor-pointer">
                  Swap/Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ring cards */}
      {rings.length === 0 ? (
        <div className="bento-card p-12 text-center">
          <Radio className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No rings assigned today</div>
          <div className="text-sm text-muted-foreground mt-1">Contact your admin to get assigned to a ring</div>
        </div>
      ) : (
        <div className="space-y-4">
          {rings.map(ring => (
            <RingControlCard key={ring.id} ring={ring} />
          ))}
        </div>
      )}
    </div>
  );
}
