import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SiteShell } from "@/layout/site-shell";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <SiteShell>
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("text")}</p>
      <Link href="/" className="mt-6 inline-block underline underline-offset-4">
        {t("back")}
      </Link>
    </SiteShell>
  );
}
