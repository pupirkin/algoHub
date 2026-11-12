import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export interface PageShellProps {
  /** Brand / navigation content rendered inside the <header> landmark. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Text of the "skip to content" link (localized by the caller). */
  skipLinkLabel?: string;
}

/** Page layout with landmarks and a skip link. Mobile-first container. */
export function PageShell({ header, footer, children, skipLinkLabel = "Skip to content" }: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        {skipLinkLabel}
      </a>
      {header !== undefined && (
        <header className="border-b border-border">
          <Container className="flex h-14 items-center justify-between">{header}</Container>
        </header>
      )}
      <main id="main" tabIndex={-1} className="flex-1 py-8 focus:outline-none">
        <Container>{children}</Container>
      </main>
      {footer !== undefined && (
        <footer className="border-t border-border py-6 text-sm text-muted-foreground">
          <Container>{footer}</Container>
        </footer>
      )}
    </div>
  );
}

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-5xl px-4 sm:px-6", className)} {...props} />;
}
