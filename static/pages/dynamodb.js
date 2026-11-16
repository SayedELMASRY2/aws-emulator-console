"use strict";

navGroup("Databases", [{ path: "/dynamodb", label: "DynamoDB", keywords: "nosql table" }]);

// Plain JSON <-> DynamoDB AttributeValue
const DDB = {
  marshal(v) {
    if (v === null || v === undefined) return { NULL: true };
    if (typeof v === "string") return { S: v };
    if (typeof v === "number") return { N: String(v) };
    if (typeof v === "boolean") return { BOOL: v };
    if (Array.isArray(v)) return { L: v.map(x => DDB.marshal(x)) };
    if (typeof v === "object") {
      if (v.__base64__) return { B: v.__base64__ };
      const M = {}; for (const [k, x] of Object.entries(v)) M[k] = DDB.marshal(x); return { M };
    }
    return { S: String(v) };
  },
  item(obj) { const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = DDB.marshal(v); return o; },
  unmarshal(av) {
    if (!av || typeof av !== "object") return av;
    if ("S" in av) return av.S;
    if ("N" in av) return Number(av.N);
    if ("BOOL" in av) return av.BOOL;
    if ("NULL" in av) return null;
    if ("L" in av) return av.L.map(DDB.unmarshal);
    if ("M" in av) return DDB.plain(av.M);
    if ("SS" in av) return av.SS;
    if ("NS" in av) return av.NS.map(Number);
    if ("B" in av) return { __base64__: av.B };
    if ("BS" in av) return av.BS;
    return av;
  },
  plain(item) { const o = {}; for (const [k, v] of Object.entries(item || {})) o[k] = DDB.unmarshal(v); return o; },
  cell(v) {
    if (v === undefined) return "";
    if (v === null) return "null";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  },
  keyOf(item, schema) { const k = {}; schema.forEach(s => (k[s.AttributeName] = item[s.AttributeName])); return k; },
};

const ATTR_TYPES = [{ value: "S", label: "String" }, { value: "N", label: "Number" }, { value: "B", label: "Binary" }];

route("/dynamodb", async () => {
  const page = h("div", pageHeader("DynamoDB", "Tables, items, queries and PartiQL."));
  const panel = resourcePanel({
    title: "Tables",
    rowKey: "TableName",
    load: async () => {
      const names = await API.all("dynamodb", "ListTables", {}, "TableNames", "ExclusiveStartTableName", "LastEvaluatedTableName");
      return Promise.all(names.map(n => API.call("dynamodb", "DescribeTable", { TableName: n }).then(r => r.Table)));
    },
    columns: [
      { label: "Name", render: t => h("a", { href: `#/dynamodb/t/${encodeURIComponent(t.TableName)}` }, t.TableName) },
      { label: "Status", render: t => badge(t.TableStatus) },
      { label: "Partition key", render: t => keyLabel(t, "HASH") },
      { label: "Sort key", render: t => keyLabel(t, "RANGE") },
      { label: "Indexes", class: "num", render: t => (t.GlobalSecondaryIndexes || []).length + (t.LocalSecondaryIndexes || []).length },
      { label: "Items", class: "num", render: t => t.ItemCount ?? 0 },
      { label: "Billing", render: t => t.BillingModeSummary?.BillingMode || "PROVISIONED" },
    ],
    poll: t => t.TableStatus !== "ACTIVE",
    onRowClick: t => go(`/dynamodb/t/${encodeURIComponent(t.TableName)}`),
    empty: "No tables yet.",
    create: { label: "Create table", open: () => createTableForm(() => panel.refresh()) },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete table",
      run: async rows => { for (const t of rows) await API.call("dynamodb", "DeleteTable", { TableName: t.TableName }); } }],
  });
  page.appendChild(panel);
  return page;
});

function keyLabel(t, type) {
  const k = t.KeySchema.find(x => x.KeyType === type);
  if (!k) return "—";
  const at = t.AttributeDefinitions.find(a => a.AttributeName === k.AttributeName);
  return `${k.AttributeName} (${at?.AttributeType})`;
}

