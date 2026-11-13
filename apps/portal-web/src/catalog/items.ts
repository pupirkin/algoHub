import type { ProductStatus } from "@algohub/core";
import type { ProductEntry } from "../registry";
import { makeDoc, type SearchDoc } from "./search";

/** Serializable card data passed from the server page to the client search component. */
export interface CatalogItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly tagline: string;
  readonly status: ProductStatus;
  readonly statusLabel: string;
  readonly profileLabels: readonly string[];
  readonly waveLabel: string;
  readonly tagLabels: readonly string[];
  readonly doc: SearchDoc;
}

export interface CatalogLabels {
  status: (s: ProductStatus) => string;
  profile: (p: ProductEntry["profiles"][number]) => string;
  tag: (t: ProductEntry["tags"][number]) => string;
  wave: (w: string | null) => string;
}

export function toCatalogItems(entries: readonly ProductEntry[], l: CatalogLabels): CatalogItem[] {
  return entries.map((p) => {
    const statusLabel = l.status(p.status);
    const profileLabels = p.profiles.map(l.profile);
    const tagLabels = p.tags.map(l.tag);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      tagline: p.tagline,
      status: p.status,
      statusLabel,
      profileLabels,
      waveLabel: l.wave(p.wave),
      tagLabels,
      doc: makeDoc(p.id, [p.id, p.title, p.tagline, p.purpose, ...p.core, ...tagLabels, ...profileLabels, statusLabel]),
    };
  });
}
