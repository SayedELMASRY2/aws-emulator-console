import { useState } from "react";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Table from "@cloudscape-design/components/table";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ValueWithLabel, EmulatorNote } from "../../common";
import { Tags } from "../s3/fields";
import { toTagSet, type KV } from "../s3/lib";
import { ec2, State, fmt, nameOf, AZS, VOLUME_TYPES, instHref, allInstances, tagSpec } from "./lib";
import { ResourcePage, ActionModal, useModal } from "./ResourcePage";
import { TagsModal } from "./InstanceActions";
import { api } from "../../api";

const crumbs = (t: string) => [{ text: "EC2", href: "#/ec2/dashboard" }, { text: t, href: "#" }];
const needsIops = (t: string) => ["gp3", "io1", "io2"].includes(t);

function VolumeFields({ v, set, sizeOnly }: { v: any; set: (v: any) => void; sizeOnly?: boolean }) {
  return (
    <ColumnLayout columns={2}>
      {!sizeOnly && <FormField label="Volume type"><Select selectedOption={VOLUME_TYPES.find(t => t.value === v.type)!} options={VOLUME_TYPES} onChange={e => set({ ...v, type: e.detail.selectedOption.value })} /></FormField>}
      <FormField label="Size (GiB)" constraintText={v.type === "gp3" || v.type === "gp2" ? "Min: 1 GiB, Max: 16384 GiB." : undefined}><Input type="number" value={v.size} onChange={e => set({ ...v, size: e.detail.value })} /></FormField>
      {needsIops(v.type) && <FormField label="IOPS" constraintText={v.type === "gp3" ? "Min: 3000 IOPS, Max: 16000 IOPS." : undefined}><Input type="number" value={v.iops} onChange={e => set({ ...v, iops: e.detail.value })} /></FormField>}
      {v.type === "gp3" && <FormField label="Throughput (MiB/s)" constraintText="Min: 125 MiB/s, Max: 1000 MiB/s."><Input type="number" value={v.throughput} onChange={e => set({ ...v, throughput: e.detail.value })} /></FormField>}
    </ColumnLayout>
  );
}
const volParams = (v: any) => ({ VolumeType: v.type, Size: Number(v.size), ...(needsIops(v.type) && v.iops ? { Iops: Number(v.iops) } : {}), ...(v.type === "gp3" && v.throughput ? { Throughput: Number(v.throughput) } : {}) });

