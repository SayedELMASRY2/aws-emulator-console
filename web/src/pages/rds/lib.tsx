import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator";
import { api } from "../../api";
import { useAsync, ACCOUNT, REGION } from "../../common";

export const rds = (op: string, p: Record<string, unknown> = {}) => api.call("rds", op, p);

/** Follows Marker pagination for any Describe* call. */
export async function rdsAll(op: string, key: string, p: Record<string, unknown> = {}) {
  const out: any[] = []; let marker: string | undefined;
  do {
    const r = await rds(op, { ...p, ...(marker ? { Marker: marker } : {}) });
    out.push(...(r[key] || [])); marker = r.Marker;
  } while (marker);
  return out;
}

export const arn = (kind: string, id: string) => `arn:aws:rds:${REGION}:${ACCOUNT}:${kind}:${id}`;
export const dbHref = (id: string) => `#/rds/databases/instance/${encodeURIComponent(id)}`;
export const clusterHref = (id: string) => `#/rds/databases/cluster/${encodeURIComponent(id)}`;
export const CRUMB = { text: "RDS", href: "#/rds/dashboard" };
export const crumbs = (...rest: { text: string; href?: string }[]) => [CRUMB, ...rest.map(r => ({ text: r.text, href: r.href || "#" }))];

const ST: Record<string, StatusIndicatorProps.Type> = {
  available: "success", active: "success", Complete: "success", "in-sync": "success", AVAILABLE: "success", COMPLETE: "success", complete: "success",
  creating: "in-progress", modifying: "in-progress", "backing-up": "in-progress", rebooting: "in-progress", starting: "in-progress", stopping: "in-progress",
  deleting: "in-progress", "failing-over": "in-progress", upgrading: "in-progress", renaming: "in-progress", copying: "in-progress", "storage-optimization": "in-progress",
  "configuring-enhanced-monitoring": "in-progress", migrating: "in-progress", promoting: "in-progress", PROVISIONING: "in-progress", STARTING: "in-progress",
  IN_PROGRESS: "in-progress", "pending-reboot": "pending", pending: "pending", PENDING: "pending", SWITCHOVER_IN_PROGRESS: "in-progress",
  stopped: "stopped", inactive: "stopped", DELETING: "in-progress", CANCELED: "stopped",
  failed: "error", "incompatible-parameters": "error", "incompatible-network": "error", "incompatible-restore": "error", "incompatible-option-group": "error",
  "inaccessible-encryption-credentials": "error", "storage-full": "warning", FAILED: "error", "INVALID_CONFIGURATION": "error",
};
export function Status({ s }: { s?: string }) {
  if (!s) return <>-</>;
  const label = /^[A-Z_]+$/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
  return <StatusIndicator type={ST[s] || "info"}>{label}</StatusIndicator>;
}

export type EngineKey = "aurora-mysql" | "aurora-postgresql" | "mysql" | "mariadb" | "postgres" | "oracle-ee" | "sqlserver-ex" | "db2-se";
export const ENGINES: { key: EngineKey; label: string; family: string; aurora?: boolean; port: number; user: string; editions?: { value: string; label: string }[] }[] = [
  { key: "aurora-mysql", label: "Aurora (MySQL Compatible)", family: "Aurora MySQL", aurora: true, port: 3306, user: "admin" },
  { key: "aurora-postgresql", label: "Aurora (PostgreSQL Compatible)", family: "Aurora PostgreSQL", aurora: true, port: 5432, user: "postgres" },
  { key: "mysql", label: "MySQL", family: "MySQL", port: 3306, user: "admin" },
  { key: "postgres", label: "PostgreSQL", family: "PostgreSQL", port: 5432, user: "postgres" },
  { key: "mariadb", label: "MariaDB", family: "MariaDB", port: 3306, user: "admin" },
  { key: "oracle-ee", label: "Oracle", family: "Oracle", port: 1521, user: "admin", editions: [{ value: "oracle-ee", label: "Oracle Enterprise Edition" }, { value: "oracle-se2", label: "Oracle Standard Edition Two" }] },
  { key: "sqlserver-ex", label: "Microsoft SQL Server", family: "SQL Server", port: 1433, user: "admin", editions: [{ value: "sqlserver-ex", label: "SQL Server Express Edition" }, { value: "sqlserver-web", label: "SQL Server Web Edition" }, { value: "sqlserver-se", label: "SQL Server Standard Edition" }, { value: "sqlserver-ee", label: "SQL Server Enterprise Edition" }] },
  { key: "db2-se", label: "IBM Db2", family: "Db2", port: 50000, user: "admin", editions: [{ value: "db2-se", label: "Db2 Standard Edition" }, { value: "db2-ae", label: "Db2 Advanced Edition" }] },
];
export function engineLabel(e?: string) {
  if (!e) return "-";
  const m: Record<string, string> = {
    "aurora-mysql": "Aurora MySQL", "aurora-postgresql": "Aurora PostgreSQL", mysql: "MySQL Community", postgres: "PostgreSQL", mariadb: "MariaDB",
    "oracle-ee": "Oracle Enterprise Edition", "oracle-se2": "Oracle Standard Edition Two", "sqlserver-ex": "SQL Server Express Edition", "sqlserver-web": "SQL Server Web Edition",
    "sqlserver-se": "SQL Server Standard Edition", "sqlserver-ee": "SQL Server Enterprise Edition", "db2-se": "Db2 Standard Edition", "db2-ae": "Db2 Advanced Edition",
  };
  return m[e] || e;
}
export const isAurora = (e?: string) => !!e && e.startsWith("aurora");
export const isMysqlish = (e?: string) => !!e && /mysql|mariadb/.test(e);
export const isPg = (e?: string) => !!e && /postgres/.test(e);

