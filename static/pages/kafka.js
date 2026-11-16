"use strict";

navGroup("Analytics", [{ path: "/kafka", label: "MSK (Kafka)", keywords: "kafka msk streaming broker" }]);

const MSK_TYPES = ["kafka.t3.small", "kafka.m5.large", "kafka.m5.xlarge", "kafka.m7g.large", "kafka.m7g.xlarge", "express.m7g.large"];

route("/kafka", async ({ tab }) => {
  const page = h("div", pageHeader("Amazon MSK", "Managed Kafka clusters and configurations."));
  const clusters = () => {
    const panel = resourcePanel({
      title: "Clusters",
      rowKey: "ClusterArn",
      load: async () => API.all("kafka", "ListClustersV2", {}, "ClusterInfoList"),
      columns: [
        { label: "Name", render: c => h("a", { href: `#/kafka/c/${encodeURIComponent(c.ClusterArn)}` }, c.ClusterName) },
        { label: "Status", render: c => badge(c.State) },
        { label: "Type", key: "ClusterType" },
        { label: "Kafka", render: c => c.Provisioned?.CurrentBrokerSoftwareInfo?.KafkaVersion || (c.ClusterType === "SERVERLESS" ? "serverless" : "—") },
        { label: "Brokers", class: "num", render: c => c.Provisioned?.NumberOfBrokerNodes ?? "—" },
        { label: "Broker type", render: c => c.Provisioned?.BrokerNodeGroupInfo?.InstanceType || "—" },
        { label: "Created", render: c => fmtDate(c.CreationTime) },
      ],
      poll: c => ["CREATING", "DELETING", "UPDATING", "REBOOTING_BROKER"].includes(c.State),
      onRowClick: c => go(`/kafka/c/${encodeURIComponent(c.ClusterArn)}`),
      create: { label: "Create cluster", open: () => mskCreateForm(() => panel.refresh()) },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete cluster",
        run: async rows => { for (const c of rows) await API.call("kafka", "DeleteCluster", { ClusterArn: c.ClusterArn }); } }],
    });
    return panel;
  };
  const configs = () => {
    const panel = resourcePanel({
      title: "Cluster configurations",
      rowKey: "Arn",
      load: async () => API.all("kafka", "ListConfigurations", {}, "Configurations"),
      columns: [
        { label: "Name", key: "Name" }, { label: "State", render: c => badge(c.State) },
        { label: "Latest revision", class: "num", key: "LatestRevision.Revision" },
        { label: "Kafka versions", render: c => (c.KafkaVersions || []).join(", ") || "any" },
        { label: "Description", key: "Description" },
      ],
      onRowClick: async c => {
        try {
          const r = await API.call("kafka", "DescribeConfigurationRevision", { Arn: c.Arn, Revision: c.LatestRevision.Revision });
          modal({ title: `${c.Name} (revision ${r.Revision})`, wide: true, body: codeBlock(typeof r.ServerProperties === "string" ? r.ServerProperties : atob(r.ServerProperties?.__base64__ || "")) });
        } catch (e) { toastErr(e); }
      },
      create: {
        label: "Create configuration",
        open: () => formModal({
          title: "Create configuration", wide: true,
          fields: [
            { name: "name", label: "Name", required: true },
            { name: "desc", label: "Description" },
            { name: "props", label: "server.properties", type: "code", rows: 10, required: true,
              default: "auto.create.topics.enable=true\ndefault.replication.factor=2\nmin.insync.replicas=1\nnum.partitions=3\nlog.retention.hours=168\n" },
          ],
          onSubmit: async v => {
            await API.call("kafka", "CreateConfiguration", { Name: v.name, Description: v.desc || undefined, ServerProperties: v.props });
            panel.refresh();
          },
        }),
      },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete configuration",
        run: async rows => { for (const c of rows) await API.call("kafka", "DeleteConfiguration", { Arn: c.Arn }); } }],
    });
    return panel;
  };
  page.appendChild(tabs([{ label: "Clusters", render: clusters }, { label: "Configurations", render: configs }], tab === "configs" ? 1 : 0));
  return page;
});

