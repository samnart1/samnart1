/*
 * ui.js
 *
 * Wires the model to the instrument: controls in, meters and drawings out.
 *
 * Two behaviours worth knowing about.
 *
 * Scroll presets. Each article section can carry a data-preset attribute, and
 * when it comes into view the instrument dials itself to that condition, so
 * reading the page is also driving the model. The moment you touch a control
 * that stops, permanently, until you press Follow article again. The page never
 * takes the controls back from you without being asked.
 *
 * The measured panel. Every meter can show a dashed line and a number from the
 * real experiment for whatever condition is currently dialled in. The
 * simulation is a toy and says so; putting the measurement next to it, live, is
 * the only way to be honest about which parts of the toy to believe.
 */

import { Sim } from "./sim.js";
import { Graph } from "./graph.js";
import { Spark } from "./charts.js";
import { SYSTEM, POWER, ENERGY_PER_SUCCESS, CHECKOUT, ENGAGEMENT, INTENSITIES } from "./data.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STATE_LABEL = { off: "disabled", closed: "closed", open: "open", half_open: "half open" };

/** Measured values for the condition currently dialled in, or null if the
 *  failure rate is not one of the five levels the experiment actually ran. */
function measuredFor(config) {
  const i = INTENSITIES.indexOf(config.failureRate);
  if (i < 0) return null;
  const m = config.breakerEnabled ? "on" : "off";
  return {
    index: i,
    throughput: SYSTEM.dell.throughputRps[m][i],
    availability: SYSTEM.dell.availabilityPercent[m][i],
    power: POWER[m].mean[i],
    powerCi: POWER[m].ci95[i],
    jPerSuccess: ENERGY_PER_SUCCESS[m][i],
    checkoutP95: CHECKOUT.dell.p95ms[m][i],
    checkoutFail: CHECKOUT.dell.failPercent[m][i],
    opens: config.breakerEnabled ? ENGAGEMENT.opens.dell[i] : 0,
    rejected: config.breakerEnabled ? ENGAGEMENT.rejected.dell[i] : 0,
  };
}

const fmt = {
  rps: (v) => v.toFixed(1),
  pct: (v) => v.toFixed(2),
  w: (v) => v.toFixed(2),
  j: (v) => v.toFixed(3),
  ms: (v) => Math.round(v).toLocaleString("en"),
  int: (v) => Math.round(v).toLocaleString("en"),
  items: (v) => v.toFixed(1),
};

