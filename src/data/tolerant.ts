/* Every figure on the tolerant page comes from here and nowhere else.
   `source` records which run produced the number so it can be traced. */

export type Source = "replication" | "single-run";

export const breaker = {
  failMax: 5,
  resetTimeoutSec: 30,
  successesToClose: 2,
  guardedServices: 7,
} as const;

export const load = {
  users: 100,
  spawnRatePerSec: 10,
  minutesPerCondition: 30,
  warmupCutSec: 300,
} as const;

export const design = {
  failureRates: [0, 25, 50, 75, 100] as const,
  conditions: 10,
  rounds: 15,
  runs: 150,
  approxHours: 72,
} as const;

export const sms = {
  screened: 44,
  measuringEnergy: 2,
} as const;

export const openCeiling = {
  windowSec: 1800,
  cycleSec: 31.3,
  opens: 57.5,
} as const;

export interface RateRow {
  rate: number;
  opens: number;
  /* percent change in joules per successful request, breaker on vs off */
  joulesPerSuccessPct: number;
  /* true when the measured value is indistinguishable from zero */
  approxZero: boolean;
}

export const byRate: RateRow[] = [
  { rate: 0, opens: 0, joulesPerSuccessPct: 0, approxZero: true },
  { rate: 25, opens: 2, joulesPerSuccessPct: 0, approxZero: true },
  { rate: 50, opens: 37, joulesPerSuccessPct: 7.6, approxZero: false },
  { rate: 75, opens: 54, joulesPerSuccessPct: 10.6, approxZero: false },
  { rate: 100, opens: 57, joulesPerSuccessPct: 0, approxZero: true },
];

export const latency = {
  checkoutP95MsOff: 530,
  checkoutP95MsOn: 130,
  factor: 4,
  source: "single-run" as Source,
};

export const partialFailure = {
  injectedPct: 50,
  observedFailurePct: 79,
  availabilityDeltaPp: -1.5,
  throughputDeltaPct: -12,
  rejected: 896,
  source: "single-run" as Source,
};

export const cartEffect = {
  beforeMs: 295,
  afterMs: 2305,
  source: "single-run" as Source,
};

export const energy = {
  powerBandPct: 1.3,
  source: "replication" as Source,
};

export const stack = [
  "Python",
  "FastAPI",
  "Docker Compose",
  "Locust",
  "Scaphandre",
  "Prometheus",
];

/* Probability that any window of `n` requests is all failures at rate `p`.
   This is the whole reason a consecutive-failure breaker has a blind spot. */
export function tripProbability(ratePct: number, failMax: number): number {
  return Math.pow(ratePct / 100, failMax);
}