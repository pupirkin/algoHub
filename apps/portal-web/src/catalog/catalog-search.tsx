"use client";

import { Badge, Button, Card, CardDescription, CardFooter, CardHeader, CardTitle, Input } from "@algohub/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { CatalogItem } from "./items";
import { search } from "./search";
import { STATUS_BADGE_VARIANT } from "./status";

export function CatalogSearch({ items }: { items: readonly CatalogItem[] }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const visible = useMemo(() => {
    const ids = new Set(
      search(
        items.map((i) => i.doc),
        query,
      ),
    );
    return items.filter((i) => ids.has(i.id));
  }, [items, query]);

  return (
    <div>
      <div className="flex max-w-xl flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("search.label")}
        </label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            type="search"
            value={query}
            placeholder={t("search.placeholder")}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query !== "" && (
            <Button type="button" variant="outline" onClick={() => setQuery("")}>
              {t("search.clear")}
            </Button>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {visible.length === 0 ? t("search.empty", { query }) : t("search.results", { count: visible.length })}
        </p>
      </div>

      <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3" data-testid="catalog-list">
        {visible.map((item) => (
          <li key={item.id}>
            <Card className="relative flex h-full flex-col transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_BADGE_VARIANT[item.status]}>{item.statusLabel}</Badge>
                  <span className="text-xs text-muted-foreground">{item.id}</span>
                </div>
                <CardTitle as="h3">
                  <Link
                    href={`/p/${item.slug}`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    aria-label={t("card.open", { title: item.title })}
                  >
                    {item.title}
                  </Link>
                </CardTitle>
                <CardDescription>{item.tagline}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto flex-wrap text-xs text-muted-foreground">
                <span>{item.profileLabels.join(" · ")}</span>
                <span aria-hidden="true">·</span>
                <span>{item.waveLabel}</span>
                <span className="sr-only">.</span>
                <span className="w-full">{item.tagLabels.join(", ")}</span>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
