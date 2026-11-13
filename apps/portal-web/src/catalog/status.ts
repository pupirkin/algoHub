import type { ProductStatus } from "@algohub/core";
import type { BadgeProps } from "@algohub/ui";

type Variant = NonNullable<BadgeProps["variant"]>;

/** Honest status colors: only launched products look «green». */
export const STATUS_BADGE_VARIANT: Record<ProductStatus, Variant> = {
  NOT_STARTED: "outline",
  DISCOVERY: "neutral",
  DESIGNED: "neutral",
  IN_PROGRESS: "warning",
  MVP_READY: "success",
  VALIDATING: "success",
  LIVE: "success",
  BLOCKED: "danger",
};
