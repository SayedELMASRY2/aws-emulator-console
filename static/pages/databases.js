"use strict";

navGroup("Databases", [
  { path: "/rds", label: "RDS & Aurora", keywords: "postgres mysql mariadb aurora relational sql" },
  { path: "/elasticache", label: "ElastiCache", keywords: "redis valkey memcached cache" },
  { path: "/redshift", label: "Redshift", keywords: "warehouse" },
  { path: "/docdb", label: "DocumentDB", keywords: "mongo document" },
  { path: "/neptune", label: "Neptune", keywords: "graph" },
]);

const RDS_ENGINES = [
  { value: "postgres", label: "PostgreSQL", port: 5432, v: "17" },
  { value: "mysql", label: "MySQL", port: 3306, v: "8.4" },
  { value: "mariadb", label: "MariaDB", port: 3306, v: "11.4" },
  { value: "aurora-postgresql", label: "Aurora PostgreSQL", port: 5432, v: "16", cluster: true },
  { value: "aurora-mysql", label: "Aurora MySQL", port: 3306, v: "8.0", cluster: true },
];
const DB_CLASSES = ["db.t3.micro", "db.t3.small", "db.t4g.micro", "db.t4g.medium", "db.m6g.large", "db.r6g.large", "db.serverless"];

async function dbSubnetGroupOptions() {
  const r = await API.call("rds", "DescribeDBSubnetGroups");
  return r.DBSubnetGroups.map(g => ({ value: g.DBSubnetGroupName, label: `${g.DBSubnetGroupName} · ${g.VpcId}` }));
}
function connString(engine, host, port, user, db) {
  if (!host) return "";
  if (/postgres/.test(engine)) return `postgresql://${user || "USER"}:PASSWORD@${host}:${port}/${db || "postgres"}`;
  return `mysql://${user || "USER"}:PASSWORD@${host}:${port}/${db || ""}`;
}

