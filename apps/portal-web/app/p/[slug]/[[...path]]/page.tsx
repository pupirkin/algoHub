import { Badge } from "@algohub/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_BADGE_VARIANT } from "@/catalog/status";
import { SiteShell } from "@/layout/site-shell";
import { isPreviewEnabled } from "@/config/flags";
import { apiBaseUrl } from "@/config/public";
import { findProductBySlug, isLaunched, type ProductEntry, type ProductModule } from "@/registry";
import { WaitlistForm } from "@/waitlist/waitlist-form";

interface Params {
  params: Promise<{ slug: string; path?: string[] }>;
}

type Resolved =
  | { kind: "landing"; product: ProductEntry }
  | { kind: "product"; product: ProductEntry; module: ProductModule; path: string[] };

/**
 * Product entry point (ARCHITECTURE_PLAN §4). A product with a web package is served through `registry.load()`
 * once it is launched (MVP_READY+) or when `ALGOHUB_FLAGS=preview:<ID>` is set (with a visible preview notice);
 * otherwise the honest landing page. Unknown products and unknown sub-pages are 404.
 */
async function resolve(params: Params["params"]): Promise<Resolved> {
  const { slug, path = [] } = await params;
  const product = findProductBySlug(slug);
  if (product === undefined) notFound();
  if (product.load !== undefined && (isLaunched(product) || isPreviewEnabled(product.id))) {
    const productModule = await product.load();
    if (productModule.matchRoute(path) === null) notFound();
    return { kind: "product", product, module: productModule, path };
  }
  if (path.length > 0 || isLaunched(product)) notFound();
  return { kind: "landing", product };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { product: p } = await resolve(params);
  return { title: p.title, description: p.tagline };
}

export default async function ProductPage({ params }: Params) {
  const resolved = await resolve(params);
  const t = await getTranslations();
  const p = resolved.product;
  if (resolved.kind === "product") {
    const Product = resolved.module.default;
    return (
      <SiteShell>
        <Link href="/" className="text-sm underline underline-offset-4">
          {t("common.backToCatalog")}
        </Link>
        {isLaunched(p) ? null : (
          <p role="note" className="mt-4 max-w-prose rounded-md border border-border bg-muted p-3 text-sm">
            {t("landing.preview", { status: t(`status.${p.status}`) })}
          </p>
        )}
        <div className="mt-6">
          <Product path={resolved.path} apiBaseUrl={apiBaseUrl()} />
        </div>
      </SiteShell>
    );
  }
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