export function mount(root) {
  const sim = new Sim({ breakerEnabled: false, failureRate: 0, users: 100, timeScale: 5 });
  const graph = new Graph($(".rig-graph", root), REDUCED);

  const sparks = {
    throughput: new Spark($('[data-spark="throughput"]', root)),
    availability: new Spark($('[data-spark="availability"]', root)),
    power: new Spark($('[data-spark="power"]', root), { min: 7.2, max: 8.3 }),
    jPerSuccess: new Spark($('[data-spark="jPerSuccess"]', root)),
  };

  const out = {};
  for (const node of $$("[data-out]", root)) out[node.dataset.out] = node;
  const ref = {};
  for (const node of $$("[data-ref]", root)) ref[node.dataset.ref] = node;

  let running = false;
  let following = true;
  let showMeasured = true;
  let last = 0;

  /* ------------------------------------------------------------- controls */

  const followChip = $(".rig-follow", root);

  function touched() {
    if (!following) return;
    following = false;
    followChip.hidden = false;
  }

  function setSegment(name, value) {
    for (const b of $$(`[data-seg="${name}"]`, root)) {
      b.setAttribute("aria-pressed", String(b.dataset.value === String(value)));
    }
  }

  function apply(patch, { user = true } = {}) {
    if (user) touched();
    sim.setConfig(patch);
    if ("breakerEnabled" in patch) setSegment("breaker", patch.breakerEnabled ? "on" : "off");
    if ("failureRate" in patch) setSegment("failure", patch.failureRate);
    if ("timeScale" in patch) setSegment("speed", patch.timeScale);
    for (const key of ["failMax", "resetTimeout", "users"]) {
      if (key in patch) {
        const input = $(`[data-range="${key}"]`, root);
        if (input) input.value = patch[key];
        if (out[key]) out[key].textContent = patch[key];
      }
    }
    paint();
  }

  for (const b of $$("[data-seg]", root)) {
    b.addEventListener("click", () => {
      const v = b.dataset.value;
      if (b.dataset.seg === "breaker") apply({ breakerEnabled: v === "on" });
      else if (b.dataset.seg === "failure") apply({ failureRate: Number(v) });
      else if (b.dataset.seg === "speed") apply({ timeScale: Number(v) });
    });
  }

  for (const input of $$("[data-range]", root)) {
    input.addEventListener("input", () => {
      apply({ [input.dataset.range]: Number(input.value) });
    });
  }

  $(".rig-play", root).addEventListener("click", () => setRunning(!running));
  $(".rig-step", root).addEventListener("click", () => {
    setRunning(false);
    sim.stepOneSecond();
    paint();
  });
  $(".rig-reset", root).addEventListener("click", () => {
    sim.reset();
    paint();
  });
  followChip.addEventListener("click", () => {
    following = true;
    followChip.hidden = true;
  });

  const measuredToggle = $(".rig-measured-toggle", root);
  measuredToggle.addEventListener("click", () => {
    showMeasured = !showMeasured;
    measuredToggle.setAttribute("aria-pressed", String(showMeasured));
    measuredToggle.querySelector(".label").textContent = showMeasured
      ? "measured: shown"
      : "measured: hidden";
    root.classList.toggle("no-measured", !showMeasured);
    paint();
  });

  function setRunning(next) {
    running = next;
    const btn = $(".rig-play", root);
    btn.querySelector(".label").textContent = running ? "pause" : "play";
    btn.setAttribute("aria-pressed", String(running));
    if (running) {
      last = performance.now();
      requestAnimationFrame(loop);
    }
  }

  /* ---------------------------------------------------------------- paint */

  function paint() {
    const f = sim.frame();
    const c = sim.config;
    const m = showMeasured ? measuredFor(c) : null;

    graph.update(f, c);

    /* Breaker pill and its counters. */
    const pill = $(".rig-pill", root);
    pill.dataset.state = f.state;
    out.state.textContent = STATE_LABEL[f.state];
    out.consecutive.textContent = c.breakerEnabled
      ? `${f.failureCount} (opens at ${f.failMax})`
      : "n/a";
    out.probes.textContent =
      f.state === "half_open" ? `${f.successCount}/2` : c.breakerEnabled ? "0/2" : "n/a";
    out.probeIn.textContent = f.probeIn === null ? "" : `probe in ${f.probeIn.toFixed(0)}s`;
    out.opens.textContent = fmt.int(f.opens);
    out.clock.textContent = `${Math.floor(f.t / 60)}m ${String(Math.floor(f.t % 60)).padStart(2, "0")}s`;

    out.throughput.textContent = fmt.rps(f.throughput);
    out.availability.textContent = fmt.pct(f.availability);
    out.power.textContent = fmt.w(f.power);
    out.jPerSuccess.textContent = fmt.j(f.jPerSuccess);

    out.served.textContent = fmt.int(f.counts.served);
    out.errors.textContent = fmt.int(f.counts.errors);
    out.rejected.textContent = fmt.int(f.counts.rejected);
    out.avgCart.textContent = fmt.items(f.avgCart);

    out.checkoutFail.textContent = fmt.pct(f.checkoutFailPercent);
    out.checkoutP95.textContent = fmt.ms(f.checkoutP95);
    out.cartMean.textContent = fmt.ms(f.cartMean);
    out.aggregateP95.textContent = fmt.ms(f.aggregateP95);

    /* Measured references. Blank rather than zero when the current failure rate
     * is not one of the five the experiment ran. */
    if (ref.throughput) {
      const set = (key, text) => {
        if (ref[key]) ref[key].textContent = m ? text : "";
      };
      set("throughput", m && `${fmt.rps(m.throughput)}`);
      set("availability", m && `${fmt.pct(m.availability)}`);
      set("power", m && `${fmt.w(m.power)} \u00b1 ${m.powerCi.toFixed(2)}`);
      set("jPerSuccess", m && `${fmt.j(m.jPerSuccess)}`);
      set("opens", m && `${fmt.int(m.opens)}`);
      set("rejected", m && `${fmt.int(m.rejected)}`);
      set("checkoutFail", m && (m.checkoutFail === null ? "n/a" : fmt.pct(m.checkoutFail)));
      set("checkoutP95", m && (m.checkoutP95 === null ? "n/a" : fmt.ms(m.checkoutP95)));
    }

    sparks.throughput.draw(f.series.throughput, m && m.throughput);
    sparks.availability.draw(f.series.availability, m && m.availability);
    sparks.power.draw(f.series.power, m && m.power);
    sparks.jPerSuccess.draw(f.series.jPerSuccess, m && m.jPerSuccess);

    const log = $(".rig-log", root);
    log.textContent = f.events.length
      ? f.events
          .slice()
          .reverse()
          .map((e) => `${e.from} -> ${e.to}  (consecutive ${e.failure_count})`)
          .join("\n")
      : "no transitions yet";
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim.step(dt);
    paint();
    requestAnimationFrame(loop);
  }

  /* -------------------------------------------------------- scroll presets */

  const sections = $$("[data-preset]");
  if (sections.length && "IntersectionObserver" in window) {
    const io = new window.IntersectionObserver(
      (entries) => {
        if (!following) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const preset = JSON.parse(visible[0].target.dataset.preset);
        apply(preset, { user: false });
        if (!running && !REDUCED) setRunning(true);
      },
      { rootMargin: "-38% 0px -38% 0px", threshold: [0, 0.4, 1] }
    );
    for (const s of sections) io.observe(s);
  }

  /* Start when the instrument is first seen, not on load: an animation running
   * offscreen is just a battery drain. Reduced motion never autostarts. */
  if (!REDUCED && "IntersectionObserver" in window) {
    const once = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRunning(true);
          once.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    once.observe(root);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running) setRunning(false);
  });

  apply({}, { user: false });
  setSegment("breaker", "off");
  setSegment("failure", 0);
  setSegment("speed", 5);
  paint();

  return { sim, paint, setRunning };
}