function createTableForm(after) {
  return formModal({
    title: "Create table",
    fields: [
      { name: "name", label: "Table name", required: true },
      { name: "pk", label: "Partition key", required: true, default: "pk" },
      { name: "pkType", label: "Partition key type", type: "select", required: true, options: ATTR_TYPES, default: "S" },
      { name: "sk", label: "Sort key (optional)", placeholder: "sk" },
      { name: "skType", label: "Sort key type", type: "select", required: true, options: ATTR_TYPES, default: "S", showIf: v => !!v.sk },
      { name: "billing", label: "Capacity mode", type: "select", required: true, options: [{ value: "PAY_PER_REQUEST", label: "On-demand" }, { value: "PROVISIONED", label: "Provisioned (5 RCU / 5 WCU)" }], default: "PAY_PER_REQUEST" },
      { name: "stream", label: "Turn on DynamoDB Streams (new and old images)", type: "checkbox" },
      { name: "ttl", label: "TTL attribute (optional)", placeholder: "expiresAt" },
    ],
    onSubmit: async v => {
      const attrs = [{ AttributeName: v.pk, AttributeType: v.pkType }];
      const keys = [{ AttributeName: v.pk, KeyType: "HASH" }];
      if (v.sk) { attrs.push({ AttributeName: v.sk, AttributeType: v.skType }); keys.push({ AttributeName: v.sk, KeyType: "RANGE" }); }
      const p = { TableName: v.name, AttributeDefinitions: attrs, KeySchema: keys, BillingMode: v.billing };
      if (v.billing === "PROVISIONED") p.ProvisionedThroughput = { ReadCapacityUnits: 5, WriteCapacityUnits: 5 };
      if (v.stream) p.StreamSpecification = { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" };
      await API.call("dynamodb", "CreateTable", p);
      if (v.ttl) {
        for (let i = 0; i < 20; i++) {
          const t = (await API.call("dynamodb", "DescribeTable", { TableName: v.name })).Table;
          if (t.TableStatus === "ACTIVE") break;
          await sleep(500);
        }
        await API.call("dynamodb", "UpdateTimeToLive", { TableName: v.name, TimeToLiveSpecification: { Enabled: true, AttributeName: v.ttl } });
      }
      toast(`Table ${v.name} created`);
      after();
    },
  });
}

route("/dynamodb/t/:table", async ({ table }) => {
  const desc = (await API.call("dynamodb", "DescribeTable", { TableName: table })).Table;
  const schema = desc.KeySchema;
  const page = h("div", crumbs(["DynamoDB", "#/dynamodb"], table),
    pageHeader(table, `Partition key: ${keyLabel(desc, "HASH")} · Sort key: ${keyLabel(desc, "RANGE")}`, badge(desc.TableStatus)));

  const itemEditor = (title, item, after) => formModal({
    title, wide: true, submitLabel: "Save",
    fields: [{ name: "json", label: "Item (plain JSON)", type: "json", rows: 14, required: true, default: item,
      help: "Write normal JSON. Strings, numbers, booleans, null, lists and objects are converted to DynamoDB types for you." }],
    onSubmit: async v => {
      if (typeof v.json !== "object" || Array.isArray(v.json)) throw new Error("The item must be a JSON object");
      await API.call("dynamodb", "PutItem", { TableName: table, Item: DDB.item(v.json) });
      toast("Item saved");
      after();
    },
  });

  const items = () => {
    const wrap = h("div");
    const mode = { kind: "scan", pk: "", skOp: "", sk: "", sk2: "", index: "" };
    const pkName = schema.find(k => k.KeyType === "HASH").AttributeName;
    const skName = schema.find(k => k.KeyType === "RANGE")?.AttributeName;
    const indexes = (desc.GlobalSecondaryIndexes || []).concat(desc.LocalSecondaryIndexes || []);
    let lastKey = null, rows = [];

    const keyInfo = () => {
      if (!mode.index) return { pk: pkName, sk: skName, pkType: desc.AttributeDefinitions.find(a => a.AttributeName === pkName).AttributeType };
      const ix = indexes.find(i => i.IndexName === mode.index);
      const p = ix.KeySchema.find(k => k.KeyType === "HASH").AttributeName;
      return { pk: p, sk: ix.KeySchema.find(k => k.KeyType === "RANGE")?.AttributeName, pkType: desc.AttributeDefinitions.find(a => a.AttributeName === p).AttributeType };
    };
    const typed = (val, attr) => {
      const t = desc.AttributeDefinitions.find(a => a.AttributeName === attr)?.AttributeType || "S";
      return t === "N" ? { N: String(val) } : t === "B" ? { B: val } : { S: val };
    };

    const panel = h("section", { class: "panel" });
    const body = h("div");
    const count = h("span", { class: "count" });
    let selected = [];
    const delBtn = button("Delete", async () => {
      if (!selected.length || !(await confirmDanger(`Delete ${selected.length} item(s)?`))) return;
      try {
        for (const it of selected) await API.call("dynamodb", "DeleteItem", { TableName: table, Key: DDB.item(DDB.keyOf(it, schema)) });
        toast("Deleted"); load(true);
      } catch (e) { toastErr(e); }
    }, { kind: "danger", icon: "trash", disabled: true });
    const more = button("Load more", () => load(false), { kind: "ghost" });

    const kindSel = h("select", { class: "input", style: { width: "auto" } }, h("option", { value: "scan" }, "Scan"), h("option", { value: "query" }, "Query"));
    const ixSel = h("select", { class: "input", style: { width: "auto" } }, h("option", { value: "" }, "Table"), indexes.map(i => h("option", { value: i.IndexName }, "Index: " + i.IndexName)));
    const pkIn = h("input", { class: "input", placeholder: "partition key value", style: { width: "200px" } });
    const skOp = h("select", { class: "input", style: { width: "auto" } }, ["", "=", "<", "<=", ">", ">=", "begins_with", "between"].map(o => h("option", { value: o }, o || "(no sort condition)")));
    const skIn = h("input", { class: "input", placeholder: "sort key value", style: { width: "160px" } });
    const sk2In = h("input", { class: "input", placeholder: "and", style: { width: "120px" } });
    const filterIn = h("input", { class: "input", placeholder: 'filter, e.g. status = "open" (optional)', style: { width: "240px" } });
    const queryRow = h("div", { class: "row" }, pkIn, skOp, skIn, sk2In);
    const sync = () => {
      queryRow.style.display = kindSel.value === "query" ? "" : "none";
      const ki = keyInfo();
      pkIn.placeholder = `${ki.pk} =`;
      skOp.style.display = skIn.style.display = ki.sk ? "" : "none";
      skIn.placeholder = ki.sk || "";
      sk2In.style.display = ki.sk && skOp.value === "between" ? "" : "none";
    };
    [kindSel, ixSel, skOp].forEach(s => s.addEventListener("change", () => { mode.index = ixSel.value; sync(); }));
    const runBtn = button("Run", () => { Object.assign(mode, { kind: kindSel.value, index: ixSel.value }); load(true); }, { kind: "primary", icon: "play" });

    // simple filter: attr op value  ->  FilterExpression
    const parseFilter = s => {
      const m = s.match(/^\s*([\w.]+)\s*(=|<>|<=|>=|<|>|contains|begins_with)\s*(.+?)\s*$/);
      if (!m) throw new Error('Filter must look like: attr = "value"  or  attr > 10');
      let val; try { val = JSON.parse(m[3]); } catch { val = m[3]; }
      const expr = m[2] === "contains" || m[2] === "begins_with" ? `${m[2]}(#f, :f)` : `#f ${m[2]} :f`;
      return { FilterExpression: expr, names: { "#f": m[1] }, values: { ":f": DDB.marshal(val) } };
    };

    async function load(reset) {
      if (reset) { lastKey = null; rows = []; selected = []; delBtn.disabled = true; clear(body).appendChild(h("div", { class: "loading" }, "Loading…")); }
      try {
        const p = { TableName: table, Limit: 50 };
        if (mode.index) p.IndexName = mode.index;
        if (lastKey) p.ExclusiveStartKey = lastKey;
        const names = {}, values = {};
        if (filterIn.value.trim()) { const f = parseFilter(filterIn.value); p.FilterExpression = f.FilterExpression; Object.assign(names, f.names); Object.assign(values, f.values); }
        let op = "Scan";
        if (mode.kind === "query") {
          op = "Query";
          const ki = keyInfo();
          if (!pkIn.value) throw new Error(`Enter a value for ${ki.pk}`);
          names["#pk"] = ki.pk; values[":pk"] = typed(pkIn.value, ki.pk);
          let kce = "#pk = :pk";
          if (ki.sk && skOp.value && skIn.value) {
            names["#sk"] = ki.sk; values[":sk"] = typed(skIn.value, ki.sk);
            if (skOp.value === "begins_with") kce += " AND begins_with(#sk, :sk)";
            else if (skOp.value === "between") { values[":sk2"] = typed(sk2In.value, ki.sk); kce += " AND #sk BETWEEN :sk AND :sk2"; }
            else kce += ` AND #sk ${skOp.value} :sk`;
          }
          p.KeyConditionExpression = kce;
        }
        if (Object.keys(names).length) p.ExpressionAttributeNames = names;
        if (Object.keys(values).length) p.ExpressionAttributeValues = values;
        const r = await API.call("dynamodb", op, p);
        rows = rows.concat((r.Items || []).map(DDB.plain));
        lastKey = r.LastEvaluatedKey || null;
        render();
      } catch (e) { clear(body).appendChild(errorBox(e)); }
    }
    function render() {
      count.textContent = `(${rows.length}${lastKey ? "+" : ""})`;
      const keyCols = schema.map(k => k.AttributeName);
      const other = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !keyCols.includes(k)).sort().slice(0, 12);
      const cols = [...keyCols, ...other].map(k => ({ label: k, class: "mono", render: r => DDB.cell(r[k]) }));
      cols.push({ label: "", render: r => h("a", { href: "#", onclick: e => { e.preventDefault(); itemEditor("Edit item", r, () => load(true)); } }, "Edit") });
      clear(body).append(dataTable({
        columns: cols, rows, rowKey: r => JSON.stringify(DDB.keyOf(r, schema)), selectable: true,
        onSelect: s => { selected = s; delBtn.disabled = !s.length; },
        onRowClick: r => itemEditor("Edit item", r, () => load(true)),
        empty: mode.kind === "query" ? "No items match." : "No items yet. Add one.",
      }), lastKey ? h("div", { class: "panel-pad" }, more) : null);
    }

    panel.append(
      h("div", { class: "panel-head" }, h("h2", "Items ", count),
        h("div", { class: "toolbar" }, delBtn, button("", () => load(true), { icon: "refresh", kind: "ghost", title: "Refresh" }),
          button("Add item", () => {
            const tmpl = {}; schema.forEach(k => (tmpl[k.AttributeName] = desc.AttributeDefinitions.find(a => a.AttributeName === k.AttributeName).AttributeType === "N" ? 1 : ""));
            itemEditor("Add item", tmpl, () => load(true));
          }, { kind: "primary", icon: "plus" }))),
      h("div", { class: "panel-pad row" }, kindSel, indexes.length ? ixSel : null, queryRow, filterIn, runBtn),
      body);
    wrap.appendChild(panel);
    sync();
    load(true);
    return wrap;
  };

  const partiql = () => {
    const ta = h("textarea", { class: "input mono", rows: 4, spellcheck: "false" }, `SELECT * FROM "${table}"`);
    const out = h("div");
    const run = async () => {
      clear(out).appendChild(h("div", { class: "loading" }, "Running…"));
      try {
        const r = await API.call("dynamodb", "ExecuteStatement", { Statement: ta.value });
        const items = (r.Items || []).map(DDB.plain);
        const cols = [...new Set(items.flatMap(i => Object.keys(i)))].map(k => ({ label: k, class: "mono", render: i => DDB.cell(i[k]) }));
        clear(out).appendChild(items.length ? dataTable({ columns: cols, rows: items, rowKey: (_, i) => i }) : emptyState("Statement ran. No items returned."));
      } catch (e) { clear(out).appendChild(errorBox(e)); }
    };
    ta.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
    return h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", h("h2", "PartiQL editor"), h("p", { class: "muted" }, "SELECT, INSERT, UPDATE and DELETE with SQL-like syntax. Ctrl+Enter runs."))),
      h("div", { class: "querybox" }, ta, h("div", button("Run", run, { kind: "primary", icon: "play" }))), out);
  };

  const indexesTab = () => resourcePanel({
    title: "Global secondary indexes",
    rowKey: "IndexName",
    load: async () => (await API.call("dynamodb", "DescribeTable", { TableName: table })).Table.GlobalSecondaryIndexes || [],
    columns: [
      { label: "Name", key: "IndexName" },
      { label: "Status", render: i => badge(i.IndexStatus) },
      { label: "Keys", render: i => i.KeySchema.map(k => `${k.AttributeName} (${k.KeyType})`).join(", ") },
      { label: "Projection", render: i => i.Projection?.ProjectionType },
    ],
    poll: i => i.IndexStatus !== "ACTIVE",
    create: {
      label: "Create index",
      open: () => formModal({
        title: "Create global secondary index",
        fields: [
          { name: "pk", label: "Partition key", required: true },
          { name: "pkType", label: "Partition key type", type: "select", required: true, options: ATTR_TYPES, default: "S" },
          { name: "sk", label: "Sort key (optional)" },
          { name: "skType", label: "Sort key type", type: "select", required: true, options: ATTR_TYPES, default: "S", showIf: v => !!v.sk },
          { name: "name", label: "Index name", required: true, placeholder: "byStatus" },
        ],
        onSubmit: async v => {
          const attrs = [{ AttributeName: v.pk, AttributeType: v.pkType }];
          const ks = [{ AttributeName: v.pk, KeyType: "HASH" }];
          if (v.sk) { attrs.push({ AttributeName: v.sk, AttributeType: v.skType }); ks.push({ AttributeName: v.sk, KeyType: "RANGE" }); }
          const gsi = { IndexName: v.name, KeySchema: ks, Projection: { ProjectionType: "ALL" } };
          if (desc.BillingModeSummary?.BillingMode !== "PAY_PER_REQUEST") gsi.ProvisionedThroughput = { ReadCapacityUnits: 5, WriteCapacityUnits: 5 };
          await API.call("dynamodb", "UpdateTable", { TableName: table, AttributeDefinitions: attrs, GlobalSecondaryIndexUpdates: [{ Create: gsi }] });
          toast("Index is being created");
          renderRoute();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete index",
      run: async rows => { for (const i of rows) await API.call("dynamodb", "UpdateTable", { TableName: table, GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: i.IndexName } }] }); } }],
  });

  const details = () => h("div", { class: "panel" },
    kv([
      ["ARN", desc.TableArn], ["Status", badge(desc.TableStatus)], ["Items", desc.ItemCount], ["Size", fmtBytes(desc.TableSizeBytes)],
      ["Billing", desc.BillingModeSummary?.BillingMode || "PROVISIONED"], ["Created", fmtDate(desc.CreationDateTime)],
      ["Stream", desc.StreamSpecification?.StreamEnabled ? `${desc.StreamSpecification.StreamViewType} · ${desc.LatestStreamArn}` : "Off"],
    ]),
    h("div", { class: "panel-pad" }, jsonView(desc)));

  page.appendChild(tabs([
    { label: "Items", render: items }, { label: "PartiQL", render: partiql },
    { label: "Indexes", render: indexesTab }, { label: "Details", render: details },
  ]));
  return page;
});
