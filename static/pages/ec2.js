"use strict";

navGroup("Compute", [{ path: "/ec2", label: "EC2", keywords: "instance vm ami security group key pair vpc subnet volume" }]);

const INSTANCE_TYPES = ["t3.micro", "t3.small", "t3.medium", "t3.large", "t4g.micro", "t4g.small", "m5.large", "m6i.large", "m7g.large", "c6i.large", "r6i.large", "g5.xlarge"];

async function amiOptions() {
  const r = await API.call("ec2", "DescribeImages", { Owners: ["amazon", "self"], Filters: [{ Name: "state", Values: ["available"] }] });
  return r.Images
    .sort((a, b) => String(b.CreationDate).localeCompare(String(a.CreationDate)))
    .slice(0, 200)
    .map(i => ({ value: i.ImageId, label: `${i.Name || i.ImageId} · ${i.Architecture} · ${i.ImageId}` }));
}

route("/ec2", async ({ tab }) => {
  const page = h("div", pageHeader("EC2", "Instances, images, networking and security."));
  const T = ["instances", "amis", "sg", "keys", "vpc", "volumes"];

  const instances = () => {
    const panel = resourcePanel({
      title: "Instances",
      rowKey: "InstanceId",
      load: async () => (await API.call("ec2", "DescribeInstances")).Reservations.flatMap(r => r.Instances),
      columns: [
        { label: "Name", render: i => nameTag(i.Tags) || "—" },
        { label: "Instance ID", class: "mono", key: "InstanceId" },
        { label: "State", render: i => badge(i.State?.Name) },
        { label: "Type", key: "InstanceType" },
        { label: "AZ", key: "Placement.AvailabilityZone" },
        { label: "Private IP", class: "mono", key: "PrivateIpAddress" },
        { label: "Public IP", class: "mono", key: "PublicIpAddress" },
        { label: "AMI", class: "mono", key: "ImageId" },
        { label: "Launched", render: i => fmtDate(i.LaunchTime) },
      ],
      poll: i => ["pending", "stopping", "shutting-down"].includes(i.State?.Name),
      onRowClick: i => showJson(i.InstanceId, i),
      empty: "No instances. Launch one.",
      create: { label: "Launch instances", open: () => launchForm(() => panel.refresh()) },
      actions: [
        { label: "Start", icon: "play", run: async rows => API.call("ec2", "StartInstances", { InstanceIds: rows.map(r => r.InstanceId) }) },
        { label: "Stop", icon: "stop", run: async rows => API.call("ec2", "StopInstances", { InstanceIds: rows.map(r => r.InstanceId) }) },
        { label: "Reboot", run: async rows => API.call("ec2", "RebootInstances", { InstanceIds: rows.map(r => r.InstanceId) }) },
        { label: "Terminate", kind: "danger", icon: "trash", confirm: "Terminate", run: async rows => API.call("ec2", "TerminateInstances", { InstanceIds: rows.map(r => r.InstanceId) }) },
      ],
    });
    return panel;
  };

  const amis = () => resourcePanel({
    title: "AMIs",
    description: "Images built into the emulator plus any you register.",
    rowKey: "ImageId",
    load: async () => (await API.call("ec2", "DescribeImages", { Owners: ["amazon", "self"] })).Images.slice(0, 300),
    columns: [
      { label: "Name", key: "Name" }, { label: "Image ID", class: "mono", key: "ImageId" },
      { label: "Arch", key: "Architecture" }, { label: "Platform", render: i => i.PlatformDetails || i.Platform || "Linux/UNIX" },
      { label: "Owner", key: "ImageOwnerAlias" }, { label: "Created", render: i => fmtDate(i.CreationDate) },
    ],
    onRowClick: i => showJson(i.ImageId, i),
  });

  const sgs = () => {
    const panel = resourcePanel({
      title: "Security groups",
      rowKey: "GroupId",
      load: async () => (await API.call("ec2", "DescribeSecurityGroups")).SecurityGroups,
      columns: [
        { label: "Name", key: "GroupName" }, { label: "Group ID", class: "mono", key: "GroupId" }, { label: "VPC", class: "mono", key: "VpcId" },
        { label: "Inbound rules", render: g => (g.IpPermissions || []).map(p => `${p.IpProtocol === "-1" ? "all" : p.IpProtocol}:${p.FromPort ?? "*"}${p.ToPort !== p.FromPort ? "-" + p.ToPort : ""} ← ${(p.IpRanges || []).map(x => x.CidrIp).concat((p.UserIdGroupPairs || []).map(x => x.GroupId)).join(",")}`).join("; ") || "—" },
        { label: "Description", key: "Description" },
      ],
      onRowClick: g => showJson(g.GroupId, g),
      create: {
        label: "Create security group",
        open: () => formModal({
          title: "Create security group",
          fields: [
            { name: "name", label: "Name", required: true }, { name: "desc", label: "Description", required: true, default: "Created from the console" },
            { name: "vpc", label: "VPC", type: "select", required: true, options: () => Pick.vpcs() },
          ],
          onSubmit: async v => { await API.call("ec2", "CreateSecurityGroup", { GroupName: v.name, Description: v.desc, VpcId: v.vpc }); panel.refresh(); },
        }),
      },
      actions: [
        { label: "Add inbound rule", multi: false, open: (rows, refresh) => {
          formModal({
            title: `Inbound rule for ${rows[0].GroupName}`, submitLabel: "Add rule",
            fields: [
              { name: "proto", label: "Protocol", type: "select", required: true, default: "tcp", options: ["tcp", "udp", "icmp", { value: "-1", label: "All traffic" }] },
              { name: "from", label: "From port", type: "number", default: 22, showIf: v => v.proto === "tcp" || v.proto === "udp" },
              { name: "to", label: "To port", type: "number", default: 22, showIf: v => v.proto === "tcp" || v.proto === "udp" },
              { name: "cidr", label: "Source CIDR", required: true, default: "10.0.0.0/16" },
            ],
            onSubmit: async v => {
              const perm = { IpProtocol: v.proto, IpRanges: [{ CidrIp: v.cidr }] };
              if (v.proto === "tcp" || v.proto === "udp") { perm.FromPort = v.from; perm.ToPort = v.to ?? v.from; }
              await API.call("ec2", "AuthorizeSecurityGroupIngress", { GroupId: rows[0].GroupId, IpPermissions: [perm] });
              toast("Rule added");
              refresh();
            },
          });
        } },
        { label: "Delete", kind: "danger", icon: "trash", confirm: "Delete security group", run: async rows => { for (const g of rows) await API.call("ec2", "DeleteSecurityGroup", { GroupId: g.GroupId }); } },
      ],
    });
    return panel;
  };

  const keys = () => {
    const panel = resourcePanel({
      title: "Key pairs",
      rowKey: "KeyName",
      load: async () => (await API.call("ec2", "DescribeKeyPairs")).KeyPairs,
      columns: [{ label: "Name", key: "KeyName" }, { label: "ID", class: "mono", key: "KeyPairId" }, { label: "Type", key: "KeyType" }, { label: "Fingerprint", class: "mono wrap", key: "KeyFingerprint" }],
      create: {
        label: "Create key pair",
        open: () => formModal({
          title: "Create key pair",
          fields: [{ name: "name", label: "Name", required: true }, { name: "type", label: "Type", type: "select", required: true, default: "ed25519", options: ["ed25519", "rsa"] }],
          onSubmit: async v => {
            const r = await API.call("ec2", "CreateKeyPair", { KeyName: v.name, KeyType: v.type });
            panel.refresh();
            modal({ title: `Private key for ${v.name}`, wide: true, body: h("div",
              h("p", { class: "muted" }, "Shown once. It's an emulator key, so it doesn't open any real machine."),
              codeBlock(r.KeyMaterial || ""),
              h("p", button("Download .pem", () => {
                const a = h("a", { href: URL.createObjectURL(new Blob([r.KeyMaterial], { type: "application/x-pem-file" })), download: v.name + ".pem" });
                a.click(); URL.revokeObjectURL(a.href);
              }))) });
          },
        }),
      },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete key pair", run: async rows => { for (const k of rows) await API.call("ec2", "DeleteKeyPair", { KeyName: k.KeyName }); } }],
    });
    return panel;
  };

  const vpc = () => h("div",
    resourcePanel({
      title: "VPCs", rowKey: "VpcId",
      load: async () => (await API.call("ec2", "DescribeVpcs")).Vpcs,
      columns: [{ label: "Name", render: v => nameTag(v.Tags) || (v.IsDefault ? "default" : "—") }, { label: "VPC ID", class: "mono", key: "VpcId" }, { label: "CIDR", class: "mono", key: "CidrBlock" }, { label: "State", render: v => badge(v.State) }, { label: "Default", render: v => (v.IsDefault ? "Yes" : "No") }],
      onRowClick: v => showJson(v.VpcId, v),
      create: { label: "Create VPC", open: () => formModal({
        title: "Create VPC",
        fields: [{ name: "name", label: "Name tag" }, { name: "cidr", label: "IPv4 CIDR", required: true, default: "10.0.0.0/16" }],
        onSubmit: async v => {
          const p = { CidrBlock: v.cidr };
          if (v.name) p.TagSpecifications = [{ ResourceType: "vpc", Tags: [{ Key: "Name", Value: v.name }] }];
          await API.call("ec2", "CreateVpc", p); renderRoute();
        } }) },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete VPC", run: async rows => { for (const v of rows) await API.call("ec2", "DeleteVpc", { VpcId: v.VpcId }); } }],
    }),
    resourcePanel({
      title: "Subnets", rowKey: "SubnetId",
      load: async () => (await API.call("ec2", "DescribeSubnets")).Subnets,
      columns: [{ label: "Name", render: s => nameTag(s.Tags) || "—" }, { label: "Subnet ID", class: "mono", key: "SubnetId" }, { label: "VPC", class: "mono", key: "VpcId" }, { label: "AZ", key: "AvailabilityZone" }, { label: "CIDR", class: "mono", key: "CidrBlock" }, { label: "Free IPs", class: "num", key: "AvailableIpAddressCount" }],
      onRowClick: s => showJson(s.SubnetId, s),
      create: { label: "Create subnet", open: () => formModal({
        title: "Create subnet",
        fields: [
          { name: "vpc", label: "VPC", type: "select", required: true, options: () => Pick.vpcs() },
          { name: "cidr", label: "IPv4 CIDR", required: true, default: "10.0.1.0/24" },
          { name: "az", label: "Availability zone", type: "select", required: true, default: "us-east-1a", options: ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d", "us-east-1e", "us-east-1f"] },
          { name: "name", label: "Name tag" },
        ],
        onSubmit: async v => {
          const p = { VpcId: v.vpc, CidrBlock: v.cidr, AvailabilityZone: v.az };
          if (v.name) p.TagSpecifications = [{ ResourceType: "subnet", Tags: [{ Key: "Name", Value: v.name }] }];
          await API.call("ec2", "CreateSubnet", p); renderRoute();
        } }) },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete subnet", run: async rows => { for (const s of rows) await API.call("ec2", "DeleteSubnet", { SubnetId: s.SubnetId }); } }],
    }));

  const volumes = () => {
    const panel = resourcePanel({
      title: "EBS volumes", rowKey: "VolumeId",
      load: async () => (await API.call("ec2", "DescribeVolumes")).Volumes,
      columns: [{ label: "Volume ID", class: "mono", key: "VolumeId" }, { label: "State", render: v => badge(v.State) }, { label: "Size", render: v => v.Size + " GiB" }, { label: "Type", key: "VolumeType" }, { label: "AZ", key: "AvailabilityZone" }, { label: "Attached to", class: "mono", render: v => (v.Attachments || []).map(a => a.InstanceId).join(", ") }],
      poll: v => v.State === "creating",
      create: { label: "Create volume", open: () => formModal({
        title: "Create volume",
        fields: [
          { name: "size", label: "Size (GiB)", type: "number", required: true, default: 8 },
          { name: "type", label: "Type", type: "select", required: true, default: "gp3", options: ["gp3", "gp2", "io2", "st1", "sc1"] },
          { name: "az", label: "Availability zone", type: "select", required: true, default: "us-east-1a", options: ["us-east-1a", "us-east-1b", "us-east-1c"] },
        ],
        onSubmit: async v => { await API.call("ec2", "CreateVolume", { Size: v.size, VolumeType: v.type, AvailabilityZone: v.az }); panel.refresh(); } }) },
      actions: [{ label: "Delete", kind: "danger", icon: "trash", confirm: "Delete volume", run: async rows => { for (const v of rows) await API.call("ec2", "DeleteVolume", { VolumeId: v.VolumeId }); } }],
    });
    return panel;
  };

  page.appendChild(tabs([
    { label: "Instances", render: instances }, { label: "AMIs", render: amis }, { label: "Security groups", render: sgs },
    { label: "Key pairs", render: keys }, { label: "VPCs & subnets", render: vpc }, { label: "Volumes", render: volumes },
  ], Math.max(0, T.indexOf(tab))));
  return page;
});

function launchForm(after) {
  return formModal({
    title: "Launch instances", wide: true, submitLabel: "Launch",
    fields: [
      { name: "name", label: "Name", placeholder: "web-1" },
      { name: "ami", label: "Image (AMI)", type: "select", required: true, options: amiOptions },
      { name: "type", label: "Instance type", type: "select", required: true, default: "t3.micro", options: INSTANCE_TYPES },
      { name: "count", label: "Number of instances", type: "number", required: true, default: 1, min: 1, max: 20 },
      { name: "subnet", label: "Subnet", type: "select", options: () => Pick.subnets(), placeholder: "Default" },
      { name: "sgs", label: "Security groups", type: "multiselect", options: () => Pick.securityGroups() },
      { name: "key", label: "Key pair", type: "select", placeholder: "None", options: async () => (await API.call("ec2", "DescribeKeyPairs")).KeyPairs.map(k => k.KeyName) },
      { name: "userData", label: "User data (optional)", type: "code", rows: 5, placeholder: "#!/bin/bash\necho hello" },
    ],
    onSubmit: async v => {
      const p = { ImageId: v.ami, InstanceType: v.type, MinCount: v.count, MaxCount: v.count };
      if (v.subnet) p.SubnetId = v.subnet;
      if (v.sgs.length) p.SecurityGroupIds = v.sgs;
      if (v.key) p.KeyName = v.key;
      if (v.userData) p.UserData = btoa(unescape(encodeURIComponent(v.userData)));
      if (v.name) p.TagSpecifications = [{ ResourceType: "instance", Tags: [{ Key: "Name", Value: v.name }] }];
      const r = await API.call("ec2", "RunInstances", p);
      toast(`Launched ${r.Instances.map(i => i.InstanceId).join(", ")}`);
      after();
    },
  });
}
