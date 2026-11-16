import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import Link from "@cloudscape-design/components/link";
import { api } from "../../api";
import { useAsync } from "../../common";

export const ec2 = (op: string, p: Record<string, unknown> = {}) => api.call("ec2", op, p);
export const elb = (op: string, p: Record<string, unknown> = {}) => api.call("elbv2", op, p);
export const asg = (op: string, p: Record<string, unknown> = {}) => api.call("autoscaling", op, p);

export const tagsOf = (t?: { Key: string; Value: string }[]) => Object.fromEntries((t || []).map(x => [x.Key, x.Value]));
export const nameOf = (x: any) => tagsOf(x?.Tags).Name || "";
export const tagSpec = (type: string, name?: string, extra: { Key: string; Value: string }[] = []) => {
  const tags = [...(name ? [{ Key: "Name", Value: name }] : []), ...extra.filter(t => t.Key && t.Key !== "Name")];
  return tags.length ? [{ ResourceType: type, Tags: tags }] : undefined;
};

const STATE: Record<string, StatusIndicatorProps.Type> = {
  running: "success", available: "success", active: "success", "in-use": "info", completed: "success", attached: "success", healthy: "success", InService: "success", fulfilled: "success",
  pending: "pending", provisioning: "pending", creating: "pending", attaching: "pending", "shutting-down": "pending", stopping: "pending", deleting: "pending", initial: "pending", "Pending": "pending", open: "pending",
  stopped: "stopped", terminated: "stopped", deleted: "stopped", detached: "stopped", draining: "stopped", unused: "stopped", cancelled: "stopped", closed: "stopped",
  error: "error", failed: "error", unhealthy: "error", "impaired": "error",
};
export function State({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
  return <StatusIndicator type={STATE[s] || "info"}>{label}</StatusIndicator>;
}
export const fmt = (d?: string) => d ? new Date(d).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";

export const instHref = (id: string) => `#/ec2/instances/${id}`;
export const sgHref = (id: string) => `#/ec2/security-groups/${id}`;
export const IdLink = ({ href, id }: { href: string; id?: string }) => id ? <Link href={href}>{id}</Link> : <>-</>;

// ---------------- shared pickers ----------------
export const useVpcs = () => useAsync(async () => ((await ec2("DescribeVpcs")).Vpcs || []).map((v: any) => ({ value: v.VpcId, label: `${v.VpcId}${nameOf(v) ? ` (${nameOf(v)})` : ""}`, description: `${v.CidrBlock}${v.IsDefault ? " · default" : ""}`, raw: v })), []);
export const useSubnets = (vpc?: string) => useAsync(async () => ((await ec2("DescribeSubnets", vpc ? { Filters: [{ Name: "vpc-id", Values: [vpc] }] } : {})).Subnets || [])
  .map((s: any) => ({ value: s.SubnetId, label: `${s.SubnetId}${nameOf(s) ? ` (${nameOf(s)})` : ""}`, description: `${s.AvailabilityZone} · ${s.CidrBlock} · ${s.VpcId}`, raw: s })), [vpc]);
export const useSgs = (vpc?: string) => useAsync(async () => ((await ec2("DescribeSecurityGroups", vpc ? { Filters: [{ Name: "vpc-id", Values: [vpc] }] } : {})).SecurityGroups || [])
  .map((g: any) => ({ value: g.GroupId, label: g.GroupName, description: `${g.GroupId} · ${g.VpcId}`, raw: g })), [vpc]);
export const useKeyPairs = () => useAsync(async () => ((await ec2("DescribeKeyPairs")).KeyPairs || []).map((k: any) => ({ value: k.KeyName, label: k.KeyName, description: k.KeyType })), []);
export const useProfiles = () => useAsync(async () => ((await api.call("iam", "ListInstanceProfiles")).InstanceProfiles || []).map((p: any) => ({ value: p.Arn, label: p.InstanceProfileName, description: (p.Roles || []).map((r: any) => r.RoleName).join(", ") })), []);
export const AZS = ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d", "us-east-1e", "us-east-1f"];

export async function allInstances(filters?: any[]) {
  const out: any[] = [];
  let token: string | undefined;
  do {
    const r = await ec2("DescribeInstances", { ...(filters ? { Filters: filters } : {}), ...(token ? { NextToken: token } : {}) });
    (r.Reservations || []).forEach((x: any) => out.push(...x.Instances));
    token = r.NextToken;
  } while (token);
  return out;
}

export const VOLUME_TYPES = [
  { value: "gp3", label: "General Purpose SSD (gp3)" }, { value: "gp2", label: "General Purpose SSD (gp2)" },
  { value: "io2", label: "Provisioned IOPS SSD (io2)" }, { value: "io1", label: "Provisioned IOPS SSD (io1)" },
  { value: "st1", label: "Throughput Optimized HDD (st1)" }, { value: "sc1", label: "Cold HDD (sc1)" }, { value: "standard", label: "Magnetic (standard)" },
];
export const PROTOCOLS: Record<string, { proto: string; port?: [number, number] }> = {
  "Custom TCP": { proto: "tcp" }, "Custom UDP": { proto: "udp" }, "Custom ICMP - IPv4": { proto: "icmp", port: [-1, -1] }, "All traffic": { proto: "-1", port: [-1, -1] },
  "All TCP": { proto: "tcp", port: [0, 65535] }, "All UDP": { proto: "udp", port: [0, 65535] }, "SSH": { proto: "tcp", port: [22, 22] }, "HTTP": { proto: "tcp", port: [80, 80] },
  "HTTPS": { proto: "tcp", port: [443, 443] }, "RDP": { proto: "tcp", port: [3389, 3389] }, "MySQL/Aurora": { proto: "tcp", port: [3306, 3306] },
  "PostgreSQL": { proto: "tcp", port: [5432, 5432] }, "Redis": { proto: "tcp", port: [6379, 6379] }, "MSSQL": { proto: "tcp", port: [1433, 1433] },
  "DNS (TCP)": { proto: "tcp", port: [53, 53] }, "DNS (UDP)": { proto: "udp", port: [53, 53] }, "NFS": { proto: "tcp", port: [2049, 2049] }, "Custom protocol": { proto: "" },
};
export function ruleTypeOf(p: any): string {
  const from = p.FromPort, to = p.ToPort, proto = p.IpProtocol;
  for (const [k, v] of Object.entries(PROTOCOLS)) if (v.port && v.proto === proto && v.port[0] === from && v.port[1] === to) return k;
  if (proto === "tcp") return "Custom TCP";
  if (proto === "udp") return "Custom UDP";
  if (proto === "icmp") return "Custom ICMP - IPv4";
  if (proto === "-1") return "All traffic";
  return "Custom protocol";
}
export const portRange = (p: any) => p.IpProtocol === "-1" ? "All" : p.FromPort === undefined || p.FromPort === -1 ? "All" : p.FromPort === p.ToPort ? String(p.FromPort) : `${p.FromPort} - ${p.ToPort}`;
export const protoLabel = (p: string) => p === "-1" ? "All" : p.toUpperCase();

// All instance types (paginated), cached for the session.
let typesCache: Promise<any[]> | null = null;
export function allInstanceTypes(): Promise<any[]> {
  if (!typesCache) typesCache = (async () => {
    const out: any[] = []; let tok: string | undefined;
    do { const r = await ec2("DescribeInstanceTypes", { MaxResults: 100, ...(tok ? { NextToken: tok } : {}) }); out.push(...(r.InstanceTypes || [])); tok = r.NextToken; } while (tok);
    return out.sort((a, b) => a.InstanceType.localeCompare(b.InstanceType, undefined, { numeric: true }));
  })().catch(e => { typesCache = null; throw e; });
  return typesCache;
}
