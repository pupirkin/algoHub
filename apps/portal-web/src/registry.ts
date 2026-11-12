import type { ProductProfile, ProductStatus } from "@algohub/core";

/**
 * Product registry — the SINGLE source of truth for the catalog (ARCHITECTURE_PLAN §6).
 * `PROJECT_INDEX.md` is generated from this file by `just index`; never edit the index by hand.
 * Status may only be raised to MVP_READY/LIVE after a green `just dod <ID>` (CLAUDE.md rule 3).
 *
 * Phase 0 keeps only the fields known from ARCHITECTURE_PLAN §3. Phase 1 adds tagline, tags and
 * `load: () => import(...)` for products that have a web package.
 */
export type ProductId = `P${number}`;
export type Wave = "1" | "1.5" | "2" | "3";

export interface ProductEntry {
  readonly id: ProductId;
  readonly slug: string;
  readonly title: string;
  /** One or more profiles; P01 = DATA + ROOM. P24 starts as CLIENT and moves to DATA later. */
  readonly profiles: readonly ProductProfile[];
  readonly status: ProductStatus;
  /** Planned delivery wave; null = not scheduled yet. */
  readonly wave: Wave | null;
}

export const products: readonly ProductEntry[] = [
  { id: "P01", slug: "jinal", title: "Jinal", profiles: ["DATA", "ROOM"], status: "NOT_STARTED", wave: "2" },
  { id: "P02", slug: "oneway", title: "OneWay", profiles: ["SOLVER", "DATA"], status: "NOT_STARTED", wave: null },
  {
    id: "P03",
    slug: "togetherride",
    title: "TogetherRide",
    profiles: ["SOLVER", "DATA"],
    status: "NOT_STARTED",
    wave: null,
  },
  { id: "P04", slug: "gonow", title: "GoNow", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P05", slug: "freetogether", title: "FreeTogether", profiles: ["ROOM"], status: "NOT_STARTED", wave: null },
  { id: "P06", slug: "basketbrain", title: "BasketBrain", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P07", slug: "fairsplit", title: "FairSplit", profiles: ["CLIENT"], status: "NOT_STARTED", wave: "1.5" },
  { id: "P08", slug: "livewhere", title: "LiveWhere", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P09", slug: "parksmart", title: "ParkSmart", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  {
    id: "P10",
    slug: "eattogether",
    title: "EatTogether",
    profiles: ["ROOM", "DATA"],
    status: "NOT_STARTED",
    wave: null,
  },
  { id: "P11", slug: "queueswap", title: "QueueSwap", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P12", slug: "lifeoptimizer", title: "LifeOptimizer", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P13", slug: "walkmatch", title: "WalkMatch", profiles: ["ROOM"], status: "NOT_STARTED", wave: null },
  { id: "P14", slug: "flightready", title: "FlightReady", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P15", slug: "nomoredebate", title: "NoMoreDebate", profiles: ["ROOM"], status: "NOT_STARTED", wave: "1" },
  { id: "P16", slug: "perfectwindow", title: "PerfectWindow", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P17", slug: "fairteams", title: "FairTeams", profiles: ["CLIENT"], status: "NOT_STARTED", wave: "1.5" },
  { id: "P18", slug: "pricedna", title: "PriceDNA", profiles: ["DATA"], status: "NOT_STARTED", wave: "3" },
  { id: "P19", slug: "groupbuy", title: "GroupBuy", profiles: ["SOLVER", "DATA"], status: "NOT_STARTED", wave: null },
  {
    id: "P20",
    slug: "subscriptionhunter",
    title: "SubscriptionHunter",
    profiles: ["CLIENT"],
    status: "NOT_STARTED",
    wave: "1.5",
  },
  { id: "P21", slug: "dealorwait", title: "DealOrWait", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  {
    id: "P22",
    slug: "repairorreplace",
    title: "RepairOrReplace",
    profiles: ["CLIENT"],
    status: "NOT_STARTED",
    wave: "1.5",
  },
  { id: "P23", slug: "quiethome", title: "QuietHome", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P24", slug: "sunflat", title: "SunFlat", profiles: ["CLIENT"], status: "NOT_STARTED", wave: "3" },
  { id: "P25", slug: "rentradar", title: "RentRadar", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P26", slug: "moveoptimizer", title: "MoveOptimizer", profiles: ["SOLVER"], status: "NOT_STARTED", wave: null },
  { id: "P27", slug: "safewalk", title: "SafeWalk", profiles: ["DATA"], status: "NOT_STARTED", wave: null },
  { id: "P28", slug: "slotgenius", title: "SlotGenius", profiles: ["SOLVER"], status: "NOT_STARTED", wave: "2" },
  {
    id: "P29",
    slug: "courierpool",
    title: "CourierPool",
    profiles: ["SOLVER", "DATA"],
    status: "NOT_STARTED",
    wave: null,
  },
  { id: "P30", slug: "stockmind", title: "StockMind", profiles: ["SOLVER"], status: "NOT_STARTED", wave: "3" },
  { id: "P31", slug: "shiftfair", title: "ShiftFair", profiles: ["SOLVER"], status: "NOT_STARTED", wave: "1" },
  {
    id: "P32",
    slug: "appointmentrescue",
    title: "AppointmentRescue",
    profiles: ["SOLVER"],
    status: "NOT_STARTED",
    wave: "2",
  },
];