function mskCreateForm(after) {
  return formModal({
    title: "Create MSK cluster", wide: true,
    fields: [
      { name: "name", label: "Cluster name", required: true },
      { name: "kind", label: "Cluster type", type: "select", required: true, default: "PROVISIONED", options: [{ value: "PROVISIONED", label: "Provisioned" }, { value: "SERVERLESS", label: "Serverless" }] },
      { name: "version", label: "Kafka version", type: "select", required: true, showIf: v => v.kind === "PROVISIONED",
        options: async () => {
          try {
            const r = await API.call("kafka", "ListKafkaVersions");
            const list = (r.KafkaVersions || []).filter(x => x.Status !== "DEPRECATED").map(x => x.Version).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            if (list.length) return list;
          } catch { /* fall through */ }
          return ["3.9.x", "3.8.x", "3.7.x.kraft", "3.6.0"];
        } },
      { name: "brokers", label: "Number of brokers (a multiple of the subnets)", type: "number", required: true, default: 2, showIf: v => v.kind === "PROVISIONED" },
      { name: "type", label: "Broker instance type", type: "select", required: true, default: "kafka.m5.large", options: MSK_TYPES, showIf: v => v.kind === "PROVISIONED" },
      { name: "storage", label: "Storage per broker (GiB)", type: "number", default: 100, showIf: v => v.kind === "PROVISIONED" },
      { name: "subnets", label: "Subnets (pick 2 or 3, each in a different AZ)", type: "multiselect", required: true, options: () => Pick.subnets() },
      { name: "sgs", label: "Security groups", type: "multiselect", options: () => Pick.securityGroups() },
      { name: "config", label: "Configuration (optional)", type: "select", placeholder: "Default", showIf: v => v.kind === "PROVISIONED",
        options: async () => (await API.all("kafka", "ListConfigurations", {}, "Configurations")).map(c => ({ value: `${c.Arn}|${c.LatestRevision.Revision}`, label: c.Name })) },
    ],
    onSubmit: async v => {
      if (v.kind === "SERVERLESS") {
        const vpc = { SubnetIds: v.subnets };
        if (v.sgs.length) vpc.SecurityGroupIds = v.sgs;
        await API.call("kafka", "CreateClusterV2", { ClusterName: v.name, Serverless: { VpcConfigs: [vpc], ClientAuthentication: { Sasl: { Iam: { Enabled: true } } } } });
      } else {
        const bng = { InstanceType: v.type, ClientSubnets: v.subnets, StorageInfo: { EbsStorageInfo: { VolumeSize: v.storage || 100 } } };
        if (v.sgs.length) bng.SecurityGroups = v.sgs;
        const p = { ClusterName: v.name, KafkaVersion: v.version, NumberOfBrokerNodes: v.brokers, BrokerNodeGroupInfo: bng };
        if (v.config) { const [Arn, Revision] = v.config.split("|"); p.ConfigurationInfo = { Arn, Revision: Number(Revision) }; }
        await API.call("kafka", "CreateCluster", p);
      }
      toast(`Creating ${v.name}`);
      after();
    },
  });
}