// ---------------- Volumes ----------------
export function Volumes() {
  useCrumbs(crumbs("Volumes"));
  const flash = useFlash();
  const m = useModal<any>();
  const [nv, setNv] = useState<any>({ type: "gp3", size: "100", iops: "3000", throughput: "125", az: "us-east-1a", snapshot: "", encrypted: false, kms: "", name: "" });
  const [tags, setTags] = useState<KV[]>([]);
  const [mod, setMod] = useState<any>({});
  const [att, setAtt] = useState<any>({ instance: null, device: "/dev/sdf" });
  const [snapDesc, setSnapDesc] = useState("");
  const [force, setForce] = useState(false);
  const snaps = useAsync(async () => ((await ec2("DescribeSnapshots", { OwnerIds: ["self"] })).Snapshots || []).map((s: any) => ({ value: s.SnapshotId, label: s.SnapshotId, description: `${s.VolumeSize} GiB · ${s.Description || ""}` })), []);
  const insts = useAsync(async () => (await allInstances([{ Name: "instance-state-name", Values: ["running", "stopped"] }])).map(i => ({ value: i.InstanceId, label: `${i.InstanceId}${nameOf(i) ? ` (${nameOf(i)})` : ""}`, description: `${i.Placement?.AvailabilityZone} · ${i.State?.Name}`, az: i.Placement?.AvailabilityZone })), [m.is("attach")]);
  return <>
    <ResourcePage<any>
      title="Volumes" trackBy="VolumeId"
      load={async () => (await ec2("DescribeVolumes")).Volumes || []}
      poll={v => ["creating", "deleting"].includes(v.State) || (v.Attachments || []).some((a: any) => ["attaching", "detaching"].includes(a.State))}
      create={{ text: "Create volume", onClick: r => m.open("create", [], r) }}
      columns={[
        { id: "n", header: "Name", cell: v => nameOf(v) || "-" },
        { id: "id", header: "Volume ID", cell: v => v.VolumeId },
        { id: "t", header: "Type", cell: v => v.VolumeType },
        { id: "s", header: "Size", cell: v => `${v.Size} GiB` },
        { id: "i", header: "IOPS", cell: v => v.Iops ?? "-" },
        { id: "th", header: "Throughput", cell: v => v.Throughput ?? "-" },
        { id: "snap", header: "Snapshot ID", cell: v => v.SnapshotId || "-" },
        { id: "c", header: "Created", cell: v => fmt(v.CreateTime) },
        { id: "az", header: "Availability Zone", cell: v => v.AvailabilityZone },
        { id: "st", header: "Volume state", cell: v => <State s={v.State} /> },
        { id: "a", header: "Attached resources", cell: v => (v.Attachments || []).map((a: any) => <div key={a.InstanceId}><Link href={instHref(a.InstanceId)}>{a.InstanceId}</Link>: {a.Device} ({a.State})</div>) },
        { id: "e", header: "Encryption", cell: v => v.Encrypted ? "Encrypted" : "Not encrypted" },
      ]}
      actions={[
        { id: "modify", text: "Modify volume", disabled: s => s.length !== 1, run: (s, r) => { setMod({ type: s[0].VolumeType, size: String(s[0].Size), iops: String(s[0].Iops || ""), throughput: String(s[0].Throughput || "") }); m.open("modify", s, r); } },
        { id: "snap", text: "Create snapshot", disabled: s => s.length !== 1, run: (s, r) => { setSnapDesc(""); m.open("snap", s, r); } },
        { id: "attach", text: "Attach volume", disabled: s => s.length !== 1 || s[0].State !== "available", disabledReason: "Only available volumes can be attached.", run: (s, r) => m.open("attach", s, r) },
        { id: "detach", text: "Detach volume", disabled: s => s.length !== 1 || s[0].State !== "in-use", run: (s, r) => { setForce(false); m.open("detach", s, r); } },
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "delete", text: "Delete volume", disabled: s => !s.length || s.some(v => v.State !== "available"), disabledReason: "Detach the volume first.", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={v => [
        { id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Volume ID">{v.VolumeId}</ValueWithLabel>
          <ValueWithLabel label="Size">{v.Size} GiB</ValueWithLabel>
          <ValueWithLabel label="Type">{v.VolumeType}</ValueWithLabel>
          <ValueWithLabel label="Volume state"><State s={v.State} /></ValueWithLabel>
          <ValueWithLabel label="IOPS">{v.Iops ?? "-"}</ValueWithLabel>
          <ValueWithLabel label="Throughput">{v.Throughput ?? "-"}</ValueWithLabel>
          <ValueWithLabel label="Encryption">{v.Encrypted ? "Encrypted" : "Not encrypted"}</ValueWithLabel>
          <ValueWithLabel label="KMS key ID">{v.KmsKeyId || "-"}</ValueWithLabel>
          <ValueWithLabel label="Snapshot">{v.SnapshotId || "-"}</ValueWithLabel>
          <ValueWithLabel label="Availability Zone">{v.AvailabilityZone}</ValueWithLabel>
          <ValueWithLabel label="Created">{fmt(v.CreateTime)}</ValueWithLabel>
          <ValueWithLabel label="Multi-Attach enabled">{v.MultiAttachEnabled ? "Yes" : "No"}</ValueWithLabel>
        </ColumnLayout> },
        { id: "s", label: "Status checks", content: <VolumeStatus id={v.VolumeId} /> },
        { id: "t", label: "Tags", content: <Table variant="embedded" items={v.Tags || []} empty={<Box color="text-body-secondary">No tags</Box>} columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value }]} /> },
      ]}
    />
    <ActionModal visible={m.is("create")} onDismiss={m.close} header="Create volume" ok="Create volume" size="large" onOk={async () => {
      const p: any = { AvailabilityZone: nv.az, ...volParams(nv), Encrypted: nv.encrypted || undefined };
      if (nv.snapshot) { p.SnapshotId = nv.snapshot; if (!nv.size) delete p.Size; }
      if (nv.encrypted && nv.kms) p.KmsKeyId = nv.kms;
      const t = [...(nv.name ? [{ Key: "Name", Value: nv.name }] : []), ...toTagSet(tags)];
      if (t.length) p.TagSpecifications = [{ ResourceType: "volume", Tags: t }];
      const r = await ec2("CreateVolume", p); flash.notify({ type: "success", content: `Successfully created volume ${r.VolumeId}.` }); m.reload();
    }}>
      <VolumeFields v={nv} set={setNv} />
      <ColumnLayout columns={2}>
        <FormField label="Availability Zone"><Select selectedOption={{ value: nv.az, label: nv.az }} options={AZS.map(a => ({ value: a, label: a }))} onChange={e => setNv({ ...nv, az: e.detail.selectedOption.value })} /></FormField>
        <FormField label="Snapshot ID - optional"><Select selectedOption={snaps.data?.find((s: any) => s.value === nv.snapshot) || null} placeholder="Don't create volume from a snapshot" options={[{ value: "", label: "Don't create volume from a snapshot" }, ...(snaps.data || [])]} onChange={e => setNv({ ...nv, snapshot: e.detail.selectedOption.value })} /></FormField>
      </ColumnLayout>
      <Checkbox checked={nv.encrypted} onChange={e => setNv({ ...nv, encrypted: e.detail.checked })}>Encrypt this volume</Checkbox>
      {nv.encrypted && <FormField label="KMS key - optional" description="Leave empty for the AWS managed key (aws/ebs)."><Input value={nv.kms} onChange={e => setNv({ ...nv, kms: e.detail.value })} /></FormField>}
      <FormField label="Name tag"><Input value={nv.name} onChange={e => setNv({ ...nv, name: e.detail.value })} /></FormField>
      <FormField label="Tags - optional"><Tags tags={tags} onChange={setTags} /></FormField>
      {nv.snapshot && <Alert type="info">In testing, the emulator returned "snapshot does not exist" for volumes created from a snapshot.</Alert>}
    </ActionModal>
    <ActionModal visible={m.is("modify")} onDismiss={m.close} header={`Modify volume ${m.rows[0]?.VolumeId}`} ok="Modify" onOk={async () => {
      await ec2("ModifyVolume", { VolumeId: m.rows[0].VolumeId, ...volParams(mod) }); flash.notify({ type: "success", content: `Modification of ${m.rows[0].VolumeId} requested.` }); m.reload();
    }}><VolumeFields v={mod} set={setMod} /><Alert type="info">Volume size can only be increased. After resizing, extend the file system inside the instance.</Alert></ActionModal>
    <ActionModal visible={m.is("snap")} onDismiss={m.close} header="Create snapshot" ok="Create snapshot" onOk={async () => {
      const r = await ec2("CreateSnapshot", { VolumeId: m.rows[0].VolumeId, Description: snapDesc || undefined }); flash.notify({ type: "success", content: <>Successfully created snapshot {r.SnapshotId}. <a href="#/ec2/snapshots">View snapshots</a></> }); m.reload();
    }}>
      <ValueWithLabel label="Volume ID">{m.rows[0]?.VolumeId}</ValueWithLabel>
      <FormField label="Description"><Input value={snapDesc} onChange={e => setSnapDesc(e.detail.value)} placeholder="Add a description for your snapshot" /></FormField>
    </ActionModal>
    <ActionModal visible={m.is("attach")} onDismiss={m.close} header="Attach volume" ok="Attach volume" disabled={!att.instance} onOk={async () => {
      await ec2("AttachVolume", { VolumeId: m.rows[0].VolumeId, InstanceId: att.instance.value, Device: att.device }); flash.notify({ type: "success", content: `Attaching ${m.rows[0].VolumeId} to ${att.instance.value}.` }); m.reload();
    }}>
      <ValueWithLabel label="Availability Zone">{m.rows[0]?.AvailabilityZone}</ValueWithLabel>
      <FormField label="Instance" description="Only instances in the same Availability Zone as the volume are shown."><Select selectedOption={att.instance} placeholder="Select an instance" options={(insts.data || []).filter((i: any) => i.az === m.rows[0]?.AvailabilityZone)} statusType={insts.loading ? "loading" : "finished"} onChange={e => setAtt({ ...att, instance: e.detail.selectedOption })} /></FormField>
      <FormField label="Device name"><Input value={att.device} onChange={e => setAtt({ ...att, device: e.detail.value })} /></FormField>
    </ActionModal>
    <ActionModal visible={m.is("detach")} onDismiss={m.close} header="Detach volume" ok="Detach" danger onOk={async () => {
      await ec2("DetachVolume", { VolumeId: m.rows[0].VolumeId, Force: force || undefined }); flash.notify({ type: "success", content: `Detaching ${m.rows[0].VolumeId}.` }); m.reload();
    }}><Box>Unmount the volume inside the instance before detaching it to avoid data loss.</Box><Checkbox checked={force} onChange={e => setForce(e.detail.checked)}>Force detach</Checkbox></ActionModal>
    {m.is("tags") && <TagsModal id={m.rows[0].VolumeId} tags={m.rows[0].Tags} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete volume" ok="Delete" danger onOk={async () => {
      for (const v of m.rows) await ec2("DeleteVolume", { VolumeId: v.VolumeId }); flash.notify({ type: "success", content: "Volumes deleted." }); m.reload();
    }}><Box>Delete {m.rows.map(v => v.VolumeId).join(", ")}? This can't be undone.</Box></ActionModal>
  </>;
}
function VolumeStatus({ id }: { id: string }) {
  const s = useAsync(async () => ((await ec2("DescribeVolumeStatus", { VolumeIds: [id] })).VolumeStatuses || [])[0], [id]);
  return <ColumnLayout columns={3} variant="text-grid">
    <ValueWithLabel label="Volume status">{s.data?.VolumeStatus?.Status || "-"}</ValueWithLabel>
    <ValueWithLabel label="I/O enabled">{s.data?.VolumeStatus?.Details?.find((d: any) => d.Name === "io-enabled")?.Status || "-"}</ValueWithLabel>
    <ValueWithLabel label="I/O performance">{s.data?.VolumeStatus?.Details?.find((d: any) => d.Name === "io-performance")?.Status || "-"}</ValueWithLabel>
  </ColumnLayout>;
}

