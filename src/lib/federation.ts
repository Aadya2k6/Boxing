import { useAuth } from "@/lib/auth";
import { useMemo } from "react";

export function useFederationFilters() {
  const { profile } = useAuth();
  
  let scope = profile?.federation_scope_type as "national" | "state" | "custom" | undefined;
  if (!scope) {
    if (profile?.role === "state_federation_admin") scope = "state";
    else if (profile?.role === "custom_federation_admin") scope = "custom";
    else scope = "national";
  }
  
  const rawStates = profile?.federation_scope_states || (profile as any)?.federation_scope_state;
  let states = Array.isArray(rawStates) ? rawStates : (typeof rawStates === "string" ? [rawStates] : []);
  states = states.map(s => typeof s === 'string' ? s.trim() : s);
  
  // Expand case variations for safe .in() matching
  const expandedStates = Array.from(new Set([
    ...states,
    ...states.map(s => s.toLowerCase()),
    ...states.map(s => s.toUpperCase()),
    ...states.map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
  ]));

  const rawCities = profile?.federation_scope_cities || (profile as any)?.federation_scope_city;
  let cities = Array.isArray(rawCities) ? rawCities : (typeof rawCities === "string" ? [rawCities] : []);
  cities = cities.map(c => typeof c === 'string' ? c.trim() : c);
  
  const expandedCities = Array.from(new Set([
    ...cities,
    ...cities.map(c => c.toLowerCase()),
    ...cities.map(c => c.toUpperCase()),
    ...cities.map(c => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase())
  ]));

  const label = scope === "national"
    ? "National — All India"
    : scope === "state" && expandedStates.length > 0
    ? `State — ${expandedStates.slice(0, states.length).join(", ")}`
    : scope === "custom" && expandedCities.length > 0
    ? `Custom — ${expandedCities.slice(0, cities.length).join(", ")}`
    : "National — All India";

  return useMemo(() => ({
    scope,
    states: expandedStates,
    cities: expandedCities,
    label
  }), [scope, states.join(","), cities.join(",")]);
}
