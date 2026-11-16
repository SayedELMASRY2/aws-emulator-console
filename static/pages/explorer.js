"use strict";

navGroup("Tools", [{ path: "/explorer", label: "API Explorer (all services)", keywords: "any service operation api call" }]);

route("/explorer", async ({ service, op }) => {
  const page = h("div", pageHeader("API Explorer", "Call any operation of any service the SDK knows. Inputs start from the operation's shape."));
  const svcIn = h("input", { class: "input", placeholder: "Filter services…" });
  const svcList = h("div", { class: "nav-mini" });
  const opIn = h("input", { class: "input", placeholder: "Filter operations…" });
  const opList = h("div", { class: "nav-mini" });
  const editor = h("div", emptyState("Pick a service and an operation."));
  let services = [], ops = [], cur = { service, op };

  const renderSvcs = () => {
    const f = svcIn.value.toLowerCase();
    clear(svcList).append(...services.filter(s => s.includes(f)).map(s =>
      h("a", { href: `#/explorer${q({ service: s })}`, class: s === cur.service ? "on" : null }, s)));
  };
  const renderOps = () => {
    const f = opIn.value.toLowerCase();
    clear(opList).append(...ops.filter(o => o.toLowerCase().includes(f)).map(o =>
      h("a", { href: `#/explorer${q({ service: cur.service, op: o })}`, class: o === cur.op ? "on" : null }, o)));
  };
  svcIn.addEventListener("input", renderSvcs);
  opIn.addEventListener("input", renderOps);

  services = (await API.req("GET", "/api/meta/services")).services;
  renderSvcs();
  if (cur.service) {
    const m = await API.req("GET", `/api/meta/operations${q({ service: cur.service })}`);
    ops = m.operations;
    renderOps();
    if (cur.op) {
      const meta = await API.req("GET", `/api/meta/operation${q({ service: cur.service, operation: cur.op })}`);
      const ta = h("textarea", { class: "input mono", rows: 14, spellcheck: "false" }, JSON.stringify(meta.skeleton || {}, null, 2));
      const out = h("div");
      const doc = h("div", { class: "muted doc" });
      // Docs come from the local SDK model; render them as text only.
      const tmp = document.createElement("div"); tmp.innerHTML = (meta.documentation || "").replace(/<[^>]+>/g, " ");
      doc.textContent = (tmp.textContent || "").replace(/\s+/g, " ").trim().slice(0, 600);
      const run = async () => {
        clear(out).appendChild(h("div", { class: "loading" }, "Calling…"));
        try {
          const params = ta.value.trim() ? JSON.parse(ta.value) : {};
          const t0 = performance.now();
          const r = await API.call(cur.service, cur.op, params);
          clear(out).append(h("div", { class: "row", style: { margin: "8px 0" } }, badge("200 OK", "ok"), h("span", { class: "muted" }, Math.round(performance.now() - t0) + " ms")), jsonView(r));
        } catch (e) { clear(out).appendChild(e instanceof SyntaxError ? errorBox({ code: "Invalid JSON", message: e.message }) : errorBox(e)); }
      };
      ta.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
      const cli = `aws ${cur.service === "stepfunctions" ? "stepfunctions" : cur.service} ${cur.op.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()} --cli-input-json '<the JSON above>'`;
      clear(editor).append(
        h("div", { class: "panel-head" }, h("div", h("h2", `${cur.service} · ${cur.op}`),
          h("p", { class: "muted" }, "Required: ", meta.required?.length ? meta.required.join(", ") : "none"),
          meta.optional?.length ? h("p", { class: "muted mono", style: { fontSize: "12px" } }, "Optional: ", meta.optional.join(", ")) : null)),
        h("div", { class: "querybox" }, doc, ta,
          h("div", { class: "row" }, button("Send", run, { kind: "primary", icon: "play" }), button("Reset", () => (ta.value = JSON.stringify(meta.skeleton || {}, null, 2))),
            h("span", { class: "muted" }, "Ctrl+Enter sends. Add any optional fields you need.")),
          h("details", h("summary", { class: "muted" }, "Same call from the CLI"), codeBlock(cli, { wrap: true }))),
        out);
    } else clear(editor).appendChild(emptyState(`Pick one of ${ops.length} ${cur.service} operations.`));
  }

  page.appendChild(h("div", { class: "explorer" },
    h("section", { class: "panel" }, h("div", { class: "panel-pad" }, h("h2", `Services (${services.length})`), svcIn), svcList),
    h("section", { class: "panel" }, h("div", { class: "panel-pad" }, h("h2", cur.service ? `Operations (${ops.length})` : "Operations"), cur.service ? opIn : h("p", { class: "muted" }, "Pick a service first.")), opList),
    h("section", { class: "panel" }, editor)));
  setTimeout(() => svcList.querySelector(".on")?.scrollIntoView({ block: "center" }), 0);
  setTimeout(() => opList.querySelector(".on")?.scrollIntoView({ block: "center" }), 0);
  return page;
});
