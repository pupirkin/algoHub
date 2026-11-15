"use client";

import { Button } from "@algohub/ui";
import { useT } from "../i18n";
import Link from "next/link";
import { commonErrorKey, type ApiFailure } from "../api";
import { paths } from "../routes";

export function Loading() {
  const t = useT("common");
  return (
    <p role="status" className="text-muted-foreground">
      {t("loading")}
    </p>
  );
}

export function Failure({ failure, onRetry }: { failure: ApiFailure; onRetry?: () => void }) {
  const t = useT("common");
  const key = commonErrorKey(failure);
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-border bg-muted p-4">
      <p>{t(key)}</p>
      {key === "notFound" ? (
        <Link href={paths.create()} className="text-sm underline underline-offset-4">
          {t("toCreate")}
        </Link>
      ) : onRetry !== undefined ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
