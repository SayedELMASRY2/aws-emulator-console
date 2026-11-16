"use strict";

navGroup("Containers", [
  { path: "/ecs", label: "ECS", keywords: "elastic container service fargate task service cluster" },
  { path: "/ecr", label: "ECR", keywords: "container registry docker image repository" },
  { path: "/eks", label: "EKS", keywords: "kubernetes k8s nodegroup" },
]);

// ---------------- ECS ----------------
async function taskDefOptions() {
  const arns = await API.all("ecs", "ListTaskDefinitions", { status: "ACTIVE", sort: "DESC" }, "taskDefinitionArns", "nextToken");
  return arns.map(a => ({ value: a, label: a.split("/").pop() }));
}
function tdLabel(arn) { return arn ? arn.split("/").pop() : "—"; }

function awsvpcFields() {
  return [
    { name: "subnets", label: "Subnets", type: "multiselect", required: true, options: () => Pick.subnets(), showIf: v => v.launch === "FARGATE" },
    { name: "sgs", label: "Security groups", type: "multiselect", options: () => Pick.securityGroups(), showIf: v => v.launch === "FARGATE" },
    { name: "publicIp", label: "Assign public IP", type: "checkbox", showIf: v => v.launch === "FARGATE" },
  ];
}
function netConfig(v) {
  if (v.launch !== "FARGATE") return undefined;
  const c = { subnets: v.subnets, assignPublicIp: v.publicIp ? "ENABLED" : "DISABLED" };
  if (v.sgs?.length) c.securityGroups = v.sgs;
  return { awsvpcConfiguration: c };
}

route("/ecs", async ({ tab }) => {
  const page = h("div", pageHeader("Elastic Container Service", "Clusters, services, tasks and task definitions."));
  const clusters = () => {
    const panel = resourcePanel({
      title: "Clusters",
      rowKey: "clusterName",
      load: async () => {
        const arns = await API.all("ecs", "ListClusters", {}, "clusterArns", "nextToken");
        if (!arns.length) return [];
        return (await API.call("ecs", "DescribeClusters", { clusters: arns, include: ["STATISTICS"] })).clusters;
      },
      columns: [
        { label: "Name", render: c => h("a", { href: `#/ecs/c/${encodeURIComponent(c.clusterName)}` }, c.clusterName) },
        { label: "Status", render: c => badge(c.status) },
        { label: "Services", class: "num", key: "activeServicesCount" },
        { label: "Running tasks", class: "num", key: "runningTasksCount" },
        { label: "Pending tasks", class: "num", key: "pendingTasksCount" },
        { label: "Container instances", class: "num", key: "registeredContainerInstancesCount" },
      ],
      onRowClick: c => go(`/ecs/c/${encodeURIComponent(c.clusterName)}`),
      create: {
        label: "Create cluster",
        open: () => formModal({
          title: "Create cluster",
          fields: [
            { name: "name", label: "Cluster name", required: true },
            { name: "insights", label: "Turn on Container Insights", type: "checkbox" },
            { name: "fargate", label: "Use FARGATE and FARGATE_SPOT capacity providers", type: "checkbox", default: true },
          ],
          onSubmit: async v => {
            const p = { clusterName: v.name };
            if (v.insights) p.settings = [{ name: "containerInsights", value: "enabled" }];
            if (v.fargate) p.capacityProviders = ["FARGATE", "FARGATE_SPOT"];
            await API.call("ecs", "CreateCluster", p);
            panel.refresh();
          },
        }),
      },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete cluster",
        run: async rows => { for (const c of rows) await API.call("ecs", "DeleteCluster", { cluster: c.clusterName }); } }],
    });
    return panel;
  };

  const taskDefs = () => {
    const panel = resourcePanel({
      title: "Task definitions",
      rowKey: "taskDefinitionArn",
      load: async () => {
        const arns = await API.all("ecs", "ListTaskDefinitions", { status: "ACTIVE", sort: "DESC" }, "taskDefinitionArns", "nextToken");
        return Promise.all(arns.slice(0, 60).map(a => API.call("ecs", "DescribeTaskDefinition", { taskDefinition: a }).then(r => r.taskDefinition)));
      },
      columns: [
        { label: "Family:revision", render: t => `${t.family}:${t.revision}` },
        { label: "Containers", render: t => t.containerDefinitions.map(c => `${c.name} (${c.image})`).join(", ") },
        { label: "CPU / Memory", render: t => `${t.cpu || "—"} / ${t.memory || "—"}` },
        { label: "Network", key: "networkMode" },
        { label: "Compatible", render: t => (t.requiresCompatibilities || []).join(", ") },
      ],
      onRowClick: t => showJson(`${t.family}:${t.revision}`, t),
      create: { label: "Register task definition", open: () => taskDefForm(() => panel.refresh()) },
      actions: [{ label: "Deregister", kind: "danger", confirm: "Deregister",
        run: async rows => { for (const t of rows) await API.call("ecs", "DeregisterTaskDefinition", { taskDefinition: t.taskDefinitionArn }); } }],
    });
    return panel;
  };

  page.appendChild(tabs([{ label: "Clusters", render: clusters }, { label: "Task definitions", render: taskDefs }], tab === "taskdefs" ? 1 : 0));
  return page;
});

