/*
 * data.js
 *
 * Every measured number this page is allowed to display. Nothing here is
 * modelled, estimated, or rounded to look better. If a value is not in this
 * file, the article does not get to claim it.
 *
 * The one rule that matters: there were TWO campaigns, and they are never
 * pooled.
 *
 *   thesis       two machines, one run per condition. This is what the PDF
 *                reports and what the defence was held on. Good for direction
 *                and for cross-hardware agreement. No confidence intervals,
 *                because you cannot compute them from n=1.
 *
 *   replication  one machine, fifteen runs per condition. Built afterwards for
 *                the paper. This is the only campaign that can carry error
 *                bars, and it is the one that overturned the single-run power
 *                result.
 *
 * Where the two disagree, replication wins and the article says so out loud.
 * The single-run power reduction did not survive. Raw host power is flat. The
 * energy cost is per completed transaction, not per watt.
 */

/** Shallow-recursive freeze. Cheap insurance: the UI never mutates measurements. */
function deepFreeze(o) {
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") deepFreeze(v);
  }
  return Object.freeze(o);
}

/** Injected payment failure rates, the x axis of everything below. */
export const INTENSITIES = Object.freeze([0, 25, 50, 75, 100]);

export const CONFIG = deepFreeze({
  failMax: 5, // CB_FAIL_MAX, consecutive failures
  resetTimeout: 30, // CB_RESET_TIMEOUT, seconds
  halfOpenSuccessesToClose: 2,
  conditions: 10, // 2 breaker modes x 5 intensities
  durationMinutes: 30,
  users: 100,
  spawnRatePerSecond: 10,
  thinkTimeSeconds: [1, 10],
  injection: "instant HTTP 500 at payment /charge, PAYMENT_LATENCY_MS=0",
  requestsPerCondition: [31279, 38300], // range across conditions
  breakers: 7, // one per direct frontend dependency
  guardedPath: "loadgenerator -> frontend -> checkout -> payment",
});

export const CAMPAIGNS = deepFreeze({
  thesis: {
    label: "thesis campaign",
    machines: [
      "Dell XPS 13 9380, i5-8265U, 4C/8T, 8 GB, Ubuntu 24.04",
      "Lenovo ThinkPad T480s",
    ],
    runsPerCondition: 1,
    totalRuns: 20,
    approxHours: 11,
    carries: "direction, and agreement across two different machines",
    cannotCarry: "confidence intervals",
    note:
      "The Lenovo's first condition (breaker off, 0% injection) ran cold at " +
      "14.5 rps against roughly 21 everywhere else. It was later re-executed " +
      "cleanly at 21.10 rps. Both facts are disclosed in the thesis; the " +
      "original cell is excluded from comparisons.",
  },
  replication: {
    label: "replication campaign",
    machines: ["Dell XPS 13 9380, i5-8265U, 4C/8T, 8 GB, Ubuntu 24.04"],
    runsPerCondition: 15,
    totalRuns: 150,
    approxHours: 72,
    roundsFailed: 0,
    carries: "means with 95% confidence intervals on a single machine",
    cannotCarry: "cross-hardware generalisation",
  },
});

/* ------------------------------------------------------------------------- *
 * Breaker engagement. thesis campaign.
 * The cleanest result in the study: predicted by arithmetic before the runs,
 * then reproduced to within one open on two different machines.
 * ------------------------------------------------------------------------- */
export const ENGAGEMENT = deepFreeze({
  campaign: "thesis",
  opens: { dell: [0, 1, 37, 54, 57], lenovo: [0, 2, 36, 54, 57] },
  rejected: { dell: [0, 22, 896, 1244, 1312], lenovo: [0, 48, 1020, 1328, 1417] },
});

/**
 * Why engagement is a threshold and not a slope. A breaker that needs five
 * consecutive failures trips with probability p^5 per window, which collapses
 * to nothing below about 50% and saturates above it.
 */
export const ARITHMETIC = deepFreeze({
  tripProbabilityPercent: [0, 0.098, 3.125, 23.73, 100], // p^5 at each intensity
  checkoutAttemptsAt25: 1640,
  expectedTripsAt25: 1.6, // 1640 x 0.25^5
  cycleSeconds: 31.3, // 30 s reset plus the wait for the next checkout
  ceilingOpensAt100: 57.5, // 1800 / 31.3
});

/* ------------------------------------------------------------------------- *
 * The checkout path. thesis campaign.
 * Observed failure percentage is what a user experiences, so breaker
 * rejections (503) are counted as failures here. That is why the on-mode
 * numbers run above the injected rate in the middle of the sweep.
 * ------------------------------------------------------------------------- */
export const CHECKOUT = deepFreeze({
  campaign: "thesis",
  dell: {
    failPercent: { off: [0.0, 25.4, 50.7, 74.4, 100], on: [0.0, 26.2, 79.4, 97.9, 100] },
    p95ms: { off: [190, 230, 270, 350, 530], on: [210, 250, 410, 360, 130] },
    meanMsAt100: { off: 289, on: 57 },
  },
  lenovo: {
    // index 0 off-mode is the cold start; excluded rather than reported.
    failPercent: { off: [null, 26.3, 49.8, 73.3, 100], on: [0.0, 26.4, 81.7, 97.0, 100] },
    p95ms: { off: [null, 180, 220, 270, 450], on: [180, 190, 290, 280, 95] },
  },
});

/* ------------------------------------------------------------------------- *
 * System-wide. thesis campaign.
 * Aggregate percentiles cover every endpoint, not just checkout. The gap
 * between checkout p95 falling and aggregate p95 rising is the cart effect.
 * ------------------------------------------------------------------------- */
