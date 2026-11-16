import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Table from "@cloudscape-design/components/table";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Toggle from "@cloudscape-design/components/toggle";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { ddb, marshal, unmarshal, unmarshalItem, marshalItem, avType, exploreHref, typeLabel } from "./lib";

type Row = { name: string; type: string; value: string; key?: boolean };
const TYPES = [
  { value: "S", label: "String" }, { value: "N", label: "Number" }, { value: "B", label: "Binary" }, { value: "BOOL", label: "Boolean" },
  { value: "NULL", label: "Null" }, { value: "SS", label: "String set" }, { value: "NS", label: "Number set" }, { value: "BS", label: "Binary set" },
  { value: "L", label: "List" }, { value: "M", label: "Map" },
];
const DEFAULTS: Record<string, string> = { S: "", N: "", B: "", BOOL: "false", NULL: "true", SS: '["a", "b"]', NS: "[1, 2]", BS: "[]", L: "[]", M: "{}" };

function rowToAv(r: Row): any {
  switch (r.type) {
    case "S": return { S: r.value };
    case "N": if (r.value === "" || isNaN(Number(r.value))) throw new Error(`${r.name}: "${r.value}" isn't a number.`); return { N: r.value };
    case "B": return { B: r.value };
    case "BOOL": return { BOOL: r.value === "true" };
    case "NULL": return { NULL: true };
    case "SS": return { SS: parse(r).map(String) };
    case "NS": return { NS: parse(r).map(String) };
    case "BS": return { BS: parse(r) };
    case "L": return { L: parse(r).map(marshal) };
    case "M": { const v = parse(r); return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshal(x)])) }; }
  }
}
function parse(r: Row) { try { return JSON.parse(r.value); } catch (e: any) { throw new Error(`${r.name}: invalid JSON (${e.message})`); } }
function avToRow(name: string, a: any, key = false): Row {
  const type = avType(a);
  let value = "";
  if (type === "S" || type === "N") value = a[type];
  else if (type === "B") value = typeof a.B === "string" ? a.B : JSON.stringify(a.B);
  else if (type === "BOOL") value = String(a.BOOL);
  else if (type === "NULL") value = "true";
  else value = JSON.stringify(unmarshal(a), null, 2);
  return { name, type, value, key };
}