route("/rds", async ({ tab }) => {
  const page = h("div", pageHeader("RDS & Aurora", "Relational databases: PostgreSQL, MySQL, MariaDB and Aurora."));
  page.appendChild(h("div", { class: "note" },
    "Instances get a local endpoint such as 127.0.0.1:<port>. Open an instance to see its connection string and point your database client at it."));

  const instances = () => {
    const panel = resourcePanel({
      title: "DB instances",
      rowKey: "DBInstanceIdentifier",
      load: async () => API.all("rds", "DescribeDBInstances", {}, "DBInstances", "Marker"),
      columns: [
        { label: "Identifier", render: d => h("a", { href: `#/rds/i/${encodeURIComponent(d.DBInstanceIdentifier)}` }, d.DBInstanceIdentifier) },
        { label: "Status", render: d => badge(d.DBInstanceStatus) },
        { label: "Engine", render: d => `${d.Engine} ${d.EngineVersion || ""}` },
        { label: "Class", key: "DBInstanceClass" },
        { label: "Endpoint", class: "mono", render: d => (d.Endpoint ? `${d.Endpoint.Address}:${d.Endpoint.Port}` : "—") },
        { label: "Cluster", key: "DBClusterIdentifier" },
        { label: "Multi-AZ", render: d => (d.MultiAZ ? "Yes" : "No") },
      ],
      poll: d => d.DBInstanceStatus !== "available" && d.DBInstanceStatus !== "stopped",
      onRowClick: d => go(`/rds/i/${encodeURIComponent(d.DBInstanceIdentifier)}`),
      create: { label: "Create database", open: () => rdsCreateForm(() => panel.refresh()) },
      actions: [
        { label: "Stop", icon: "stop", run: async rows => { for (const d of rows) await API.call("rds", "StopDBInstance", { DBInstanceIdentifier: d.DBInstanceIdentifier }); } },
        { label: "Start", icon: "play", run: async rows => { for (const d of rows) await API.call("rds", "StartDBInstance", { DBInstanceIdentifier: d.DBInstanceIdentifier }); } },
        { label: "Reboot", run: async rows => { for (const d of rows) await API.call("rds", "RebootDBInstance", { DBInstanceIdentifier: d.DBInstanceIdentifier }); } },
        { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete (no final snapshot)",
          run: async rows => { for (const d of rows) await API.call("rds", "DeleteDBInstance", { DBInstanceIdentifier: d.DBInstanceIdentifier, SkipFinalSnapshot: true, DeleteAutomatedBackups: true }); } },
      ],
    });
    return panel;
  };

  const clusters = () => resourcePanel({
    title: "DB clusters (Aurora)",
    rowKey: "DBClusterIdentifier",
    load: async () => (await API.all("rds", "DescribeDBClusters", {}, "DBClusters", "Marker")).filter(c => /aurora/.test(c.Engine)),
    columns: [
      { label: "Identifier", key: "DBClusterIdentifier" }, { label: "Status", render: c => badge(c.Status) },
      { label: "Engine", render: c => `${c.Engine} ${c.EngineVersion || ""}` },
      { label: "Writer endpoint", class: "mono", render: c => (c.Endpoint ? `${c.Endpoint}:${c.Port}` : "—") },
      { label: "Reader endpoint", class: "mono", render: c => c.ReaderEndpoint || "—" },
      { label: "Members", class: "num", render: c => (c.DBClusterMembers || []).length },
    ],
    poll: c => c.Status !== "available" && c.Status !== "stopped",
    onRowClick: c => showJson(c.DBClusterIdentifier, c),
    empty: "No Aurora clusters. Pick an Aurora engine under Create database.",
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete cluster and its instances",
      run: async rows => {
        for (const c of rows) {
          for (const m of c.DBClusterMembers || []) await API.call("rds", "DeleteDBInstance", { DBInstanceIdentifier: m.DBInstanceIdentifier, SkipFinalSnapshot: true }).catch(() => {});
          await API.call("rds", "DeleteDBCluster", { DBClusterIdentifier: c.DBClusterIdentifier, SkipFinalSnapshot: true });
        }
      } }],
  });

  const snapshots = () => resourcePanel({
    title: "Snapshots",
    rowKey: "DBSnapshotIdentifier",
    load: async () => API.all("rds", "DescribeDBSnapshots", {}, "DBSnapshots", "Marker"),
    columns: [
      { label: "Snapshot", key: "DBSnapshotIdentifier" }, { label: "Instance", key: "DBInstanceIdentifier" },
      { label: "Status", render: s => badge(s.Status) }, { label: "Engine", key: "Engine" }, { label: "Type", key: "SnapshotType" },
      { label: "Created", render: s => fmtDate(s.SnapshotCreateTime) },
    ],
    poll: s => s.Status === "creating",
    create: {
      label: "Take snapshot",
      open: () => formModal({
        title: "Take snapshot",
        fields: [
          { name: "db", label: "DB instance", type: "select", required: true, options: async () => (await API.call("rds", "DescribeDBInstances")).DBInstances.map(d => d.DBInstanceIdentifier) },
          { name: "id", label: "Snapshot name", required: true, default: "snap-" + new Date().toISOString().slice(0, 10) },
        ],
        onSubmit: async v => { await API.call("rds", "CreateDBSnapshot", { DBInstanceIdentifier: v.db, DBSnapshotIdentifier: v.id }); renderRoute(); },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete snapshot",
      run: async rows => { for (const s of rows) await API.call("rds", "DeleteDBSnapshot", { DBSnapshotIdentifier: s.DBSnapshotIdentifier }); } }],
  });

  const subnetGroups = () => resourcePanel({
    title: "Subnet groups",
    rowKey: "DBSubnetGroupName",
    load: async () => (await API.call("rds", "DescribeDBSubnetGroups")).DBSubnetGroups,
    columns: [
      { label: "Name", key: "DBSubnetGroupName" }, { label: "VPC", class: "mono", key: "VpcId" },
      { label: "Subnets", class: "mono", render: g => g.Subnets.map(s => s.SubnetIdentifier).join(", ") },
      { label: "Status", render: g => badge(g.SubnetGroupStatus) }, { label: "Description", key: "DBSubnetGroupDescription" },
    ],
    create: {
      label: "Create subnet group",
      open: () => formModal({
        title: "Create DB subnet group",
        fields: [
          { name: "name", label: "Name", required: true }, { name: "desc", label: "Description", required: true, default: "Created from the console" },
          { name: "subnets", label: "Subnets (2+ AZs)", type: "multiselect", required: true, options: () => Pick.subnets() },
        ],
        onSubmit: async v => { await API.call("rds", "CreateDBSubnetGroup", { DBSubnetGroupName: v.name, DBSubnetGroupDescription: v.desc, SubnetIds: v.subnets }); renderRoute(); },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete subnet group",
      run: async rows => { for (const g of rows) await API.call("rds", "DeleteDBSubnetGroup", { DBSubnetGroupName: g.DBSubnetGroupName }); } }],
  });

  const T = ["instances", "clusters", "snapshots", "subnets"];
  page.appendChild(tabs([
    { label: "Databases", render: instances }, { label: "Aurora clusters", render: clusters },
    { label: "Snapshots", render: snapshots }, { label: "Subnet groups", render: subnetGroups },
  ], Math.max(0, T.indexOf(tab))));
  return page;
});

