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
    <div className="animate-fade-up space-y-6 max-w-2xl">
      <PageHeader
        title="Account Settings"
        subtitle="Your federation account configuration"
      />

      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Account Information</div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Organisation Name</span>
            <span className="text-sm font-semibold">{profile?.full_name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Login Email</span>
            <span className="text-sm font-semibold">{profile?.email ?? "—"}</span>
          </div>
          <div className="flex items-start justify-between py-2.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Jurisdiction</span>
            <div className="flex items-center gap-1.5 text-right">
              <ScopeIcon className="size-3.5 text-indigo-500" />
              <span className="text-sm font-semibold">{jurisdiction}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Account Status</span>
            {profile?.is_active ? (
              <span className="badge badge-success">Active</span>
            ) : (
              <span className="badge badge-danger">Revoked</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 text-xs text-muted-foreground flex items-start gap-3">
        <Shield className="size-4 text-indigo-500 shrink-0 mt-0.5" />
        <span>
          <span className="font-semibold text-indigo-600">Restricted Account:</span> Federation accounts are provisioned exclusively by the BOXOS Platform Admin. Jurisdiction, scope, and access settings cannot be changed from within this portal. Contact the platform administrator to request changes.
        </span>
      </div>
    </div>
  );
}
