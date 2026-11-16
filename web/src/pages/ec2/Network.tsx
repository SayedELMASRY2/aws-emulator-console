import { useState } from "react";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Tiles from "@cloudscape-design/components/tiles";
import Textarea from "@cloudscape-design/components/textarea";
import Checkbox from "@cloudscape-design/components/checkbox";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Table from "@cloudscape-design/components/table";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ValueWithLabel } from "../../common";
import { ec2, State, fmt, nameOf, instHref, sgHref, allInstances, useSubnets, useSgs, tagSpec } from "./lib";
import { ResourcePage, ActionModal, useModal } from "./ResourcePage";
import { TagsModal } from "./InstanceActions";
import { NewKeyModal } from "./LaunchWizard";

const crumbs = (t: string) => [{ text: "EC2", href: "#/ec2/dashboard" }, { text: t, href: "#" }];
const tagTable = (tags?: any[]) => <Table variant="embedded" items={tags || []} empty={<Box color="text-body-secondary">No tags</Box>} columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value }]} />;

// ---------------- Elastic IPs ----------------
export function ElasticIps() {
  useCrumbs(crumbs("Elastic IP addresses"));
  const flash = useFlash();
  const m = useModal<any>();
  const [kind, setKind] = useState("instance");
  const [target, setTarget] = useState<any>(null);
  const [reassoc, setReassoc] = useState(false);
  const [name, setName] = useState("");
  const insts = useAsync(async () => (await allInstances([{ Name: "instance-state-name", Values: ["running", "stopped"] }])).map(i => ({ value: i.InstanceId, label: `${i.InstanceId}${nameOf(i) ? ` (${nameOf(i)})` : ""}` })), [m.is("assoc")]);
  const enis = useAsync(async () => ((await ec2("DescribeNetworkInterfaces")).NetworkInterfaces || []).map((n: any) => ({ value: n.NetworkInterfaceId, label: n.NetworkInterfaceId, description: n.PrivateIpAddress })), [m.is("assoc")]);
  return <>
    <ResourcePage<any>
      title="Elastic IP addresses" trackBy="AllocationId"
      load={async () => (await ec2("DescribeAddresses")).Addresses || []}
      create={{ text: "Allocate Elastic IP address", onClick: r => { setName(""); m.open("alloc", [], r); } }}
      columns={[
        { id: "n", header: "Name", cell: a => nameOf(a) || "-" },
        { id: "ip", header: "Allocated IPv4 address", cell: a => a.PublicIp },
        { id: "t", header: "Type", cell: () => "Public IP" },
        { id: "id", header: "Allocation ID", cell: a => a.AllocationId },
        { id: "i", header: "Associated instance ID", cell: a => a.InstanceId ? <Link href={instHref(a.InstanceId)}>{a.InstanceId}</Link> : "-" },
        { id: "p", header: "Private IP address", cell: a => a.PrivateIpAddress || "-" },
        { id: "as", header: "Association ID", cell: a => a.AssociationId || "-" },
        { id: "ni", header: "Network interface ID", cell: a => a.NetworkInterfaceId || "-" },
        { id: "nb", header: "Network border group", cell: a => a.NetworkBorderGroup || "us-east-1" },
      ]}
      actions={[
        { id: "assoc", text: "Associate Elastic IP address", disabled: s => s.length !== 1, run: (s, r) => { setTarget(null); m.open("assoc", s, r); } },
        { id: "disassoc", text: "Disassociate Elastic IP address", disabled: s => s.length !== 1 || !s[0].AssociationId, run: (s, r) => m.open("disassoc", s, r) },
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "release", text: "Release Elastic IP addresses", disabled: s => !s.length || s.some(a => a.AssociationId), disabledReason: "Disassociate the address first.", run: (s, r) => m.open("release", s, r) },
      ]}
      detail={a => [{ id: "d", label: "Summary", content: <ColumnLayout columns={3} variant="text-grid">
        <ValueWithLabel label="Allocated IPv4 address">{a.PublicIp}</ValueWithLabel>
        <ValueWithLabel label="Allocation ID">{a.AllocationId}</ValueWithLabel>
        <ValueWithLabel label="Scope">{a.Domain}</ValueWithLabel>
        <ValueWithLabel label="Associated instance ID">{a.InstanceId || "-"}</ValueWithLabel>
        <ValueWithLabel label="Private IP address">{a.PrivateIpAddress || "-"}</ValueWithLabel>
        <ValueWithLabel label="Public DNS">{a.PublicIp ? `ec2-${a.PublicIp.replace(/\./g, "-")}.compute-1.amazonaws.com` : "-"}</ValueWithLabel>
      </ColumnLayout> }, { id: "t", label: "Tags", content: tagTable(a.Tags) }]}
    />
    <ActionModal visible={m.is("alloc")} onDismiss={m.close} header="Allocate Elastic IP address" ok="Allocate" onOk={async () => {
      const r = await ec2("AllocateAddress", { Domain: "vpc", TagSpecifications: tagSpec("elastic-ip", name) }); flash.notify({ type: "success", content: `Elastic IP address allocated successfully. Elastic IP address ${r.PublicIp}` }); m.reload();
    }}>
      <FormField label="Network border group"><Box>us-east-1</Box></FormField>
      <FormField label="Public IPv4 address pool"><RadioGroup value="amazon" items={[{ value: "amazon", label: "Amazon's pool of IPv4 addresses" }]} /></FormField>
      <FormField label="Name tag - optional"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
    </ActionModal>
    <ActionModal visible={m.is("assoc")} onDismiss={m.close} header="Associate Elastic IP address" ok="Associate" disabled={!target} onOk={async () => {
      await ec2("AssociateAddress", { AllocationId: m.rows[0].AllocationId, AllowReassociation: reassoc, ...(kind === "instance" ? { InstanceId: target.value } : { NetworkInterfaceId: target.value }) });
      flash.notify({ type: "success", content: `Elastic IP address associated successfully.` }); m.reload();
    }}>
      <ValueWithLabel label="Elastic IP address">{m.rows[0]?.PublicIp}</ValueWithLabel>
      <FormField label="Resource type"><Tiles value={kind} onChange={e => { setKind(e.detail.value); setTarget(null); }} items={[{ value: "instance", label: "Instance" }, { value: "eni", label: "Network interface" }]} /></FormField>
      <FormField label={kind === "instance" ? "Instance" : "Network interface"}><Select selectedOption={target} placeholder="Choose" options={(kind === "instance" ? insts.data : enis.data) || []} filteringType="auto" onChange={e => setTarget(e.detail.selectedOption)} /></FormField>
      <Checkbox checked={reassoc} onChange={e => setReassoc(e.detail.checked)}>Allow this Elastic IP address to be reassociated</Checkbox>
    </ActionModal>
    <ActionModal visible={m.is("disassoc")} onDismiss={m.close} header="Disassociate Elastic IP address" ok="Disassociate" onOk={async () => {
      await ec2("DisassociateAddress", { AssociationId: m.rows[0].AssociationId }); flash.notify({ type: "success", content: "Elastic IP address disassociated." }); m.reload();
    }}><Box>Disassociate {m.rows[0]?.PublicIp} from {m.rows[0]?.InstanceId || m.rows[0]?.NetworkInterfaceId}?</Box></ActionModal>
    {m.is("tags") && <TagsModal id={m.rows[0].AllocationId} tags={m.rows[0].Tags} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("release")} onDismiss={m.close} header="Release Elastic IP addresses" ok="Release" danger onOk={async () => {
      for (const a of m.rows) await ec2("ReleaseAddress", { AllocationId: a.AllocationId }); flash.notify({ type: "success", content: "Elastic IP addresses released." }); m.reload();
    }}><Box>Release {m.rows.map(a => a.PublicIp).join(", ")}? You can't recover a released address.</Box></ActionModal>
  </>;
}