function taskDefForm(after) {
  return formModal({
    title: "Register task definition", wide: true, submitLabel: "Register",
    fields: [
      { name: "mode", label: "How", type: "select", required: true, default: "form", options: [{ value: "form", label: "Simple form (one container)" }, { value: "json", label: "Full JSON" }] },
      { name: "family", label: "Family", required: true, showIf: v => v.mode === "form" },
      { name: "cname", label: "Container name", required: true, default: "app", showIf: v => v.mode === "form" },
      { name: "image", label: "Image", required: true, default: "nginx:latest", showIf: v => v.mode === "form" },
      { name: "port", label: "Container port (optional)", type: "number", default: 80, showIf: v => v.mode === "form" },
      { name: "cpu", label: "Task CPU", type: "select", required: true, default: "256", options: ["256", "512", "1024", "2048", "4096"], showIf: v => v.mode === "form" },
      { name: "memory", label: "Task memory (MiB)", type: "select", required: true, default: "512", options: ["512", "1024", "2048", "4096", "8192"], showIf: v => v.mode === "form" },
      { name: "env", label: "Environment variables (optional)", type: "textarea", rows: 3, placeholder: "KEY=value", showIf: v => v.mode === "form" },
      { name: "json", label: "RegisterTaskDefinition input", type: "json", rows: 16, showIf: v => v.mode === "json",
        default: { family: "my-app", requiresCompatibilities: ["FARGATE"], networkMode: "awsvpc", cpu: "256", memory: "512",
          containerDefinitions: [{ name: "app", image: "nginx:latest", essential: true, portMappings: [{ containerPort: 80, protocol: "tcp" }] }] } },
    ],
    onSubmit: async v => {
      let p = v.json;
      if (v.mode === "form") {
        const c = { name: v.cname, image: v.image, essential: true };
        if (v.port) c.portMappings = [{ containerPort: v.port, protocol: "tcp" }];
        const env = (v.env || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf("="); return { name: l.slice(0, i), value: l.slice(i + 1) }; });
        if (env.length) c.environment = env;
        p = { family: v.family, requiresCompatibilities: ["FARGATE", "EC2"], networkMode: "awsvpc", cpu: v.cpu, memory: v.memory, containerDefinitions: [c] };
      }
      const r = await API.call("ecs", "RegisterTaskDefinition", p);
      toast(`Registered ${r.taskDefinition.family}:${r.taskDefinition.revision}`);
      after();
    },
  });
}