export default function ItemEditor() {
  const [sp] = useSearchParams();
  const table = sp.get("table") || "";
  const mode = sp.get("mode") || "create";
  const keyParam = sp.get("key");
  const nav = useNavigate();
  const flash = useFlash();
  const title = mode === "edit" ? "Edit item" : mode === "duplicate" ? "Duplicate item" : "Create item";
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Explore items", href: exploreHref(table) }, { text: table, href: exploreHref(table) }, { text: title, href: "#" }]);

  const data = useAsync(async () => {
    const t = (await ddb("DescribeTable", { TableName: table })).Table;
    const item = keyParam ? (await ddb("GetItem", { TableName: table, Key: JSON.parse(keyParam), ConsistentRead: true })).Item : null;
    return { t, item };
  }, [table, keyParam]);
  const [rows, setRows] = useState<Row[]>([]);
  const [view, setView] = useState<"form" | "json">("form");
  const [ddbJson, setDdbJson] = useState(false);
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [original, setOriginal] = useState<any>(null);

  useEffect(() => {
    if (!data.data) return;
    const { t, item } = data.data;
    const keys: string[] = t.KeySchema.map((k: any) => k.AttributeName);
    const typeOf = (n: string) => t.AttributeDefinitions.find((a: any) => a.AttributeName === n)?.AttributeType || "S";
    if (item) {
      const r = [...keys.map(k => avToRow(k, item[k] || { [typeOf(k)]: "" }, true)), ...Object.keys(item).filter(k => !keys.includes(k)).sort().map(k => avToRow(k, item[k]))];
      setRows(mode === "duplicate" ? r.map(x => x.key ? { ...x } : x) : r);
      if (mode === "edit") setOriginal(Object.fromEntries(keys.map(k => [k, item[k]])));
    } else setRows(keys.map(k => ({ name: k, type: typeOf(k), value: "", key: true })));
  }, [data.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowsToItem = (rs: Row[]) => {
    const out: any = {};
    for (const r of rs) {
      if (!r.name) throw new Error("Every attribute needs a name.");
      if (out[r.name]) throw new Error(`Duplicate attribute name "${r.name}".`);
      if (r.key && r.value === "") throw new Error(`The key attribute ${r.name} needs a value.`);
      out[r.name] = rowToAv(r);
    }
    return out;
  };
  const switchView = (v: "form" | "json") => {
    setErr(null);
    try {
      if (v === "json") { const it = rowsToItem(rows); setJson(JSON.stringify(ddbJson ? it : unmarshalItem(it), null, 2)); }
      else { const it = jsonToItem(); setRows(rowsFromItem(it)); }
      setView(v);
    } catch (e) { setErr(e); }
  };
  const jsonToItem = () => {
    let o: any;
    try { o = JSON.parse(json); } catch (e: any) { throw new Error("Invalid JSON: " + e.message); }
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("The item must be a JSON object.");
    return ddbJson ? o : marshalItem(o);
  };
  const rowsFromItem = (it: any) => {
    const keys: string[] = data.data!.t.KeySchema.map((k: any) => k.AttributeName);
    return [...keys.map(k => avToRow(k, it[k] || { S: "" }, true)), ...Object.keys(it).filter(k => !keys.includes(k)).map(k => avToRow(k, it[k]))];
  };
  const toggleDdb = (on: boolean) => {
    setErr(null);
    try { const it = jsonToItem(); setDdbJson(on); setJson(JSON.stringify(on ? it : unmarshalItem(it), null, 2)); }
    catch (e) { setErr(e); }
  };

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const item = view === "form" ? rowsToItem(rows) : jsonToItem();
      const t = data.data!.t;
      for (const k of t.KeySchema) if (!item[k.AttributeName]) throw new Error(`The item must include the key attribute ${k.AttributeName}.`);
      await ddb("PutItem", { TableName: table, Item: item });
      if (mode === "edit" && original) {
        const changed = t.KeySchema.some((k: any) => JSON.stringify(item[k.AttributeName]) !== JSON.stringify(original[k.AttributeName]));
        if (changed) await ddb("DeleteItem", { TableName: table, Key: original });
      }
      flash.notify({ type: "success", content: mode === "edit" ? "The item was saved successfully." : "The item was created successfully." });
      nav(exploreHref(table).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  if (data.loading && !data.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (data.error) return <ErrorAlert error={data.error} />;
  if (keyParam && !data.data?.item && mode !== "create") return <Alert type="warning" header="Item not found">The item no longer exists in {table}.</Alert>;

  return (
    <ContentLayout header={<Header variant="h1" description="You can add, remove, or edit the attributes of an item. You can nest attributes inside other attributes up to 32 levels deep.">{title}</Header>}>
      <SpaceBetween size="l">
        <ErrorAlert error={err} />
        {mode === "edit" && <Alert type="info">Changing a key attribute creates a new item and deletes the original.</Alert>}
        <Container header={<Header variant="h2"
          actions={<SpaceBetween direction="horizontal" size="xs" alignItems="center">
            {view === "json" && <Toggle checked={ddbJson} onChange={e => toggleDdb(e.detail.checked)}>View DynamoDB JSON</Toggle>}
            <SegmentedControl selectedId={view} onChange={e => switchView(e.detail.selectedId as any)} options={[{ id: "form", text: "Form" }, { id: "json", text: "JSON view" }]} />
          </SpaceBetween>}>Attributes</Header>}>
          {view === "form" ? (
            <Table variant="embedded" items={rows} trackBy={r => String(rows.indexOf(r))}
              columnDefinitions={[
                { id: "n", header: "Attribute name", width: 240, cell: r => r.key ? <SpaceBetween direction="horizontal" size="xxs"><b>{r.name}</b><Box variant="small" color="text-body-secondary">{data.data!.t.KeySchema.find((k: any) => k.AttributeName === r.name)?.KeyType === "HASH" ? "Partition key" : "Sort key"}</Box></SpaceBetween>
                  : <Input value={r.name} onChange={e => setRows(rows.map(x => x === r ? { ...x, name: e.detail.value } : x))} placeholder="Attribute name" /> },
                { id: "v", header: "Value", cell: r => r.type === "BOOL"
                  ? <Select selectedOption={{ value: r.value, label: r.value === "true" ? "True" : "False" }} options={[{ value: "true", label: "True" }, { value: "false", label: "False" }]} onChange={e => setRows(rows.map(x => x === r ? { ...x, value: e.detail.selectedOption.value! } : x))} />
                  : r.type === "NULL" ? <Box color="text-body-secondary">null</Box>
                    : ["L", "M", "SS", "NS", "BS"].includes(r.type) ? <Textarea rows={Math.min(8, r.value.split("\n").length + 1)} value={r.value} onChange={e => setRows(rows.map(x => x === r ? { ...x, value: e.detail.value } : x))} />
                      : <Input value={r.value} inputMode={r.type === "N" ? "decimal" : undefined} onChange={e => setRows(rows.map(x => x === r ? { ...x, value: e.detail.value } : x))} placeholder={r.type === "B" ? "Base64-encoded value" : "Enter value"} /> },
                { id: "t", header: "Type", width: 170, cell: r => r.key ? typeLabel(r.type)
                  : <Select selectedOption={TYPES.find(x => x.value === r.type)!} options={TYPES} onChange={e => setRows(rows.map(x => x === r ? { ...x, type: e.detail.selectedOption.value!, value: DEFAULTS[e.detail.selectedOption.value!] } : x))} /> },
                { id: "x", header: "", width: 90, cell: r => r.key ? null : <Button variant="inline-link" onClick={() => setRows(rows.filter(x => x !== r))}>Remove</Button> },
              ]}
              footer={<ButtonDropdown onItemClick={e => setRows([...rows, { name: "", type: e.detail.id, value: DEFAULTS[e.detail.id] }])} items={TYPES.map(x => ({ id: x.value, text: x.label }))}>Add new attribute</ButtonDropdown>}
            />
          ) : (
            <Textarea rows={22} value={json} onChange={e => setJson(e.detail.value)} spellcheck={false} />
          )}
        </Container>
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{mode === "edit" ? "Save" : "Create item"}</Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