// ---------------- Key pairs ----------------
export function KeyPairs() {
  useCrumbs(crumbs("Key pairs"));
  const flash = useFlash();
  const m = useModal<any>();
  const [imp, setImp] = useState({ name: "", key: "" });
  return <>
    <ResourcePage<any>
      title="Key pairs" trackBy="KeyName"
      load={async () => (await ec2("DescribeKeyPairs")).KeyPairs || []}
      create={{ text: "Create key pair", onClick: r => m.open("create", [], r) }}
      primaryActions={[{ id: "import", text: "Import key pair", disabled: () => false, run: (_s, r) => { setImp({ name: "", key: "" }); m.open("import", [], r); } }]}
      columns={[
        { id: "n", header: "Name", cell: k => k.KeyName },
        { id: "t", header: "Type", cell: k => k.KeyType },
        { id: "c", header: "Created", cell: k => fmt(k.CreateTime) },
        { id: "f", header: "Fingerprint", cell: k => k.KeyFingerprint },
        { id: "id", header: "ID", cell: k => k.KeyPairId },
      ]}
      actions={[
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "delete", text: "Delete", run: (s, r) => m.open("delete", s, r) },
      ]}
    />
    {m.is("create") && <NewKeyModal close={m.close} onCreated={k => { flash.notify({ type: "success", content: `Successfully created key pair ${k}. The private key file was downloaded.` }); m.reload(); }} />}
    <ActionModal visible={m.is("import")} onDismiss={m.close} header="Import key pair" ok="Import key pair" disabled={!imp.name || !imp.key} onOk={async () => {
      await ec2("ImportKeyPair", { KeyName: imp.name, PublicKeyMaterial: imp.key.trim() }); flash.notify({ type: "success", content: `Successfully imported key pair ${imp.name}.` }); m.reload();
    }}>
      <FormField label="Name"><Input value={imp.name} onChange={e => setImp({ ...imp, name: e.detail.value })} /></FormField>
      <FormField label="Public key contents" description="Paste an OpenSSH public key (ssh-rsa or ssh-ed25519) or choose a .pub file.">
        <Textarea rows={5} value={imp.key} onChange={e => setImp({ ...imp, key: e.detail.value })} placeholder="ssh-ed25519 AAAA..." />
      </FormField>
      <input type="file" accept=".pub,.pem,.txt" onChange={async e => { const f = e.target.files?.[0]; if (f) setImp({ name: imp.name || f.name.replace(/\.(pub|pem|txt)$/, ""), key: await f.text() }); }} />
    </ActionModal>
    {m.is("tags") && <TagsModal id={m.rows[0].KeyPairId} tags={m.rows[0].Tags} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete key pair" ok="Delete" danger onOk={async () => {
      for (const k of m.rows) await ec2("DeleteKeyPair", { KeyName: k.KeyName }); flash.notify({ type: "success", content: "Key pairs deleted." }); m.reload();
    }}><Box>Delete {m.rows.map(k => k.KeyName).join(", ")}? Instances launched with these keys keep running, but you'll need the private key files to connect.</Box></ActionModal>
  </>;
}

