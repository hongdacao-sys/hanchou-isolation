/* 翰畴隔震 — site theme: 自动 / 浅色 / 深色.
   Storage key: hanchou-theme. Resolved scheme is always written to
   html[data-theme="light"|"dark"] so CSS and the 3D viewer can follow it. */
(function (global) {
  "use strict";

  var KEY = "hanchou-theme";
  var EVENT = "hanchou-theme-change";
  var LIGHT_COLOR = "#f3f3ef";
  var DARK_COLOR = "#0b0b0c";

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark" || v === "auto") return v;
    } catch (err) {}
    return "auto";
  }

  function systemIsLight() {
    return !!(global.matchMedia && global.matchMedia("(prefers-color-scheme: light)").matches);
  }

  function resolve(pref) {
    pref = pref || stored();
    if (pref === "light") return "light";
    if (pref === "dark") return "dark";
    return systemIsLight() ? "light" : "dark";
  }

  function setThemeColor(theme) {
    var meta =
      document.querySelector('meta[name="theme-color"][data-hc-theme-color]') ||
      document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? LIGHT_COLOR : DARK_COLOR);
  }

  function syncControls(pref) {
    pref = pref || stored();
    var groups = document.querySelectorAll(".theme-switch");
    for (var i = 0; i < groups.length; i++) {
      var buttons = groups[i].querySelectorAll("[data-theme-value]");
      for (var j = 0; j < buttons.length; j++) {
        var on = buttons[j].getAttribute("data-theme-value") === pref;
        buttons[j].setAttribute("aria-checked", on ? "true" : "false");
      }
    }
  }

  function apply(pref, opts) {
    pref = pref || stored();
    if (pref !== "light" && pref !== "dark") pref = "auto";
    var theme = resolve(pref);
    var root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    setThemeColor(theme);
    syncControls(pref);
    if (!opts || !opts.silent) {
      var ev;
      try {
        ev = new CustomEvent(EVENT, { detail: { preference: pref, theme: theme } });
      } catch (err) {
        ev = document.createEvent("CustomEvent");
        ev.initCustomEvent(EVENT, false, false, { preference: pref, theme: theme });
      }
      document.dispatchEvent(ev);
    }
    return theme;
  }

  function setPreference(pref) {
    if (pref !== "light" && pref !== "dark") pref = "auto";
    try {
      localStorage.setItem(KEY, pref);
    } catch (err) {}
    return apply(pref);
  }

  function bindGroup(group) {
    if (group.getAttribute("data-theme-bound") === "true") return;
    group.setAttribute("data-theme-bound", "true");
    group.addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest("[data-theme-value]") : ev.target;
      if (!btn || !group.contains(btn) || !btn.getAttribute) return;
      var value = btn.getAttribute("data-theme-value");
      if (!value) return;
      setPreference(value);
    });
    group.addEventListener("keydown", function (ev) {
      var buttons = Array.prototype.slice.call(group.querySelectorAll("[data-theme-value]"));
      var i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      var next = i;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = (i + 1) % buttons.length;
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = (i - 1 + buttons.length) % buttons.length;
      else if (ev.key === "Home") next = 0;
      else if (ev.key === "End") next = buttons.length - 1;
      else if (ev.key === " " || ev.key === "Enter") {
        ev.preventDefault();
        setPreference(buttons[i].getAttribute("data-theme-value"));
        return;
      } else return;
      ev.preventDefault();
      buttons[next].focus();
      setPreference(buttons[next].getAttribute("data-theme-value"));
    });
  }

  function bind() {
    var groups = document.querySelectorAll(".theme-switch");
    for (var i = 0; i < groups.length; i++) bindGroup(groups[i]);
    syncControls(stored());
  }

  var mql = global.matchMedia && global.matchMedia("(prefers-color-scheme: light)");
  function onSystemChange() {
    if (stored() === "auto") apply("auto");
  }
  if (mql) {
    if (mql.addEventListener) mql.addEventListener("change", onSystemChange);
    else if (mql.addListener) mql.addListener(onSystemChange);
  }

  global.addEventListener("storage", function (ev) {
    if (ev.key === KEY) apply(stored());
  });

  apply(stored(), { silent: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  global.HanchouTheme = {
    key: KEY,
    event: EVENT,
    stored: stored,
    resolve: resolve,
    apply: apply,
    setPreference: setPreference,
  };
})(window);
