// Core helpers: API client, DOM builder, tables, forms, modals, router.
"use strict";

// ---------------- API ----------------
class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

const API = {
  async req(method, url, body, headers = {}) {
    const opts = { method, headers: { "X-Emu-Console": "1", ...headers } };
    if (body !== undefined) {
      if (body instanceof Blob || body instanceof ArrayBuffer) opts.body = body;
      else { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
    }
    let r;
    try { r = await fetch(url, opts); }
    catch (e) { throw new ApiError("ConsoleOffline", "Can't reach the console server. Is server.py running?", 0); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = data.error || {};
      throw new ApiError(e.code || "Error", e.message || r.statusText, r.status);
    }
    return data;
  },
  async call(service, operation, params = {}) {
    const d = await this.req("POST", "/api/call", { service, operation, params });
    return d.result;
  },
  // Follow NextToken-style pagination for list calls (bounded).
  async all(service, operation, params, itemsKey, tokenIn = "NextToken", tokenOut = tokenIn, max = 20) {
    let out = [], token, i = 0;
    do {
      const p = { ...params };
      if (token) p[tokenIn] = token;
      const r = await this.call(service, operation, p);
      out = out.concat(get(r, itemsKey) || []);
      token = r[tokenOut];
    } while (token && ++i < max);
    return out;
  },
  health() { return this.req("GET", "/api/health"); },
};

// ---------------- utils ----------------
function get(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function fmtBytes(n) {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(1) : n) + " " + u[i];
}
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(typeof s === "number" && s < 1e12 ? s * 1000 : s);
  return isNaN(d) ? String(s) : d.toLocaleString();
}
function arnName(arn) { return arn ? String(arn).split(/[/:]/).pop() : ""; }
function tagsToObj(tags) { const o = {}; (tags || []).forEach(t => (o[t.Key ?? t.key] = t.Value ?? t.value)); return o; }
function nameTag(tags) { return tagsToObj(tags).Name || ""; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uid() { return Math.random().toString(36).slice(2, 8); }
function copyText(t) { navigator.clipboard?.writeText(t).then(() => toast("Copied"), () => toast("Copy failed", "error")); }

// ---------------- DOM ----------------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

function badge(text, kind) {
  const t = String(text ?? "");
  if (!kind) {
    const s = t.toLowerCase();
    if (/(running|active|available|succeeded|enabled|in_service|inservice|complete|ready|healthy|ok)$/.test(s) || s === "create_complete" || s === "update_complete") kind = "ok";
    else if (/(fail|error|deleted|terminated|stopped|disabled|rollback)/.test(s)) kind = "bad";
    else if (/(pending|creating|starting|stopping|updating|deleting|modifying|in_progress|running_|provisioning|queued|backing)/.test(s)) kind = "warn";
    else kind = "neutral";
  }
  return h("span", { class: "badge " + kind }, t || "—");
}
function icon(name) { return h("span", { class: "ico", "aria-hidden": "true" }, ICONS[name] || "•"); }
const ICONS = { refresh: "↻", plus: "+", trash: "✕", play: "▶", stop: "■", up: "↑", down: "↓", folder: "📁", file: "📄", back: "←", copy: "⧉", eye: "◉" };

function button(label, onclick, opts = {}) {
  return h("button", { class: "btn " + (opts.kind || ""), onclick, disabled: opts.disabled, title: opts.title, type: opts.type || "button" },
    opts.icon ? icon(opts.icon) : null, label);
}
function codeBlock(text, opts = {}) {
  const pre = h("pre", { class: "code" + (opts.wrap ? " wrap" : "") }, text);
  return h("div", { class: "codewrap" }, h("button", { class: "btn tiny copy", onclick: () => copyText(text), title: "Copy" }, "Copy"), pre);
}
function jsonView(obj) { return codeBlock(JSON.stringify(obj, null, 2)); }
function kv(pairs) {
  return h("dl", { class: "kv" }, pairs.filter(p => p).map(([k, v]) =>
    [h("dt", k), h("dd", v instanceof Node ? v : (v === undefined || v === null || v === "" ? "—" : String(v)))]));
}
function emptyState(text, action) { return h("div", { class: "empty" }, h("p", text), action || null); }
function errorBox(e) {
  return h("div", { class: "errbox" }, h("strong", e.code || "Error"), h("div", e.message || String(e)),
    e.status === 501 ? h("div", { class: "muted" }, "The emulator doesn't implement this operation yet.") : null);
}

// ---------------- toast ----------------
function toast(msg, kind = "ok", ms = 3500) {
  const host = document.getElementById("toasts");
  const t = h("div", { class: "toast " + kind, role: "status" }, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
}
function toastErr(e) { toast((e.code ? e.code + ": " : "") + (e.message || e), "error", 7000); }

// ---------------- modal ----------------
function modal({ title, body, actions = [], wide }) {
  const back = h("div", { class: "modal-back" });
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  const box = h("div", { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true" },
    h("div", { class: "modal-head" }, h("h3", title), h("button", { class: "btn ghost tiny", onclick: close, "aria-label": "Close" }, "✕")),
    h("div", { class: "modal-body" }, body),
    actions.length ? h("div", { class: "modal-foot" }, actions.map(a => button(a.label, () => a.run(close), { kind: a.kind }))) : null);
  back.appendChild(box);
  back.addEventListener("mousedown", e => { if (e.target === back) close(); });
  document.body.appendChild(back);
  return { close, box };
}
function showJson(title, obj) { modal({ title, body: jsonView(obj), wide: true }); }

function confirmDanger(text, { typed } = {}) {
  return new Promise(resolve => {
    const input = typed ? h("input", { class: "input", placeholder: typed }) : null;
    const m = modal({
      title: "Are you sure?",
      body: h("div", h("p", text), typed ? h("label", { class: "field" }, h("span", `Type "${typed}" to confirm`), input) : null),
      actions: [
        { label: "Cancel", run: c => { c(); resolve(false); } },
        { label: "Delete", kind: "danger", run: c => { if (typed && input.value !== typed) { input.focus(); return; } c(); resolve(true); } },
      ],
    });
    (input || m.box.querySelector(".btn.danger")).focus();
  });
}

// ---------------- forms ----------------
// field: {name,label,type,required,default,placeholder,help,options,rows,showIf}
async function formModal({ title, fields, submitLabel = "Create", onSubmit, wide }) {
  const inputs = {};
  const err = h("div");
  const rows = [];
  for (const f of fields) {
    const id = "f_" + uid();
    let input;
    const t = f.type || "text";
    if (t === "select" || t === "multiselect") {
      input = h("select", { class: "input", id, multiple: t === "multiselect" });
      let opts = typeof f.options === "function" ? null : f.options;
      const fill = list => {
        clear(input);
        if (!f.required && t === "select") input.appendChild(h("option", { value: "" }, f.placeholder || "—"));
        list.forEach(o => {
          const v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o;
          const opt = h("option", { value: v }, l);
          if (Array.isArray(f.default) ? f.default.includes(v) : f.default === v) opt.selected = true;
          input.appendChild(opt);
        });
      };
      if (opts) fill(opts);
      else {
        input.appendChild(h("option", "Loading…"));
        f.options().then(fill).catch(e => { clear(input); input.appendChild(h("option", { value: "" }, "Error: " + e.message)); });
      }
      if (t === "multiselect") input.size = f.size || 4;
    } else if (t === "textarea" || t === "json" || t === "code") {
      input = h("textarea", { class: "input mono", id, rows: f.rows || (t === "code" ? 12 : 6), placeholder: f.placeholder, spellcheck: "false" });
      input.value = f.default != null ? (typeof f.default === "string" ? f.default : JSON.stringify(f.default, null, 2)) : "";
      if (t === "code") input.addEventListener("keydown", e => {
        if (e.key === "Tab") { e.preventDefault(); const s = input.selectionStart; input.setRangeText("    ", s, input.selectionEnd, "end"); }
      });
    } else if (t === "checkbox") {
      input = h("input", { type: "checkbox", id, checked: !!f.default });
    } else if (t === "file") {
      input = h("input", { type: "file", id, class: "input", multiple: f.multiple });
    } else {
      input = h("input", { class: "input", id, type: t, placeholder: f.placeholder, value: f.default ?? "", min: f.min, max: f.max });
    }
    inputs[f.name] = input;
    const row = t === "checkbox"
      ? h("label", { class: "field check", for: id }, input, h("span", f.label), f.help ? h("small", f.help) : null)
      : h("div", { class: "field" }, h("label", { for: id }, f.label, f.required ? h("b", { class: "req" }, " *") : null), input, f.help ? h("small", f.help) : null);
    row._f = f;
    rows.push(row);
  }
  const read = () => {
    const v = {};
    for (const f of fields) {
      const i = inputs[f.name], t = f.type || "text";
      if (t === "checkbox") v[f.name] = i.checked;
      else if (t === "multiselect") v[f.name] = [...i.selectedOptions].map(o => o.value).filter(Boolean);
      else if (t === "number") v[f.name] = i.value === "" ? undefined : Number(i.value);
      else if (t === "file") v[f.name] = [...i.files];
      else if (t === "json") {
        const s = i.value.trim();
        if (!s) v[f.name] = undefined;
        else try { v[f.name] = JSON.parse(s); } catch (e) { throw new Error(`${f.label}: invalid JSON (${e.message})`); }
      } else v[f.name] = i.value.trim();
    }
    return v;
  };
  const updateVis = () => {
    let v; try { v = read(); } catch { return; }
    rows.forEach(r => { if (r._f.showIf) r.style.display = r._f.showIf(v) ? "" : "none"; });
  };
  const form = h("form", { class: "form", onsubmit: e => { e.preventDefault(); submit(); }, oninput: updateVis, onchange: updateVis }, rows, err,
    h("button", { type: "submit", hidden: true }));
  let busy = false;
  const m = modal({
    title, body: form, wide,
    actions: [{ label: "Cancel", run: c => c() }, { label: submitLabel, kind: "primary", run: () => submit() }],
  });
  const submitBtn = m.box.querySelector(".btn.primary");
  async function submit() {
    if (busy) return;
    clear(err);
    let v;
    try {
      v = read();
      for (const f of fields) {
        const visible = !f.showIf || f.showIf(v);
        const empty = v[f.name] === undefined || v[f.name] === "" || (Array.isArray(v[f.name]) && !v[f.name].length);
        if (visible && f.required && empty) throw new Error(`${f.label} is required`);
      }
    } catch (e) { err.appendChild(errorBox({ code: "Invalid input", message: e.message })); return; }
    busy = true; submitBtn.disabled = true; submitBtn.textContent = "Working…";
    try { await onSubmit(v); m.close(); }
    catch (e) { err.appendChild(errorBox(e)); }
    finally { busy = false; submitBtn.disabled = false; submitBtn.textContent = submitLabel; }
  }
  updateVis();
  setTimeout(() => form.querySelector("input:not([type=checkbox]),textarea,select")?.focus(), 30);
  return m;
}

// ---------------- data table ----------------
// columns: [{key,label,render(row),class}]
function dataTable({ columns, rows, rowKey, selectable, onSelect, onRowClick, empty = "Nothing here yet." }) {
  const selected = new Set();
  const wrap = h("div", { class: "tablewrap" });
  if (!rows.length) { wrap.appendChild(emptyState(empty)); return wrap; }
  const keyOf = r => (typeof rowKey === "function" ? rowKey(r) : r[rowKey]);
  const all = selectable ? h("input", { type: "checkbox", "aria-label": "Select all" }) : null;
  const boxes = [];
  const emit = () => onSelect && onSelect(rows.filter(r => selected.has(keyOf(r))));
  if (all) all.addEventListener("change", () => {
    boxes.forEach(([b, r]) => { b.checked = all.checked; all.checked ? selected.add(keyOf(r)) : selected.delete(keyOf(r)); });
    emit();
  });
  const table = h("table", { class: "table" },
    h("thead", h("tr", selectable ? h("th", { class: "sel" }, all) : null, columns.map(c => h("th", { class: c.class }, c.label)))),
    h("tbody", rows.map(r => {
      const tr = h("tr", { class: onRowClick ? "clickable" : null });
      if (selectable) {
        const b = h("input", { type: "checkbox", "aria-label": "Select row" });
        b.addEventListener("click", e => e.stopPropagation());
        b.addEventListener("change", () => { b.checked ? selected.add(keyOf(r)) : selected.delete(keyOf(r)); tr.classList.toggle("on", b.checked); emit(); });
        boxes.push([b, r]);
        tr.appendChild(h("td", { class: "sel" }, b));
      }
      columns.forEach(c => {
        const v = c.render ? c.render(r) : get(r, c.key);
        tr.appendChild(h("td", { class: c.class }, v instanceof Node || Array.isArray(v) ? v : (v === undefined || v === null || v === "" ? "—" : String(v))));
      });
      if (onRowClick) tr.addEventListener("click", e => { if (!e.target.closest("a,button,input")) onRowClick(r); });
      return tr;
    })));
  wrap.appendChild(table);
  return wrap;
}

// ---------------- resource panel ----------------
// A titled panel listing resources with refresh / create / bulk actions.
// cfg: {title, description, load:()=>rows, columns, rowKey, create:{label, open()}, actions:[{label,kind,multi,run(rows)}], onRowClick, empty, poll}
function resourcePanel(cfg) {
  const el = h("section", { class: "panel" });
  let selected = [];
  const count = h("span", { class: "count" });
  const actionBtns = (cfg.actions || []).map(a => {
    const b = button(a.label, async () => {
      if (!selected.length) return;
      if (a.open) { a.open(selected, refresh); return; } // opens its own dialog
      try {
        if (a.confirm) {
          const names = selected.map(r => (typeof cfg.rowKey === "function" ? cfg.rowKey(r) : r[cfg.rowKey]));
          if (!(await confirmDanger(`${a.confirm} ${names.length > 3 ? names.length + " items" : names.join(", ")}?`))) return;
        }
        b.disabled = true;
        await a.run(selected);
        toast(a.done || "Done");
      } catch (e) { toastErr(e); }
      finally { b.disabled = false; refresh(); }
    }, { kind: a.kind, icon: a.icon });
    b._a = a;
    return b;
  });
  const syncButtons = () => actionBtns.forEach(b => { b.disabled = !selected.length || (b._a.multi === false && selected.length !== 1); });
  const body = h("div", { class: "panel-body" });
  const head = h("div", { class: "panel-head" },
    h("div", h("h2", cfg.title, " ", count), cfg.description ? h("p", { class: "muted" }, cfg.description) : null),
    h("div", { class: "toolbar" },
      actionBtns,
      button("", () => refresh(), { icon: "refresh", title: "Refresh", kind: "ghost" }),
      cfg.create ? button(cfg.create.label || "Create", async () => { await cfg.create.open(); }, { kind: "primary", icon: "plus" }) : null));
  el.append(head, body);
  let timer;
  async function refresh() {
    selected = []; syncButtons();
    if (!body.firstChild) body.appendChild(h("div", { class: "loading" }, "Loading…"));
    try {
      const rows = await cfg.load();
      count.textContent = `(${rows.length})`;
      clear(body).appendChild(dataTable({
        columns: cfg.columns, rows, rowKey: cfg.rowKey, selectable: !!actionBtns.length,
        onSelect: s => { selected = s; syncButtons(); }, onRowClick: cfg.onRowClick, empty: cfg.empty,
      }));
      if (cfg.poll && rows.some(cfg.poll) && el.isConnected) { clearTimeout(timer); timer = setTimeout(refresh, 2500); }
    } catch (e) { count.textContent = ""; clear(body).appendChild(errorBox(e)); }
  }
  el.refresh = refresh;
  if (cfg.create) { const orig = cfg.create.open; cfg.create.open = async () => { await orig(); }; }
  syncButtons();
  refresh();
  return el;
}

// Tabs: [{label, render()}]
function tabs(list, initial = 0) {
  const bar = h("div", { class: "tabs", role: "tablist" });
  const body = h("div", { class: "tabbody" });
  const btns = list.map((t, i) => h("button", { class: "tab", role: "tab", onclick: () => show(i) }, t.label));
  bar.append(...btns);
  function show(i) {
    btns.forEach((b, j) => b.classList.toggle("on", i === j));
    clear(body).appendChild(list[i].render());
  }
  show(initial);
  return h("div", bar, body);
}

function pageHeader(title, sub, ...extra) {
  return h("header", { class: "page-head" }, h("div", h("h1", title), sub ? h("p", { class: "muted" }, sub) : null), h("div", { class: "toolbar" }, extra));
}
function crumbs(...parts) {
  return h("nav", { class: "crumbs" }, parts.map((p, i) => [i ? h("span", { class: "sep" }, "/") : null,
    Array.isArray(p) ? h("a", { href: p[1] }, p[0]) : h("span", p)]));
}

// ---------------- shared pickers ----------------
const Pick = {
  async subnets() {
    const r = await API.call("ec2", "DescribeSubnets");
    return r.Subnets.map(s => ({ value: s.SubnetId, label: `${s.SubnetId} · ${s.AvailabilityZone} · ${s.CidrBlock}${nameTag(s.Tags) ? " · " + nameTag(s.Tags) : ""}` }));
  },
  async securityGroups() {
    const r = await API.call("ec2", "DescribeSecurityGroups");
    return r.SecurityGroups.map(g => ({ value: g.GroupId, label: `${g.GroupId} · ${g.GroupName}` }));
  },
  async vpcs() {
    const r = await API.call("ec2", "DescribeVpcs");
    return r.Vpcs.map(v => ({ value: v.VpcId, label: `${v.VpcId} · ${v.CidrBlock}${v.IsDefault ? " (default)" : ""}` }));
  },
  async roles() {
    const r = await API.call("iam", "ListRoles");
    return r.Roles.map(x => ({ value: x.Arn, label: x.RoleName }));
  },
  async buckets() {
    const r = await API.call("s3", "ListBuckets");
    return (r.Buckets || []).map(b => b.Name);
  },
};

// Ensure a role exists that a service can assume (the emulator checks trust policies).
async function ensureServiceRole(name, servicePrincipal, managedPolicy) {
  try { return (await API.call("iam", "GetRole", { RoleName: name })).Role.Arn; }
  catch (e) { if (e.code !== "NoSuchEntity") throw e; }
  const doc = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: servicePrincipal }, Action: "sts:AssumeRole" }] };
  const r = await API.call("iam", "CreateRole", { RoleName: name, AssumeRolePolicyDocument: JSON.stringify(doc), Description: "Created by Emulator Console" });
  if (managedPolicy) { try { await API.call("iam", "AttachRolePolicy", { RoleName: name, PolicyArn: managedPolicy }); } catch { /* optional */ } }
  return r.Role.Arn;
}

// ---------------- router ----------------
const Routes = [];
const Nav = [];
function route(pattern, render) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
  Routes.push({ re, keys, render });
}
function navGroup(label, items) {
  const g = Nav.find(x => x.label === label);
  if (g) g.items.push(...items); else Nav.push({ label, items: [...items] });
}
function go(hash) { location.hash = hash; }
function parseHash() {
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  return { path, query: Object.fromEntries(new URLSearchParams(qs || "")) };
}
function q(params) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "")).toString();
  return s ? "?" + s : "";
}
async function renderRoute() {
  const { path, query } = parseHash();
  const main = document.getElementById("main");
  for (const r of Routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = { ...query };
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    clear(main);
    document.querySelectorAll(".nav a").forEach(a => {
      const href = a.getAttribute("href").slice(1);
      a.classList.toggle("on", href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
    });
    try {
      const out = await r.render(params);
      if (out) main.appendChild(out);
    } catch (e) { main.appendChild(errorBox(e)); }
    main.scrollTop = 0;
    return;
  }
  clear(main).appendChild(emptyState("Page not found.", h("a", { href: "#/" }, "Go to overview")));
}
