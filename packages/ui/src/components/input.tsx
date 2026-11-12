import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

/** Text input. Always pair with a <label htmlFor> or aria-label — enforced by jsx-a11y and axe tests. */
export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