route("/ecs/c/:cluster", async ({ cluster }) => {
  const page = h("div", crumbs(["ECS", "#/ecs"], cluster), pageHeader(cluster, "ECS cluster"),
    h("div", { class: "note" }, "Tasks really run: the emulator pulls each container image, so it needs internet access to the registry (Docker Hub, ECR, …). If an image can't be pulled, the task stops with CannotPullContainerError."));
  const services = () => {
    const panel = resourcePanel({
      title: "Services",
      rowKey: "serviceName",
      load: async () => {
        const arns = await API.all("ecs", "ListServices", { cluster }, "serviceArns", "nextToken");
        if (!arns.length) return [];
        const out = [];
        for (let i = 0; i < arns.length; i += 10) out.push(...(await API.call("ecs", "DescribeServices", { cluster, services: arns.slice(i, i + 10) })).services);
        return out;
      },
      columns: [
        { label: "Name", key: "serviceName" }, { label: "Status", render: s => badge(s.status) },
        { label: "Task definition", render: s => tdLabel(s.taskDefinition) },
        { label: "Desired", class: "num", key: "desiredCount" }, { label: "Running", class: "num", key: "runningCount" }, { label: "Pending", class: "num", key: "pendingCount" },
        { label: "Launch type", render: s => s.launchType || (s.capacityProviderStrategy || []).map(c => c.capacityProvider).join(",") },
      ],
      onRowClick: s => showJson(s.serviceName, s),
      create: {
        label: "Create service",
        open: () => formModal({
          title: "Create service",
          fields: [
            { name: "name", label: "Service name", required: true },
            { name: "td", label: "Task definition", type: "select", required: true, options: taskDefOptions },
            { name: "count", label: "Desired tasks", type: "number", required: true, default: 1 },
            { name: "launch", label: "Launch type", type: "select", required: true, default: "FARGATE", options: ["FARGATE", "EC2"] },
            ...awsvpcFields(),
          ],
          onSubmit: async v => {
            const p = { cluster, serviceName: v.name, taskDefinition: v.td, desiredCount: v.count, launchType: v.launch };
            const nc = netConfig(v); if (nc) p.networkConfiguration = nc;
            await API.call("ecs", "CreateService", p);
            panel.refresh();
          },
        }),
      },
      actions: [
        { label: "Set desired count", multi: false, open: (rows, refresh) => formModal({
          title: `Scale ${rows[0].serviceName}`, submitLabel: "Update",
          fields: [{ name: "n", label: "Desired tasks", type: "number", required: true, default: rows[0].desiredCount }],
          onSubmit: async v => { await API.call("ecs", "UpdateService", { cluster, service: rows[0].serviceName, desiredCount: v.n }); refresh(); },
        }) },
        { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete service",
          run: async rows => { for (const s of rows) await API.call("ecs", "DeleteService", { cluster, service: s.serviceName, force: true }); } },
      ],
    });
    return panel;
  };
  const tasks = () => {
    const panel = resourcePanel({
      title: "Tasks",
      rowKey: "taskArn",
      load: async () => {
        const [running, stopped] = await Promise.all([
          API.all("ecs", "ListTasks", { cluster }, "taskArns", "nextToken"),
          API.all("ecs", "ListTasks", { cluster, desiredStatus: "STOPPED" }, "taskArns", "nextToken"),
        ]);
        const arns = [...running, ...stopped];
        if (!arns.length) return [];
        const out = [];
        for (let i = 0; i < arns.length; i += 100) out.push(...(await API.call("ecs", "DescribeTasks", { cluster, tasks: arns.slice(i, i + 100) })).tasks);
        return out;
      },
      columns: [
        { label: "Task", class: "mono", render: t => arnName(t.taskArn) },
        { label: "Last status", render: t => badge(t.lastStatus) }, { label: "Desired", render: t => t.desiredStatus },
        { label: "Task definition", render: t => tdLabel(t.taskDefinitionArn) },
        { label: "Group", key: "group" }, { label: "Launch", key: "launchType" },
        { label: "Started", render: t => fmtDate(t.startedAt || t.createdAt) },
        { label: "Stop reason", key: "stoppedReason" },
      ],
      poll: t => ["PROVISIONING", "PENDING", "ACTIVATING", "DEACTIVATING", "STOPPING", "DEPROVISIONING"].includes(t.lastStatus),
      onRowClick: t => showJson(arnName(t.taskArn), t),
      create: {
        label: "Run task",
        open: () => formModal({
          title: "Run task",
          fields: [
            { name: "td", label: "Task definition", type: "select", required: true, options: taskDefOptions },
            { name: "count", label: "Number of tasks", type: "number", required: true, default: 1 },
            { name: "launch", label: "Launch type", type: "select", required: true, default: "FARGATE", options: ["FARGATE", "EC2"] },
            ...awsvpcFields(),
          ],
          onSubmit: async v => {
            const p = { cluster, taskDefinition: v.td, count: v.count, launchType: v.launch };
            const nc = netConfig(v); if (nc) p.networkConfiguration = nc;
            const r = await API.call("ecs", "RunTask", p);
            if (r.failures?.length) throw { code: "RunTask failures", message: r.failures.map(f => f.reason).join("; ") };
            panel.refresh();
          },
        }),
      },
      actions: [{ label: "Stop", icon: "stop", run: async rows => { for (const t of rows) await API.call("ecs", "StopTask", { cluster, task: t.taskArn, reason: "Stopped from Emulator Console" }); } }],
    });
    return panel;
  };
  page.appendChild(tabs([{ label: "Services", render: services }, { label: "Tasks", render: tasks },
    { label: "Details", render: () => { const d = h("div", { class: "panel" }, h("div", { class: "loading" }, "Loading…")); API.call("ecs", "DescribeClusters", { clusters: [cluster], include: ["SETTINGS", "STATISTICS", "CONFIGURATIONS"] }).then(r => clear(d).appendChild(h("div", { class: "panel-pad" }, jsonView(r.clusters[0])))).catch(e => clear(d).appendChild(errorBox(e))); return d; } }]));
  return page;
});

