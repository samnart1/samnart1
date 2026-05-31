(function () {
  "use strict";

  var root = document.documentElement;
  var NS = "http://www.w3.org/2000/svg";

  // ---- Theme toggle (persists) ----
  var btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }

  // ---- Footer year ----
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ---- Live uptime (honest: counts since page load) ----
  var up = document.getElementById("uptime");
  if (up) {
    var start = Date.now();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    setInterval(function () {
      var s = Math.floor((Date.now() - start) / 1000);
      up.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
    }, 1000);
  }

  // ---- Writing tabs (writing page only) ----
  var tabs = document.querySelector("[data-tabs]");
  if (tabs) {
    var buttons = tabs.querySelectorAll(".tab-btn");
    var hl = tabs.querySelector(".tab-hl");
    var panels = document.querySelectorAll(".tab-panel");
    function moveHL(b) { if (hl) { hl.style.left = b.offsetLeft + "px"; hl.style.width = b.offsetWidth + "px"; } }
    function activate(name) {
      buttons.forEach(function (b) {
        var on = b.getAttribute("data-tab") === name;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        if (on) moveHL(b);
      });
      panels.forEach(function (p) {
        var on = p.getAttribute("data-panel") === name;
        p.classList.toggle("is-active", on);
        if (on) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
      });
    }
    buttons.forEach(function (b) { b.addEventListener("click", function () { activate(b.getAttribute("data-tab")); }); });
    var firstTab = tabs.querySelector(".tab-btn.is-active") || buttons[0];
    if (firstTab) { activate(firstTab.getAttribute("data-tab")); requestAnimationFrame(function () { tabs.classList.add("ready"); }); }
    window.addEventListener("resize", function () { var cur = tabs.querySelector(".tab-btn.is-active"); if (cur) moveHL(cur); });
  }

  // ---- Living system graph (home page only) ----
  var graphSvg = document.getElementById("sysGraph");
  if (graphSvg) buildSystem(graphSvg);

  function buildSystem(svg) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var NODES = [
      { id: "core", kind: "core" },
      { id: "m1", kind: "mesh" },
      { id: "m2", kind: "mesh" },
      { id: "projects", kind: "primary", label: "Projects", href: "/projects/" },
      { id: "research", kind: "primary", label: "Research", href: "/research/" },
      { id: "writing",  kind: "primary", label: "Writing",  href: "/writing/" },
      { id: "about",    kind: "primary", label: "About",    href: "/about/" }
    ];
    var EDGES_D = [["core","projects"],["core","m1"],["core","writing"],["m1","research"],["projects","research"],["research","m2"],["m2","about"],["writing","m2"],["writing","about"]];
    var EDGES_M = [["core","projects"],["projects","research"],["research","writing"],["writing","about"]];
    var POS_D = { core:[0.08,0.52], m1:[0.34,0.30], projects:[0.30,0.66], research:[0.56,0.20], writing:[0.50,0.86], m2:[0.74,0.58], about:[0.95,0.34] };
    var POS_M = { core:[0.5,0.07], projects:[0.30,0.28], research:[0.68,0.46], writing:[0.34,0.66], about:[0.62,0.86], m1:[-1,-1], m2:[-1,-1] };

    var els = {}, edgeEls = [], raf = [], ambient, heartbeat, booted = false, mobile = false;
    var gPkts, gRings;

    function clearTimers() {
      if (ambient) clearInterval(ambient);
      if (heartbeat) clearInterval(heartbeat);
      raf.forEach(function (id) { cancelAnimationFrame(id); });
      raf = [];
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function getPos(id) {
      var n = els[id]; if (!n) return null;
      var m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(n.g.getAttribute("transform"));
      return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
    }

    function build() {
      clearTimers();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      els = {}; edgeEls = [];

      var r = svg.getBoundingClientRect();
      var W = r.width, H = r.height;
      mobile = window.innerWidth <= 860;
      var pos = mobile ? POS_M : POS_D;
      var edges = mobile ? EDGES_M : EDGES_D;
      var padX = mobile ? 42 : 66, padY = mobile ? 38 : 54;
      var X = function (nx) { return padX + nx * (W - 2 * padX); };
      var Y = function (ny) { return padY + ny * (H - 2 * padY); };

      var gEdges = document.createElementNS(NS, "g");
      gPkts = document.createElementNS(NS, "g");
      gRings = document.createElementNS(NS, "g");
      var gNodes = document.createElementNS(NS, "g");
      svg.appendChild(gEdges); svg.appendChild(gPkts); svg.appendChild(gRings); svg.appendChild(gNodes);

      var P = {};
      NODES.forEach(function (n) { var p = pos[n.id]; if (p && p[0] >= 0) P[n.id] = [X(p[0]), Y(p[1])]; });

      edges.forEach(function (e) {
        if (!P[e[0]] || !P[e[1]]) return;
        var a = P[e[0]], b = P[e[1]];
        var ln = document.createElementNS(NS, "line");
        ln.setAttribute("x1", a[0]); ln.setAttribute("y1", a[1]);
        ln.setAttribute("x2", b[0]); ln.setAttribute("y2", b[1]);
        ln.setAttribute("class", "edge");
        var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!booted && !reduce) { ln.style.strokeDasharray = len; ln.style.strokeDashoffset = len; }
        gEdges.appendChild(ln);
        edgeEls.push({ el: ln, a: e[0], b: e[1] });
      });

      NODES.forEach(function (n) {
        if (!P[n.id]) return;
        var c = P[n.id];
        var isLink = n.kind === "primary";
        var g = document.createElementNS(NS, isLink ? "a" : "g");
        if (isLink) { g.setAttribute("href", n.href); g.setAttribute("aria-label", n.label); }
        g.setAttribute("class", "sys-node sys-node--" + n.kind);
        g.setAttribute("transform", "translate(" + c[0] + "," + c[1] + ")");

        var rad = n.kind === "core" ? 24 : n.kind === "mesh" ? 5 : 9;
        var ring = document.createElementNS(NS, "circle");
        ring.setAttribute("r", rad); ring.setAttribute("class", "ring");
        g.appendChild(ring);

        if (n.kind === "core") {
          var mg = document.createElementNS(NS, "g");
          mg.setAttribute("transform", "scale(0.6) translate(-32,-32)");
          var path = document.createElementNS(NS, "path");
          path.setAttribute("d", "M7 32 L21 32 L29 50 L39 14 L47 36 L57 32");
          path.setAttribute("class", "mark");
          var md = document.createElementNS(NS, "circle");
          md.setAttribute("cx", 29); md.setAttribute("cy", 50); md.setAttribute("r", 5); md.setAttribute("class", "mark-dot");
          mg.appendChild(path); mg.appendChild(md); g.appendChild(mg);
        } else if (isLink) {
          var dot = document.createElementNS(NS, "circle");
          dot.setAttribute("r", 2.5); dot.setAttribute("class", "dot");
          g.appendChild(dot);
          var tx = document.createElementNS(NS, "text");
          tx.setAttribute("class", "label"); tx.setAttribute("text-anchor", "middle"); tx.setAttribute("y", rad + 19);
          tx.textContent = n.label; g.appendChild(tx);
        }
        gNodes.appendChild(g);
        els[n.id] = { g: g };

        if (isLink) {
          var on = function () { focus(n.id, true); };
          var off = function () { focus(n.id, false); };
          g.addEventListener("mouseenter", on);
          g.addEventListener("mouseleave", off);
          g.addEventListener("focus", on);
          g.addEventListener("blur", off);
        }
      });

      if (reduce) {
        Object.keys(els).forEach(function (id) { els[id].g.style.opacity = "1"; });
        return;
      }

      if (!booted) {
        Object.keys(els).forEach(function (id) { els[id].g.style.opacity = "0"; });
        boot(); booted = true;
      } else {
        Object.keys(els).forEach(function (id) { els[id].g.style.opacity = "1"; });
      }
      startAmbient();
    }

    function focus(id, state) {
      var node = els[id]; if (!node) return;
      node.g.classList.toggle("hover", state);
      edgeEls.forEach(function (e) {
        if (e.a === id || e.b === id) {
          e.el.classList.toggle("active", state);
          var other = e.a === id ? e.b : e.a;
          if (els[other]) els[other].g.classList.toggle("near", state);
        }
      });
    }

    function sendPacket(aId, bId, opt) {
      opt = opt || {};
      var pa = getPos(aId), pb = getPos(bId);
      if (!pa || !pb) return;
      var pk = document.createElementNS(NS, "circle");
      pk.setAttribute("r", opt.r || 3); pk.setAttribute("class", "pkt");
      pk.setAttribute("cx", pa[0]); pk.setAttribute("cy", pa[1]);
      if (opt.dim) pk.style.opacity = 0.6;
      gPkts.appendChild(pk);
      var dur = opt.dur || 1400, t0 = performance.now();
      function step(now) {
        var t = Math.min(1, (now - t0) / dur);
        var e = t * t * (3 - 2 * t);
        pk.setAttribute("cx", lerp(pa[0], pb[0], e));
        pk.setAttribute("cy", lerp(pa[1], pb[1], e));
        if (t < 1) { raf.push(requestAnimationFrame(step)); }
        else { if (pk.parentNode) pk.parentNode.removeChild(pk); if (opt.onArrive) opt.onArrive(); }
      }
      raf.push(requestAnimationFrame(step));
    }

    function flash(id) {
      var node = els[id]; if (!node) return;
      node.g.classList.add("lit");
      setTimeout(function () { node.g.classList.remove("lit"); }, 720);
    }

    function pulseRing(id) {
      var p = getPos(id); if (!p) return;
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", 24); c.setAttribute("class", "hb");
      gRings.appendChild(c);
      var t0 = performance.now(), dur = 1600;
      function step(now) {
        var t = Math.min(1, (now - t0) / dur);
        c.setAttribute("r", 24 + t * 62);
        c.style.opacity = (1 - t) * 0.5;
        if (t < 1) { raf.push(requestAnimationFrame(step)); }
        else if (c.parentNode) c.parentNode.removeChild(c);
      }
      raf.push(requestAnimationFrame(step));
    }

    function bfsOrder() {
      var edges = mobile ? EDGES_M : EDGES_D, adj = {};
      edges.forEach(function (e) {
        if (!els[e[0]] || !els[e[1]]) return;
        (adj[e[0]] = adj[e[0]] || []).push(e[1]);
        (adj[e[1]] = adj[e[1]] || []).push(e[0]);
      });
      var seen = { core: true }, q = [["core", 0]], out = [];
      while (q.length) {
        var cur = q.shift();
        (adj[cur[0]] || []).forEach(function (nb) {
          if (!seen[nb]) { seen[nb] = true; out.push({ from: cur[0], to: nb, depth: cur[1] + 1 }); q.push([nb, cur[1] + 1]); }
        });
      }
      return out;
    }

    function boot() {
      var step = 175;
      if (els.core) { els.core.g.style.transition = "opacity .5s ease"; els.core.g.style.opacity = "1"; flash("core"); }
      requestAnimationFrame(function () {
        edgeEls.forEach(function (e) { e.el.style.transition = "stroke-dashoffset .85s ease"; e.el.style.strokeDashoffset = "0"; });
      });
      bfsOrder().forEach(function (o) {
        setTimeout(function () {
          if (els[o.to]) { els[o.to].g.style.transition = "opacity .5s ease"; els[o.to].g.style.opacity = "1"; }
          sendPacket(o.from, o.to, { onArrive: function () { flash(o.to); } });
        }, o.depth * step + 130);
      });
    }

    function startAmbient() {
      var edges = (mobile ? EDGES_M : EDGES_D).filter(function (e) { return els[e[0]] && els[e[1]]; });
      ambient = setInterval(function () {
        if (document.hidden || !edges.length) return;
        var e = edges[Math.floor(Math.random() * edges.length)];
        var rev = Math.random() < 0.5;
        sendPacket(rev ? e[1] : e[0], rev ? e[0] : e[1], { dim: true, dur: 1900 });
      }, 2400);
      heartbeat = setInterval(function () { if (!document.hidden) pulseRing("core"); }, 5200);
    }

    build();
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(build, 220);
    });
  }

  // ---- Scroll reveal ----
  var items = document.querySelectorAll("[data-reveal]");
  var reduceMo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMo || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  items.forEach(function (el) { io.observe(el); });
})();