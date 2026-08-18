import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { Swords, Trophy, TrendingDown, Minus, ChevronRight, X, Calendar, MapPin, Tag, Award, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/athlete/bouts")({ component: AthleteBouts });

type BoutFilter = "all" | "upcoming" | "completed";

interface Bout {
  id: string;
  opponent: string;
  date: string;
  tournamentName: string;
  ringName: string;
  ageCategory: string;
  weightCategory: string;
  result: "win" | "loss" | "draw" | "upcoming" | "no_contest";
  decision: string;
  myCorner: "red" | "blue";
  rounds?: RoundScore[];
  events?: BoutEvent[];
}

interface RoundScore {
  round: number;
  judge: string;
  red: number;
  blue: number;
}

interface BoutEvent {
  round: number;
  time: string;
  type: string;
  boxer: string;
  note: string;
}

function resultBadge(r: Bout["result"]) {
  if (r === "win") return <span className="badge badge-success">Win</span>;
  if (r === "loss") return <span className="badge badge-danger">Loss</span>;
  if (r === "draw") return <span className="badge badge-neutral">Draw</span>;
  if (r === "no_contest") return <span className="badge badge-neutral">No Contest</span>;
  return <span className="badge badge-info">Upcoming</span>;
}

function BoutScorecardModal({ bout, onClose }: { bout: Bout; onClose: () => void }) {
  const myScore = bout.rounds
    ? bout.rounds.reduce((acc, r) => acc + (bout.myCorner === "red" ? r.red : r.blue), 0)
    : 0;
  const oppScore = bout.rounds
    ? bout.rounds.reduce((acc, r) => acc + (bout.myCorner === "red" ? r.blue : r.red), 0)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="font-display font-bold text-lg">Bout Scorecard</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {bout.tournamentName} · {bout.ringName} · {bout.date ? new Date(bout.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"}
            </div>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-elevated grid place-items-center text-muted-foreground cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        {/* Both boxers + result banner */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-4">
            {/* Me */}
            <div className="flex-1 text-center">
              <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full mb-2 ${bout.myCorner === "red" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                {bout.myCorner === "red" ? "🔴 Red Corner" : "🔵 Blue Corner"}
              </div>
              <div className="font-semibold text-sm">You</div>
              <div className="text-stat font-display mt-1">{myScore > 0 ? myScore : "-"}</div>
            </div>

            {/* Result */}
            <div className="text-center px-4">
              {resultBadge(bout.result)}
              <div className="text-xs text-muted-foreground mt-1">{bout.decision}</div>
            </div>

            {/* Opponent */}
            <div className="flex-1 text-center">
              <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full mb-2 ${bout.myCorner === "red" ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"}`}>
                {bout.myCorner === "red" ? "🔵 Blue Corner" : "🔴 Red Corner"}
              </div>
              <div className="font-semibold text-sm">{bout.opponent}</div>
              <div className="text-stat font-display mt-1">{oppScore > 0 ? oppScore : "-"}</div>
            </div>
          </div>
        </div>

        {/* Per-round score table */}
        {bout.rounds && bout.rounds.length > 0 && (
          <div className="p-5 border-b border-border">
            <div className="font-semibold text-sm mb-3">Round Scores</div>
            <DataTable
              headers={["Round", "Judge", "Red", "Blue"]}
              rows={bout.rounds.map((r, idx) => [
                <span key={`r-${idx}`} className="font-semibold">R{r.round}</span>,
                <span key={`j-${idx}`} className="text-muted-foreground text-xs">{r.judge}</span>,
                <span key={`rd-${idx}`} className={`font-semibold ${bout.myCorner === "red" ? "text-foreground" : "text-muted-foreground"}`}>{r.red}</span>,
                <span key={`bl-${idx}`} className={`font-semibold ${bout.myCorner === "blue" ? "text-foreground" : "text-muted-foreground"}`}>{r.blue}</span>,
              ])}
            />
            <div className="flex justify-between mt-3 pt-3 border-t border-border text-sm font-bold">
              <span>Total</span>
              <span className="flex gap-12">
                <span>{bout.rounds.reduce((a, r) => a + r.red, 0)}</span>
                <span>{bout.rounds.reduce((a, r) => a + r.blue, 0)}</span>
              </span>
            </div>
          </div>
        )}

        {/* Event log */}
        {bout.events && bout.events.length > 0 && (
          <div className="p-5">
            <div className="font-semibold text-sm mb-3">Event Log</div>
            <div className="space-y-2">
              {bout.events.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-shrink-0 w-20 text-xs text-muted-foreground">R{ev.round} · {ev.time}</div>
                  <span className="badge badge-neutral text-[10px]">{ev.type}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{ev.boxer}</span>
                    {ev.note && <span className="text-xs text-muted-foreground ml-1">— {ev.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {(!bout.rounds || bout.rounds.length === 0) && (!bout.events || bout.events.length === 0) && (
          <div className="p-10 text-center text-muted-foreground text-sm">
            Detailed scorecard data is not available for this bout.
          </div>
        )}
      </div>
    </div>
  );
}

function BoutCard({ bout, onClick }: { bout: Bout; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bento-card p-4 sm:p-5 flex items-center gap-4 hover:shadow-elevated hover:border-border-strong transition-all cursor-pointer"
    >
      <AvatarInitials name={bout.opponent} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{bout.opponent}</span>
          {resultBadge(bout.result)}
          {bout.result !== "upcoming" && (
            <span className="badge badge-neutral text-[10px]">{bout.decision}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {bout.date ? new Date(bout.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {bout.ringName}
          </span>
          <span className="flex items-center gap-1">
            <Tag className="size-3" />
            {bout.weightCategory}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{bout.tournamentName}</div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function AthleteBouts() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<BoutFilter>("all");
  const [selectedBout, setSelectedBout] = useState<Bout | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [bouts, setBouts] = useState<Bout[]>([]);
  const [record, setRecord] = useState({ wins: 0, losses: 0, kos: 0 });
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function loadData() {
      try {
        setLoading(true);
        // 1. Get boxer profile and record
        const { data: bp } = await supabase
          .from("boxer_profiles")
          .select("id, record_wins, record_losses, record_kos")
          .eq("user_id", user!.id)
          .maybeSingle();

        if (!bp) return;

        setRecord({
          wins: bp.record_wins || 0,
          losses: bp.record_losses || 0,
          kos: bp.record_kos || 0,
        });

        // 2. Fetch Completed Bouts from boxer_bout_history
        const { data: history } = await supabase
          .from("boxer_bout_history")
          .select(`
            id, result, decision_type, bout_id,
            bouts (
              id, ring_instance_id, ring_session_id, boxer_red_id, boxer_blue_id, bout_kind,
              ring_instances(name, date),
              age_categories(name),
              weight_categories(name)
            ),
            opponent:boxer_profiles!opponent_id (full_name)
          `)
          .eq("boxer_profile_id", bp.id)
          .order("created_at", { ascending: false });

        // 3. Fetch Upcoming Bouts from bouts
        const { data: upcoming } = await supabase
          .from("bouts")
          .select(`
            id, status, boxer_red_id, boxer_blue_id, bout_kind,
            ring_instances(name, date),
            age_categories(name),
            weight_categories(name),
            red_boxer:boxer_profiles!boxer_red_id(full_name),
            blue_boxer:boxer_profiles!boxer_blue_id(full_name)
          `)
          .in("status", ["scheduled", "weigh_in_confirmed", "declaration_pending", "ready"])
          .or(`boxer_red_id.eq.${bp.id},boxer_blue_id.eq.${bp.id}`);

        // Map them together
        const mappedBouts: Bout[] = [];

        if (history) {
          history.forEach((h: any) => {
            const boutNode = h.bouts;
            if (!boutNode) return;
            const myCorner = boutNode.boxer_red_id === bp.id ? "red" : "blue";
            mappedBouts.push({
              id: boutNode.id,
              opponent: (h.opponent as any)?.full_name || "Unknown",
              date: (boutNode.ring_instances as any)?.date || "",
              tournamentName: boutNode.bout_kind === "tournament" ? "Tournament Bout" : "Training Bout",
              ringName: (boutNode.ring_instances as any)?.name || "Main Ring",
              ageCategory: (boutNode.age_categories as any)?.name || "-",
              weightCategory: (boutNode.weight_categories as any)?.name || "-",
              result: h.result as any,
              decision: h.decision_type || "—",
              myCorner,
            });
          });
        }

        if (upcoming) {
          upcoming.forEach((u: any) => {
            const myCorner = u.boxer_red_id === bp.id ? "red" : "blue";
            const opponentName = myCorner === "red" ? (u.blue_boxer as any)?.full_name : (u.red_boxer as any)?.full_name;
            mappedBouts.push({
              id: u.id,
              opponent: opponentName || "TBD",
              date: (u.ring_instances as any)?.date || "",
              tournamentName: u.bout_kind === "tournament" ? "Tournament Bout" : "Training Bout",
              ringName: (u.ring_instances as any)?.name || "Main Ring",
              ageCategory: (u.age_categories as any)?.name || "-",
              weightCategory: (u.weight_categories as any)?.name || "-",
              result: "upcoming",
              decision: "—",
              myCorner,
            });
          });
        }

        // Sort by date desc
        mappedBouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setBouts(mappedBouts);

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const loadModalData = async (bout: Bout) => {
    setModalLoading(true);
    try {
      const [{ data: scores }, { data: events }] = await Promise.all([
        supabase
          .from("bout_round_scores")
          .select("round_number, red_score, blue_score, profiles(full_name)")
          .eq("bout_id", bout.id),
        supabase
          .from("bout_events")
          .select("round_number, event_type, description, target_boxer_id, boxer_profiles!target_boxer_id(full_name)")
          .eq("bout_id", bout.id),
      ]);

      const parsedRounds: RoundScore[] = (scores || []).map((s: any) => ({
        round: s.round_number,
        judge: s.profiles?.full_name || "Unknown Judge",
        red: s.red_score,
        blue: s.blue_score,
      }));

      const parsedEvents: BoutEvent[] = (events || []).map((e: any) => ({
        round: e.round_number || 1,
        time: "--:--", // Time parsing left out for simplicity if not in DB natively
        type: e.event_type,
        boxer: e.boxer_profiles?.full_name || "Unknown Boxer",
        note: e.description || "",
      }));

      setSelectedBout({ ...bout, rounds: parsedRounds, events: parsedEvents });
    } catch (err) {
      console.error("Failed to load modal data", err);
      setSelectedBout(bout);
    } finally {
      setModalLoading(false);
    }
  };

  const filtered = bouts.filter((b) => {
    if (filter === "upcoming") return b.result === "upcoming";
    if (filter === "completed") return b.result !== "upcoming";
    return true;
  });

  const chips: { key: BoutFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader2 className="size-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium">Loading bout history...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="My Bouts"
        subtitle={`${record.wins}W · ${record.losses}L · ${record.kos} KOs`}
      />

      {/* Record stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Trophy className="size-4 text-success" strokeWidth={1.75} />
            <span className="label-micro">Wins</span>
          </div>
          <div className="text-stat font-display text-success">{record.wins}</div>
        </div>
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <TrendingDown className="size-4 text-destructive" strokeWidth={1.75} />
            <span className="label-micro">Losses</span>
          </div>
          <div className="text-stat font-display text-destructive">{record.losses}</div>
        </div>
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Award className="size-4 text-warning" strokeWidth={1.75} />
            <span className="label-micro">KOs</span>
          </div>
          <div className="text-stat font-display text-warning">{record.kos}</div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              filter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bout list */}
      {filtered.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <Swords className="size-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.25} />
          <div className="font-semibold text-muted-foreground">No bouts found</div>
          <div className="text-sm text-muted-foreground mt-1">Your bout history will appear here</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bout) => (
            <BoutCard 
              key={bout.id} 
              bout={bout} 
              onClick={() => {
                if (modalLoading) return;
                loadModalData(bout);
              }} 
            />
          ))}
        </div>
      )}

      {/* Scorecard modal */}
      {selectedBout && (
        <BoutScorecardModal bout={selectedBout} onClose={() => setSelectedBout(null)} />
      )}
      
      {modalLoading && (
        <div className="fixed inset-0 z-[60] bg-foreground/10 flex items-center justify-center">
          <div className="bg-surface p-4 rounded-xl shadow-lg flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm font-semibold">Loading scorecard...</span>
          </div>
        </div>
      )}
    </div>
  );
}
