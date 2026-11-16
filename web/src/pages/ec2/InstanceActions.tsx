// Instance actions shared by the Instances list and the instance page.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Checkbox from "@cloudscape-design/components/checkbox";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Textarea from "@cloudscape-design/components/textarea";
import Input from "@cloudscape-design/components/input";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import Table from "@cloudscape-design/components/table";
import Spinner from "@cloudscape-design/components/spinner";
import { type ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import { api } from "../../api";
import { useAsync, useFlash, Copyable } from "../../common";
import { Tags } from "../s3/fields";
import { fromTagSet, toTagSet, type KV } from "../s3/lib";
import { ec2, nameOf, useSgs, useProfiles, allInstanceTypes } from "./lib";
import { ActionModal, forEachReport } from "./ResourcePage";

export const INSTANCE_TYPES = ["t2.micro", "t2.small", "t3.nano", "t3.micro", "t3.small", "t3.medium", "t3.large", "t3.xlarge", "t4g.micro", "t4g.small", "t4g.medium", "m5.large", "m5.xlarge", "m6i.large", "m6i.xlarge", "m7g.large", "c5.large", "c6i.large", "c7g.large", "r5.large", "r6i.large", "g5.xlarge", "p3.2xlarge"];

type I = any;
export const STATE_ITEMS = (sel: I[]): ButtonDropdownProps.Item[] => {
  const st = sel.map(i => i.State?.Name);
  return [
    { id: "stop", text: "Stop instance", disabled: !sel.length || !st.every(s => s === "running") },
    { id: "start", text: "Start instance", disabled: !sel.length || !st.every(s => s === "stopped") },
    { id: "reboot", text: "Reboot instance", disabled: !sel.length || !st.every(s => s === "running") },
    { id: "hibernate", text: "Hibernate instance", disabled: !sel.length || !st.every(s => s === "running") },
    { id: "terminate", text: "Terminate (delete) instance", disabled: !sel.length || st.some(s => s === "terminated") },
  ];
};
export const ACTION_ITEMS = (sel: I[]): ButtonDropdownProps.Items => {
  const one = sel.length === 1;
  const live = sel.length > 0 && sel.every(i => i.State?.Name !== "terminated");
  const stopped = one && sel[0].State?.Name === "stopped";
  return [
    { id: "connect", text: "Connect", disabled: !one },
    { id: "settings", text: "Instance settings", items: [
      { id: "type", text: "Change instance type", disabled: !stopped, disabledReason: "Stop the instance first." },
      { id: "term-protect", text: "Change termination protection", disabled: !one || !live },
      { id: "stop-protect", text: "Change stop protection", disabled: !one || !live },
      { id: "shutdown", text: "Change shutdown behavior", disabled: !one || !live },
      { id: "userdata", text: "Edit user data", disabled: !stopped, disabledReason: "Stop the instance first." },
      { id: "tags", text: "Manage tags", disabled: !one },
      { id: "metadata", text: "Modify instance metadata options", disabled: !one || !live },
      { id: "credit", text: "Change credit specification", disabled: !live },
    ] },
    { id: "networking", text: "Networking", items: [
      { id: "attach-eni", text: "Attach network interface", disabled: !one || !live },
      { id: "detach-eni", text: "Detach network interface", disabled: !one || !live },
      { id: "srcdst", text: "Change source/destination check", disabled: !one || !live },
    ] },
    { id: "security", text: "Security", items: [
      { id: "sgs", text: "Change security groups", disabled: !one || !live },
      { id: "iam", text: "Modify IAM role", disabled: !one || !live },
    ] },
    { id: "image", text: "Image and templates", items: [
      { id: "create-image", text: "Create image", disabled: true, disabledReason: "CreateImage isn't implemented in AWS Emulator." },
      { id: "create-template", text: "Create template from instance", disabled: true, disabledReason: "GetLaunchTemplateData isn't implemented in AWS Emulator." },
      { id: "launch-more", text: "Launch more like this", disabled: !one },
    ] },
    { id: "monitor", text: "Monitor and troubleshoot", items: [
      { id: "syslog", text: "Get system log", disabled: !one },
      { id: "screenshot", text: "Get instance screenshot", disabled: !one },
      { id: "monitoring", text: "Manage detailed monitoring", disabled: !live },
    ] },
  ];
};

/** Renders every instance modal; call `open(id, rows)` from menus. */
export function InstanceModals({ m, reload }: { m: { is: (id: string) => boolean; rows: I[]; close: () => void }; reload: () => void }) {
  const flash = useFlash();
  const nav = useNavigate();
  const rows = m.rows;
  const i = rows[0];
  const ids = rows.map(r => r.InstanceId);
  const label = rows.length === 1 ? `${i?.InstanceId}${nameOf(i) ? ` (${nameOf(i)})` : ""}` : `${rows.length} instances`;
  const done = () => { m.close(); reload(); };
  const stateOp = (op: string, msg: string, extra: Record<string, unknown> = {}) => async () => {
    await ec2(op, { InstanceIds: ids, ...extra });
    flash.notify({ type: "success", content: `${msg} ${ids.join(", ")}` }); done();
  };

  useEffect(() => { if (m.is("launch-more") && i) nav(`/ec2/launch?from=${i.InstanceId}`); }, [m.is("launch-more")]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <ActionModal visible={m.is("stop")} onDismiss={m.close} header="Stop instance?" ok="Stop" onOk={stateOp("StopInstances", "Successfully stopped")}>
      <Box>To confirm that you want to stop {label}, choose the stop button below. Storage on any instance store volumes is deleted.</Box>
    </ActionModal>
    <ActionModal visible={m.is("hibernate")} onDismiss={m.close} header="Hibernate instance?" ok="Hibernate" onOk={stateOp("StopInstances", "Successfully hibernated", { Hibernate: true })}>
      <Box>Hibernating saves the contents of memory to the EBS root volume. The instance must have been launched with hibernation enabled.</Box>
    </ActionModal>
    <ActionModal visible={m.is("start")} onDismiss={m.close} header="Start instance?" ok="Start" onOk={stateOp("StartInstances", "Successfully started")}><Box>Start {label}?</Box></ActionModal>
    <ActionModal visible={m.is("reboot")} onDismiss={m.close} header="Reboot instance?" ok="Reboot" onOk={stateOp("RebootInstances", "Successfully rebooted")}><Box>Reboot {label}?</Box></ActionModal>
    <ActionModal visible={m.is("terminate")} onDismiss={m.close} header="Terminate (delete) instance?" ok="Terminate (delete)" danger
      onOk={async () => { await forEachReport(rows, r => r.InstanceId, r => ec2("TerminateInstances", { InstanceIds: [r.InstanceId] }), flash, `Successfully initiated termination (deletion) of ${ids.join(", ")}`); done(); }}>
      <Alert type="warning">On an EBS-backed instance, the default action is for the root EBS volume to be deleted when the instance is terminated. Storage on any local drives will be lost.</Alert>
      <Box>Are you sure you want to terminate {label}?</Box>
    </ActionModal>
    {m.is("connect") && <ConnectModal i={i} close={m.close} />}
    {m.is("type") && <ChangeTypeModal i={i} close={m.close} done={done} />}
    {(m.is("term-protect") || m.is("stop-protect")) && <ProtectionModal i={i} kind={m.is("term-protect") ? "term" : "stop"} close={m.close} done={done} />}
    {m.is("shutdown") && <ShutdownModal i={i} close={m.close} done={done} />}
    {m.is("userdata") && <UserDataModal i={i} close={m.close} done={done} />}
    {m.is("tags") && <TagsModal i={i} close={m.close} done={done} />}
    {m.is("metadata") && <MetadataModal i={i} close={m.close} done={done} />}
    {m.is("credit") && <CreditModal rows={rows} close={m.close} done={done} />}
    {m.is("attach-eni") && <AttachEniModal i={i} close={m.close} done={done} />}
    {m.is("detach-eni") && <DetachEniModal i={i} close={m.close} done={done} />}
    {m.is("srcdst") && <SrcDstModal i={i} close={m.close} done={done} />}
    {m.is("sgs") && <SgModal i={i} close={m.close} done={done} />}
    {m.is("iam") && <IamModal i={i} close={m.close} done={done} />}
    {m.is("syslog") && <SyslogModal i={i} close={m.close} />}
    {m.is("screenshot") && <ScreenshotModal i={i} close={m.close} />}
    {m.is("monitoring") && <MonitoringModal rows={rows} close={m.close} done={done} />}
  </>;
}

type P = { i: I; close: () => void; done: () => void };

function ConnectModal({ i, close }: { i: I; close: () => void }) {
  const host = i.PublicDnsName || i.PublicIpAddress || i.PrivateIpAddress;
  const user = /ubuntu/i.test(i.PlatformDetails || "") ? "ubuntu" : "ec2-user";
  const cmd = `ssh -i "${i.KeyName || "key"}.pem" ${user}@${host}`;
  return (
    <ActionModal visible onDismiss={close} header={`Connect to instance ${i.InstanceId}`} ok="Close" onOk={async () => {}} size="medium">
      <Alert type="info">The emulator models the EC2 API; it doesn't boot a real machine you can log in to. These are the connection details AWS would show.</Alert>
      <FormField label="SSH client"><Box variant="code">{cmd}</Box> <Copyable text={cmd} label="command" iconOnly /></FormField>
      <FormField label="Public DNS">{i.PublicDnsName || "-"}</FormField>
      <FormField label="Username">{user}</FormField>
    </ActionModal>
  );
}

function ChangeTypeModal({ i, close, done }: P) {
  const flash = useFlash();
  const types = useAsync(async () => (await allInstanceTypes()).map((t: any) => t.InstanceType), []);
  const [t, setT] = useState<any>({ value: i.InstanceType, label: i.InstanceType });
  return (
    <ActionModal visible onDismiss={close} header="Change instance type" ok="Change" onOk={async () => {
      await ec2("ModifyInstanceAttribute", { InstanceId: i.InstanceId, InstanceType: { Value: t.value } });
      flash.notify({ type: "success", content: `Successfully changed instance type of ${i.InstanceId} to ${t.value}` }); done();
    }}>
      <FormField label="Current instance type"><Box>{i.InstanceType}</Box></FormField>
      <FormField label="New instance type"><Select selectedOption={t} filteringType="auto" options={(types.data?.length ? types.data : INSTANCE_TYPES).map((x: string) => ({ value: x, label: x }))} onChange={e => setT(e.detail.selectedOption)} statusType={types.loading ? "loading" : "finished"} empty="No matching instance types" /></FormField>
    </ActionModal>
  );
}

function ProtectionModal({ i, kind, close, done }: P & { kind: "term" | "stop" }) {
  const flash = useFlash();
  const attr = kind === "term" ? "disableApiTermination" : "disableApiStop";
  const cur = useAsync(async () => (await ec2("DescribeInstanceAttribute", { InstanceId: i.InstanceId, Attribute: attr }))[kind === "term" ? "DisableApiTermination" : "DisableApiStop"]?.Value, []);
  const [on, setOn] = useState<boolean | null>(null);
  const v = on ?? !!cur.data;
  return (
    <ActionModal visible onDismiss={close} header={kind === "term" ? "Change termination protection" : "Change stop protection"} ok="Save" onOk={async () => {
      await ec2("ModifyInstanceAttribute", { InstanceId: i.InstanceId, [kind === "term" ? "DisableApiTermination" : "DisableApiStop"]: { Value: v } });
      flash.notify({ type: "success", content: `Successfully updated ${kind === "term" ? "termination" : "stop"} protection for ${i.InstanceId}` }); done();
    }}>
      <Box>{kind === "term" ? "Termination protection prevents the instance from being accidentally terminated." : "Stop protection prevents the instance from being accidentally stopped."}</Box>
      {cur.loading ? <Spinner /> : <Checkbox checked={v} onChange={e => setOn(e.detail.checked)}>Enable</Checkbox>}
    </ActionModal>
  );
}

function ShutdownModal({ i, close, done }: P) {
  const flash = useFlash();
  const cur = useAsync(async () => (await ec2("DescribeInstanceAttribute", { InstanceId: i.InstanceId, Attribute: "instanceInitiatedShutdownBehavior" })).InstanceInitiatedShutdownBehavior?.Value || "stop", []);
  const [v, setV] = useState<string | null>(null);
  return (
    <ActionModal visible onDismiss={close} header="Change shutdown behavior" ok="Save" onOk={async () => {
      await ec2("ModifyInstanceAttribute", { InstanceId: i.InstanceId, InstanceInitiatedShutdownBehavior: { Value: v ?? cur.data } });
      flash.notify({ type: "success", content: `Shutdown behavior updated for ${i.InstanceId}` }); done();
    }}>
      <FormField label="Shutdown behavior" description="What happens when the instance is shut down from the operating system.">
        <RadioGroup value={v ?? cur.data ?? "stop"} onChange={e => setV(e.detail.value)} items={[{ value: "stop", label: "Stop" }, { value: "terminate", label: "Terminate" }]} />
      </FormField>
    </ActionModal>
  );
}

function UserDataModal({ i, close, done }: P) {
  const flash = useFlash();
  const cur = useAsync(async () => {
    const v = (await ec2("DescribeInstanceAttribute", { InstanceId: i.InstanceId, Attribute: "userData" })).UserData?.Value;
    if (!v) return "";
    try { return decodeURIComponent(escape(atob(v))); } catch { return v; }
  }, []);
  const [v, setV] = useState<string | null>(null);
  return (
    <ActionModal visible onDismiss={close} header="Edit user data" ok="Save" size="large" onOk={async () => {
      await ec2("ModifyInstanceAttribute", { InstanceId: i.InstanceId, UserData: { Value: v ?? cur.data ?? "" } });
      flash.notify({ type: "success", content: `User data updated for ${i.InstanceId}` }); done();
    }}>
      <Box>User data runs at boot. Changes take effect the next time the instance starts.</Box>
      {cur.loading ? <Spinner /> : <Textarea rows={12} value={v ?? cur.data ?? ""} onChange={e => setV(e.detail.value)} spellcheck={false} placeholder="#!/bin/bash" />}
    </ActionModal>
  );
}

export function TagsModal({ i, close, done, id, tags: initial }: Partial<P> & { i?: I; close: () => void; done: () => void; id?: string; tags?: any[] }) {
  const flash = useFlash();
  const resId = id || i.InstanceId;
  const [tags, setTags] = useState<KV[]>(fromTagSet(initial || i?.Tags));
  return (
    <ActionModal visible onDismiss={close} header={`Manage tags: ${resId}`} ok="Save" size="large" onOk={async () => {
      const keep = toTagSet(tags);
      const removed = (initial || i?.Tags || []).filter((t: any) => !keep.some(k => k.Key === t.Key)).map((t: any) => ({ Key: t.Key }));
      if (removed.length) await ec2("DeleteTags", { Resources: [resId], Tags: removed });
      if (keep.length) await ec2("CreateTags", { Resources: [resId], Tags: keep });
      flash.notify({ type: "success", content: `Tags updated for ${resId}` }); done();
    }}>
      <Tags tags={tags} onChange={setTags} />
    </ActionModal>
  );
}

function MetadataModal({ i, close, done }: P) {
  const flash = useFlash();
  const mo = i.MetadataOptions || {};
  const [endpoint, setEndpoint] = useState(mo.HttpEndpoint || "enabled");
  const [tokens, setTokens] = useState(mo.HttpTokens || "required");
  const [hop, setHop] = useState(String(mo.HttpPutResponseHopLimit || 2));
  const [tagsMd, setTagsMd] = useState(mo.InstanceMetadataTags || "disabled");
  return (
    <ActionModal visible onDismiss={close} header="Modify instance metadata options" ok="Save" onOk={async () => {
      await ec2("ModifyInstanceMetadataOptions", { InstanceId: i.InstanceId, HttpEndpoint: endpoint, HttpTokens: tokens, HttpPutResponseHopLimit: Number(hop), InstanceMetadataTags: tagsMd });
      flash.notify({ type: "success", content: `Metadata options updated for ${i.InstanceId}` }); done();
    }}>
      <FormField label="Instance metadata service"><RadioGroup value={endpoint} onChange={e => setEndpoint(e.detail.value)} items={[{ value: "enabled", label: "Enable" }, { value: "disabled", label: "Disable" }]} /></FormField>
      <FormField label="IMDSv2"><RadioGroup value={tokens} onChange={e => setTokens(e.detail.value)} items={[{ value: "optional", label: "Optional" }, { value: "required", label: "Required" }]} /></FormField>
      <FormField label="Metadata response hop limit"><Input type="number" value={hop} onChange={e => setHop(e.detail.value)} /></FormField>
      <FormField label="Allow tags in metadata"><RadioGroup value={tagsMd} onChange={e => setTagsMd(e.detail.value)} items={[{ value: "enabled", label: "Enable" }, { value: "disabled", label: "Disable" }]} /></FormField>
    </ActionModal>
  );
}

function CreditModal({ rows, close, done }: { rows: I[]; close: () => void; done: () => void }) {
  const flash = useFlash();
  const [v, setV] = useState("unlimited");
  return (
    <ActionModal visible onDismiss={close} header="Change credit specification" ok="Save" onOk={async () => {
      await ec2("ModifyInstanceCreditSpecification", { InstanceCreditSpecifications: rows.map(r => ({ InstanceId: r.InstanceId, CpuCredits: v })) });
      flash.notify({ type: "success", content: "Credit specification updated." }); done();
    }}>
      <Box>Applies to burstable instance types (T2, T3, T3a, T4g).</Box>
      <RadioGroup value={v} onChange={e => setV(e.detail.value)} items={[{ value: "standard", label: "Standard" }, { value: "unlimited", label: "Unlimited" }]} />
    </ActionModal>
  );
}

function AttachEniModal({ i, close, done }: P) {
  const flash = useFlash();
  const enis = useAsync(async () => ((await ec2("DescribeNetworkInterfaces", { Filters: [{ Name: "status", Values: ["available"] }, { Name: "vpc-id", Values: [i.VpcId] }] })).NetworkInterfaces || [])
    .map((n: any) => ({ value: n.NetworkInterfaceId, label: n.NetworkInterfaceId, description: `${n.SubnetId} · ${n.PrivateIpAddress}${n.Description ? " · " + n.Description : ""}` })), []);
  const [v, setV] = useState<any>(null);
  return (
    <ActionModal visible onDismiss={close} header="Attach network interface" ok="Attach" disabled={!v} onOk={async () => {
      await ec2("AttachNetworkInterface", { NetworkInterfaceId: v.value, InstanceId: i.InstanceId, DeviceIndex: (i.NetworkInterfaces || []).length });
      flash.notify({ type: "success", content: `Attached ${v.value} to ${i.InstanceId}` }); done();
    }}>
      <FormField label="Network interface" description={enis.data && !enis.data.length ? "No available network interfaces in this VPC. Create one under Network Interfaces." : undefined}>
        <Select selectedOption={v} placeholder="Select a network interface" options={enis.data || []} statusType={enis.loading ? "loading" : "finished"} onChange={e => setV(e.detail.selectedOption)} />
      </FormField>
    </ActionModal>
  );
}

function DetachEniModal({ i, close, done }: P) {
  const flash = useFlash();
  const opts = (i.NetworkInterfaces || []).filter((n: any) => n.Attachment?.DeviceIndex > 0).map((n: any) => ({ value: n.Attachment.AttachmentId, label: n.NetworkInterfaceId, description: n.PrivateIpAddress }));
  const [v, setV] = useState<any>(null);
  return (
    <ActionModal visible onDismiss={close} header="Detach network interface" ok="Detach" disabled={!v} onOk={async () => {
      await ec2("DetachNetworkInterface", { AttachmentId: v.value });
      flash.notify({ type: "success", content: `Detached ${v.label}` }); done();
    }}>
      {opts.length ? <FormField label="Network interface"><Select selectedOption={v} placeholder="Select" options={opts} onChange={e => setV(e.detail.selectedOption)} /></FormField>
        : <Box>Only the primary network interface is attached; it can't be detached.</Box>}
    </ActionModal>
  );
}

function SrcDstModal({ i, close, done }: P) {
  const flash = useFlash();
  const [on, setOn] = useState(i.SourceDestCheck !== false);
  return (
    <ActionModal visible onDismiss={close} header="Change source/destination check" ok="Save" onOk={async () => {
      await ec2("ModifyInstanceAttribute", { InstanceId: i.InstanceId, SourceDestCheck: { Value: on } });
      flash.notify({ type: "success", content: `Updated source/destination check for ${i.InstanceId}` }); done();
    }}>
      <Box>Turn this off for instances that route traffic, such as NAT instances.</Box>
      <Checkbox checked={on} onChange={e => setOn(e.detail.checked)}>Source / destination checking</Checkbox>
    </ActionModal>
  );
}

function SgModal({ i, close, done }: P) {
  const flash = useFlash();
  const sgs = useSgs(i.VpcId);
  const [sel, setSel] = useState<any[]>((i.SecurityGroups || []).map((g: any) => ({ value: g.GroupId, label: g.GroupName, description: g.GroupId })));
  return (
    <ActionModal visible onDismiss={close} header="Change security groups" ok="Save" size="medium" disabled={!sel.length} onOk={async () => {
      await ec2("ModifyInstanceAttribute", { InstanceId: i.InstanceId, Groups: sel.map(s => s.value) });
      flash.notify({ type: "success", content: `Security groups updated for ${i.InstanceId}` }); done();
    }}>
      <FormField label="Associated security groups" description="Security groups in the instance's VPC."><Multiselect selectedOptions={sel} options={sgs.data || []} statusType={sgs.loading ? "loading" : "finished"} filteringType="auto" onChange={e => setSel(e.detail.selectedOptions as any)} /></FormField>
    </ActionModal>
  );
}

function IamModal({ i, close, done }: P) {
  const flash = useFlash();
  const profiles = useProfiles();
  const assoc = useAsync(async () => ((await ec2("DescribeIamInstanceProfileAssociations", { Filters: [{ Name: "instance-id", Values: [i.InstanceId] }] })).IamInstanceProfileAssociations || []).find((a: any) => a.State === "associated"), []);
  const [v, setV] = useState<any>(undefined);
  const cur = assoc.data?.IamInstanceProfile?.Arn;
  const opts = [{ value: "", label: "No IAM role" }, ...(profiles.data || [])];
  const selected = v ?? opts.find(o => o.value === (cur || "")) ?? opts[0];
  return (
    <ActionModal visible onDismiss={close} header="Modify IAM role" ok="Update IAM role" onOk={async () => {
      if (assoc.data && selected.value === cur) { done(); return; }
      if (assoc.data && !selected.value) await ec2("DisassociateIamInstanceProfile", { AssociationId: assoc.data.AssociationId });
      else if (assoc.data) await ec2("ReplaceIamInstanceProfileAssociation", { AssociationId: assoc.data.AssociationId, IamInstanceProfile: { Arn: selected.value } });
      else if (selected.value) await ec2("AssociateIamInstanceProfile", { InstanceId: i.InstanceId, IamInstanceProfile: { Arn: selected.value } });
      flash.notify({ type: "success", content: `IAM role updated for ${i.InstanceId}` }); done();
    }}>
      <FormField label="IAM role" description={profiles.data && !profiles.data.length ? "No instance profiles yet. Create an IAM role for EC2 with an instance profile in IAM." : "Instance profiles in this account."}>
        <Select selectedOption={selected} options={opts} statusType={profiles.loading ? "loading" : "finished"} onChange={e => setV(e.detail.selectedOption)} />
      </FormField>
    </ActionModal>
  );
}

function SyslogModal({ i, close }: { i: I; close: () => void }) {
  const out = useAsync(async () => (await ec2("GetConsoleOutput", { InstanceId: i.InstanceId, Latest: true })).Output || "", []);
  return (
    <ActionModal visible onDismiss={close} header={`Get system log: ${i.InstanceId}`} ok="Close" size="large" onOk={async () => {}}>
      {out.loading ? <Spinner /> : <pre style={{ maxHeight: 420, overflow: "auto", fontSize: 12, margin: 0 }}>{out.data || "No console output."}</pre>}
    </ActionModal>
  );
}

function ScreenshotModal({ i, close }: { i: I; close: () => void }) {
  const img = useAsync(async () => (await ec2("GetConsoleScreenshot", { InstanceId: i.InstanceId, WakeUp: true })).ImageData, []);
  return (
    <ActionModal visible onDismiss={close} header={`Get instance screenshot: ${i.InstanceId}`} ok="Close" size="large" onOk={async () => {}}>
      {img.loading ? <Spinner /> : img.data ? <img alt="Instance screenshot" src={`data:image/jpeg;base64,${img.data}`} style={{ maxWidth: "100%" }} /> : <Box>No screenshot available.</Box>}
    </ActionModal>
  );
}

function MonitoringModal({ rows, close, done }: { rows: I[]; close: () => void; done: () => void }) {
  const flash = useFlash();
  const [on, setOn] = useState(rows.every(r => r.Monitoring?.State === "enabled"));
  return (
    <ActionModal visible onDismiss={close} header="Manage detailed monitoring" ok="Confirm" onOk={async () => {
      await ec2(on ? "MonitorInstances" : "UnmonitorInstances", { InstanceIds: rows.map(r => r.InstanceId) });
      flash.notify({ type: "success", content: `Detailed monitoring ${on ? "enabled" : "disabled"}.` }); done();
    }}>
      <Box>Detailed monitoring sends metrics to CloudWatch every minute instead of every five minutes.</Box>
      <Checkbox checked={on} onChange={e => setOn(e.detail.checked)}>Enable</Checkbox>
      <Table variant="embedded" items={rows} columnDefinitions={[{ id: "i", header: "Instance", cell: r => r.InstanceId }, { id: "m", header: "Current", cell: r => r.Monitoring?.State }]} />
    </ActionModal>
  );
}

