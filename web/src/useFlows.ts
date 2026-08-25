import { useEffect, useState } from "react";
import { boardFile } from "./flows";
import type { Centroids, FacilityFlows, FlowEndpoints } from "./types";

export interface FlowData {
  flows: FacilityFlows;
  endpoints: FlowEndpoints;
  states: Centroids;
  countries: Centroids;
}

const facilityCache = new Map<string, Promise<FacilityFlows>>();
let referenceCache: Promise<Omit<FlowData, "flows">> | null = null;

function load<T>(file: string): Promise<T> {
  return fetch(`${import.meta.env.BASE_URL}data/flows/${file}`).then(
    (response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<T>;
    },
  );
}

function loadReference(): Promise<Omit<FlowData, "flows">> {
  referenceCache ??= Promise.all([
    load<FlowEndpoints>("endpoints.json"),
    load<Centroids>("states.json"),
    load<Centroids>("countries.json"),
  ])
    .then(([endpoints, states, countries]) => ({
      endpoints,
      states,
      countries,
    }))
    .catch((error) => {
      referenceCache = null;
      throw error;
    });
  return referenceCache;
}

function loadFacility(detloc: string): Promise<FacilityFlows> {
  let pending = facilityCache.get(detloc);
  if (!pending) {
    pending = load<FacilityFlows>(boardFile(detloc)).catch((error) => {
      facilityCache.delete(detloc);
      throw error;
    });
    facilityCache.set(detloc, pending);
  }
  return pending;
}

/**
 * Flow data for the selected facility, fetched on demand and cached for the
 * session. A failure resolves to null: the panel omits the Flows section
 * rather than reporting an error, matching the app's absence-is-silent rule.
 */
export function useFacilityFlows(detloc: string | null): FlowData | null {
  const [loaded, setLoaded] = useState<FlowData | null>(null);

  useEffect(() => {
    if (!detloc) return;
    let cancelled = false;
    Promise.all([loadFacility(detloc), loadReference()])
      .then(([flows, reference]) => {
        if (!cancelled) setLoaded({ flows, ...reference });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detloc]);

  // Derived rather than cleared in the effect, so a facility change never
  // renders the previous facility's flows for a frame.
  return loaded?.flows.detloc === detloc ? loaded : null;
}

/**
 * The endpoint table on its own, for the processing-site layer. Shares the
 * cached reference fetch with the flow panel, so turning the toggle on after
 * selecting a facility costs nothing.
 */
export function useFlowEndpoints(enabled: boolean): FlowEndpoints | null {
  const [endpoints, setEndpoints] = useState<FlowEndpoints | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadReference()
      .then((reference) => {
        if (!cancelled) setEndpoints(reference.endpoints);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return endpoints;
}
