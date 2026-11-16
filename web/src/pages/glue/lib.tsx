import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, ACCOUNT, REGION } from "../../common";

export const glue = (op: string, p: Record<string, unknown> = {}) => api.call("glue", op, p);

/** Follows NextToken pagination. */
export async function glueAll(op: string, key: string, p: Record<string, unknown> = {}) {
  const out: any[] = []; let tok: string | undefined;
  do {
    const r = await glue(op, { ...p, ...(tok ? { NextToken: tok } : {}) });
    out.push(...(r[key] || [])); tok = r.NextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "AWS Glue", href: "#/glue/getting-started" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [CRUMB, ...rest.map(r => ({ text: r.text, href: r.href || "#" }))];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  SUCCEEDED: "success", READY: "success", ACTIVATED: "success", COMPLETED: "success", AVAILABLE: "success", PASS: "success", ACTIVE: "success",
  RUNNING: "in-progress", STARTING: "pending", STOPPING: "in-progress", WAITING: "pending", ACTIVATING: "in-progress", CREATING: "in-progress", PROVISIONING: "in-progress",
  DEACTIVATING: "in-progress", UPDATING: "in-progress", DELETING: "in-progress", PENDING: "pending", SCHEDULED: "info",
  STOPPED: "stopped", DEACTIVATED: "stopped", CREATED: "stopped", CANCELLED: "stopped", NOT_SCHEDULED: "stopped", TIMEOUT: "warning",
  FAILED: "error", ERROR: "error", FAIL: "error",
};
export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  return <StatusIndicator type={ST[s] || "info"}>{label}</StatusIndicator>;
}
export const fmt = (d?: string | number) => d ? new Date(d).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";
export const dur = (s?: number) => s === undefined || s === null ? "-" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} m ${s % 60} s`;
export const arn = (kind: string, id: string) => `arn:aws:glue:${REGION}:${ACCOUNT}:${kind}/${id}`;

// ---------------- script storage ----------------
export const ASSETS = `aws-glue-assets-${ACCOUNT}-${REGION}`;
export async function ensureAssets() {
  try { await api.call("s3", "HeadBucket", { Bucket: ASSETS }); }
  catch { await api.call("s3", "CreateBucket", { Bucket: ASSETS }); }
}
export const splitS3 = (uri: string) => { const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri || ""); return m ? { bucket: m[1], key: m[2] } : null; };
export async function readS3Text(uri: string) {
  const s = splitS3(uri);
  if (!s) return "";
  const r = await fetch(api.downloadUrl(s.bucket, s.key, { inline: true }), { headers: { "X-Emu-Console": "1" } });
  if (!r.ok) throw new Error(`Couldn't read ${uri} (${r.status})`);
  return r.text();
}
export async function writeS3Text(uri: string, text: string) {
  const s = splitS3(uri);
  if (!s) throw new Error(`Invalid S3 path: ${uri}`);
  await api.call("s3", "PutObject", { Bucket: s.bucket, Key: s.key, Body: text, ContentType: "text/x-python" });
}

// ---------------- IAM roles for Glue ----------------
const TRUST = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "glue.amazonaws.com" }, Action: "sts:AssumeRole" }] });
export const useGlueRoles = () => useAsync(async () => {
  const roles = (await api.call("iam", "ListRoles")).Roles || [];
  const trusts = (r: any) => { const d = typeof r.AssumeRolePolicyDocument === "string" ? decodeURIComponent(r.AssumeRolePolicyDocument) : JSON.stringify(r.AssumeRolePolicyDocument || {}); return d.includes("glue.amazonaws.com"); };
  return roles.sort((a: any, b: any) => Number(trusts(b)) - Number(trusts(a))).map((r: any) => ({ value: r.Arn, label: r.RoleName, description: trusts(r) ? "Trusts AWS Glue" : "Doesn't trust glue.amazonaws.com" }));
}, []);
/** Creates a role Glue can assume, with the Glue service policy and S3 access (IAM is enforced by the emulator). */
export async function createGlueRole(name: string) {
  const r = await api.call("iam", "CreateRole", { RoleName: name, AssumeRolePolicyDocument: TRUST, Description: "Created by Emulator Console for AWS Glue" });
  await api.call("iam", "AttachRolePolicy", { RoleName: name, PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole" });
  await api.call("iam", "AttachRolePolicy", { RoleName: name, PolicyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess" });
  return r.Role.Arn as string;
}

export const useDatabases = () => useAsync(async () => (await glueAll("GetDatabases", "DatabaseList")).map((d: any) => ({ value: d.Name, label: d.Name, description: d.Description })), []);
export const roleName = (a?: string) => a ? String(a).split("/").pop() : "-";

export const JOB_TYPE = (j: any) => j.Command?.Name === "pythonshell" ? "Python shell" : j.Command?.Name === "gluestreaming" ? "Spark Streaming" : j.Command?.Name === "glueray" ? "Ray" : "Spark";