function rdsCreateForm(after) {
  return formModal({
    title: "Create database", wide: true,
    fields: [
      { name: "engine", label: "Engine", type: "select", required: true, default: "postgres", options: RDS_ENGINES.map(e => ({ value: e.value, label: e.label })) },
      { name: "id", label: "DB identifier", required: true, placeholder: "my-db" },
      { name: "version", label: "Engine version (optional)", placeholder: "default" },
      { name: "cls", label: "Instance class", type: "select", required: true, default: "db.t3.micro", options: DB_CLASSES },
      { name: "storage", label: "Storage (GiB)", type: "number", default: 20, showIf: v => !/aurora/.test(v.engine) },
      { name: "user", label: "Master username", required: true, default: "dbadmin" },
      { name: "pass", label: "Master password", type: "password", required: true, help: "8+ characters. Use a test value. Only the emulator sees it." },
      { name: "dbname", label: "Initial database name (optional)", placeholder: "app" },
      { name: "subnetGroup", label: "Subnet group (optional)", type: "select", placeholder: "Default", options: dbSubnetGroupOptions },
      { name: "multiAz", label: "Multi-AZ", type: "checkbox", showIf: v => !/aurora/.test(v.engine) },
    ],
    onSubmit: async v => {
      const eng = RDS_ENGINES.find(e => e.value === v.engine);
      if (eng.cluster) {
        const cp = { DBClusterIdentifier: v.id, Engine: v.engine, MasterUsername: v.user, MasterUserPassword: v.pass };
        if (v.version) cp.EngineVersion = v.version;
        if (v.dbname) cp.DatabaseName = v.dbname;
        if (v.subnetGroup) cp.DBSubnetGroupName = v.subnetGroup;
        if (v.cls === "db.serverless") cp.ServerlessV2ScalingConfiguration = { MinCapacity: 0.5, MaxCapacity: 4 };
        await API.call("rds", "CreateDBCluster", cp);
        await API.call("rds", "CreateDBInstance", { DBInstanceIdentifier: v.id + "-1", DBClusterIdentifier: v.id, Engine: v.engine, DBInstanceClass: v.cls });
      } else {
        const p = { DBInstanceIdentifier: v.id, Engine: v.engine, DBInstanceClass: v.cls === "db.serverless" ? "db.t3.micro" : v.cls,
          MasterUsername: v.user, MasterUserPassword: v.pass, AllocatedStorage: v.storage || 20, MultiAZ: !!v.multiAz };
        if (v.version) p.EngineVersion = v.version;
        if (v.dbname) p.DBName = v.dbname;
        if (v.subnetGroup) p.DBSubnetGroupName = v.subnetGroup;
        await API.call("rds", "CreateDBInstance", p);
      }
      toast(`Creating ${v.id}`);
      after();
    },
  });
}

