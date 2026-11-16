import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Grid from "@cloudscape-design/components/grid";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Input from "@cloudscape-design/components/input";
import Checkbox from "@cloudscape-design/components/checkbox";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { ConfirmModal, ErrorAlert, useAsync, useFlash } from "../../common";
import { ddb, listTableNames, keyOf, avPreview, keyFromItem, tableHref, typeLabel, ATTR_TYPES } from "./lib";

type Filter = { name: string; type: string; op: string; v1: string; v2: string };
const OPS = [
  { value: "=", label: "Equal to" }, { value: "<>", label: "Not equal to" }, { value: "<", label: "Less than" }, { value: "<=", label: "Less than or equal to" },
  { value: ">", label: "Greater than" }, { value: ">=", label: "Greater than or equal to" }, { value: "between", label: "Between" },
  { value: "exists", label: "Exists" }, { value: "not_exists", label: "Not exists" }, { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not contains" }, { value: "begins_with", label: "Begins with" },
];
const SK_OPS = OPS.filter(o => ["=", "<", "<=", ">", ">=", "between", "begins_with"].includes(o.value));
const FILTER_TYPES = [...ATTR_TYPES, { value: "BOOL", label: "Boolean" }, { value: "NULL", label: "Null" }];
const av = (type: string, v: string): any => type === "N" ? { N: v } : type === "B" ? { B: v } : type === "BOOL" ? { BOOL: v === "true" } : type === "NULL" ? { NULL: true } : { S: v };

function toCsv(items: any[], cols: string[]) {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [cols.map(esc).join(","), ...items.map(i => cols.map(c => esc(i[c] ? avPreview(i[c]) : "")).join(","))].join("\n");
}
function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
export const itemHref = (table: string, item: any, t: any, mode = "edit") =>
  `#/dynamodb/item?${new URLSearchParams({ table, mode, key: JSON.stringify(keyFromItem(item, t)) })}`;

export default function ExploreItems() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  const table = sp.get("table") || "";
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Explore items", href: "#/dynamodb/explore" }, ...(table ? [{ text: table, href: "#" }] : [])]);
  const names = useAsync(listTableNames, []);
  const [tf, setTf] = useState("");
  const desc = useAsync(async () => table ? (await ddb("DescribeTable", { TableName: table })).Table : null, [table]);
  const t = desc.data;

  const [mode, setMode] = useState<"scan" | "query">("scan");
  const [target, setTarget] = useState(sp.get("index") || "");
  const [pkVal, setPkVal] = useState("");
  const [skOp, setSkOp] = useState(SK_OPS[0]);
  const [sk1, setSk1] = useState("");
  const [sk2, setSk2] = useState("");
  const [desc_, setDesc] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [proj, setProj] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [lastKey, setLastKey] = useState<any>(null);
  const [stats, setStats] = useState<{ count: number; scanned: number; rcu?: number } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<any[]>([]);
  const [del, setDel] = useState(false);

  const indexes = useMemo(() => t ? [...(t.GlobalSecondaryIndexes || []).map((g: any) => ({ ...g, kind: "GSI" })), ...(t.LocalSecondaryIndexes || []).map((g: any) => ({ ...g, kind: "LSI" }))] : [], [t]);
  const schema = target ? indexes.find(i => i.IndexName === target)?.KeySchema : t?.KeySchema;
  const pk = t && schema ? keyOf(t, "HASH", schema) : null;
  const sk = t && schema ? keyOf(t, "RANGE", schema) : null;

  const build = (start: any) => {
    const p: any = { TableName: table, ReturnConsumedCapacity: "TOTAL", Limit: 50 };
    if (target) p.IndexName = target;
    if (start) p.ExclusiveStartKey = start;
    const names: any = {}, values: any = {};
    let n = 0;
    const name = (a: string) => { const k = `#n${n++}`; names[k] = a; return k; };
    const val = (x: any) => { const k = `:v${n++}`; values[k] = x; return k; };
    if (mode === "query") {
      if (!pkVal) throw new Error(`Enter a value for the partition key ${pk?.name}.`);
      let kce = `${name(pk!.name)} = ${val(av(pk!.type, pkVal))}`;
      if (sk && sk1) {
        const a = name(sk.name);
        if (skOp.value === "begins_with") kce += ` AND begins_with(${a}, ${val(av(sk.type, sk1))})`;
        else if (skOp.value === "between") kce += ` AND ${a} BETWEEN ${val(av(sk.type, sk1))} AND ${val(av(sk.type, sk2))}`;
        else kce += ` AND ${a} ${skOp.value} ${val(av(sk.type, sk1))}`;
      }
      p.KeyConditionExpression = kce;
      if (desc_) p.ScanIndexForward = false;
    }
    const fx = filters.filter(f => f.name).map(f => {
      const a = name(f.name);
      switch (f.op) {
        case "exists": return `attribute_exists(${a})`;
        case "not_exists": return `attribute_not_exists(${a})`;
        case "contains": return `contains(${a}, ${val(av(f.type, f.v1))})`;
        case "not_contains": return `NOT contains(${a}, ${val(av(f.type, f.v1))})`;
        case "begins_with": return `begins_with(${a}, ${val(av(f.type, f.v1))})`;
        case "between": return `${a} BETWEEN ${val(av(f.type, f.v1))} AND ${val(av(f.type, f.v2))}`;
        default: return `${a} ${f.op} ${val(av(f.type, f.v1))}`;
      }
    });
    if (fx.length) p.FilterExpression = fx.join(" AND ");
    if (proj.trim()) p.ProjectionExpression = proj.split(",").map(s => s.trim()).filter(Boolean).map(name).join(", ");
    if (Object.keys(names).length) p.ExpressionAttributeNames = names;
    if (Object.keys(values).length) p.ExpressionAttributeValues = values;
    return p;
  };
  const run = async (more = false) => {
    setErr(null); setBusy(true);
    try {
      const r = await ddb(mode === "query" ? "Query" : "Scan", build(more ? lastKey : null));
      setItems(more ? [...items, ...(r.Items || [])] : r.Items || []);
      setLastKey(r.LastEvaluatedKey || null);
      setStats({ count: (more ? stats?.count || 0 : 0) + r.Count, scanned: (more ? stats?.scanned || 0 : 0) + r.ScannedCount, rcu: r.ConsumedCapacity?.CapacityUnits });
      if (!more) setSel([]);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  useEffect(() => { setItems([]); setStats(null); setLastKey(null); setSel([]); setFilters([]); setPkVal(""); setSk1(""); setSk2(""); }, [table]);
  useEffect(() => { if (t) run(); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  const keyCols = (t?.KeySchema || []).map((k: any) => k.AttributeName);
  const otherCols = [...new Set(items.flatMap(i => Object.keys(i)))].filter(c => !keyCols.includes(c)).sort();
  const cols = [...keyCols, ...otherCols];
  const reset = () => { setFilters([]); setPkVal(""); setSk1(""); setSk2(""); setProj(""); setDesc(false); };

  const tableOptions = [{ value: "", label: `Table - ${table}` }, ...indexes.map(i => ({ value: i.IndexName, label: `Index - ${i.IndexName}`, description: i.kind === "GSI" ? "Global secondary index" : "Local secondary index" }))];

  const panel = t ? (
    <SpaceBetween size="l">
      <ExpandableSection variant="container" defaultExpanded headerText="Scan or query items"
        headerActions={<Button href={tableHref(table)}>View table details</Button>}>
        <SpaceBetween size="l">
          <SegmentedControl selectedId={mode} onChange={e => setMode(e.detail.selectedId as any)} options={[{ id: "scan", text: "Scan" }, { id: "query", text: "Query" }]} />
          <FormField label="Select a table or index">
            <Select selectedOption={tableOptions.find(o => o.value === target) || tableOptions[0]} options={tableOptions} onChange={e => setTarget(e.detail.selectedOption.value!)} />
          </FormField>
          {mode === "query" && pk && (
            <ColumnLayout columns={2}>
              <FormField label={<>{pk.name} <Box variant="small" display="inline" color="text-body-secondary">(Partition key)</Box></>}>
                <Input value={pkVal} onChange={e => setPkVal(e.detail.value)} placeholder={`Enter partition key value (${typeLabel(pk.type)})`} />
              </FormField>
              {sk && (
                <FormField label={<>{sk.name} <Box variant="small" display="inline" color="text-body-secondary">(Sort key)</Box></>}>
                  <SpaceBetween direction="horizontal" size="xs">
                    <Select selectedOption={skOp} options={SK_OPS} onChange={e => setSkOp(e.detail.selectedOption as any)} />
                    <Input value={sk1} onChange={e => setSk1(e.detail.value)} placeholder={`Enter sort key value (${typeLabel(sk.type)})`} />
                    {skOp.value === "between" && <Input value={sk2} onChange={e => setSk2(e.detail.value)} placeholder="and" />}
                  </SpaceBetween>
                </FormField>
              )}
            </ColumnLayout>
          )}
          {mode === "query" && <Checkbox checked={desc_} onChange={e => setDesc(e.detail.checked)}>Sort descending</Checkbox>}
          <ExpandableSection headerText={`Filters - optional (${filters.filter(f => f.name).length})`} defaultExpanded={filters.length > 0}>
            <AttributeEditor
              items={filters} addButtonText="Add filter" removeButtonText="Remove" empty="No filters."
              onAddButtonClick={() => setFilters([...filters, { name: "", type: "S", op: "=", v1: "", v2: "" }])}
              onRemoveButtonClick={e => setFilters(filters.filter((_, i) => i !== e.detail.itemIndex))}
              definition={[
                { label: "Attribute name", control: (f, i) => <Input value={f.name} placeholder="Enter attribute name" onChange={e => setFilters(filters.map((x, j) => j === i ? { ...x, name: e.detail.value } : x))} /> },
                { label: "Type", control: (f, i) => <Select selectedOption={FILTER_TYPES.find(x => x.value === f.type)!} options={FILTER_TYPES} onChange={e => setFilters(filters.map((x, j) => j === i ? { ...x, type: e.detail.selectedOption.value! } : x))} /> },
                { label: "Condition", control: (f, i) => <Select selectedOption={OPS.find(o => o.value === f.op)!} options={OPS} onChange={e => setFilters(filters.map((x, j) => j === i ? { ...x, op: e.detail.selectedOption.value! } : x))} /> },
                { label: "Value", control: (f, i) => ["exists", "not_exists"].includes(f.op) ? <Box color="text-body-secondary">-</Box> :
                  <SpaceBetween direction="horizontal" size="xxs">
                    <Input value={f.v1} placeholder="Enter attribute value" onChange={e => setFilters(filters.map((x, j) => j === i ? { ...x, v1: e.detail.value } : x))} />
                    {f.op === "between" && <Input value={f.v2} placeholder="and" onChange={e => setFilters(filters.map((x, j) => j === i ? { ...x, v2: e.detail.value } : x))} />}
                  </SpaceBetween> },
              ]}
            />
          </ExpandableSection>
          <FormField label="Projection - optional" description="Comma-separated attributes to return. Leave empty to return all attributes.">
            <Input value={proj} onChange={e => setProj(e.detail.value)} placeholder="pk, sk, status" />
          </FormField>
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" loading={busy} onClick={() => run()}>Run</Button>
            <Button onClick={reset}>Reset</Button>
          </SpaceBetween>
        </SpaceBetween>
      </ExpandableSection>
      {err ? <ErrorAlert error={err} /> : stats && <Alert type="success">Completed · Items returned: {stats.count} · Items scanned: {stats.scanned}{stats.rcu !== undefined ? ` · Efficiency: ${stats.scanned ? Math.round((stats.count / stats.scanned) * 100) : 100}% · RCUs consumed: ${stats.rcu}` : ""}</Alert>}
      <Table
        header={<Header counter={`(${items.length}${lastKey ? "+" : ""})`}
          actions={<SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" onClick={() => run()} />
            <ButtonDropdown onItemClick={e => {
              const id = e.detail.id;
              if (id === "edit") nav(itemHref(table, sel[0], t).slice(1));
              if (id === "dup") nav(itemHref(table, sel[0], t, "duplicate").slice(1));
              if (id === "delete") setDel(true);
              if (id === "csv-sel") download(`${table}-selected.csv`, toCsv(sel, cols));
              if (id === "csv-all") download(`${table}-results.csv`, toCsv(items, cols));
            }} items={[
              { id: "edit", text: "Edit item", disabled: sel.length !== 1 },
              { id: "dup", text: "Duplicate item", disabled: sel.length !== 1 },
              { id: "delete", text: "Delete items", disabled: !sel.length },
              { id: "csv-sel", text: "Download selected items to CSV", disabled: !sel.length },
              { id: "csv-all", text: "Download results to CSV", disabled: !items.length },
            ]}>Actions</ButtonDropdown>
            <Button variant="primary" href={`#/dynamodb/item?${new URLSearchParams({ table, mode: "create" })}`}>Create item</Button>
          </SpaceBetween>}>Items returned</Header>}
        items={items} loading={busy && !items.length} loadingText="Running"
        trackBy={i => JSON.stringify(keyFromItem(i, t))} selectionType="multi" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        resizableColumns wrapLines={false}
        empty={<Box textAlign="center" color="inherit"><b>No items</b><Box variant="p" color="inherit">{stats ? "The operation returned no items." : "Run a scan or query to see items."}</Box></Box>}
        columnDefinitions={cols.map((c, i) => ({
          id: c, header: c,
          cell: (it: any) => i === 0 ? <Link href={itemHref(table, it, t)}>{it[c] ? avPreview(it[c]) : ""}</Link> : (it[c] ? avPreview(it[c]) : ""),
        }))}
        footer={lastKey ? <Box textAlign="center"><Button loading={busy} onClick={() => run(true)}>Retrieve next page</Button></Box> : undefined}
      />
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header={`Delete ${sel.length} item${sel.length === 1 ? "" : "s"}?`} confirmLabel="Delete"
        onConfirm={async () => {
          try {
            for (const it of sel) await ddb("DeleteItem", { TableName: table, Key: keyFromItem(it, t) });
            flash.notify({ type: "success", content: `Deleted ${sel.length} item(s).` }); setDel(false); run();
          } catch (e) { flash.error(e); setDel(false); }
        }}>
        <Box>The selected items will be permanently deleted from {table}.</Box>
      </ConfirmModal>
    </SpaceBetween>
  ) : desc.error ? <ErrorAlert error={desc.error} /> : <Container><Box textAlign="center" color="text-body-secondary" padding="xl">Choose a table to explore its items.</Box></Container>;

  const filtered = (names.data || []).filter(n => n.toLowerCase().includes(tf.toLowerCase()));
  return (
    <ContentLayout header={<Header variant="h1">{table || "Explore items"}</Header>}>
      <Grid gridDefinition={[{ colspan: { default: 12, m: 3 } }, { colspan: { default: 12, m: 9 } }]}>
        <Container header={<Header variant="h2" counter={`(${names.data?.length || 0})`}>Tables</Header>}>
          <SpaceBetween size="s">
            <TextFilter filteringText={tf} onChange={e => setTf(e.detail.filteringText)} filteringPlaceholder="Find tables by table name" />
            {names.loading ? <Box>Loading…</Box> : filtered.length ? filtered.map(n => (
              <div key={n} style={{ padding: "4px 6px", borderRadius: 6, background: n === table ? "rgba(9,114,211,0.12)" : undefined }}>
                <Link onFollow={e => { e.preventDefault(); setSp({ table: n }); setTarget(""); }} href={`#/dynamodb/explore?table=${encodeURIComponent(n)}`} variant={n === table ? "primary" : "secondary"}>{n}</Link>
              </div>
            )) : <Box color="text-body-secondary">No tables</Box>}
          </SpaceBetween>
        </Container>
        {panel}
      </Grid>
    </ContentLayout>
  );
}
