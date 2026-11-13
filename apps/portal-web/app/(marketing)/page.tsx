import { getTranslations } from "next-intl/server";
import { CatalogSearch } from "@/catalog/catalog-search";
import { toCatalogItems } from "@/catalog/items";
import { SiteShell } from "@/layout/site-shell";
import { isLaunched, products } from "@/registry";

export default async function HomePage() {
  const t = await getTranslations();
  const ready = products.filter(isLaunched).length;
  const items = toCatalogItems(products, {
    status: (s) => t(`status.${s}`),
    profile: (p) => t(`profile.${p}`),
    tag: (tag) => t(`tags.${tag}`),
    wave: (w) => (w === null ? t("card.noWave") : t("card.wave", { wave: w })),
  });
  return (
    <SiteShell>
      <h1 className="text-3xl font-bold tracking-tight">{t("home.title")}</h1>
      <p className="mt-3 max-w-prose text-muted-foreground">{t("home.lead", { count: products.length })}</p>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {t("home.readySummary", { ready, total: products.length })}
      </p>
      <section aria-labelledby="catalog-heading" className="mt-10">
        <h2 id="catalog-heading" className="mb-4 text-2xl font-semibold">
          {t("home.catalogHeading")}
        </h2>
        <CatalogSearch items={items} />
      </section>
    </SiteShell>
  );
}
