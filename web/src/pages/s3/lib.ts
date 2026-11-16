import { api, isNotConfigured } from "../../api";

export const s3 = (op: string, params: Record<string, unknown> = {}) => api.call("s3", op, params);

/** Run a Get* call; return `fallback` when the configuration doesn't exist. */
export async function getOr<T>(op: string, params: Record<string, unknown>, fallback: T): Promise<T | any> {
  try { return await s3(op, params); }
  catch (e) { if (isNotConfigured(e)) return fallback; throw e; }
}

export const bucketHref = (b: string, tab?: string, prefix?: string) => {
  const p = new URLSearchParams();
  if (tab) p.set("tab", tab);
  if (prefix) p.set("prefix", prefix);
  const qs = p.toString();
  return `#/s3/buckets/${encodeURIComponent(b)}${qs ? "?" + qs : ""}`;
};
export const objectHref = (b: string, key: string, versionId?: string) =>
  `#/s3/buckets/${encodeURIComponent(b)}/object?${new URLSearchParams({ key, ...(versionId ? { versionId } : {}) })}`;
export const editHref = (b: string, setting: string, extra?: Record<string, string>) =>
  `#/s3/buckets/${encodeURIComponent(b)}/edit/${setting}${extra ? "?" + new URLSearchParams(extra) : ""}`;

export const s3Uri = (b: string, key = "") => `s3://${b}/${key}`;
export const bucketArn = (b: string) => `arn:aws:s3:::${b}`;
export const objectArn = (b: string, k: string) => `arn:aws:s3:::${b}/${k}`;
export const objectUrl = (b: string, k: string) => `https://${b}.s3.us-east-1.amazonaws.com/${k.split("/").map(encodeURIComponent).join("/")}`;

export const STORAGE_CLASSES = [
  { value: "STANDARD", label: "Standard", desc: "Frequently accessed data (more than once a month) with milliseconds access", az: "≥ 3", min: "-", minSize: "-" },
  { value: "INTELLIGENT_TIERING", label: "Intelligent-Tiering", desc: "Data with changing or unknown access patterns", az: "≥ 3", min: "-", minSize: "-" },
  { value: "STANDARD_IA", label: "Standard-IA", desc: "Infrequently accessed data (once a month) with milliseconds access", az: "≥ 3", min: "30 days", minSize: "128 KB" },
  { value: "ONEZONE_IA", label: "One Zone-IA", desc: "Recreatable, infrequently accessed data (once a month) stored in a single Availability Zone with milliseconds access", az: "1", min: "30 days", minSize: "128 KB" },
  { value: "GLACIER_IR", label: "Glacier Instant Retrieval", desc: "Long-lived archive data accessed once a quarter with instant retrieval in milliseconds", az: "≥ 3", min: "90 days", minSize: "128 KB" },
  { value: "GLACIER", label: "Glacier Flexible Retrieval", desc: "Long-lived archive data accessed once a year with retrieval of minutes to hours", az: "≥ 3", min: "90 days", minSize: "-" },
  { value: "DEEP_ARCHIVE", label: "Glacier Deep Archive", desc: "Long-lived archive data accessed less than once a year with retrieval of hours", az: "≥ 3", min: "180 days", minSize: "-" },
  { value: "REDUCED_REDUNDANCY", label: "Reduced redundancy", desc: "Noncritical, frequently accessed data with milliseconds access (not recommended as S3 Standard is more cost effective)", az: "≥ 3", min: "-", minSize: "-" },
];
export const storageClassLabel = (v?: string) => STORAGE_CLASSES.find(s => s.value === (v || "STANDARD"))?.label || v || "Standard";
export const TRANSITION_CLASSES = ["STANDARD_IA", "INTELLIGENT_TIERING", "ONEZONE_IA", "GLACIER_IR", "GLACIER", "DEEP_ARCHIVE"];

export const isFolder = (key: string) => key.endsWith("/");
export const baseName = (key: string, prefix = "") => key.slice(prefix.length);

export async function listAllObjects(bucket: string, prefix = "") {
  const out: any[] = [];
  let token: string | undefined;
  do {
    const r: any = await s3("ListObjectsV2", { Bucket: bucket, Prefix: prefix, ContinuationToken: token });
    out.push(...(r.Contents || []));
    token = r.NextContinuationToken;
  } while (token);
  return out;
}

export async function listAllVersions(bucket: string, prefix = "") {
  const out: any[] = [];
  let km: string | undefined, vm: string | undefined;
  do {
    const r: any = await s3("ListObjectVersions", { Bucket: bucket, Prefix: prefix, KeyMarker: km, VersionIdMarker: vm });
    (r.Versions || []).forEach((v: any) => out.push({ ...v, deleteMarker: false }));
    (r.DeleteMarkers || []).forEach((v: any) => out.push({ ...v, deleteMarker: true }));
    km = r.IsTruncated ? r.NextKeyMarker : undefined;
    vm = r.IsTruncated ? r.NextVersionIdMarker : undefined;
  } while (km);
  return out;
}

