import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Swords, ChevronRight, Tag,
  AlertTriangle, Check, Loader2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/judge/")({ component: JudgeDashboard });

// ── Types ──────────────────────────────────────────────────────────────────────
interface BoutAssignment {
  id: string;
  boutNumber: number | null;
  redCorner: string;
  blueCorner: string;
  ageCategory: string;
  weightCategory: string;
  status: "scheduled" | "weigh_in_confirmed" | "declaration_pending" | "ready" | "in_progress" | "paused" | "completed" | "cancelled" | "walkover";
  totalRounds: number;
  currentRound: number;
  currentRoundState: string;
  myScores: (null | { red: number; blue: number })[];
  redBoxerProfileId: string;
  blueBoxerProfileId: string;
}

// ── Round timer ────────────────────────────────────────────────────────────────
function useRoundTimer(isActive: boolean, roundDurationSeconds: number) {
  const [timeLeft, setTimeLeft] = useState(roundDurationSeconds);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeLeft(roundDurationSeconds);
  }, [roundDurationSeconds]);

  useEffect(() => {
    if (isActive) {
      ref.current = setInterval(() => {
        setTimeLeft(t => Math.max(0, t - 1));
      }, 1000);
    } else if (ref.current) {
      clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [isActive]);

  return timeLeft;
}

// ── Scoring card ───────────────────────────────────────────────────────────────
function ScoringCard({
  bout,
  judgeProfileId,
  onScoreSubmit,
}: {
  bout: BoutAssignment;
  judgeProfileId: string;
  onScoreSubmit: (round: number, red: number, blue: number) => void;
}) {
  const [roundToScore, setRoundToScore] = useState(
    bout.currentRound > 0 ? bout.currentRound : 1
  );
  const [red, setRed] = useState<number | null>(null);
  const [blue, setBlue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isActiveRound = bout.status === "in_progress" && roundToScore === bout.currentRound;
  const timeLeft = useRoundTimer(
    isActiveRound && bout.currentRoundState === "active",
    180 // default; real duration would come from age_categories if needed
  );

  const SCORES = [10, 9, 8, 7];
  const isCurrentRoundScored = bout.myScores[roundToScore - 1] !== null;

  async function handleSubmit() {
    if (red === null || blue === null) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("bout_round_scores").insert({
        bout_id: bout.id,
        round_number: roundToScore,
        judge_profile_id: judgeProfileId,
        red_score: red,
        blue_score: blue,
      });

      if (error) {
        // Unique constraint means already submitted
        if (error.code === "23505") {
          toast.error("Score for this round already submitted.");
        } else {
          toast.error(`Failed to submit score: ${error.message}`);
        }
        return;
      }

      onScoreSubmit(roundToScore, red, blue);
      toast.success(`Round ${roundToScore} score submitted`);
      setRed(null);
      setBlue(null);
    } catch (err: any) {
      toast.error(err.message ?? "Unexpected error submitting score");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bento-card p-5 border-primary/20 bg-primary/3">
      {/* Round tab selector */}
      <div className="flex gap-1 mb-5 bg-elevated p-1 rounded-xl w-fit">
        {Array.from({ length: bout.totalRounds }, (_, i) => i + 1).map(r => (
          <button
            key={r}
            onClick={() => { setRoundToScore(r); setRed(null); setBlue(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer relative ${roundToScore === r ? "bg-surface shadow-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            R{r}
            {bout.myScores[r - 1] !== null && (
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-success" />
            )}
          </button>
        ))}
      </div>

      {/* Timer (if active round) */}
      {isActiveRound && bout.currentRoundState === "active" && (
        <div className="text-center mb-5">
          <div className="text-xs text-muted-foreground mb-1">Round {bout.currentRound} · Time remaining</div>
          <div className={`text-3xl font-display font-bold tabular ${timeLeft > 30 ? "text-success" : "text-destructive"}`}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
          </div>
        </div>
      )}

      {isCurrentRoundScored ? (
        <div className="flex items-center gap-3 bg-success/8 border border-success/20 rounded-xl p-4">
          <Check className="size-5 text-success shrink-0" />
          <div>
            <div className="font-semibold text-sm">Round {roundToScore} score submitted</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Red: {bout.myScores[roundToScore - 1]?.red} · Blue: {bout.myScores[roundToScore - 1]?.blue}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Score pickers */}
          <div className="grid grid-cols-2 gap-6 mb-5">
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-red-500 inline-block" />
                {bout.redCorner} (Red)
              </div>
              <div className="flex gap-2">
                {SCORES.map(s => (
                  <button
                    key={s}
                    onClick={() => setRed(s)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold border transition cursor-pointer ${red === s ? "bg-red-500 text-white border-red-500" : "border-border hover:border-red-400"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-blue-500 inline-block" />
                {bout.blueCorner} (Blue)
              </div>
              <div className="flex gap-2">
                {SCORES.map(s => (
                  <button
                    key={s}
                    onClick={() => setBlue(s)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold border transition cursor-pointer ${blue === s ? "bg-blue-500 text-white border-blue-500" : "border-border hover:border-blue-400"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scoring note */}
          <div className="flex items-start gap-2 bg-info/8 border border-info/20 rounded-xl p-3 mb-4 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-info" />
            The winner of each round receives 10 points. The loser receives 9 (or fewer if a knockdown occurred). Scores must be within AIBA rules.
          </div>

          {/* Confirm & submit */}
          <div className="flex items-center gap-3">
            {red !== null && blue !== null && (
              <div className="flex-1 text-sm font-semibold">
                Red <span className="text-red-500">{red}</span> — Blue <span className="text-blue-500">{blue}</span>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={red === null || blue === null || submitting}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50 cursor-pointer hover:bg-primary-dark transition"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit Round {roundToScore}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
function JudgeDashboard() {
  const { user } = useAuth();
  const [bouts, setBouts] = useState<BoutAssignment[]>([]);
  const [activeBout, setActiveBout] = useState<BoutAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBouts = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fetch all bout_judge_assignments for this judge
      // Fetch today's instances to get bouts
      const today = new Date().toISOString().split("T")[0];
      const { data: instances, error: instErr } = await supabase
        .from("ring_instances")
        .select("id")
        .eq("date", today);
        
      if (instErr) throw instErr;
      const instanceIds = instances?.map(i => i.id) || [];

      if (instanceIds.length === 0) {
        setBouts([]);
        setActiveBout(null);
        setLoading(false);
        return;
      }

      // Fetch bouts with related data directly, bypassing bout_judge_assignments
      const { data: boutRows, error: boutErr } = await supabase
        .from("bouts")
        .select(`
          id,
          bout_number,
          status,
          current_round,
          current_round_state,
          round_count,
          boxer_red_id,
          boxer_blue_id,
          age_categories(name),
          weight_categories(name)
        `)
        .in("ring_instance_id", instanceIds)
        .order("bout_number", { ascending: true });

      if (boutErr) throw boutErr;
      
      const boutIds = boutRows?.map(b => b.id) || [];
      
      if (boutIds.length === 0) {
        setBouts([]);
        setActiveBout(null);
        setLoading(false);
        return;
      }

      // Fetch this judge's scores for all these bouts
      const { data: scores } = await supabase
        .from("bout_round_scores")
        .select("bout_id, round_number, red_score, blue_score")
        .eq("judge_profile_id", user.id)
        .in("bout_id", boutIds);

      // Fetch boxer names
      const allBoxerIds = new Set<string>();
      (boutRows ?? []).forEach(b => {
        allBoxerIds.add(b.boxer_red_id);
        allBoxerIds.add(b.boxer_blue_id);
      });

      const { data: boxers } = await supabase
        .from("boxer_profiles")
        .select("id, full_name")
        .in("id", [...allBoxerIds]);

      const boxerMap: Record<string, string> = {};
      (boxers ?? []).forEach(b => { boxerMap[b.id] = b.full_name; });

      // Build score map: boutId → roundNumber → {red, blue}
      const scoreMap: Record<string, Record<number, { red: number; blue: number }>> = {};
      (scores ?? []).forEach(s => {
        if (!scoreMap[s.bout_id]) scoreMap[s.bout_id] = {};
        scoreMap[s.bout_id][s.round_number] = { red: s.red_score, blue: s.blue_score };
      });

      const mapped: BoutAssignment[] = (boutRows ?? []).map(b => {
        const myScores: (null | { red: number; blue: number })[] = Array.from(
          { length: b.round_count },
          (_, i) => scoreMap[b.id]?.[i + 1] ?? null
        );
        return {
          id: b.id,
          boutNumber: b.bout_number,
          redCorner: boxerMap[b.boxer_red_id] ?? "Red",
          blueCorner: boxerMap[b.boxer_blue_id] ?? "Blue",
          ageCategory: (b.age_categories as any)?.name ?? "—",
          weightCategory: (b.weight_categories as any)?.name ?? "—",
          status: b.status,
          totalRounds: b.round_count,
          currentRound: b.current_round,
          currentRoundState: b.current_round_state,
          myScores,
          redBoxerProfileId: b.boxer_red_id,
          blueBoxerProfileId: b.boxer_blue_id,
        };
      });

      setBouts(mapped);

      // Set active bout: prefer in_progress, then ready/declaration_pending
      const active =
        mapped.find(b => b.status === "in_progress") ??
        mapped.find(b => b.status === "ready" || b.status === "declaration_pending") ??
        null;
      setActiveBout(active);
    } catch (err: any) {
      console.error("[JudgeDashboard] fetch error:", err);
      toast.error("Failed to load bout assignments: " + (err?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBouts();
  }, [fetchBouts]);

  // Realtime: re-fetch on any change to the judge's assignments or bouts
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`judge-bouts-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bouts" }, fetchBouts)
      .on("postgres_changes", { event: "*", schema: "public", table: "bout_round_scores" }, fetchBouts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchBouts]);

  function handleScoreSubmit(boutId: string, round: number, red: number, blue: number) {
    setBouts(prev => prev.map(b => {
      if (b.id !== boutId) return b;
      const newScores = [...b.myScores];
      newScores[round - 1] = { red, blue };
      return { ...b, myScores: newScores };
    }));
    if (activeBout?.id === boutId) {
      setActiveBout(prev => {
        if (!prev) return prev;
        const newScores = [...prev.myScores];
        newScores[round - 1] = { red, blue };
        return { ...prev, myScores: newScores };
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bouts"
        subtitle="Score your assigned bouts below"
      />

      {/* Active bout scoring card — prominent */}
      {activeBout && user?.id && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Bout</div>
          <div className="bento-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-display font-bold">
                  {activeBout.boutNumber != null ? `Bout #${activeBout.boutNumber}` : "Bout"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Tag className="size-3" />{activeBout.ageCategory}</span>
                  <span className="flex items-center gap-1"><Tag className="size-3" />{activeBout.weightCategory}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-red-500">{activeBout.redCorner}</span>
                <span className="text-muted-foreground">vs</span>
                <span className="text-sm font-semibold text-blue-500">{activeBout.blueCorner}</span>
              </div>
            </div>
            <div className="p-5">
              <ScoringCard
                bout={activeBout}
                judgeProfileId={user.id}
                onScoreSubmit={(r, red, blue) => handleScoreSubmit(activeBout.id, r, red, blue)}
              />
            </div>
          </div>
        </div>
      )}

      {/* All other bouts list */}
      {bouts.filter(b => b.id !== activeBout?.id).length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Assigned Bouts</div>
          {bouts.filter(b => b.id !== activeBout?.id).map(bout => (
            <button
              key={bout.id}
              onClick={() => {
                if (bout.status === "in_progress" || bout.status === "ready") setActiveBout(bout);
              }}
              className="w-full text-left bento-card p-4 flex items-center gap-4 hover:border-border-strong transition-all cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    {bout.boutNumber != null ? `Bout #${bout.boutNumber}` : "Bout"}
                  </span>
                  <span className={`badge ${bout.status === "completed" || bout.status === "cancelled" || bout.status === "walkover" ? "badge-neutral" : bout.status === "in_progress" ? "badge-success" : "badge-info"}`}>
                    {bout.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span className="badge badge-neutral">{bout.weightCategory}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="text-red-500">{bout.redCorner}</span> vs <span className="text-blue-500">{bout.blueCorner}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: bout.totalRounds }, (_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-6 rounded-full ${bout.myScores[i] !== null ? "bg-success" : "bg-border"}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {bout.myScores.filter(s => s !== null).length}/{bout.totalRounds} rounds scored
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {bouts.length === 0 && (
        <div className="bento-card p-12 text-center">
          <Swords className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No bouts assigned</div>
          <div className="text-sm text-muted-foreground mt-1">You will be notified when a bout is assigned to you</div>
        </div>
      )}
    </div>
  );
}