route("/rds/i/:id", async ({ id }) => {
  const d = (await API.call("rds", "DescribeDBInstances", { DBInstanceIdentifier: id })).DBInstances[0];
  const host = d.Endpoint?.Address, port = d.Endpoint?.Port;
  const page = h("div", crumbs(["RDS", "#/rds"], id), pageHeader(id, `${d.Engine} ${d.EngineVersion || ""} · ${d.DBInstanceClass}`, badge(d.DBInstanceStatus)));
  const cs = connString(d.Engine, host, port, d.MasterUsername, d.DBName);
  const cli = /postgres/.test(d.Engine) ? `psql "host=${host} port=${port} user=${d.MasterUsername} dbname=${d.DBName || "postgres"}"` : `mysql -h ${host} -P ${port} -u ${d.MasterUsername} -p`;
  page.append(
    h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Connect")),
      host ? h("div", { class: "panel-pad" },
        h("p", { class: "muted" }, "Connection string (put in your password):"), codeBlock(cs, { wrap: true }),
        h("p", { class: "muted", style: { marginTop: "12px" } }, "Command-line client:"), codeBlock(cli, { wrap: true }))
        : emptyState("No endpoint yet. Wait for the instance to become available.")),
    h("section", { class: "panel" }, kv([
      ["ARN", d.DBInstanceArn], ["Endpoint", host ? `${host}:${port}` : null], ["Master user", d.MasterUsername], ["Database", d.DBName],
      ["Storage", d.AllocatedStorage ? d.AllocatedStorage + " GiB " + (d.StorageType || "") : null], ["Multi-AZ", d.MultiAZ ? "Yes" : "No"],
      ["AZ", d.AvailabilityZone], ["Subnet group", d.DBSubnetGroup?.DBSubnetGroupName], ["Cluster", d.DBClusterIdentifier], ["Created", fmtDate(d.InstanceCreateTime)],
    ])),
    h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "JSON")), h("div", { class: "panel-pad" }, jsonView(d))));
  return page;
});