/** Delete every object (and every version, when versioned) under a prefix. */
export async function emptyPrefix(bucket: string, prefix = "") {
  const all = await listAllVersions(bucket, prefix).catch(() => [] as any[]);
  const ids = all.length
    ? all.map(v => ({ Key: v.Key, VersionId: v.VersionId }))
    : (await listAllObjects(bucket, prefix)).map(o => ({ Key: o.Key }));
  for (let i = 0; i < ids.length; i += 1000) {
    await s3("DeleteObjects", { Bucket: bucket, Delete: { Objects: ids.slice(i, i + 1000), Quiet: true } });
  }
  return ids.length;
}

export async function folderStats(bucket: string, prefix: string) {
  const objs = await listAllObjects(bucket, prefix);
  return { count: objs.filter(o => !isFolder(o.Key)).length, size: objs.reduce((a, o) => a + (o.Size || 0), 0) };
}

export type KV = { key: string; value: string; existing?: boolean; markedForRemoval?: boolean };
export const toTagSet = (tags: KV[]) => tags.filter(t => !t.markedForRemoval && t.key).map(t => ({ Key: t.key, Value: t.value }));
export const fromTagSet = (ts?: { Key: string; Value: string }[]): KV[] => (ts || []).map(t => ({ key: t.Key, value: t.Value, existing: true }));

export const DEFAULT_POLICY_TEMPLATE = (b: string) => JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Sid: "DenyInsecureTransport", Effect: "Deny", Principal: "*", Action: "s3:*",
    Resource: [bucketArn(b), `${bucketArn(b)}/*`],
    Condition: { Bool: { "aws:SecureTransport": "false" } },
  }],
}, null, 2);

export const EVENT_TYPES: { group: string; items: { value: string; label: string }[] }[] = [
  { group: "Object creation", items: [
    { value: "s3:ObjectCreated:*", label: "All object create events" },
    { value: "s3:ObjectCreated:Put", label: "Put" }, { value: "s3:ObjectCreated:Post", label: "Post" },
    { value: "s3:ObjectCreated:Copy", label: "Copy" }, { value: "s3:ObjectCreated:CompleteMultipartUpload", label: "Multipart upload completed" },
  ] },
  { group: "Object removal", items: [
    { value: "s3:ObjectRemoved:*", label: "All object removal events" },
    { value: "s3:ObjectRemoved:Delete", label: "Permanently deleted" }, { value: "s3:ObjectRemoved:DeleteMarkerCreated", label: "Delete marker created" },
  ] },
  { group: "Object restore", items: [
    { value: "s3:ObjectRestore:*", label: "All restore object events" },
    { value: "s3:ObjectRestore:Post", label: "Restore initiated" }, { value: "s3:ObjectRestore:Completed", label: "Restore completed" },
    { value: "s3:ObjectRestore:Delete", label: "Restored object expired" },
  ] },
  { group: "Object ACL", items: [{ value: "s3:ObjectAcl:Put", label: "Object ACL events" }] },
  { group: "Object tagging", items: [{ value: "s3:ObjectTagging:*", label: "All object tagging events" }, { value: "s3:ObjectTagging:Put", label: "Object tags added" }, { value: "s3:ObjectTagging:Delete", label: "Object tags deleted" }] },
  { group: "Lifecycle", items: [{ value: "s3:LifecycleTransition", label: "Lifecycle transition" }, { value: "s3:LifecycleExpiration:*", label: "All lifecycle expiration events" }] },
  { group: "Intelligent-Tiering", items: [{ value: "s3:IntelligentTiering", label: "Archive access tier transitions" }] },
  { group: "Replication", items: [{ value: "s3:Replication:*", label: "All replication events" }] },
  { group: "Reduced Redundancy Storage", items: [{ value: "s3:ReducedRedundancyLostObject", label: "Object in RRS lost" }] },
];

export function grantLabel(g: any) {
  const gr = g.Grantee || {};
  if (gr.URI?.endsWith("AllUsers")) return "Everyone (public access)";
  if (gr.URI?.endsWith("AuthenticatedUsers")) return "Authenticated users group (anyone with an AWS account)";
  if (gr.URI?.endsWith("LogDelivery")) return "S3 log delivery group";
  return gr.DisplayName ? `Bucket owner (your AWS account) · ${gr.DisplayName}` : gr.ID ? `Canonical ID ${String(gr.ID).slice(0, 16)}…` : gr.EmailAddress || "-";
}