// ---------------- Snapshots ----------------
export function Snapshots() {
  useCrumbs(crumbs("Snapshots"));
  const flash = useFlash();
  const m = useModal<any>();
  const [owner, setOwner] = useState("self");
  const [f, setF] = useState<any>({});
  const vols = useAsync(async () => ((await ec2("DescribeVolumes")).Volumes || []).map((v: any) => ({ value: v.VolumeId, label: `${v.VolumeId}${nameOf(v) ? ` (${nameOf(v)})` : ""}`, description: `${v.Size} GiB · ${v.AvailabilityZone}` })), [m.is("create")]);
  return <>
    <ResourcePage<any>
      key={owner} title="Snapshots" trackBy="SnapshotId" deps={[owner]}
      banner={<RadioGroup value={owner} onChange={e => setOwner(e.detail.value)} items={[{ value: "self", label: "Owned by me" }, { value: "all", label: "Public snapshots" }]} />}
      load={async () => (await ec2("DescribeSnapshots", owner === "self" ? { OwnerIds: ["self"] } : {})).Snapshots || []}
      poll={s => s.State === "pending"}
      create={{ text: "Create snapshot", onClick: r => { setF({ volume: null, desc: "", name: "" }); m.open("create", [], r); } }}
      columns={[
        { id: "n", header: "Name", cell: s => nameOf(s) || "-" },
        { id: "id", header: "Snapshot ID", cell: s => s.SnapshotId },
        { id: "z", header: "Volume size", cell: s => `${s.VolumeSize} GiB` },
        { id: "d", header: "Description", cell: s => s.Description || "-" },
        { id: "t", header: "Storage tier", cell: s => s.StorageTier || "Standard" },
        { id: "st", header: "Snapshot status", cell: s => <State s={s.State} /> },
        { id: "c", header: "Started", cell: s => fmt(s.StartTime) },
        { id: "p", header: "Progress", cell: s => s.Progress || "-" },
        { id: "e", header: "Encryption", cell: s => s.Encrypted ? "Encrypted" : "Not encrypted" },
        { id: "v", header: "Source volume", cell: s => s.VolumeId },
      ]}
      actions={[
        { id: "vol", text: "Create volume from snapshot", disabled: s => s.length !== 1, run: (s, r) => { setF({ az: "us-east-1a", type: "gp3", size: String(s[0].VolumeSize) }); m.open("vol", s, r); } },
        { id: "image", text: "Create image from snapshot", disabled: s => s.length !== 1, run: (s, r) => { setF({ name: "", arch: "x86_64", device: "/dev/xvda", desc: "" }); m.open("image", s, r); } },
        { id: "copy", text: "Copy snapshot", disabled: s => s.length !== 1, run: (s, r) => { setF({ desc: `Copy of ${s[0].SnapshotId}`, encrypted: !!s[0].Encrypted }); m.open("copy", s, r); } },
        { id: "perm", text: "Modify permissions", disabled: () => true, disabledReason: "ModifySnapshotAttribute isn't implemented in AWS Emulator.", run: () => {} },
        { id: "tags", text: "Manage tags", disabled: s => s.length !== 1, run: (s, r) => m.open("tags", s, r) },
        { id: "delete", text: "Delete snapshot", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={s => [{ id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
        <ValueWithLabel label="Snapshot ID">{s.SnapshotId}</ValueWithLabel>
        <ValueWithLabel label="Owner">{s.OwnerId}</ValueWithLabel>
        <ValueWithLabel label="Volume ID">{s.VolumeId}</ValueWithLabel>
        <ValueWithLabel label="Volume size">{s.VolumeSize} GiB</ValueWithLabel>
        <ValueWithLabel label="Status"><State s={s.State} /></ValueWithLabel>
        <ValueWithLabel label="Started">{fmt(s.StartTime)}</ValueWithLabel>
        <ValueWithLabel label="Encryption">{s.Encrypted ? "Encrypted" : "Not encrypted"}</ValueWithLabel>
        <ValueWithLabel label="Description">{s.Description || "-"}</ValueWithLabel>
      </ColumnLayout> }]}
    />
    <ActionModal visible={m.is("create")} onDismiss={m.close} header="Create snapshot" ok="Create snapshot" disabled={!f.volume} onOk={async () => {
      const r = await ec2("CreateSnapshot", { VolumeId: f.volume.value, Description: f.desc || undefined, TagSpecifications: tagSpec("snapshot", f.name) }); flash.notify({ type: "success", content: `Successfully created snapshot ${r.SnapshotId}.` }); m.reload();
    }}>
      <FormField label="Resource type"><RadioGroup value="volume" items={[{ value: "volume", label: "Volume" }, { value: "instance", label: "Instance", disabled: true, description: "Multi-volume snapshots aren't covered here." }]} /></FormField>
      <FormField label="Volume ID"><Select selectedOption={f.volume} placeholder="Select a volume" options={vols.data || []} onChange={e => setF({ ...f, volume: e.detail.selectedOption })} /></FormField>
      <FormField label="Description"><Input value={f.desc || ""} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
      <FormField label="Name tag"><Input value={f.name || ""} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
    </ActionModal>
    <ActionModal visible={m.is("vol")} onDismiss={m.close} header="Create volume from snapshot" ok="Create volume" onOk={async () => {
      const r = await ec2("CreateVolume", { SnapshotId: m.rows[0].SnapshotId, AvailabilityZone: f.az, VolumeType: f.type, Size: Number(f.size) }); flash.notify({ type: "success", content: `Created volume ${r.VolumeId}.` }); m.reload();
    }}>
      <EmulatorNote>In testing, the emulator answered "snapshot does not exist" here, even for completed snapshots. The error is shown as returned.</EmulatorNote>
      <ColumnLayout columns={2}>
        <FormField label="Volume type"><Select selectedOption={VOLUME_TYPES.find(t => t.value === f.type) || VOLUME_TYPES[0]} options={VOLUME_TYPES} onChange={e => setF({ ...f, type: e.detail.selectedOption.value })} /></FormField>
        <FormField label="Size (GiB)"><Input type="number" value={f.size || ""} onChange={e => setF({ ...f, size: e.detail.value })} /></FormField>
        <FormField label="Availability Zone"><Select selectedOption={{ value: f.az, label: f.az }} options={AZS.map(a => ({ value: a, label: a }))} onChange={e => setF({ ...f, az: e.detail.selectedOption.value })} /></FormField>
      </ColumnLayout>
    </ActionModal>
    <ActionModal visible={m.is("image")} onDismiss={m.close} header="Create image from snapshot" ok="Create image" disabled={!f.name} onOk={async () => {
      const r = await ec2("RegisterImage", { Name: f.name, Description: f.desc || undefined, Architecture: f.arch, RootDeviceName: f.device, VirtualizationType: "hvm", EnaSupport: true, BlockDeviceMappings: [{ DeviceName: f.device, Ebs: { SnapshotId: m.rows[0].SnapshotId, DeleteOnTermination: true } }] });
      flash.notify({ type: "success", content: <>Created AMI {r.ImageId}. <a href="#/ec2/amis">View AMIs</a></> }); m.reload();
    }}>
      <FormField label="Image name"><Input value={f.name || ""} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
      <FormField label="Description - optional"><Input value={f.desc || ""} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
      <ColumnLayout columns={2}>
        <FormField label="Architecture"><Select selectedOption={{ value: f.arch, label: f.arch }} options={["x86_64", "arm64", "i386"].map(a => ({ value: a, label: a }))} onChange={e => setF({ ...f, arch: e.detail.selectedOption.value })} /></FormField>
        <FormField label="Root device name"><Input value={f.device || ""} onChange={e => setF({ ...f, device: e.detail.value })} /></FormField>
      </ColumnLayout>
    </ActionModal>
    <ActionModal visible={m.is("copy")} onDismiss={m.close} header="Copy snapshot" ok="Copy snapshot" onOk={async () => {
      const r = await ec2("CopySnapshot", { SourceSnapshotId: m.rows[0].SnapshotId, SourceRegion: "us-east-1", Description: f.desc, Encrypted: f.encrypted || undefined }); flash.notify({ type: "success", content: `Copying to ${r.SnapshotId}.` }); m.reload();
    }}>
      <FormField label="Description"><Input value={f.desc || ""} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
      <FormField label="Destination Region"><Box>us-east-1 (the emulator runs one Region)</Box></FormField>
      <Checkbox checked={!!f.encrypted} onChange={e => setF({ ...f, encrypted: e.detail.checked })}>Encrypt this snapshot</Checkbox>
    </ActionModal>
    {m.is("tags") && <TagsModal id={m.rows[0].SnapshotId} tags={m.rows[0].Tags} close={m.close} done={() => { m.close(); m.reload(); }} />}
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete snapshot" ok="Delete" danger onOk={async () => {
      for (const s of m.rows) await ec2("DeleteSnapshot", { SnapshotId: s.SnapshotId }); flash.notify({ type: "success", content: "Snapshots deleted." }); m.reload();
    }}><Box>Delete {m.rows.map(s => s.SnapshotId).join(", ")}? Snapshots used by a registered AMI can't be deleted.</Box></ActionModal>
  </>;
}

// ---------------- Lifecycle Manager ----------------
export function LifecycleManager() {
  useCrumbs(crumbs("Lifecycle Manager"));
  const flash = useFlash();
  const m = useModal<any>();
  const [f, setF] = useState({ desc: "", tagKey: "Backup", tagVal: "true", hours: "24", time: "03:00", keep: "7", role: "arn:aws:iam::000000000000:role/AWSDataLifecycleManagerDefaultRole" });
  const dlm = (op: string, p: Record<string, unknown> = {}) => api.call("dlm", op, p);
  return <>
    <ResourcePage<any>
      title="Lifecycle policies" trackBy="PolicyId"
      description="Amazon Data Lifecycle Manager automates the creation, retention and deletion of EBS snapshots and AMIs."
      load={async () => (await dlm("GetLifecyclePolicies")).Policies || []}
      create={{ text: "Create lifecycle policy", onClick: r => m.open("create", [], r) }}
      columns={[
        { id: "id", header: "Policy ID", cell: p => p.PolicyId },
        { id: "d", header: "Description", cell: p => p.Description },
        { id: "s", header: "State", cell: p => <State s={String(p.State).toLowerCase()} /> },
        { id: "t", header: "Policy type", cell: p => p.PolicyType },
      ]}
      actions={[
        { id: "toggle", text: "Enable / disable policy", disabled: s => s.length !== 1, run: async (s, r) => { await dlm("UpdateLifecyclePolicy", { PolicyId: s[0].PolicyId, State: s[0].State === "ENABLED" ? "DISABLED" : "ENABLED" }); r(); } },
        { id: "delete", text: "Delete policy", run: async (s, r) => { for (const p of s) await dlm("DeleteLifecyclePolicy", { PolicyId: p.PolicyId }); flash.notify({ type: "success", content: "Policies deleted." }); r(); } },
      ]}
    />
    <ActionModal visible={m.is("create")} onDismiss={m.close} header="Create EBS snapshot policy" ok="Create policy" size="medium" disabled={!f.desc} onOk={async () => {
      await dlm("CreateLifecyclePolicy", { ExecutionRoleArn: f.role, Description: f.desc, State: "ENABLED", PolicyDetails: {
        PolicyType: "EBS_SNAPSHOT_MANAGEMENT", ResourceTypes: ["VOLUME"], TargetTags: [{ Key: f.tagKey, Value: f.tagVal }],
        Schedules: [{ Name: "Default schedule", CreateRule: { Interval: Number(f.hours), IntervalUnit: "HOURS", Times: [f.time] }, RetainRule: { Count: Number(f.keep) }, CopyTags: true }],
      } });
      flash.notify({ type: "success", content: "Lifecycle policy created." }); m.reload();
    }}>
      <FormField label="Description"><Input value={f.desc} onChange={e => setF({ ...f, desc: e.detail.value })} /></FormField>
      <ColumnLayout columns={2}>
        <FormField label="Target resource tag key"><Input value={f.tagKey} onChange={e => setF({ ...f, tagKey: e.detail.value })} /></FormField>
        <FormField label="Tag value"><Input value={f.tagVal} onChange={e => setF({ ...f, tagVal: e.detail.value })} /></FormField>
        <FormField label="Frequency (hours)"><Input type="number" value={f.hours} onChange={e => setF({ ...f, hours: e.detail.value })} /></FormField>
        <FormField label="Starting at (UTC)"><Input value={f.time} onChange={e => setF({ ...f, time: e.detail.value })} /></FormField>
        <FormField label="Retain (count)"><Input type="number" value={f.keep} onChange={e => setF({ ...f, keep: e.detail.value })} /></FormField>
      </ColumnLayout>
      <FormField label="IAM role"><Input value={f.role} onChange={e => setF({ ...f, role: e.detail.value })} /></FormField>
    </ActionModal>
  </>;
}
