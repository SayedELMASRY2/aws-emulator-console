"use strict";
// Boot: sidebar, emulator status, routing.

function renderNav(filter = "") {
  const nav = clear(document.getElementById("nav"));
  const f = filter.toLowerCase();
  for (const g of Nav) {
    const items = g.items.filter(i => !f || (i.label + " " + (i.keywords || "")).toLowerCase().includes(f));
    if (!items.length) continue;
    nav.appendChild(h("div", { class: "nav-group" }, g.label ? h("div", { class: "nav-label" }, g.label) : null,
      items.map(i => h("a", { href: "#" + i.path, onclick: () => document.body.classList.remove("nav-open") }, i.label))));
  }
  renderRouteNavState();
}
function renderRouteNavState() {
  const { path } = parseHash();
  document.querySelectorAll(".nav a").forEach(a => {
    const href = a.getAttribute("href").slice(1);
    a.classList.toggle("on", href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  });
}

let lastUp = null;
async function pollHealth() {
  const el = document.getElementById("status");
  const info = document.getElementById("topinfo");
  try {
    const r = await API.health();
    el.className = "status " + (r.up ? "up" : "down");
    el.lastChild.textContent = r.up ? "Emulator running" : "Emulator not running";
    el.title = r.message || r.endpoint;
    info.textContent = r.up ? `${r.endpoint} · ${r.region} · account ${r.account}` : "Start it in a terminal:  aws-emulator";
    if (lastUp === false && r.up) { toast("Emulator is back. Its state starts empty after a restart."); renderRoute(); }
    lastUp = r.up;
  } catch (e) {
    el.className = "status down";
    el.lastChild.textContent = "Console server offline";
    info.textContent = "";
    lastUp = false;
  }
}

window.addEventListener("hashchange", renderRoute);
document.getElementById("navsearch").addEventListener("input", e => renderNav(e.target.value));
document.getElementById("menu").addEventListener("click", () => document.body.classList.toggle("nav-open"));
renderNav();
pollHealth();
setInterval(pollHealth, 5000);
renderRoute();
