import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { REGION, ACCOUNT } from "../../common";

export const ecr = (op: string, p: Record<string, unknown> = {}) => api.call("ecr", op, p);

/** Follows nextToken pagination for ECR APIs */
export async function ecrAll(op: string, key: string, p: Record<string, unknown> = {}, tokKey = "nextToken") {
  const out: any[] = [];
  let tok: string | undefined;
  do {
    const r = await ecr(op, { ...p, ...(tok ? { [tokKey]: tok } : {}) });
    out.push(...(r[key] || []));
    tok = r[tokKey] || r.NextToken;
  } while (tok);
  return out;
}

export const CRUMB = { text: "Amazon ECR", href: "#/ecr/repositories" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" }))
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  AVAILABLE: "success",
  ACTIVE: "success",
  COMPLETE: "success",
  PASSED: "success",
  IN_PROGRESS: "in-progress",
  SCANNING: "in-progress",
  PENDING: "pending",
  FAILED: "error",
  UNSUPPORTED: "warning",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  return <StatusIndicator type={ST[s] || "info"}>{label}</StatusIndicator>;
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function pushCommands(repoUri: string, repoName: string) {
  const host = repoUri.split("/")[0] || `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com`;
  return [
    {
      title: "1. Retrieve an authentication token and authenticate your Docker client to your registry",
      cmd: `aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${host}`,
    },
    {
      title: "2. Build your Docker image using the following command",
      cmd: `docker build -t ${repoName} .`,
    },
    {
      title: "3. After the build completes, tag your image so you can push it to this repository",
      cmd: `docker tag ${repoName}:latest ${repoUri}:latest`,
    },
    {
      title: "4. Run the following command to push this image to your AWS repository",
      cmd: `docker push ${repoUri}:latest`,
    },
  ];
}
