import { err, ok, type Result } from "./result";

/**
 * Provenance — mandatory for every external or computed figure (ADR-0009, CLAUDE.md rule 4).
 * `demo` values must be visibly labeled in the UI and are never presented as real.
 */
export const PROVENANCE_SOURCES = ["live", "demo", "user"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export interface Provenance {
  readonly source: ProvenanceSource;
  /** ISO-8601 timestamp of when the value was fetched or computed. */
  readonly fetched_at: string;
  /** Optional confidence in [0, 1]. */
  readonly confidence?: number;
}

export type ProvenanceError =
  | { readonly kind: "invalid_source"; readonly value: unknown }
  | { readonly kind: "invalid_timestamp"; readonly value: unknown }
  | { readonly kind: "invalid_confidence"; readonly value: unknown };

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isProvenanceSource(value: unknown): value is ProvenanceSource {
  return typeof value === "string" && (PROVENANCE_SOURCES as readonly string[]).includes(value);
}

/** Validates an untrusted value (e.g. from an API response) into a Provenance. */
export function parseProvenance(input: unknown): Result<Provenance, ProvenanceError> {
  if (typeof input !== "object" || input === null) {
    return err({ kind: "invalid_source", value: input });
  }
  const { source, fetched_at: fetchedAt, confidence } = input as Record<string, unknown>;
  if (!isProvenanceSource(source)) return err({ kind: "invalid_source", value: source });
  if (typeof fetchedAt !== "string" || !ISO_8601.test(fetchedAt) || Number.isNaN(Date.parse(fetchedAt))) {
    return err({ kind: "invalid_timestamp", value: fetchedAt });
  }
  if (confidence === undefined) return ok({ source, fetched_at: fetchedAt });
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return err({ kind: "invalid_confidence", value: confidence });
  }
  return ok({ source, fetched_at: fetchedAt, confidence });
}

export const isDemo = (p: Provenance): boolean => p.source === "demo";