// ---------------- Network interfaces ----------------
export function NetworkInterfaces() {
  useCrumbs(crumbs("Network interfaces"));
  const flash = useFlash();
  const m = useModal<any>();
  const subnets = useSubnets();
  const [f, setF] = useState<any>({ desc: "", subnet: null, ipMode: "auto", ip: "", sgs: [], name: "" });
  const sgs = useSgs(f.subnet?.raw?.VpcId);
  const [inst, setInst] = useState<any>(null);
  const insts = useAsync(async () => (await allInstances([{ Name: "instance-state-name", Values: ["running", "stopped"] }])).map(i => ({ value: i.InstanceId, label: `${i.InstanceId}${nameOf(i) ? ` (${nameOf(i)})` : ""}`, vpc: i.VpcId, n: (i.NetworkInterfaces || []).length })), [m.is("attach")]);
  return <>
    <ResourcePage<any>
      title="Network interfaces" trackBy="NetworkInterfaceId"
      load={async () => (await ec2("DescribeNetworkInterfaces")).NetworkInterfaces || []}
      poll={n => ["attaching", "detaching"].includes(n.Attachment?.Status)}
      create={{ text: "Create network interface", onClick: r => { setF({ desc: "", subnet: null, ipMode: "auto", ip: "", sgs: [], name: "" }); m.open("create", [], r); } }}
      columns={[
        { id: "n", header: "Name", cell: n => nameOf({ Tags: n.TagSet }) || "-" },
        { id: "id", header: "Network interface ID", cell: n => n.NetworkInterfaceId },
        { id: "s", header: "Subnet ID", cell: n => n.SubnetId },
        { id: "v", header: "VPC ID", cell: n => n.VpcId },
        { id: "az", header: "Availability Zone", cell: n => n.AvailabilityZone },
        { id: "sg", header: "Security group names", cell: n => (n.Groups || []).map((g: any) => g.GroupName).join(", ") },
        { id: "d", header: "Description", cell: n => n.Description || "-" },
        { id: "t", header: "Interface Type", cell: n => n.InterfaceType },
        { id: "st", header: "Status", cell: n => <State s={n.Status} /> },
        { id: "pub", header: "Public IPv4 address", cell: n => n.Association?.PublicIp || "-" },
        { id: "ip", header: "Primary private IPv4 address", cell: n => n.PrivateIpAddress },
        { id: "i", header: "Instance ID", cell: n => n.Attachment?.InstanceId ? <Link href={instHref(n.Attachment.InstanceId)}>{n.Attachment.InstanceId}</Link> : "-" },
      ]}
      actions={[
        { id: "attach", text: "Attach", disabled: s => s.length !== 1 || s[0].Status !== "available", run: (s, r) => { setInst(null); m.open("attach", s, r); } },
        { id: "detach", text: "Detach", disabled: s => s.length !== 1 || !s[0].Attachment || s[0].Attachment.DeviceIndex === 0, disabledReason: "Primary network interfaces can't be detached.", run: async (s, r) => { await ec2("DetachNetworkInterface", { AttachmentId: s[0].Attachment.AttachmentId }); flash.notify({ type: "success", content: `Detaching ${s[0].NetworkInterfaceId}.` }); r(); } },
        { id: "srcdst", text: "Change source/dest check", disabled: s => s.length !== 1, run: async (s, r) => { await ec2("ModifyNetworkInterfaceAttribute", { NetworkInterfaceId: s[0].NetworkInterfaceId, SourceDestCheck: { Value: !s[0].SourceDestCheck } }); flash.notify({ type: "success", content: `Source/dest check ${s[0].SourceDestCheck ? "disabled" : "enabled"}.` }); r(); } },
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "delete", text: "Delete", disabled: s => !s.length || s.some(n => n.Status !== "available"), disabledReason: "Detach first.", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={n => [{ id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
        <ValueWithLabel label="Network interface ID">{n.NetworkInterfaceId}</ValueWithLabel>
        <ValueWithLabel label="Status"><State s={n.Status} /></ValueWithLabel>
        <ValueWithLabel label="MAC address">{n.MacAddress}</ValueWithLabel>
        <ValueWithLabel label="Source/dest. check">{String(n.SourceDestCheck)}</ValueWithLabel>
        <ValueWithLabel label="Private IPv4 DNS">{n.PrivateDnsName || "-"}</ValueWithLabel>
        <ValueWithLabel label="Private IPv4 addresses">{(n.PrivateIpAddresses || []).map((p: any) => p.PrivateIpAddress).join(", ")}</ValueWithLabel>
        <ValueWithLabel label="Security groups">{(n.Groups || []).map((g: any) => <div key={g.GroupId}><Link href={sgHref(g.GroupId)}>{g.GroupId}</Link></div>)}</ValueWithLabel>
        <ValueWithLabel label="Requester-managed">{String(n.RequesterManaged)}</ValueWithLabel>
      </ColumnLayout> }, { id: "t", label: "Tags", content: tagTable(n.TagSet) }]}
    />
    <ActionModal visible={m.is("create")} onDismiss={m.close} header="Create network interface" ok="Create network interface" size="medium" disabled={!f.subnet} onOk={async () => {
      const r = await ec2("CreateNetworkInterface", { SubnetId: f.subnet.value, Description: f.desc || undefined, ...(f.ipMode === "custom" && f.ip ? { PrivateIpAddress: f.ip } : {}), ...(f.sgs.length ? { Groups: f.sgs.map((g: any) => g.value) } : {}), TagSpecifications: tagSpec("network-interface", f.name) });
      flash.notify({ type: "success", content: `Successfully created ${r.NetworkInterface.NetworkInterfaceId}.` }); m.reload();
    }}>
      <FormField label="Description - optional"><Input value={f.desc} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
      <FormField label="Subnet"><Select selectedOption={f.subnet} placeholder="Select a subnet" options={subnets.data || []} onChange={e => setF({ ...f, subnet: e.detail.selectedOption, sgs: [] })} /></FormField>
      <FormField label="Private IPv4 address"><RadioGroup value={f.ipMode} onChange={e => setF({ ...f, ipMode: e.detail.value })} items={[{ value: "auto", label: "Auto-assign" }, { value: "custom", label: "Custom" }]} /></FormField>
      {f.ipMode === "custom" && <FormField label="IPv4 address"><Input value={f.ip} onChange={e => setF({ ...f, ip: e.detail.value })} placeholder="172.31.0.50" /></FormField>}
      <FormField label="Security groups"><Multiselect selectedOptions={f.sgs} options={sgs.data || []} onChange={e => setF({ ...f, sgs: e.detail.selectedOptions })} placeholder="Select security groups" /></FormField>
      <FormField label="Name tag - optional"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
    </ActionModal>
    <ActionModal visible={m.is("attach")} onDismiss={m.close} header="Attach network interface" ok="Attach" disabled={!inst} onOk={async () => {
      await ec2("AttachNetworkInterface", { NetworkInterfaceId: m.rows[0].NetworkInterfaceId, InstanceId: inst.value, DeviceIndex: inst.n }); flash.notify({ type: "success", content: `Attaching to ${inst.value}.` }); m.reload();
    }}>
      <FormField label="Instance" description="Instances in the same VPC as the network interface."><Select selectedOption={inst} placeholder="Select an instance" options={(insts.data || []).filter((i: any) => i.vpc === m.rows[0]?.VpcId)} onChange={e => setInst(e.detail.selectedOption)} /></FormField>
    </ActionModal>
    {m.is("tags") && <TagsModal id={m.rows[0].NetworkInterfaceId} tags={m.rows[0].TagSet} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete network interface" ok="Delete" danger onOk={async () => {
      for (const n of m.rows) await ec2("DeleteNetworkInterface", { NetworkInterfaceId: n.NetworkInterfaceId }); flash.notify({ type: "success", content: "Network interfaces deleted." }); m.reload();
    }}><Box>Delete {m.rows.map(n => n.NetworkInterfaceId).join(", ")}?</Box></ActionModal>
  </>;
}

// ---------------- Placement groups ----------------
export function PlacementGroups() {
  useCrumbs(crumbs("Placement groups"));
  const flash = useFlash();
  const m = useModal<any>();
  const [f, setF] = useState({ name: "", strategy: "cluster", partitions: "2", spread: "rack" });
  return <>
    <ResourcePage<any>
      title="Placement groups" trackBy="GroupName"
      load={async () => (await ec2("DescribePlacementGroups")).PlacementGroups || []}
      create={{ text: "Create placement group", onClick: r => { setF({ name: "", strategy: "cluster", partitions: "2", spread: "rack" }); m.open("create", [], r); } }}
      columns={[
        { id: "n", header: "Group name", cell: g => g.GroupName },
        { id: "id", header: "Group ID", cell: g => g.GroupId },
        { id: "s", header: "Strategy", cell: g => g.Strategy },
        { id: "st", header: "State", cell: g => <State s={g.State} /> },
        { id: "p", header: "Partitions", cell: g => g.PartitionCount ?? "-" },
        { id: "sl", header: "Spread level", cell: g => g.SpreadLevel || "-" },
      ]}
      actions={[{ id: "delete", text: "Delete", run: async (s, r) => { for (const g of s) await ec2("DeletePlacementGroup", { GroupName: g.GroupName }); flash.notify({ type: "success", content: "Placement groups deleted." }); r(); } }]}
    />
    <ActionModal visible={m.is("create")} onDismiss={m.close} header="Create placement group" ok="Create group" disabled={!f.name} onOk={async () => {
      await ec2("CreatePlacementGroup", { GroupName: f.name, Strategy: f.strategy, ...(f.strategy === "partition" ? { PartitionCount: Number(f.partitions) } : {}), ...(f.strategy === "spread" ? { SpreadLevel: f.spread } : {}) });
      flash.notify({ type: "success", content: `Placement group ${f.name} created.` }); m.reload();
    }}>
      <FormField label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
      <FormField label="Placement strategy"><Select selectedOption={{ value: f.strategy, label: f.strategy[0].toUpperCase() + f.strategy.slice(1) }} options={[{ value: "cluster", label: "Cluster" }, { value: "spread", label: "Spread" }, { value: "partition", label: "Partition" }]} onChange={e => setF({ ...f, strategy: e.detail.selectedOption.value! })} /></FormField>
      {f.strategy === "partition" && <FormField label="Number of partitions"><Input type="number" value={f.partitions} onChange={e => setF({ ...f, partitions: e.detail.value })} /></FormField>}
      {f.strategy === "spread" && <FormField label="Spread level"><RadioGroup value={f.spread} onChange={e => setF({ ...f, spread: e.detail.value })} items={[{ value: "rack", label: "Rack" }, { value: "host", label: "Host" }]} /></FormField>}
    </ActionModal>
  </>;
}
