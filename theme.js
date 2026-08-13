// Explicit two-state theme toggle. On load, an inline <head> script has already
// set data-theme to the stored choice or the OS preference, so the DOM always
// has a concrete "light" or "dark" and the button label matches it.
(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".theme");
  if (!btn) return;

  var label = btn.querySelector(".label");

  function paint() {
    var mode = root.dataset.theme;              // always "light" or "dark"
    if (label) label.textContent = mode === "dark" ? "light" : "dark";
    btn.setAttribute("aria-label", "Switch to " + (mode === "dark" ? "light" : "dark") + " mode");
    btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
  }

  paint();

  btn.addEventListener("click", function () {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.theme = next; } catch (e) {}
    paint();
  });
})();