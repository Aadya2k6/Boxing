import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Swords, ChevronRight, Clock, Tag, Calendar, X,
  AlertTriangle, Check, Loader2, Send, Star
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/judge/")({ component: JudgeDashboard });

// ── Stub data — TODO: wire to bout_judge_assignments + bouts + bout_rounds via Realtime
interface BoutAssignment {
  id: string;
  boutNumber: number;
  redCorner: string;
  blueCorner: string;
  ageCategory: string;
  weightCategory: string;
  status: "upcoming" | "active" | "scoring" | "completed";
  totalRounds: number;
  currentRound: number;
  myScores: (null | { red: number; blue: number })[];
  events: { round: number; type: string; boxer: string; time: string }[];
}

const STUB_BOUTS: BoutAssignment[] = [
  {
    id: "b1",
    boutNumber: 1,
    redCorner: "Aisha Khan",
    blueCorner: "Priya Sharma",
    ageCategory: "Youth (17–18)",
    weightCategory: "60 kg",
    status: "active",
    totalRounds: 3,
    currentRound: 2,
    myScores: [{ red: 10, blue: 9 }, null, null],
    events: [{ round: 1, type: "Knockdown", boxer: "Blue", time: "1:23" }],
  },
  {
    id: "b2",
    boutNumber: 2,
    redCorner: "Sana Sheikh",
    blueCorner: "Lakshmi Devi",
    ageCategory: "Junior (15–16)",
    weightCategory: "46 kg",
    status: "upcoming",
    totalRounds: 3,
    currentRound: 0,
    myScores: [null, null, null],
    events: [],
  },
];

// Real-time-like state update for active bout
function useRoundTimer(isActive: boolean, initialTime: number) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

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

function ScoringCard({ bout, onScoreSubmit }: { bout: BoutAssignment; onScoreSubmit: (round: number, red: number, blue: number) => void }) {
  const [roundToScore, setRoundToScore] = useState(bout.currentRound > 0 ? bout.currentRound : 1);
  const [red, setRed] = useState<number | null>(null);
  const [blue, setBlue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timeLeft = useRoundTimer(bout.status === "active", 120);

  const SCORES = [10, 9, 8, 7];
  const isCurrentRoundScored = bout.myScores[roundToScore - 1] !== null;

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
      {bout.status === "active" && roundToScore === bout.currentRound && (
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
              onClick={async () => {
                if (red === null || blue === null) return;
                setSubmitting(true);
                await new Promise(r => setTimeout(r, 600));
                onScoreSubmit(roundToScore, red, blue);
                toast.success(`Round ${roundToScore} score submitted`);
                setRed(null); setBlue(null);
                setSubmitting(false);
              }}
              disabled={red === null || blue === null || submitting}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50 cursor-pointer hover:bg-primary-dark transition"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit Round {roundToScore}
            </button>
          </div>
        </>
      )}

      {/* Event log for this round */}
      {bout.events.filter(e => e.round === roundToScore).length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="text-xs font-semibold mb-2">Events in Round {roundToScore}</div>
          {bout.events.filter(e => e.round === roundToScore).map((ev, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-border last:border-0">
              <span className="badge badge-warning">{ev.type}</span>
              <span className="text-muted-foreground">{ev.boxer} · {ev.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JudgeDashboard() {
  const [bouts, setBouts] = useState(STUB_BOUTS);
  const [activeBout, setActiveBout] = useState<BoutAssignment | null>(STUB_BOUTS.find(b => b.status === "active") ?? null);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bouts"
        subtitle="Score your assigned bouts below"
      />

      {/* Active bout scoring card — prominent */}
      {activeBout && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Bout</div>
          <div className="bento-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-display font-bold">Bout #{activeBout.boutNumber}</div>
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
              <ScoringCard bout={activeBout} onScoreSubmit={(r, red, blue) => handleScoreSubmit(activeBout.id, r, red, blue)} />
            </div>
          </div>
        </div>
      )}

      {/* Upcoming bouts list */}
      {bouts.filter(b => b.status === "upcoming" || b.status === "completed").length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Assigned Bouts</div>
          {bouts.filter(b => b.id !== activeBout?.id).map(bout => (
            <button
              key={bout.id}
              onClick={() => bout.status === "active" && setActiveBout(bout)}
              className="w-full text-left bento-card p-4 flex items-center gap-4 hover:border-border-strong transition-all cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">Bout #{bout.boutNumber}</span>
                  <span className={`badge ${bout.status === "completed" ? "badge-neutral" : "badge-info"}`}>
                    {bout.status.charAt(0).toUpperCase() + bout.status.slice(1)}
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
