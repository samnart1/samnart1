/*
 * breaker.js
 *
 * Literal port of `class CircuitBreaker` from:
 *   github.com/samnart1/tolerant  ->  frontend/main.py
 *
 * The simulation on this page is only worth reading if it behaves like the
 * system that produced the measurements. So this file is a translation, not a
 * reimplementation: same states, same counters, same transition order, same
 * quirks. `breaker.test.js` ports all thirty cases from
 * `tests/test_circuit_breaker.py` and is the gate on that claim.
 *
 * Two deliberate differences from the Python, both mechanical:
 *
 *   1. Methods are camelCase (canExecute, recordSuccess) because this is JS.
 *      The observable payloads are not: `getMetrics()` and every entry in
 *      `stateChanges` keep the Python key names, so output from this class can
 *      be diffed byte for byte against the frontend's /metrics endpoint.
 *
 *   2. The clock is injected instead of read from a global. Python's tests
 *      monkeypatch `time.time`; here the constructor takes a `now` function.
 *      The page needs this anyway: the simulation runs on scaled sim-seconds,
 *      not wall-clock, so a 30 second reset timeout is watchable.
 */

const CLOSED = "closed";
const OPEN = "open";
const HALF_OPEN = "half_open";

/** Epoch seconds as a float, matching Python's time.time(). */
const wallClock = () => Date.now() / 1000;

export class CircuitBreaker {
  static CLOSED = CLOSED;
  static OPEN = OPEN;
  static HALF_OPEN = HALF_OPEN;

  /**
   * @param {string} name          breaker name, as in the `breakers` dict
   * @param {number} failMax       consecutive failures to open (CB_FAIL_MAX)
   * @param {number} resetTimeout  seconds before a probe is allowed
   * @param {() => number} now     clock in seconds; injected for sim and tests
   */
  constructor(name, failMax = 5, resetTimeout = 30, now = wallClock) {
    this.name = name;
    this.failMax = failMax;
    this.resetTimeout = resetTimeout;
    this.now = now;

    this.state = CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;

    this.stateChanges = [];
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.totalRejected = 0;
  }

  /** Records a transition only when the state actually differs. */
  _changeState(newState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.stateChanges.push({
      timestamp: this.now(),
      breaker: this.name,
      from: oldState,
      to: newState,
      // Snapshot at transition time. Ordering matters: the half-open close path
      // zeroes failureCount before calling this, so that event logs 0.
      failure_count: this.failureCount,
    });
  }

  /**
   * Gate on every guarded call. Note that totalCalls increments even when the
   * answer is no, so totalCalls counts attempts, not requests that left the
   * frontend. The open-to-half-open transition happens here, and the call that
   * triggers it is the probe: it is allowed through.
   */
  canExecute() {
    this.totalCalls += 1;

    if (this.state === CLOSED) return true;

    if (this.state === OPEN) {
      if (this.now() - this.lastFailureTime >= this.resetTimeout) {
        this._changeState(HALF_OPEN);
        return true;
      }
      this.totalRejected += 1;
      return false;
    }

    if (this.state === HALF_OPEN) return true;

    return false;
  }

  recordSuccess() {
    this.totalSuccesses += 1;

    if (this.state === HALF_OPEN) {
      this.successCount += 1;
      if (this.successCount >= 2) {
        this.failureCount = 0;
        this.successCount = 0;
        this._changeState(CLOSED);
      }
    } else if (this.state === CLOSED) {
      // Consecutive, not windowed. One success wipes the run of failures, which
      // is the whole reason a 25% failure rate barely trips this breaker.
      this.failureCount = 0;
    }
  }

  recordFailure() {
    this.totalFailures += 1;
    this.failureCount += 1;
    this.lastFailureTime = this.now();

    if (this.state === HALF_OPEN) {
      // Faithful to the Python: successCount is NOT cleared here. A probe that
      // scored one success before failing leaves that success banked, so the
      // next half-open window closes on a single success instead of two.
      // Preserved deliberately; see the quirk tests in breaker.test.js.
      this._changeState(OPEN);
    } else if (this.state === CLOSED && this.failureCount >= this.failMax) {
      this._changeState(OPEN);
    }
  }

  /** Same shape and key names as the frontend's /metrics payload. */
  getMetrics() {
    return {
      name: this.name,
      state: this.state,
      failure_count: this.failureCount,
      total_calls: this.totalCalls,
      total_successes: this.totalSuccesses,
      total_failures: this.totalFailures,
      total_rejected: this.totalRejected,
      state_changes: this.stateChanges,
    };
  }
}

export class CircuitBreakerOpen extends Error {}