route("/kafka/c/:arn", async ({ arn }) => {
  const c = (await API.call("kafka", "DescribeClusterV2", { ClusterArn: arn })).ClusterInfo;
  const page = h("div", crumbs(["MSK", "#/kafka"], c.ClusterName), pageHeader(c.ClusterName, c.ClusterType, badge(c.State)));
  const overview = () => {
    const box = h("div");
    const brokers = h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", "Bootstrap brokers")), h("div", { class: "loading" }, "Loading…"));
    API.call("kafka", "GetBootstrapBrokers", { ClusterArn: arn }).then(r => {
      const rows = Object.entries(r).filter(([, v]) => v);
      brokers.lastChild.replaceWith(rows.length
        ? h("div", { class: "panel-pad" }, rows.map(([k, v]) => h("div", { style: { marginBottom: "10px" } }, h("div", { class: "muted" }, k.replace(/^BootstrapBrokerString/, "") || "Plaintext"), codeBlock(v, { wrap: true }))))
        : emptyState("No bootstrap brokers yet (the cluster may still be creating)."));
    }).catch(e => brokers.lastChild.replaceWith(errorBox(e)));
    const p = c.Provisioned || {};
    box.append(
      h("div", { class: "note" }, "These broker addresses are AWS-style hostnames that don't resolve on your machine, so Kafka clients can't connect to them. The emulator covers the MSK management API, not a running Kafka."),
      h("div", { class: "panel" }, kv([
        ["ARN", c.ClusterArn], ["Status", badge(c.State)], ["Kafka version", p.CurrentBrokerSoftwareInfo?.KafkaVersion],
        ["Brokers", p.NumberOfBrokerNodes], ["Broker type", p.BrokerNodeGroupInfo?.InstanceType],
        ["Subnets", (p.BrokerNodeGroupInfo?.ClientSubnets || c.Serverless?.VpcConfigs?.[0]?.SubnetIds || []).join(", ")],
        ["Storage", p.BrokerNodeGroupInfo?.StorageInfo?.EbsStorageInfo?.VolumeSize ? p.BrokerNodeGroupInfo.StorageInfo.EbsStorageInfo.VolumeSize + " GiB" : null],
        ["Zookeeper", p.ZookeeperConnectString], ["Current version", c.CurrentVersion], ["Created", fmtDate(c.CreationTime)],
      ])),
      brokers);
    return box;
  };
  const nodes = () => resourcePanel({
    title: "Broker nodes",
    rowKey: n => n.BrokerNodeInfo?.BrokerId ?? n.NodeARN,
    load: async () => (await API.call("kafka", "ListNodes", { ClusterArn: arn })).NodeInfoList || [],
    columns: [
      { label: "Broker", render: n => n.BrokerNodeInfo?.BrokerId }, { label: "Type", key: "InstanceType" },
      { label: "Subnet", class: "mono", render: n => n.BrokerNodeInfo?.ClientSubnet }, { label: "Client IP", class: "mono", render: n => n.BrokerNodeInfo?.ClientVpcIpAddress },
      { label: "Endpoints", class: "mono wrap", render: n => (n.BrokerNodeInfo?.Endpoints || []).join(", ") },
    ],
    empty: "No broker nodes listed.",
  });
  const ops = () => resourcePanel({
    title: "Operations",
    rowKey: "OperationArn",
    load: async () => (await API.call("kafka", "ListClusterOperationsV2", { ClusterArn: arn }).catch(() => API.call("kafka", "ListClusterOperations", { ClusterArn: arn }))).ClusterOperationInfoList || [],
    columns: [{ label: "Type", key: "OperationType" }, { label: "State", render: o => badge(o.OperationState) }, { label: "Started", render: o => fmtDate(o.CreationTime) }, { label: "Ended", render: o => fmtDate(o.EndTime) }],
    onRowClick: o => showJson(o.OperationType, o),
    empty: "No operations.",
  });
  const scale = () => h("div", { class: "panel panel-pad" },
    h("p", { class: "muted" }, "Change the broker count or storage. MSK only grows these, never shrinks them."),
    h("div", { class: "row" },
      button("Change broker count", () => formModal({
        title: "Change broker count", submitLabel: "Update",
        fields: [{ name: "n", label: "Target number of brokers", type: "number", required: true, default: (c.Provisioned?.NumberOfBrokerNodes || 2) * 2 }],
        onSubmit: async v => { await API.call("kafka", "UpdateBrokerCount", { ClusterArn: arn, CurrentVersion: c.CurrentVersion, TargetNumberOfBrokerNodes: v.n }); toast("Update started"); renderRoute(); },
      })),
      button("Change storage", () => formModal({
        title: "Change storage per broker", submitLabel: "Update",
        fields: [{ name: "gb", label: "Size (GiB)", type: "number", required: true, default: (c.Provisioned?.BrokerNodeGroupInfo?.StorageInfo?.EbsStorageInfo?.VolumeSize || 100) * 2 }],
        onSubmit: async v => { await API.call("kafka", "UpdateBrokerStorage", { ClusterArn: arn, CurrentVersion: c.CurrentVersion, TargetBrokerEBSVolumeInfo: [{ KafkaBrokerNodeId: "All", VolumeSizeGB: v.gb }] }); toast("Update started"); renderRoute(); },
      }))));
  const list = [{ label: "Overview", render: overview }];
  if (c.ClusterType === "PROVISIONED") list.push({ label: "Brokers", render: nodes }, { label: "Scale", render: scale });
  list.push({ label: "Operations", render: ops }, { label: "JSON", render: () => h("div", { class: "panel panel-pad" }, jsonView(c)) });
  page.appendChild(tabs(list));
  return page;
});