// ---------------- ElastiCache ----------------
route("/elasticache", async () => {
  const page = h("div", pageHeader("ElastiCache", "Redis OSS, Valkey and Memcached caches."));
  const panel = resourcePanel({
    title: "Replication groups & clusters",
    rowKey: "id",
    load: async () => {
      const [rg, cc] = await Promise.all([
        API.all("elasticache", "DescribeReplicationGroups", {}, "ReplicationGroups", "Marker"),
        API.all("elasticache", "DescribeCacheClusters", {}, "CacheClusters", "Marker"),
      ]);
      const rgs = rg.map(g => ({ id: g.ReplicationGroupId, kind: "replication group", status: g.Status, engine: g.Engine || "redis", node: g.CacheNodeType,
        endpoint: g.ConfigurationEndpoint ? `${g.ConfigurationEndpoint.Address}:${g.ConfigurationEndpoint.Port}` : g.NodeGroups?.[0]?.PrimaryEndpoint ? `${g.NodeGroups[0].PrimaryEndpoint.Address}:${g.NodeGroups[0].PrimaryEndpoint.Port}` : "", raw: g }));
      const solo = cc.filter(c => !c.ReplicationGroupId).map(c => ({ id: c.CacheClusterId, kind: "cluster", status: c.CacheClusterStatus, engine: `${c.Engine} ${c.EngineVersion || ""}`, node: c.CacheNodeType,
        endpoint: c.ConfigurationEndpoint ? `${c.ConfigurationEndpoint.Address}:${c.ConfigurationEndpoint.Port}` : c.CacheNodes?.[0]?.Endpoint ? `${c.CacheNodes[0].Endpoint.Address}:${c.CacheNodes[0].Endpoint.Port}` : "", raw: c }));
      return [...rgs, ...solo];
    },
    columns: [
      { label: "ID", key: "id" }, { label: "Kind", key: "kind" }, { label: "Status", render: r => badge(r.status) },
      { label: "Engine", key: "engine" }, { label: "Node type", key: "node" }, { label: "Endpoint", class: "mono", key: "endpoint" },
    ],
    poll: r => !["available", "deleted"].includes(r.status),
    onRowClick: r => showJson(r.id, r.raw),
    create: {
      label: "Create cache",
      open: () => formModal({
        title: "Create cache",
        fields: [
          { name: "id", label: "Name", required: true },
          { name: "engine", label: "Engine", type: "select", required: true, default: "valkey", options: ["valkey", "redis", "memcached"] },
          { name: "node", label: "Node type", type: "select", required: true, default: "cache.t3.micro", options: ["cache.t3.micro", "cache.t4g.micro", "cache.t4g.small", "cache.m6g.large", "cache.r6g.large"] },
          { name: "nodes", label: "Number of nodes", type: "number", required: true, default: 1 },
        ],
        onSubmit: async v => {
          if (v.engine === "memcached") await API.call("elasticache", "CreateCacheCluster", { CacheClusterId: v.id, Engine: "memcached", CacheNodeType: v.node, NumCacheNodes: v.nodes });
          else await API.call("elasticache", "CreateReplicationGroup", { ReplicationGroupId: v.id, ReplicationGroupDescription: "Created from the console", Engine: v.engine, CacheNodeType: v.node, NumCacheClusters: v.nodes });
          panel.refresh();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete",
      run: async rows => {
        for (const r of rows) {
          if (r.kind === "cluster") await API.call("elasticache", "DeleteCacheCluster", { CacheClusterId: r.id });
          else await API.call("elasticache", "DeleteReplicationGroup", { ReplicationGroupId: r.id });
        }
      } }],
  });
  page.appendChild(panel);
  return page;
});

// ---------------- Redshift ----------------
route("/redshift", async () => {
  const page = h("div", pageHeader("Redshift", "Data warehouse clusters."));
  const panel = resourcePanel({
    title: "Clusters",
    rowKey: "ClusterIdentifier",
    load: async () => API.all("redshift", "DescribeClusters", {}, "Clusters", "Marker"),
    columns: [
      { label: "Identifier", key: "ClusterIdentifier" }, { label: "Status", render: c => badge(c.ClusterStatus) },
      { label: "Node type", key: "NodeType" }, { label: "Nodes", class: "num", key: "NumberOfNodes" },
      { label: "Database", key: "DBName" }, { label: "Endpoint", class: "mono", render: c => (c.Endpoint ? `${c.Endpoint.Address}:${c.Endpoint.Port}` : "—") },
    ],
    poll: c => !["available", "paused"].includes(c.ClusterStatus),
    onRowClick: c => showJson(c.ClusterIdentifier, c),
    create: {
      label: "Create cluster",
      open: () => formModal({
        title: "Create Redshift cluster",
        fields: [
          { name: "id", label: "Cluster identifier", required: true },
          { name: "node", label: "Node type", type: "select", required: true, default: "ra3.large", options: ["ra3.large", "ra3.xlplus", "ra3.4xlarge", "dc2.large"] },
          { name: "nodes", label: "Number of nodes", type: "number", required: true, default: 2 },
          { name: "db", label: "Database name", required: true, default: "dev" },
          { name: "user", label: "Admin user", required: true, default: "awsuser" },
          { name: "pass", label: "Admin password", type: "password", required: true, help: "8–64 characters with upper, lower and a digit. Use a test value." },
        ],
        onSubmit: async v => {
          await API.call("redshift", "CreateCluster", { ClusterIdentifier: v.id, NodeType: v.node, ClusterType: v.nodes > 1 ? "multi-node" : "single-node",
            ...(v.nodes > 1 ? { NumberOfNodes: v.nodes } : {}), DBName: v.db, MasterUsername: v.user, MasterUserPassword: v.pass });
          panel.refresh();
        },
      }),
    },
    actions: [
      { label: "Pause", run: async rows => { for (const c of rows) await API.call("redshift", "PauseCluster", { ClusterIdentifier: c.ClusterIdentifier }); } },
      { label: "Resume", run: async rows => { for (const c of rows) await API.call("redshift", "ResumeCluster", { ClusterIdentifier: c.ClusterIdentifier }); } },
      { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete cluster",
        run: async rows => { for (const c of rows) await API.call("redshift", "DeleteCluster", { ClusterIdentifier: c.ClusterIdentifier, SkipFinalClusterSnapshot: true }); } },
    ],
  });
  page.appendChild(panel);
  return page;
});

// ---------------- DocumentDB & Neptune (RDS-style APIs) ----------------
function rdsStyleClusterPage(service, title, sub, engine, defaultClass) {
  return async () => {
    const page = h("div", pageHeader(title, sub));
    const panel = resourcePanel({
      title: "Clusters",
      rowKey: "DBClusterIdentifier",
      load: async () => (await API.all(service, "DescribeDBClusters", { Filters: [{ Name: "engine", Values: [engine] }] }, "DBClusters", "Marker")),
      columns: [
        { label: "Identifier", key: "DBClusterIdentifier" }, { label: "Status", render: c => badge(c.Status) },
        { label: "Engine", render: c => `${c.Engine} ${c.EngineVersion || ""}` },
        { label: "Endpoint", class: "mono", render: c => (c.Endpoint ? `${c.Endpoint}:${c.Port}` : "—") },
        { label: "Instances", class: "num", render: c => (c.DBClusterMembers || []).length },
      ],
      poll: c => c.Status !== "available" && c.Status !== "stopped",
      onRowClick: c => showJson(c.DBClusterIdentifier, c),
      create: {
        label: "Create cluster",
        open: () => formModal({
          title: `Create ${title} cluster`,
          fields: [
            { name: "id", label: "Cluster identifier", required: true },
            { name: "cls", label: "Instance class", type: "select", required: true, default: defaultClass, options: [defaultClass, "db.r6g.large", "db.t4g.medium"] },
            { name: "instances", label: "Instances", type: "number", required: true, default: 1 },
            ...(engine === "docdb" ? [{ name: "user", label: "Master username", required: true, default: "dbadmin" }, { name: "pass", label: "Master password", type: "password", required: true, help: "Use a test value." }] : []),
          ],
          onSubmit: async v => {
            const p = { DBClusterIdentifier: v.id, Engine: engine };
            if (engine === "docdb") { p.MasterUsername = v.user; p.MasterUserPassword = v.pass; }
            await API.call(service, "CreateDBCluster", p);
            for (let i = 1; i <= (v.instances || 1); i++)
              await API.call(service, "CreateDBInstance", { DBInstanceIdentifier: `${v.id}-${i}`, DBClusterIdentifier: v.id, Engine: engine, DBInstanceClass: v.cls });
            panel.refresh();
          },
        }),
      },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete cluster and its instances",
        run: async rows => {
          for (const c of rows) {
            for (const m of c.DBClusterMembers || []) await API.call(service, "DeleteDBInstance", { DBInstanceIdentifier: m.DBInstanceIdentifier }).catch(() => {});
            await API.call(service, "DeleteDBCluster", { DBClusterIdentifier: c.DBClusterIdentifier, SkipFinalSnapshot: true });
          }
        } }],
    });
    page.appendChild(panel);
    return page;
  };
}
route("/docdb", rdsStyleClusterPage("docdb", "DocumentDB", "MongoDB-compatible document database clusters.", "docdb", "db.t3.medium"));
route("/neptune", rdsStyleClusterPage("neptune", "Neptune", "Graph database clusters.", "neptune", "db.t3.medium"));
