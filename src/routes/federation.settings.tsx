import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Globe2, MapPin, Building2, Shield } from "lucide-react";
import { useFederationFilters } from "@/lib/federation";

export const Route = createFileRoute("/federation/settings")({
  component: FederationSettings,
});

function FederationSettings() {
  const { profile } = useAuth();
  const { scope, states, cities, label: jurisdiction } = useFederationFilters();
  const ScopeIcon = scope === "national" ? Globe2 : scope === "state" ? MapPin : Building2;

  return (
    <div className="animate-fade-up space-y-6 max-w-2xl relative">
      {/* Subtle Arena Fog */}
      <div className="atmosphere-base atmosphere-blue animate-ambient-drift w-[600px] h-[600px] top-0 right-0 -translate-y-1/3 translate-x-1/3 opacity-20 pointer-events-none" />

      <PageHeader
        title="Account Settings"
        subtitle="Your federation account configuration"
      />

      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-card relative z-10">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Account Information</div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Organisation Name</span>
            <span className="text-sm font-semibold text-foreground">{profile?.full_name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Login Email</span>
            <span className="text-sm font-semibold text-foreground">{profile?.email ?? "—"}</span>
          </div>
          <div className="flex items-start justify-between py-2.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Jurisdiction</span>
            <div className="flex items-center gap-1.5 text-right">
              <ScopeIcon className="size-3.5 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">{jurisdiction}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Account Status</span>
            {profile?.is_active ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">Revoked</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-muted-foreground flex items-start gap-3 relative z-10">
        <Shield className="size-4 text-blue-400 shrink-0 mt-0.5" />
        <span>
          <span className="font-semibold text-blue-400">Restricted Account:</span> Federation accounts are provisioned exclusively by the BOXOS Platform Admin. Jurisdiction, scope, and access settings cannot be changed from within this portal. Contact the platform administrator to request changes.
        </span>
      </div>
    </div>
  );
}
