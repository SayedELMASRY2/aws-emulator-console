import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, REGION } from "../../common";

export const ec = (op: string, p: Record<string, unknown> = {}) => api.call("elasticache", op, p);

/** Follows Marker pagination for ElastiCache APIs */
export async function ecAll(op: string, key: string, p: Record<string, unknown> = {}, markerKey = "Marker") {
  const out: any[] = [];
  let marker: string | undefined;
  do {
    const r = await ec(op, { ...p, ...(marker ? { [markerKey]: marker } : {}) });
    out.push(...(r[key] || []));
    marker = r[markerKey];
  } while (marker);
  return out;
}

export const CRUMB = { text: "Amazon ElastiCache", href: "#/elasticache/dashboard" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [
  CRUMB,
  ...rest.map(r => ({ text: r.text, href: r.href || "#" })),
];
export const enc = encodeURIComponent;

const ST: Record<string, StatusIndicatorProps.Type> = {
  available: "success",
  creating: "in-progress",
  modifying: "in-progress",
  deleting: "in-progress",
  rebooting: "in-progress",
  incompatible_network: "error",
  restore_failed: "error",
};

export function St({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
  return <StatusIndicator type={ST[s.toLowerCase()] || "info"}>{label}</StatusIndicator>;
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

export function redisCliCmd(host: string, port: number | string) {
  return `redis-cli -h ${host} -p ${port}`;
}

export function memcachedTelnetCmd(host: string, port: number | string) {
  return `nc -v ${host} ${port}`;
}

export const CACHE_NODE_TYPES = [
  { value: "cache.t3.micro", label: "cache.t3.micro (2 vCPU, 0.5 GiB - standard)" },
  { value: "cache.t3.small", label: "cache.t3.small (2 vCPU, 1.37 GiB)" },
  { value: "cache.t3.medium", label: "cache.t3.medium (2 vCPU, 3.09 GiB)" },
  { value: "cache.t4g.micro", label: "cache.t4g.micro (Graviton2, 2 vCPU, 0.5 GiB)" },
  { value: "cache.m5.large", label: "cache.m5.large (2 vCPU, 6.38 GiB)" },
  { value: "cache.m6g.large", label: "cache.m6g.large (Graviton2, 2 vCPU, 6.38 GiB)" },
];

export function useSubnetGroups() {
  return useAsync(async () => {
    try {
      const res = await ecAll("DescribeCacheSubnetGroups", "CacheSubnetGroups");
      return res.map((g: any) => ({
        value: g.CacheSubnetGroupName,
        label: g.CacheSubnetGroupName,
        description: g.CacheSubnetGroupDescription,
      }));
    } catch {
      return [];
    }
  });
}

export function useParameterGroups(engine?: string) {
  return useAsync(async () => {
    try {
      const res = await ecAll("DescribeCacheParameterGroups", "CacheParameterGroups");
      let list = res || [];
      if (engine) {
        list = list.filter((p: any) => p.CacheParameterGroupFamily.startsWith(engine.toLowerCase()));
      }
      return list.map((p: any) => ({
        value: p.CacheParameterGroupName,
        label: p.CacheParameterGroupName,
        family: p.CacheParameterGroupFamily,
      }));
    } catch {
      return [];
    }
  }, [engine]);
}
