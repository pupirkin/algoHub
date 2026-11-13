import { PageShell } from "@algohub/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

export async function SiteShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("common");
  return (
    <PageShell
      skipLinkLabel={t("skipLink")}
      header={
        <Link
          href="/"
          className="text-lg font-semibold focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("brand")}
        </Link>
      }
      footer={<span>{t("footer")}</span>}
    >
      {children}
    </PageShell>
  );
}
