/*
 * sim.js
 *
 * The model behind the instrument on this page.
 *
 * A fixed population of simulated users sit in a loop: wait, issue one request,
 * wait again. That is what Locust does in the real rig, and copying it matters,
 * because throughput in a closed loop is set by think time plus latency, not by
 * how fast the machine can go. It is why slowing the system down by a factor of
 * three costs only about a tenth of the throughput.
 *
 * The one modelling decision worth arguing about is that a request has two
 * separate costs:
 *
 *   wall work  how long it takes. Rendering a cart makes one catalog call per
 *              item, so this grows with the cart.
 *   cpu work   how much the processor actually burns. Those catalog calls are
 *              loopback round trips: the service spends the time waiting, not
 *              computing, so this barely grows at all.
 *
 * Keeping them apart is what reproduces the measured result honestly. Fan-out
 * makes pages slow without making the machine hot. Host power ends up varying
 * by about two percent across every condition, which is what fifteen rounds of
 * RAPL measurement found, and it is why the watts needle here refuses to move
 * whatever you do to the sliders. An earlier single-run reading suggested the
 * breaker saved eleven percent of host power. That was noise.
 *
 * Energy per completed transaction is the meter that does move. Same watts,
 * fewer successes.
 *
 * One mechanism is ported rather than modelled: a cart is emptied in exactly
 * one place in the real system, after a payment succeeds (checkout/main.py,
 * charge at line 115, empty at line 153). Suppress successful checkouts and
 * carts grow for the whole run, and every cart view gets more expensive, on
 * pages that never touch payment. That is the cart effect.
 *
 * Milliseconds and watts here are illustrative. The breaker is not: it is the
 * ported class from frontend/main.py, gated by test.html.
 */

import { CircuitBreaker } from "./breaker.js";

/* ------------------------------------------------------------ constants -- */

/* Request mix. Checkout being rare is not a detail: at roughly four percent of
 * traffic, a total payment outage costs about four points of system-wide
 * availability, and the rig measured 95.84%. */
const MIX = Object.freeze([
  ["home", 0.598],
  ["cart", 0.36],
  ["checkout", 0.042],
]);

/* Think time between one user's requests, seconds, uniform. */
const THINK = Object.freeze([0.8, 8.2]);

/* Wall time cost, seconds, before queueing. */
const WALL = Object.freeze({
  home: 0.105,
  cartBase: 0.15,
  cartPerItem: 0.085, // one product catalog call per item held
  checkout: 0.1,
  reject: 0.03, // never leaves the frontend, but still renders an error page
});

/* Processor cost, arbitrary units. Note how small the per-item term is next to
 * its wall-time twin: the fan-out is waiting, not computing. */
const CPU = Object.freeze({
  home: 0.02,
  cartBase: 0.024,
  cartPerItem: 0.0008,
  checkout: 0.03,
  reject: 0.001,
});

/* Queueing softness: everything in flight slows everything else a little. */
const N_SOFT = 9;

/* Illustrative power, anchored on two measured points: about 7.68 W at the
 * quietest condition and 7.83 W at the busiest. The whole band is two percent. */
const CPU_FULL = 2.0;
const P_IDLE = 7.48;
const P_SPAN = 0.83;
const P_TAU = 1.2; // lag, seconds, so the needle reads like a real scrape

const SERIES_WINDOW = 90; // sim seconds of chart history
const SERIES_EVERY = 0.5;
const MAX_DRAWN_PACKETS = 46;
const MAX_SUBSTEP = 0.05;
const PULSE_LIFE = 3.5; // sim seconds a finished checkout stays on the drawing

/* --------------------------------------------------------------- helpers -- */

function pickKind(r) {
  let acc = 0;
  for (const [kind, share] of MIX) {
    acc += share;
    if (r < acc) return kind;
  }
  return "home";
}

