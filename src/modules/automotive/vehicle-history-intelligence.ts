/** Evidence-bound vehicle history summary. Never turns missing data into a clean report. */
export type VehicleHistoryRegion = "GB" | "DE" | "JP";
export type VehicleHistoryArea =
  | "identity" | "mot" | "inspection" | "finance" | "stolen"
  | "writeoff" | "accident" | "mileage" | "auction_sheet"
  | "auction_mileage" | "repair";
export type HistoryFinding = "clear" | "flagged" | "unknown";
export type VehicleHistoryObservation = {
  area: VehicleHistoryArea;
  sourceId: string;
  checkedAt: string;
  finding: HistoryFinding;
  verified: boolean;
  dataRightsConfirmed: boolean;
  evidenceId?: string;
};
export type VehicleHistorySummary = {
  region: VehicleHistoryRegion;
  status: "needs_review" | "incomplete" | "checked_without_flags";
  checkedAreas: VehicleHistoryArea[];
  unknownAreas: VehicleHistoryArea[];
  flaggedAreas: VehicleHistoryArea[];
  coverage: number;
  statement: string;
};

/** Distinct coverage requirements: identity decoding is not provenance clearance. */
export const HISTORY_REQUIRED_AREAS: Record<VehicleHistoryRegion, VehicleHistoryArea[]> = {
  GB: ["identity", "mot", "finance", "stolen", "writeoff", "mileage"],
  DE: ["identity", "inspection", "finance", "accident", "mileage"],
  JP: ["identity", "auction_sheet", "auction_mileage", "repair"],
};

export function assessVehicleHistory(
  region: VehicleHistoryRegion,
  observations: readonly VehicleHistoryObservation[],
  now = new Date(),
): VehicleHistorySummary {
  const checkedAreas: VehicleHistoryArea[] = [];
  const unknownAreas: VehicleHistoryArea[] = [];
  const flaggedAreas: VehicleHistoryArea[] = [];
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const area of HISTORY_REQUIRED_AREAS[region]) {
    const trusted = observations.filter((item) =>
      item.area === area && item.verified === true &&
      item.dataRightsConfirmed === true &&
      item.sourceId.trim().length > 0 &&
      Number.isFinite(Date.parse(item.checkedAt)) &&
      Date.parse(item.checkedAt) <= now.getTime() + 5 * 60 * 1000,
    );
    // Any verified adverse marker blocks clear reporting, even when old.
    if (trusted.some((item) => item.finding === "flagged")) {
      flaggedAreas.push(area);
    } else if (
      trusted.some((item) => item.finding === "clear" && Date.parse(item.checkedAt) >= cutoff)
    ) {
      checkedAreas.push(area);
    } else {
      unknownAreas.push(area);
    }
  }
  const status = flaggedAreas.length
    ? "needs_review" as const
    : unknownAreas.length ? "incomplete" as const
    : "checked_without_flags" as const;
  return {
    region, status, checkedAreas, unknownAreas, flaggedAreas,
    coverage: Number((checkedAreas.length / HISTORY_REQUIRED_AREAS[region].length).toFixed(3)),
    statement: status === "needs_review"
      ? "One or more verified sources require a specialist review; do not treat this vehicle as clear."
      : status === "incomplete"
        ? "Checks are incomplete or unverified. Missing results are unknown, not clear."
        : "No flags were reported within the specified sources and checked-at window; this is not a guarantee of complete vehicle history.",
  };
}
