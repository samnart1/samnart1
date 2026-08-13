/*
 * graph.js
 *
 * The service graph, drawn once and then updated per frame.
 *
 * Only the guarded path is animated: loadgenerator, frontend, checkout,
 * payment. The other services are drawn but dimmed, because they are the reason
 * this is a distributed system and not a two tier app, and because the frontend
 * holds a breaker for each of them that never trips in this experiment. Faults
 * go into payment only.
 *
 * A packet is one request. Green served, red a payment 500, amber a rejection
 * that never left the frontend. Amber dots stopping short of checkout is the
 * whole picture of what an open circuit does.
 */

const NODES = {
  loadgen: { x: 52, y: 42, w: 92, label: "loadgenerator", dim: false },
  frontend: { x: 206, y: 42, w: 84, label: "frontend", dim: false },
  checkout: { x: 358, y: 42, w: 80, label: "checkout", dim: false },
  payment: { x: 520, y: 42, w: 78, label: "payment", dim: false },

  productcatalog: { x: 96, y: 142, w: 108, label: "productcatalog", dim: true },
  cart: { x: 196, y: 142, w: 52, label: "cart", dim: true },
  currency: { x: 280, y: 142, w: 74, label: "currency", dim: true },
  shipping: { x: 366, y: 142, w: 72, label: "shipping", dim: true },
  recommendation: { x: 476, y: 142, w: 116, label: "recommendation", dim: true },
  ad: { x: 566, y: 142, w: 38, label: "ad", dim: true },
};

const DIM_EDGES = ["productcatalog", "cart", "currency", "shipping", "recommendation", "ad"];
const NODE_H = 26;
const SVG_NS = "http://www.w3.org/2000/svg";

const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const pt = (id) => ({ x: NODES[id].x, y: NODES[id].y });

/** Route each request kind takes. Packets travel out and back along it. */
function routeFor(req) {
  if (req.kind === "home") return ["loadgen", "frontend", "productcatalog"];
  if (req.kind === "cart") return ["loadgen", "frontend", "cart"];
  if (req.reach === "frontend") return ["loadgen", "frontend"]; // rejected
  return ["loadgen", "frontend", "checkout", "payment"];
}

/** Point at a fraction along a polyline, by arc length. */
function alongRoute(route, s) {
  const pts = route.map(pt);
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(d);
    total += d;
  }
  let want = Math.max(0, Math.min(1, s)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? want / segs[i] : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      };
    }
    want -= segs[i];
  }
  return pts[pts.length - 1];
}

export class Graph {
  /** @param {SVGElement} svg  @param {boolean} reducedMotion */
  constructor(svg, reducedMotion = false) {
    this.svg = svg;
    this.reduced = reducedMotion;
    this.dots = new Map(); // request id -> circle
    this._lastPacketPaint = -1;
    this._build();
  }