function uniform(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function p95(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Fixed-capacity sample buffer for latency percentiles. */
class Ring {
  constructor(n) {
    this.n = n;
    this.a = [];
  }
  push(v) {
    this.a.push(v);
    if (this.a.length > this.n) this.a.shift();
  }
}

/* ------------------------------------------------------------------- sim -- */

export class Sim {
  constructor(config = {}) {
    this.config = {
      breakerEnabled: false,
      failureRate: 0, // percent, injected at payment
      failMax: 5,
      resetTimeout: 30, // sim seconds
      users: 100,
      timeScale: 5,
      ...config,
    };
    this.reset();
  }

  setConfig(patch) {
    const rebuild =
      ("failMax" in patch && patch.failMax !== this.config.failMax) ||
      ("resetTimeout" in patch && patch.resetTimeout !== this.config.resetTimeout);
    Object.assign(this.config, patch);
    if (rebuild) this._newBreaker();
    if ("users" in patch) this._resizeUsers();
  }

  _newBreaker() {
    this.breaker = new CircuitBreaker(
      "checkout",
      this.config.failMax,
      this.config.resetTimeout,
      () => this.t
    );
  }

  _newUser() {
    return { cart: 0, nextAt: this.t + uniform(0, THINK[1]), busy: false };
  }

  _resizeUsers() {
    const n = this.config.users;
    while (this.users.length < n) this.users.push(this._newUser());
    if (this.users.length > n) this.users.length = n;
  }

  reset() {
    this.t = 0;
    this._newBreaker();

    this.users = [];
    this.inflight = [];
    this.seq = 0;
    this._resizeUsers();

    this.counts = {
      requests: 0,
      served: 0, // 2xx
      errors: 0, // payment 500, surfaced at checkout
      rejected: 0, // breaker said no
      checkoutAttempts: 0,
      checkoutSuccess: 0,
    };

    this.joules = 0;
    this.power = P_IDLE;
    this.cpuLoad = 0;

    this.lat = { checkout: new Ring(240), cart: new Ring(240), all: new Ring(600) };
    this.series = { t: [], throughput: [], availability: [], power: [], jPerSuccess: [], cart: [] };
    this._sinceSample = 0;
    this._cpuAccum = 0;

    this.events = [];
    this._seenChanges = 0;

    /* Recent checkout outcomes, parked on the drawing at the node where they
     * ended. Checkout is only four percent of traffic and resolves in a
     * fraction of a second, so as moving dots these are on screen about a tenth
     * of the time and you would never see the thing the page is about. The
     * meters carry the timing; the drawing carries the picture. Red piling up
     * at payment, or amber stopping at the frontend, is that picture. */
    this.pulses = [];
  }

  /* -------------------------------------------------------------- stepping */

  /** dtReal is wall-clock seconds; sim time moves at dtReal * timeScale. */
  step(dtReal) {
    let remaining = Math.min(dtReal, 0.25) * this.config.timeScale;
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_SUBSTEP);
      this._substep(dt);
      remaining -= dt;
    }
  }

  /** Advance exactly one sim second, for the step button. */
  stepOneSecond() {
    for (let left = 1; left > 0; left -= MAX_SUBSTEP) {
      this._substep(Math.min(left, MAX_SUBSTEP));
    }
  }

  _substep(dt) {
    this.t += dt;
    this._admit();
    this._service(dt);
    this._power(dt);
    this._expirePulses();
    this._drainEvents();
    this._sample(dt);
  }

  _admit() {
    for (let i = 0; i < this.users.length; i++) {
      const u = this.users[i];
      if (!u.busy && this.t >= u.nextAt) this._spawn(i, pickKind(Math.random()));
    }
  }

  _spawn(userIndex, kind) {
    const u = this.users[userIndex];
    u.busy = true;

    const req = {
      id: ++this.seq,
      kind,
      user: userIndex,
      born: this.t,
      progress: 0,
      outcome: "served",
      reach: kind === "checkout" ? "payment" : kind, // furthest node it touches
    };

    let wall;
    let cpu;

    if (kind === "home") {
      wall = WALL.home;
      cpu = CPU.home;
    } else if (kind === "cart") {
      wall = WALL.cartBase + WALL.cartPerItem * u.cart;
      cpu = CPU.cartBase + CPU.cartPerItem * u.cart;
    } else {
      u.cart += 1; // the load generator adds an item before buying
      this.counts.checkoutAttempts += 1;
      req.outcome = this._decideCheckout();
      if (req.outcome === "rejected") {
        wall = WALL.reject;
        cpu = CPU.reject;
        req.reach = "frontend";
      } else {
        wall = WALL.checkout;
        cpu = CPU.checkout;
      }
    }

    this.counts.requests += 1;
    this._cpuAccum += cpu;

    const load = 1 + this.inflight.length / N_SOFT;
    req.duration = wall * load * uniform(0.6, 1.5);

    this.inflight.push(req);
  }

  /**
   * The only place the breaker is consulted. In the real system the frontend
   * guards its call to checkout, and payment sits behind checkout, so an open
   * circuit stops the request before it leaves the frontend.
   */
  _decideCheckout() {
    const f = this.config.failureRate / 100;

    if (!this.config.breakerEnabled) {
      return Math.random() < f ? "error" : "served";
    }

    if (!this.breaker.canExecute()) return "rejected";

    if (Math.random() < f) {
      this.breaker.recordFailure();
      return "error";
    }
    this.breaker.recordSuccess();
    return "served";
  }

  _service(dt) {
    if (!this.inflight.length) return;
    const finished = [];

    for (const req of this.inflight) {
      req.progress += dt / req.duration;
      if (req.progress >= 1) {
        req.progress = 1;
        finished.push(req);
      }
    }

    if (!finished.length) return;
    for (const req of finished) this._complete(req);
    const done = new Set(finished.map((r) => r.id));
    this.inflight = this.inflight.filter((r) => !done.has(r.id));
  }

  _complete(req) {
    const u = this.users[req.user];
    const ms = req.duration * 1000; // exact by construction; wall clock
    // would round to zero for a rejection that resolves inside one substep

    this.lat.all.push(ms);
    if (req.kind === "checkout") this.lat.checkout.push(ms);
    if (req.kind === "cart") this.lat.cart.push(ms);

    if (req.outcome === "served") {
      this.counts.served += 1;
      if (req.kind === "checkout") {
        this.counts.checkoutSuccess += 1;
        u.cart = 0; // the one place a cart is emptied
      }
    } else if (req.outcome === "error") {
      this.counts.errors += 1;
    } else {
      this.counts.rejected += 1;
    }

    if (req.kind === "checkout") {
      this.pulses.push({ t: this.t, outcome: req.outcome, reach: req.reach });
    }

    u.busy = false;
    u.nextAt = this.t + uniform(THINK[0], THINK[1]);
  }

  _power(dt) {
    const rate = this._cpuAccum / dt;
    this._cpuAccum = 0;
    const alpha = 1 - Math.exp(-dt / P_TAU);
    this.cpuLoad += (Math.min(1, rate / CPU_FULL) - this.cpuLoad) * alpha;
    this.power += (P_IDLE + P_SPAN * this.cpuLoad - this.power) * alpha;
    this.joules += this.power * dt;
  }

  _expirePulses() {
    const cut = this.t - PULSE_LIFE;
    while (this.pulses.length && this.pulses[0].t < cut) this.pulses.shift();
    if (this.pulses.length > 36) this.pulses.splice(0, this.pulses.length - 36);
  }

  _drainEvents() {
    const changes = this.breaker.stateChanges;
    for (let i = this._seenChanges; i < changes.length; i++) this.events.push(changes[i]);
    this._seenChanges = changes.length;
    if (this.events.length > 8) this.events.splice(0, this.events.length - 8);
  }

  _sample(dt) {
    this._sinceSample += dt;
    if (this._sinceSample < SERIES_EVERY) return;
    this._sinceSample = 0;

    const s = this.series;
    s.t.push(this.t);
    s.throughput.push(this.throughput);
    s.availability.push(this.availability);
    s.power.push(this.power);
    s.jPerSuccess.push(this.jPerSuccess);
    s.cart.push(this.avgCart);

    const cut = this.t - SERIES_WINDOW;
    while (s.t.length > 2 && s.t[0] < cut) {
      for (const key of Object.keys(s)) s[key].shift();
    }
  }

  /* --------------------------------------------------------------- getters */

  /** Requests served per sim second, all endpoints. */
  get throughput() {
    return this.t > 0 ? this.counts.served / this.t : 0;
  }

  /** Served over asked. Rejections are failures: the user did not get the page. */
  get availability() {
    return this.counts.requests ? (100 * this.counts.served) / this.counts.requests : 100;
  }

  /** What a checkout user experiences, which is where the breaker shows up. */
  get checkoutFailPercent() {
    const a = this.counts.checkoutAttempts;
    return a ? (100 * (a - this.counts.checkoutSuccess)) / a : 0;
  }

  get jPerSuccess() {
    return this.counts.served ? this.joules / this.counts.served : 0;
  }

  get avgCart() {
    return mean(this.users.map((u) => u.cart));
  }

  get maxCart() {
    return this.users.reduce((a, u) => (u.cart > a ? u.cart : a), 0);
  }

  get probeIn() {
    if (!this.config.breakerEnabled) return null;
    if (this.breaker.state !== CircuitBreaker.OPEN) return null;
    return Math.max(0, this.config.resetTimeout - (this.t - this.breaker.lastFailureTime));
  }

  get breakerState() {
    return this.config.breakerEnabled ? this.breaker.state : "off";
  }

  /** One read-only snapshot for every renderer. */
  frame() {
    return {
      t: this.t,
      state: this.breakerState,
      failureCount: this.breaker.failureCount,
      failMax: this.config.failMax,
      successCount: this.breaker.successCount,
      probeIn: this.probeIn,
      opens: this.breaker.stateChanges.filter((c) => c.to === "open").length,
      counts: this.counts,
      throughput: this.throughput,
      availability: this.availability,
      checkoutFailPercent: this.checkoutFailPercent,
      power: this.power,
      joules: this.joules,
      jPerSuccess: this.jPerSuccess,
      avgCart: this.avgCart,
      maxCart: this.maxCart,
      checkoutP95: p95(this.lat.checkout.a),
      cartMean: mean(this.lat.cart.a),
      aggregateP95: p95(this.lat.all.a),
      inflight: this.inflight.length,
      packets: this.inflight.slice(0, MAX_DRAWN_PACKETS),
      pulses: this.pulses.map((p) => ({
        age: (this.t - p.t) / PULSE_LIFE,
        outcome: p.outcome,
        reach: p.reach,
      })),
      series: this.series,
      events: this.events,
    };
  }
}

export const SIM_CONSTANTS = Object.freeze({
  MIX,
  THINK,
  WALL,
  CPU,
  N_SOFT,
  P_IDLE,
  P_SPAN,
  CPU_FULL,
});