export const SYSTEM = deepFreeze({
  campaign: "thesis",
  dell: {
    throughputRps: { off: [21.15, 21.28, 20.7, 20.04, 18.03], on: [21.06, 21.06, 19.17, 17.59, 17.38] },
    availabilityPercent: { off: [100.0, 98.85, 97.86, 96.79, 95.84], on: [100.0, 98.85, 96.48, 95.75, 95.58] },
    aggregateP50ms: { off: [140, 170, 210, 320, 700], on: [150, 180, 510, 840, 900] },
    aggregateP95ms: { off: [430, 560, 760, 1300, 3400], on: [500, 600, 2200, 3800, 4200] },
    aggregateP99ms: { off: [670, 920, 1300, 2200, 4300], on: [830, 970, 3400, 5100, 5300] },
  },
  lenovo: {
    throughputRps: { off: [null, 21.23, 21.13, 20.63, 18.66], on: [21.28, 21.17, 20.25, 19.11, 18.78] },
    availabilityPercent: { off: [null, 98.84, 97.81, 96.87, 95.82], on: [100.0, 98.86, 96.27, 95.77, 95.59] },
    coldStartRps: 14.5, // the excluded cell
    reExecutedRps: 21.1, // the clean re-run of that cell
  },
});

/* ------------------------------------------------------------------------- *
 * Host power. replication campaign, 15 rounds, mean +/- 95% CI, watts.
 *
 * Read the intervals before the means. Every one of them straddles zero. The
 * breaker does not change how much power the machine draws. An earlier
 * single-run reading suggested up to 11% less; fifteen rounds says that was
 * noise, and this file exists partly so that number can never come back.
 * ------------------------------------------------------------------------- */
export const POWER = deepFreeze({
  campaign: "replication",
  unit: "W",
  off: { mean: [7.681, 7.719, 7.729, 7.788, 7.743], ci95: [0.344, 0.345, 0.322, 0.3, 0.304] },
  on: { mean: [7.68, 7.765, 7.831, 7.827, 7.798], ci95: [0.319, 0.317, 0.352, 0.366, 0.392] },
  deltaPercent: [-0.0, 0.6, 1.3, 0.5, 0.7],
  verdict: "flat within +/- 1.3%, all confidence intervals straddle zero",
});

/* ------------------------------------------------------------------------- *
 * Energy per successfully served request. replication campaign, joules.
 *
 * Same watts, fewer completed transactions. This is the finding that survived,
 * and it is sharper than the one it replaced: the breaker does not change what
 * the machine costs to run, it changes how much useful work that cost buys.
 * ------------------------------------------------------------------------- */
export const ENERGY_PER_SUCCESS = deepFreeze({
  campaign: "replication",
  unit: "J",
  off: [0.3105, 0.319, 0.3306, 0.3535, 0.404],
  on: [0.3101, 0.3213, 0.3557, 0.3908, 0.4008],
  deltaPercent: [-0.1, 0.7, 7.6, 10.6, -0.8],
  verdict: "the penalty is real and concentrated at partial failure, 50% and 75%",
});

/* ------------------------------------------------------------------------- *
 * The cart effect. thesis campaign, Dell, mean latency in ms.
 *
 * Failure travelled through persistent state, not through blocked threads. A
 * cart is emptied in exactly one place in the code, after a successful payment
 * (checkout/main.py: charge at line 115, empty at line 153). Suppress
 * successful checkouts and carts stop draining. Rendering a cart costs one
 * catalog call per item, so the price of every cart view climbs with it, on
 * pages that never touch payment.
 * ------------------------------------------------------------------------- */
export const CART = deepFreeze({
  campaign: "thesis",
  conditions: [
    { breaker: "off", inject: 0, cartMs: 179, cartBytes: 597, homeMs: 112, checkoutMs: 99 },
    { breaker: "off", inject: 75, cartMs: 701, cartBytes: 694, homeMs: 231, checkoutMs: 171 },
    { breaker: "on", inject: 75, cartMs: 2228, cartBytes: 779, homeMs: 511, checkoutMs: 71 },
    { breaker: "off", inject: 100, cartMs: 1982, cartBytes: 796, homeMs: 430, checkoutMs: 289 },
    { breaker: "on", inject: 100, cartMs: 2537, cartBytes: 795, homeMs: 541, checkoutMs: 57 },
  ],
  // Inside one 30 minute run, breaker on at 75%: the accumulation is visible
  // without comparing to anything else.
  withinRun: { breaker: "on", inject: 75, firstFiveMinutesMs: 295, lastFiveMinutesMs: 2305 },
});

/* ------------------------------------------------------------------------- *
 * The systematic mapping study that motivated measuring energy at all.
 * ------------------------------------------------------------------------- */
export const MAPPING_STUDY = deepFreeze({
  sources: { ieeeXplore: 255, acmDigitalLibrary: 529, screened: 784 },
  included: 44,
  yearsCovered: [2016, 2025],
  byPattern: { circuitBreaker: 16, retry: 13, timeout: 8, bulkhead: 4, chaos: 6 },
  papersMeasuringEnergy: 2,
  papersMeasuringPatternEnergy: 0,
});

/** Every export above, for the pages that want to iterate rather than import. */
export const ALL = deepFreeze({
  INTENSITIES,
  CONFIG,
  CAMPAIGNS,
  ENGAGEMENT,
  ARITHMETIC,
  CHECKOUT,
  SYSTEM,
  POWER,
  ENERGY_PER_SUCCESS,
  CART,
  MAPPING_STUDY,
});