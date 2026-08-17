import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, Badge, DataTable, AvatarInitials } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { Swords, Trophy, TrendingDown, Minus, ChevronRight, X, Calendar, MapPin, Tag, Award } from "lucide-react";

export const Route = createFileRoute("/athlete/bouts")({ component: AthleteBouts });

// ── Stub data — TODO: wire to bouts + bout_judge_totals + boxer_bout_history
type BoutFilter = "all" | "upcoming" | "completed";

interface Bout {
  id: string;
  opponent: string;
  date: string;
  tournamentName: string;
  ringName: string;
  ageCategory: string;
  weightCategory: string;
  result: "win" | "loss" | "draw" | "upcoming";
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

const STUB_BOUTS: Bout[] = [
  {
    id: "b1",
    opponent: "Priya Sharma",
    date: "2026-08-10",
    tournamentName: "State Boxing Championship 2026",
    ringName: "Ring A",
    ageCategory: "Youth (17–18)",
    weightCategory: "60 kg",
    result: "win",
    decision: "WP",
    myCorner: "red",
    rounds: [
      { round: 1, judge: "Judge 1", red: 10, blue: 9 },
      { round: 2, judge: "Judge 1", red: 10, blue: 8 },
      { round: 3, judge: "Judge 1", red: 9, blue: 9 },
    ],
    events: [
      { round: 2, time: "1:34", type: "Knockdown", boxer: "Blue (Priya Sharma)", note: "Left hook" },
      { round: 3, time: "0:45", type: "Warning", boxer: "Red", note: "Holding" },
    ],
  },
  {
    id: "b2",
    opponent: "Ananya Reddy",
    date: "2026-07-22",
    tournamentName: "District Open 2026",
    ringName: "Ring B",
    ageCategory: "Youth (17–18)",
    weightCategory: "60 kg",
    result: "loss",
    decision: "WP",
    myCorner: "blue",
    rounds: [
      { round: 1, judge: "Judge 2", red: 10, blue: 9 },
      { round: 2, judge: "Judge 2", red: 9, blue: 10 },
      { round: 3, judge: "Judge 2", red: 10, blue: 9 },
    ],
  },
  {
    id: "b3",
    opponent: "Meera Nair",
    date: "2026-09-05",
    tournamentName: "National Qualifiers 2026",
    ringName: "Ring C",
    ageCategory: "Youth (17–18)",
    weightCategory: "60 kg",
    result: "upcoming",
    decision: "—",
    myCorner: "red",
  },
];

const RECORD = { wins: 12, losses: 3, kos: 4 };

function resultBadge(r: Bout["result"]) {
  if (r === "win") return <span className="badge badge-success">Win</span>;
  if (r === "loss") return <span className="badge badge-danger">Loss</span>;
  if (r === "draw") return <span className="badge badge-neutral">Draw</span>;
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
              {bout.tournamentName} · {bout.ringName} · {new Date(bout.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
              <div className="text-stat font-display mt-1">{myScore}</div>
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
              <div className="text-stat font-display mt-1">{oppScore}</div>
            </div>
          </div>
        </div>

        {/* Per-round score table */}
        {bout.rounds && bout.rounds.length > 0 && (
          <div className="p-5 border-b border-border">
            <div className="font-semibold text-sm mb-3">Round Scores</div>
            <DataTable
              headers={["Round", "Judge", "Red", "Blue"]}
              rows={bout.rounds.map((r) => [
                <span className="font-semibold">R{r.round}</span>,
                <span className="text-muted-foreground text-xs">{r.judge}</span>,
                <span className={`font-semibold ${bout.myCorner === "red" ? "text-foreground" : "text-muted-foreground"}`}>{r.red}</span>,
                <span className={`font-semibold ${bout.myCorner === "blue" ? "text-foreground" : "text-muted-foreground"}`}>{r.blue}</span>,
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
            {new Date(bout.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
  const [filter, setFilter] = useState<BoutFilter>("all");
  const [selectedBout, setSelectedBout] = useState<Bout | null>(null);

  const filtered = STUB_BOUTS.filter((b) => {
    if (filter === "upcoming") return b.result === "upcoming";
    if (filter === "completed") return b.result !== "upcoming";
    return true;
  });

  const chips: { key: BoutFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="My Bouts"
        subtitle={`${RECORD.wins}W · ${RECORD.losses}L · ${RECORD.kos} KOs`}
      />

      {/* Record stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Trophy className="size-4 text-success" strokeWidth={1.75} />
            <span className="label-micro">Wins</span>
          </div>
          <div className="text-stat font-display text-success">{RECORD.wins}</div>
        </div>
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <TrendingDown className="size-4 text-destructive" strokeWidth={1.75} />
            <span className="label-micro">Losses</span>
          </div>
          <div className="text-stat font-display text-destructive">{RECORD.losses}</div>
        </div>
        <div className="bento-card p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Award className="size-4 text-warning" strokeWidth={1.75} />
            <span className="label-micro">KOs</span>
          </div>
          <div className="text-stat font-display text-warning">{RECORD.kos}</div>
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
            <BoutCard key={bout.id} bout={bout} onClick={() => setSelectedBout(bout)} />
          ))}
        </div>
      )}

      {/* Scorecard modal */}
      {selectedBout && (
        <BoutScorecardModal bout={selectedBout} onClose={() => setSelectedBout(null)} />
      )}
    </div>
  );
}
