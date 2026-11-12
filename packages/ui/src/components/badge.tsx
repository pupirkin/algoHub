import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      neutral: "border-transparent bg-muted text-foreground",
      info: "border-transparent bg-primary text-primary-foreground",
      success: "border-transparent bg-success text-success-foreground",
      warning: "border-transparent bg-warning text-warning-foreground",
      danger: "border-transparent bg-destructive text-destructive-foreground",
      outline: "border-border text-foreground",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
