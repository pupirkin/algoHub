import { err, isProductProfile, ok, type ProductProfile, type Result } from "@algohub/core";

export interface GenArgs {
  readonly id: string; // "P17"
  readonly slug: string; // "fairteams"
  readonly profiles: readonly ProductProfile[];
  readonly dryRun: boolean;
}

export const DOC_FILES = [
  "README.md",
  "PRD.md",
  "ARCHITECTURE.md",
  "VALIDATION.md",
  "STATUS.md",
  "DECISIONS.md",
  "CHANGELOG.md",
] as const;

const USAGE = "usage: gen-product <ID> <slug> --profile CLIENT|ROOM|SOLVER|DATA[+...] [--dry-run]";

export function parseArgs(argv: readonly string[]): Result<GenArgs, string> {
  const positional: string[] = [];
  let profileRaw: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--profile") profileRaw = argv[++i];
    else if (a?.startsWith("--profile=")) profileRaw = a.slice("--profile=".length);
    else if (a !== undefined && a !== "--") positional.push(a);
  }
  const [rawId, slug] = positional;
  if (rawId === undefined || slug === undefined || profileRaw === undefined || positional.length > 2) {
    return err(USAGE);
  }
  const id = rawId.toUpperCase();
  if (!/^P(0[1-9]|[1-9]\d)$/.test(id)) return err(`invalid product id "${rawId}" (expected P01..P99)`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return err(`invalid slug "${slug}" (lowercase, digits, dashes)`);
  const parts = profileRaw.toUpperCase().split("+");
  const profiles: ProductProfile[] = [];
  for (const p of parts) {
    if (!isProductProfile(p)) return err(`invalid profile "${p}" (CLIENT|ROOM|SOLVER|DATA)`);
    if (!profiles.includes(p)) profiles.push(p);
  }
  return ok({ id, slug, profiles, dryRun });
}

export interface PlannedFile {
  readonly path: string; // relative to repo root
  readonly content: string;
}

export function productDir(args: Pick<GenArgs, "id" | "slug">): string {
  return `products/${args.id.toLowerCase()}-${args.slug}`;
}

/**
 * Phase 0 skeleton: docs + scenarios only. Profile-specific `web/` and `api/` templates are
 * produced by the Phase 2.5 retrospective from what P15 actually needed (DEVOPS §6).
 */
export function planProduct(args: GenArgs, today: string): PlannedFile[] {
  const dir = productDir(args);
  const profile = args.profiles.join("+");
  const title = `${args.id} ${args.slug}`;
  const docs: Record<(typeof DOC_FILES)[number], string> = {
    "README.md": `# ${title}\n\nПрофиль: ${profile}.\n\nКраткое описание продукта: TODO.\n`,
    "PRD.md": `# ${title} — PRD\n\n## Проблема\nTODO\n\n## Ключевой сценарий (acceptance)\nTODO\n\n## Нецели v1\nTODO\n`,
    "ARCHITECTURE.md": `# ${title} — архитектура\n\nПрофиль: ${profile} (см. ARCHITECTURE_PLAN.md §3).\n\n## Алгоритм\nTODO\n\n## Данные и retention\nTODO\n`,
    "VALIDATION.md": `# ${title} — валидация\n\n## Измеримая гипотеза\nTODO\n`,
    "STATUS.md": `# ${title} — STATUS\n\nStatus: NOT_STARTED\nUpdated: ${today}\n\n## Acceptance criteria\nTODO\n\n## Assumptions\n- none yet\n\n## Known bugs\n- none\n`,
    "DECISIONS.md": `# ${title} — решения\n\nФормат: дата · решение · причина · как откатить.\n`,
    "CHANGELOG.md": `# Changelog\n\nAll notable changes to this product are documented here (Keep a Changelog).\n\n## [Unreleased]\n- Product skeleton generated.\n`,
  };
  return [
    ...DOC_FILES.map((f) => ({ path: `${dir}/docs/${f}`, content: docs[f] })),
    { path: `${dir}/scenarios/.gitkeep`, content: "" },
  ];
}