// ---------------- ECR ----------------
route("/ecr", async () => {
  const page = h("div", pageHeader("Elastic Container Registry", "Private image repositories."));
  const panel = resourcePanel({
    title: "Repositories",
    rowKey: "repositoryName",
    load: async () => API.all("ecr", "DescribeRepositories", {}, "repositories", "nextToken"),
    columns: [
      { label: "Name", render: r => h("a", { href: `#/ecr/r/${encodeURIComponent(r.repositoryName)}` }, r.repositoryName) },
      { label: "URI", class: "mono wrap", key: "repositoryUri" },
      { label: "Tag mutability", key: "imageTagMutability" },
      { label: "Scan on push", render: r => (r.imageScanningConfiguration?.scanOnPush ? "On" : "Off") },
      { label: "Created", render: r => fmtDate(r.createdAt) },
    ],
    onRowClick: r => go(`/ecr/r/${encodeURIComponent(r.repositoryName)}`),
    create: {
      label: "Create repository",
      open: () => formModal({
        title: "Create repository",
        fields: [
          { name: "name", label: "Repository name", required: true, placeholder: "team/my-app" },
          { name: "immutable", label: "Immutable tags", type: "checkbox" },
          { name: "scan", label: "Scan on push", type: "checkbox" },
        ],
        onSubmit: async v => {
          await API.call("ecr", "CreateRepository", { repositoryName: v.name, imageTagMutability: v.immutable ? "IMMUTABLE" : "MUTABLE", imageScanningConfiguration: { scanOnPush: v.scan } });
          panel.refresh();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete repository (with all images)",
      run: async rows => { for (const r of rows) await API.call("ecr", "DeleteRepository", { repositoryName: r.repositoryName, force: true }); } }],
  });
  page.appendChild(panel);
  return page;
});

route("/ecr/r/:repo", async ({ repo }) => {
  const page = h("div", crumbs(["ECR", "#/ecr"], repo), pageHeader(repo, "Images in this repository."));
  page.appendChild(h("div", { class: "note" },
    h("div", "The emulator serves a Docker registry on its own endpoint. Log in, then tag and push to this repository's URI:"),
    codeBlock(`aws ecr get-login-password | docker login --username AWS --password-stdin 127.0.0.1:9297`, { wrap: true }),
    h("div", { class: "muted" }, "Docker may need to trust the emulator's certificate (~/.aws/emulator/9297/ca.pem) before the push works.")));
  page.appendChild(resourcePanel({
    title: "Images",
    rowKey: "imageDigest",
    load: async () => API.all("ecr", "DescribeImages", { repositoryName: repo }, "imageDetails", "nextToken"),
    columns: [
      { label: "Tags", render: i => (i.imageTags || []).join(", ") || "<untagged>" },
      { label: "Digest", class: "mono", render: i => String(i.imageDigest).slice(0, 23) + "…" },
      { label: "Size", class: "num", render: i => fmtBytes(i.imageSizeInBytes) },
      { label: "Pushed", render: i => fmtDate(i.imagePushedAt) },
    ],
    empty: "No images in this repository.",
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete image",
      run: async rows => { await API.call("ecr", "BatchDeleteImage", { repositoryName: repo, imageIds: rows.map(i => ({ imageDigest: i.imageDigest })) }); } }],
  }));
  return page;
});

