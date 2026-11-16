import { api } from "../../api";

export const ddb = (op: string, params: Record<string, unknown> = {}) => api.call("dynamodb", op, params);

export const tableHref = (t: string, tab?: string) => `#/dynamodb/tables/${encodeURIComponent(t)}${tab ? `?tab=${tab}` : ""}`;
export const exploreHref = (t?: string, index?: string) => `#/dynamodb/explore${t ? `?table=${encodeURIComponent(t)}${index ? `&index=${encodeURIComponent(index)}` : ""}` : ""}`;
export const editHref = (t: string, setting: string) => `#/dynamodb/tables/${encodeURIComponent(t)}/edit/${setting}`;

export async function listTableNames(): Promise<string[]> {
  const out: string[] = [];
  let start: string | undefined;
  do {
    const r: any = await ddb("ListTables", start ? { ExclusiveStartTableName: start } : {});
    out.push(...r.TableNames);
    start = r.LastEvaluatedTableName;
  } while (start);
  return out;
}
export async function describeAll() {
  const names = await listTableNames();
  return Promise.all(names.map(n => ddb("DescribeTable", { TableName: n }).then((r: any) => r.Table).catch(() => ({ TableName: n, TableStatus: "UNKNOWN", KeySchema: [], AttributeDefinitions: [] }))));
}

export const ATTR_TYPES = [{ value: "S", label: "String" }, { value: "N", label: "Number" }, { value: "B", label: "Binary" }];
export const typeLabel = (t?: string) => ATTR_TYPES.find(a => a.value === t)?.label || t || "-";

export function keyOf(t: any, type: "HASH" | "RANGE", schema = t.KeySchema) {
  const k = (schema || []).find((x: any) => x.KeyType === type);
  if (!k) return null;
  const at = (t.AttributeDefinitions || []).find((a: any) => a.AttributeName === k.AttributeName);
  return { name: k.AttributeName as string, type: at?.AttributeType as string };
}
export const keyLabel = (t: any, type: "HASH" | "RANGE", schema?: any) => {
  const k = keyOf(t, type, schema);
  return k ? `${k.name} (${typeLabel(k.type)})` : "-";
};
export const isOnDemand = (t: any) => t.BillingModeSummary?.BillingMode === "PAY_PER_REQUEST";
export const capacityMode = (t: any) => isOnDemand(t) ? "On-demand" : "Provisioned";
export const tableClassLabel = (c?: string) => c === "STANDARD_INFREQUENT_ACCESS" ? "DynamoDB Standard-IA" : "DynamoDB Standard";

// ---------------- AttributeValue <-> plain JSON ----------------
export function marshal(v: any): any {
  if (v === null || v === undefined) return { NULL: true };
  if (typeof v === "string") return { S: v };
  if (typeof v === "number") return { N: String(v) };
  if (typeof v === "boolean") return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(marshal) };
  if (typeof v === "object") {
    if (v instanceof Set) { const a = [...v]; return a.every(x => typeof x === "number") ? { NS: a.map(String) } : { SS: a.map(String) }; }
    const M: any = {}; for (const [k, x] of Object.entries(v)) M[k] = marshal(x); return { M };
  }
  return { S: String(v) };
}
export const marshalItem = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, marshal(v)]));
export function unmarshal(av: any): any {
  if (!av || typeof av !== "object") return av;
  if ("S" in av) return av.S;
  if ("N" in av) return Number(av.N);
  if ("BOOL" in av) return av.BOOL;
  if ("NULL" in av) return null;
  if ("L" in av) return av.L.map(unmarshal);
  if ("M" in av) return unmarshalItem(av.M);
  if ("SS" in av) return av.SS;
  if ("NS" in av) return av.NS.map(Number);
  if ("BS" in av) return av.BS;
  if ("B" in av) return typeof av.B === "string" ? av.B : av.B?.__base64__ ?? av.B;
  return av;
}
export const unmarshalItem = (item: Record<string, any>) => Object.fromEntries(Object.entries(item || {}).map(([k, v]) => [k, unmarshal(v)]));
export const avType = (av: any) => Object.keys(av || {})[0] || "S";
export function avPreview(av: any): string {
  if (!av) return "";
  const t = avType(av);
  if (t === "S" || t === "N") return String(av[t]);
  if (t === "BOOL") return String(av.BOOL);
  if (t === "NULL") return "null";
  if (t === "B") return "<binary>";
  return JSON.stringify(unmarshal(av));
}
export const keyFromItem = (item: Record<string, any>, t: any) =>
  Object.fromEntries((t.KeySchema || []).map((k: any) => [k.AttributeName, item[k.AttributeName]]));

export const STREAM_VIEWS = [
  { value: "KEYS_ONLY", label: "Key attributes only", description: "Only the key attributes of the modified item." },
  { value: "NEW_IMAGE", label: "New image", description: "The entire item, as it appears after it was modified." },
  { value: "OLD_IMAGE", label: "Old image", description: "The entire item, as it appeared before it was modified." },
  { value: "NEW_AND_OLD_IMAGES", label: "New and old images", description: "Both the new and the old images of the item." },
];
export const streamViewLabel = (v?: string) => STREAM_VIEWS.find(s => s.value === v)?.label || v || "-";

export function encryptionLabel(sse: any) {
  if (!sse || sse.Status === "DISABLED" || !sse.SSEType) return "Owned by Amazon DynamoDB";
  if (sse.KMSMasterKeyArn && !/alias\/aws\/dynamodb|aws\/dynamodb/.test(sse.KMSMasterKeyArn)) return "Stored in your account, and owned and managed by you (customer managed key)";
  return "AWS managed key (aws/dynamodb)";
}