  _build() {
    const s = this.svg;
    s.setAttribute("viewBox", "0 0 620 186");
    s.innerHTML = "";

    const gEdges = el("g", { class: "g-edges" });
    const gDim = el("g", { class: "g-dim" });
    const gNodes = el("g", { class: "g-nodes" });
    this.gPackets = el("g", { class: "g-packets" });
    this.gRejects = el("g", { class: "g-rejects" });
    s.append(gDim, gEdges, this.gPackets, this.gRejects, gNodes);

    /* Dim fan-out from the frontend. Drawn first so everything sits above it. */
    for (const id of DIM_EDGES) {
      const a = pt("frontend");
      const b = pt(id);
      gDim.appendChild(
        el("path", {
          class: "edge dim",
          d: `M ${a.x} ${a.y + NODE_H / 2} C ${a.x} ${a.y + 54}, ${b.x} ${b.y - 54}, ${b.x} ${b.y - NODE_H / 2}`,
        })
      );
    }

    const edge = (from, to, cls) => {
      const a = pt(from);
      const b = pt(to);
      const p = el("path", { class: "edge " + cls, d: `M ${a.x + 6} ${a.y} L ${b.x - 6} ${b.y}` });
      gEdges.appendChild(p);
      return p;
    };

    edge("loadgen", "frontend", "main");
    /* The guarded edge. Its dash pattern is the breaker state, which is the one
     * piece of the drawing that carries information rather than structure. */
    this.guarded = edge("frontend", "checkout", "main guarded");
    edge("checkout", "payment", "main");

    /* Marker on the guarded edge: when the circuit opens, this is the gap. */
    const g = pt("frontend");
    const c = pt("checkout");
    this.breakMark = el("g", { class: "break-mark" });
    const mx = (g.x + c.x) / 2;
    this.breakMark.append(
      el("line", { x1: mx - 5, y1: g.y - 9, x2: mx - 5, y2: g.y + 9 }),
      el("line", { x1: mx + 5, y1: g.y - 9, x2: mx + 5, y2: g.y + 9 })
    );
    gEdges.appendChild(this.breakMark);

    for (const [id, n] of Object.entries(NODES)) {
      const grp = el("g", { class: "node" + (n.dim ? " dim" : ""), "data-node": id });
      grp.append(
        el("rect", {
          x: n.x - n.w / 2,
          y: n.y - NODE_H / 2,
          width: n.w,
          height: NODE_H,
          rx: 3,
        })
      );
      const t = el("text", { x: n.x, y: n.y, "text-anchor": "middle", "dominant-baseline": "central" });
      t.textContent = n.label;
      grp.appendChild(t);
      gNodes.appendChild(grp);
    }

    this.paymentNode = s.querySelector('[data-node="payment"]');
    this.checkoutNode = s.querySelector('[data-node="checkout"]');
    this.cartNode = s.querySelector('[data-node="cart"]');

    /* Fault label under payment, shown only when injection is on. */
    this.faultLabel = el("text", {
      class: "fault-label",
      x: NODES.payment.x,
      y: NODES.payment.y + 28,
      "text-anchor": "middle",
    });
    gNodes.appendChild(this.faultLabel);
  }

  /** @param {object} frame from sim.frame()  @param {object} config sim config */
  update(frame, config) {
    this.svg.dataset.state = frame.state;

    this.faultLabel.textContent = config.failureRate > 0 ? `HTTP 500 at ${config.failureRate}%` : "";
    this.paymentNode.classList.toggle("faulted", config.failureRate > 0);
    /* Payment goes quiet when nothing is reaching it. */
    this.paymentNode.classList.toggle("quiet", frame.state === "open");
    this.checkoutNode.classList.toggle("quiet", frame.state === "open");
    this.cartNode.classList.toggle("loaded", frame.avgCart >= 4);

    /* Under reduced motion, move packets in discrete hops instead of tweening. */
    if (this.reduced) {
      if (frame.t - this._lastPacketPaint < 0.5) return;
      this._lastPacketPaint = frame.t;
    }

    const seen = new Set();
    for (const req of frame.packets) {
      seen.add(req.id);
      let dot = this.dots.get(req.id);
      if (!dot) {
        dot = el("circle", { r: 3.1, class: "packet " + req.outcome });
        this.gPackets.appendChild(dot);
        this.dots.set(req.id, dot);
      }
      const route = routeFor(req);
      /* Out on the first half of the request, back on the second. */
      const s = req.progress < 0.5 ? req.progress * 2 : (1 - req.progress) * 2;
      const p = alongRoute(route, this.reduced ? Math.round(s * 4) / 4 : s);
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
    }

    for (const [id, dot] of this.dots) {
      if (!seen.has(id)) {
        dot.remove();
        this.dots.delete(id);
      }
    }

    this._drawPulses(frame.pulses || []);
  }

  /**
   * Finished checkouts, parked above the node they got as far as and fading
   * out. Amber above the frontend means the circuit is open and requests are
   * stopping there. Red above payment means they are getting through and
   * failing. Green means the shop is taking money.
   */
  _drawPulses(pulses) {
    const g = this.gRejects;
    while (g.childNodes.length > pulses.length) g.lastChild.remove();
    while (g.childNodes.length < pulses.length) {
      g.appendChild(el("circle", { r: 3.1, class: "packet parked" }));
    }
    pulses.forEach((p, i) => {
      const dot = g.childNodes[i];
      dot.setAttribute("class", "packet parked " + p.outcome);
      const base = pt(p.outcome === "rejected" ? "frontend" : "payment");
      /* Stack in short rows and drift up as they age, so a burst reads as one. */
      dot.setAttribute("cx", (base.x - 15 + (i % 6) * 6).toFixed(1));
      dot.setAttribute("cy", (base.y - 15 - Math.floor((i % 18) / 6) * 7 - p.age * 6).toFixed(1));
      dot.setAttribute("opacity", Math.max(0, 1 - p.age).toFixed(2));
    });
  }
}