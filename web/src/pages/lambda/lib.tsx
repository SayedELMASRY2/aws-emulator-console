import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION, ACCOUNT } from "../../common";

export const lam = (op: string, p: Record<string, unknown> = {}) => api.call("lambda", op, p);

/** Follows Marker / NextMarker pagination for Lambda APIs */
export async function lamAll(op: string, key: string, p: Record<string, unknown> = {}) {
  const out: any[] = [];
  let marker: string | undefined;
  do {
    const r = await lam(op, { ...p, ...(marker ? { Marker: marker } : {}) });
    out.push(...(r[key] || []));
    marker = r.NextMarker || r.Marker;
  } while (marker);
  return out;
}

export const CRUMB = { text: "AWS Lambda", href: "#/lambda/functions" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  Active: "success",
  SUCCESS: "success",
  SUCCEEDED: "success",
  Pending: "in-progress",
  CREATING: "in-progress",
  Updating: "in-progress",
  Failed: "error",
  FAILED: "error",
  Inactive: "stopped",
  STOPPED: "stopped",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  return <StatusIndicator type={ST[s] || "info"}>{s}</StatusIndicator>;
}

export const fmt = (d?: string | number) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";

export function fmtBytes(bytes?: number) {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const LAMBDA_RUNTIMES = [
  { value: "python3.13", label: "Python 3.13 (recommended)" },
  { value: "python3.12", label: "Python 3.12" },
  { value: "python3.11", label: "Python 3.11" },
  { value: "nodejs22.x", label: "Node.js 22.x (recommended)" },
  { value: "nodejs20.x", label: "Node.js 20.x" },
];

export const LAMBDA_SAMPLES: Record<string, { file: string; handler: string; code: string }> = {
  python: {
    file: "index.py",
    handler: "index.handler",
    code: `import json

def handler(event, context):
    print("Received event:", json.dumps(event))
    name = event.get("name", "World") if isinstance(event, dict) else "World"
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": f"Hello, {name} from local AWS Lambda!"})
    }
`,
  },
  nodejs: {
    file: "index.mjs",
    handler: "index.handler",
    code: `export const handler = async (event, context) => {
  console.log("Received event:", JSON.stringify(event));
  const name = (typeof event === "object" && event?.name) ? event.name : "World";
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: \`Hello, \${name} from local AWS Lambda!\` })
  };
};
`,
  },
};

export const langForRuntime = (rt?: string) => (rt && rt.startsWith("node") ? "nodejs" : "python");

export function decodeLogs(b64?: string) {
  if (!b64) return "";
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    try {
      return atob(b64);
    } catch {
      return b64;
    }
  }
}

export async function deployLambdaCode(b: {
  name: string;
  code: string;
  runtime?: string;
  handler?: string;
  filename?: string;
  update?: boolean;
  timeout?: number;
  memory?: number;
  env?: Record<string, string>;
  role?: string;
}) {
  const res = await api.req<{ result: any }>("POST", "/api/lambda/code", b);
  return res.result;
}
