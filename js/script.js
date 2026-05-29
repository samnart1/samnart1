(function () {
  "use strict";

  var root = document.documentElement;

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

  // ---- Writing tabs (only runs on the writing page) ----
  var tabs = document.querySelector("[data-tabs]");
  if (tabs) {
    var buttons = tabs.querySelectorAll(".tab-btn");
    var hl = tabs.querySelector(".tab-hl");
    var panels = document.querySelectorAll(".tab-panel");

    function moveHL(b) {
      if (hl) { hl.style.left = b.offsetLeft + "px"; hl.style.width = b.offsetWidth + "px"; }
    }
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
        if (on) { p.removeAttribute("hidden"); } else { p.setAttribute("hidden", ""); }
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () { activate(b.getAttribute("data-tab")); });
    });

    var first = tabs.querySelector(".tab-btn.is-active") || buttons[0];
    if (first) {
      activate(first.getAttribute("data-tab"));
      requestAnimationFrame(function () { tabs.classList.add("ready"); });
    }
    window.addEventListener("resize", function () {
      var cur = tabs.querySelector(".tab-btn.is-active");
      if (cur) moveHL(cur);
    });
  }

  // ---- Scroll reveal ----
  var items = document.querySelectorAll("[data-reveal]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  items.forEach(function (el) { io.observe(el); });
})();