// ---------------- EKS ----------------
const EKS_ROLE = () => ensureServiceRole("EmuConsoleEksClusterRole", "eks.amazonaws.com", "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy");
const EKS_NODE_ROLE = () => ensureServiceRole("EmuConsoleEksNodeRole", "ec2.amazonaws.com", "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy");

route("/eks", async () => {
  const page = h("div", pageHeader("Elastic Kubernetes Service", "Kubernetes control planes and node groups."));
  const panel = resourcePanel({
    title: "Clusters",
    rowKey: "name",
    load: async () => {
      const names = await API.all("eks", "ListClusters", {}, "clusters", "nextToken");
      return Promise.all(names.map(n => API.call("eks", "DescribeCluster", { name: n }).then(r => r.cluster)));
    },
    columns: [
      { label: "Name", render: c => h("a", { href: `#/eks/c/${encodeURIComponent(c.name)}` }, c.name) },
      { label: "Status", render: c => badge(c.status) }, { label: "Kubernetes", key: "version" },
      { label: "Endpoint", class: "mono wrap", key: "endpoint" }, { label: "Created", render: c => fmtDate(c.createdAt) },
    ],
    poll: c => ["CREATING", "DELETING", "UPDATING"].includes(c.status),
    onRowClick: c => go(`/eks/c/${encodeURIComponent(c.name)}`),
    create: {
      label: "Create cluster",
      open: () => formModal({
        title: "Create EKS cluster",
        fields: [
          { name: "name", label: "Cluster name", required: true },
          { name: "version", label: "Kubernetes version", type: "select", required: true, default: "1.36", options: ["1.36", "1.35", "1.34", "1.33"] },
          { name: "subnets", label: "Subnets (pick 2+ in different AZs)", type: "multiselect", required: true, options: () => Pick.subnets() },
          { name: "sgs", label: "Security groups", type: "multiselect", options: () => Pick.securityGroups() },
        ],
        onSubmit: async v => {
          const vpc = { subnetIds: v.subnets };
          if (v.sgs.length) vpc.securityGroupIds = v.sgs;
          await API.call("eks", "CreateCluster", { name: v.name, version: v.version, roleArn: await EKS_ROLE(), resourcesVpcConfig: vpc });
          panel.refresh();
        },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete cluster",
      run: async rows => { for (const c of rows) await API.call("eks", "DeleteCluster", { name: c.name }); } }],
  });
  page.appendChild(panel);
  return page;
});

route("/eks/c/:cluster", async ({ cluster }) => {
  const c = (await API.call("eks", "DescribeCluster", { name: cluster })).cluster;
  const page = h("div", crumbs(["EKS", "#/eks"], cluster), pageHeader(cluster, `Kubernetes ${c.version}`, badge(c.status)));
  const nodegroups = () => {
    const panel = resourcePanel({
      title: "Node groups",
      rowKey: "nodegroupName",
      load: async () => {
        const names = await API.all("eks", "ListNodegroups", { clusterName: cluster }, "nodegroups", "nextToken");
        return Promise.all(names.map(n => API.call("eks", "DescribeNodegroup", { clusterName: cluster, nodegroupName: n }).then(r => r.nodegroup)));
      },
      columns: [
        { label: "Name", key: "nodegroupName" }, { label: "Status", render: n => badge(n.status) },
        { label: "Instance types", render: n => (n.instanceTypes || []).join(", ") },
        { label: "Min / desired / max", render: n => `${n.scalingConfig?.minSize} / ${n.scalingConfig?.desiredSize} / ${n.scalingConfig?.maxSize}` },
        { label: "Capacity", key: "capacityType" },
      ],
      poll: n => ["CREATING", "DELETING", "UPDATING"].includes(n.status),
      onRowClick: n => showJson(n.nodegroupName, n),
      create: {
        label: "Add node group",
        open: () => formModal({
          title: "Add node group",
          fields: [
            { name: "name", label: "Name", required: true },
            { name: "type", label: "Instance type", type: "select", required: true, default: "t3.medium", options: INSTANCE_TYPES },
            { name: "min", label: "Min nodes", type: "number", required: true, default: 1 },
            { name: "desired", label: "Desired nodes", type: "number", required: true, default: 2 },
            { name: "max", label: "Max nodes", type: "number", required: true, default: 3 },
            { name: "spot", label: "Use Spot capacity", type: "checkbox" },
          ],
          onSubmit: async v => {
            await API.call("eks", "CreateNodegroup", {
              clusterName: cluster, nodegroupName: v.name, nodeRole: await EKS_NODE_ROLE(), subnets: c.resourcesVpcConfig.subnetIds,
              instanceTypes: [v.type], scalingConfig: { minSize: v.min, desiredSize: v.desired, maxSize: v.max }, capacityType: v.spot ? "SPOT" : "ON_DEMAND",
            });
            panel.refresh();
          },
        }),
      },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete node group",
        run: async rows => { for (const n of rows) await API.call("eks", "DeleteNodegroup", { clusterName: cluster, nodegroupName: n.nodegroupName }); } }],
    });
    return panel;
  };
  const addons = () => resourcePanel({
    title: "Add-ons",
    rowKey: "addonName",
    load: async () => {
      const names = await API.all("eks", "ListAddons", { clusterName: cluster }, "addons", "nextToken");
      return Promise.all(names.map(n => API.call("eks", "DescribeAddon", { clusterName: cluster, addonName: n }).then(r => r.addon)));
    },
    columns: [{ label: "Name", key: "addonName" }, { label: "Status", render: a => badge(a.status) }, { label: "Version", key: "addonVersion" }],
    create: {
      label: "Add add-on",
      open: () => formModal({
        title: "Add add-on",
        fields: [{ name: "name", label: "Add-on", type: "select", required: true, options: ["vpc-cni", "coredns", "kube-proxy", "aws-ebs-csi-driver", "eks-pod-identity-agent", "metrics-server"] }],
        onSubmit: async v => { await API.call("eks", "CreateAddon", { clusterName: cluster, addonName: v.name }); renderRoute(); },
      }),
    },
    actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete add-on",
      run: async rows => { for (const a of rows) await API.call("eks", "DeleteAddon", { clusterName: cluster, addonName: a.addonName }); } }],
  });
  const kubeconfig = () => h("div", { class: "panel panel-pad" },
    h("p", { class: "muted" }, "The endpoint serves an emulated Kubernetes API. To point kubectl at it:"),
    codeBlock(`aws eks update-kubeconfig --name ${cluster}`, { wrap: true }),
    kv([["Endpoint", c.endpoint], ["Role", c.roleArn], ["Subnets", (c.resourcesVpcConfig?.subnetIds || []).join(", ")], ["OIDC issuer", c.identity?.oidc?.issuer]]),
    jsonView(c));
  page.appendChild(tabs([{ label: "Node groups", render: nodegroups }, { label: "Add-ons", render: addons }, { label: "Details", render: kubeconfig }]));
  return page;
});