/** Shell command that connects to a local endpoint (the emulator runs real MySQL/PostgreSQL servers). */
export function connectCmd(engine: string | undefined, host: string, port: number | string, user: string, db?: string) {
  if (isPg(engine)) return `psql "host=${host} port=${port} user=${user} dbname=${db || "postgres"}"`;
  if (isMysqlish(engine)) return `mysql -h ${host} -P ${port} -u ${user} -p${db ? ` ${db}` : ""}`;
  return `${host}:${port}`;
}

export const STORAGE_TYPES = [
  { value: "gp3", label: "General Purpose SSD (gp3)" }, { value: "gp2", label: "General Purpose SSD (gp2)" },
  { value: "io2", label: "Provisioned IOPS SSD (io2)" }, { value: "io1", label: "Provisioned IOPS SSD (io1)" }, { value: "standard", label: "Magnetic" },
];
export const storageLabel = (t?: string) => STORAGE_TYPES.find(s => s.value === t)?.label || t || "-";

export const CLASSES: Record<string, string[]> = {
  burstable: ["db.t3.micro", "db.t3.small", "db.t3.medium", "db.t3.large", "db.t3.xlarge", "db.t3.2xlarge", "db.t4g.micro", "db.t4g.small", "db.t4g.medium", "db.t4g.large"],
  standard: ["db.m5.large", "db.m5.xlarge", "db.m5.2xlarge", "db.m5.4xlarge", "db.m6g.large", "db.m6g.xlarge", "db.m6i.large", "db.m6i.xlarge", "db.m7g.large", "db.m7g.xlarge"],
  memory: ["db.r5.large", "db.r5.xlarge", "db.r5.2xlarge", "db.r6g.large", "db.r6g.xlarge", "db.r6g.2xlarge", "db.r6i.large", "db.r7g.large", "db.r7g.xlarge", "db.x2g.large"],
};
const SPECS: Record<string, [number, number]> = { micro: [2, 1], small: [2, 2], medium: [2, 4], large: [2, 8], xlarge: [4, 16], "2xlarge": [8, 32], "4xlarge": [16, 64] };
export function classSpec(c?: string) {
  if (!c) return "";
  const size = c.split(".").pop() || "";
  const [v, m] = SPECS[size] || [0, 0];
  const mem = /\.r|\.x2/.test(c) ? m * 2 : /\.t/.test(c) && size === "large" ? 8 : m;
  return v ? `${v} vCPUs · ${mem} GiB RAM` : "";
}

// ---------------- pickers ----------------
export const useSubnetGroups = () => useAsync(async () => (await rdsAll("DescribeDBSubnetGroups", "DBSubnetGroups"))
  .map((g: any) => ({ value: g.DBSubnetGroupName, label: g.DBSubnetGroupName, description: `${g.VpcId} · ${(g.Subnets || []).length} subnets`, raw: g })), []);
export const useParamGroups = (family?: string, cluster = false) => useAsync(async () => {
  if (!family) return [];
  const l = cluster ? await rdsAll("DescribeDBClusterParameterGroups", "DBClusterParameterGroups") : await rdsAll("DescribeDBParameterGroups", "DBParameterGroups");
  return l.filter((g: any) => g.DBParameterGroupFamily === family).map((g: any) => ({ value: cluster ? g.DBClusterParameterGroupName : g.DBParameterGroupName, label: cluster ? g.DBClusterParameterGroupName : g.DBParameterGroupName, description: g.Description }));
}, [family, cluster]);
export const useOptionGroups = (engine?: string, major?: string) => useAsync(async () => {
  if (!engine) return [];
  return (await rdsAll("DescribeOptionGroups", "OptionGroupsList", { EngineName: engine })).filter((g: any) => !major || g.MajorEngineVersion === major)
    .map((g: any) => ({ value: g.OptionGroupName, label: g.OptionGroupName, description: g.OptionGroupDescription }));
}, [engine, major]);
export const useEngineVersions = (engine?: string) => useAsync(async () => engine ? (await rdsAll("DescribeDBEngineVersions", "DBEngineVersions", { Engine: engine })) : [], [engine]);
export const useInstances = () => useAsync(() => rdsAll("DescribeDBInstances", "DBInstances"), []);

export function majorOf(engine: string, version?: string) {
  if (!version) return undefined;
  if (isAurora(engine)) return engine === "aurora-mysql" ? version.split(".").slice(0, 2).join(".").replace(/\.mysql_aurora.*/, "") : version.split(".")[0];
  const p = version.split(".");
  return engine === "postgres" ? p[0] : p.slice(0, 2).join(".");
}

export const fmtWhen = (d?: string | number) => d ? new Date(d).toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
export const yesNo = (b?: boolean) => b ? "Yes" : "No";
export const enabled = (b?: boolean) => b ? "Enabled" : "Disabled";
