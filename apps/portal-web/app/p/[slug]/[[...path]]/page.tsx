import { Badge } from "@algohub/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_BADGE_VARIANT } from "@/catalog/status";
import { SiteShell } from "@/layout/site-shell";
import { findProductBySlug, isLaunched, type ProductEntry } from "@/registry";
import { WaitlistForm } from "@/waitlist/waitlist-form";

interface Params {
  params: Promise<{ slug: string; path?: string[] }>;
}

/**
 * Product entry point (ARCHITECTURE_PLAN §4). Below MVP_READY it renders the honest landing page;
 * the first product web slice (P15) adds the branch that loads the product via `registry.load()`.
 */
async function resolve(params: Params["params"]): Promise<ProductEntry> {
  const { slug, path } = await params;
  const product = findProductBySlug(slug);
  // No launched product exists yet, so there are no sub-pages: /p/<slug>/<anything> is a 404.
  if (product === undefined || (path !== undefined && path.length > 0) || isLaunched(product)) notFound();
  return product;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await resolve(params);
  return { title: p.title, description: p.tagline };
}

export default async function ProductPage({ params }: Params) {
  const p = await resolve(params);
  const t = await getTranslations();
  return (
    <SiteShell>
      <Link href="/" className="text-sm underline underline-offset-4">
        {t("common.backToCatalog")}
      </Link>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_BADGE_VARIANT[p.status]}>{t(`status.${p.status}`)}</Badge>
        <span className="text-sm text-muted-foreground">{p.id}</span>
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{p.title}</h1>
      <p className="mt-2 max-w-prose text-lg">{p.tagline}</p>
      <p className="mt-4 max-w-prose rounded-md border border-border bg-muted p-3 text-sm">
        {t("landing.notice", { status: t(`status.${p.status}`) })}
      </p>

      <section aria-labelledby="problem" className="mt-8 max-w-prose">
        <h2 id="problem" className="text-xl font-semibold">
          {t("landing.problemHeading")}
        </h2>
        <p className="mt-2">{p.purpose}.</p>
      </section>

      <section aria-labelledby="how" className="mt-8 max-w-prose">
        <h2 id="how" className="text-xl font-semibold">
          {t("landing.howHeading")}
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {p.profiles.map((prof) => (
            <li key={prof}>{t(`landing.how.${prof}`)}</li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("landing.profileLabel")}</dt>
          <dd>{p.profiles.map((prof) => t(`profile.${prof}`)).join(" + ")}</dd>
          <dt className="text-muted-foreground">{t("landing.coreLabel")}</dt>
          <dd lang="en">{p.core.join(", ")}</dd>
        </dl>
      </section>

      <section aria-labelledby="waitlist" className="mt-10 max-w-prose">
        <h2 id="waitlist" className="text-xl font-semibold">
          {t("waitlist.heading")}
        </h2>
        <p className="mb-4 mt-2 text-muted-foreground">{t("waitlist.intro", { title: p.title })}</p>
        <WaitlistForm productId={p.id} productTitle={p.title} />
      </section>
    </SiteShell>
  );
}
