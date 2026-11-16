import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Link from "@cloudscape-design/components/link";
import Badge from "@cloudscape-design/components/badge";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ValueWithLabel } from "../../common";
import { JsonBlock } from "../s3/PermissionsTab";
import { ec2, State, fmt, AZS, allInstances, instHref, nameOf, allInstanceTypes } from "./lib";
import { ResourcePage, ActionModal, useModal, forEachReport } from "./ResourcePage";
import { INSTANCE_TYPES } from "./InstanceActions";

const crumbs = (t: string) => [{ text: "EC2", href: "#/ec2/dashboard" }, { text: t, href: "#" }];

// ---------------- Launch templates ----------------
export function LaunchTemplates() {
  useCrumbs(crumbs("Launch templates"));
  const nav = useNavigate();
  const flash = useFlash();
  const m = useModal<any>();
  const [ver, setVer] = useState("");
  return <>
    <ResourcePage<any>
      title="Launch Templates" trackBy="LaunchTemplateId" multi={false}
      description="Launch templates save instance configuration so you can launch instances, Auto Scaling groups and Spot Fleets from it."
      load={async () => (await ec2("DescribeLaunchTemplates")).LaunchTemplates || []}
      create={{ text: "Create launch template", href: "#/ec2/launch-templates/create" }}
      columns={[
        { id: "id", header: "Launch Template ID", cell: t => t.LaunchTemplateId },
        { id: "n", header: "Launch Template Name", cell: t => t.LaunchTemplateName },
        { id: "d", header: "Default Version", cell: t => t.DefaultVersionNumber },
        { id: "l", header: "Latest Version", cell: t => t.LatestVersionNumber },
        { id: "c", header: "Create Time", cell: t => fmt(t.CreateTime) },
        { id: "o", header: "Owner", cell: t => String(t.CreatedBy || "").split(":").pop() || "-" },
      ]}
      actions={[
        { id: "launch", text: "Launch instance from template", run: s => nav(`/ec2/launch?template=${s[0].LaunchTemplateId}`) },
        { id: "default", text: "Set default version", run: (s, r) => { setVer(String(s[0].LatestVersionNumber)); m.open("default", s, r); } },
        { id: "delete-version", text: "Delete template version", disabled: s => s.length !== 1 || s[0].LatestVersionNumber < 2, run: (s, r) => { setVer(String(s[0].LatestVersionNumber)); m.open("delete-version", s, r); } },
        { id: "delete", text: "Delete template", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={t => [
        { id: "details", label: "Details", content: <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Launch template ID">{t.LaunchTemplateId}</ValueWithLabel>
          <ValueWithLabel label="Launch template name">{t.LaunchTemplateName}</ValueWithLabel>
          <ValueWithLabel label="Default version">{t.DefaultVersionNumber}</ValueWithLabel>
          <ValueWithLabel label="Owner">{t.CreatedBy}</ValueWithLabel>
        </ColumnLayout> },
        { id: "versions", label: "Versions", content: <TemplateVersions id={t.LaunchTemplateId} /> },
      ]}
    />
    <ActionModal visible={m.is("default")} onDismiss={m.close} header="Set default version" ok="Set as default version" onOk={async () => {
      await ec2("ModifyLaunchTemplate", { LaunchTemplateId: m.rows[0].LaunchTemplateId, DefaultVersion: ver }); flash.notify({ type: "success", content: `Default version set to ${ver}.` }); m.reload();
    }}><FormField label="Template version"><Input type="number" value={ver} onChange={e => setVer(e.detail.value)} /></FormField></ActionModal>
    <ActionModal visible={m.is("delete-version")} onDismiss={m.close} header="Delete template version" ok="Delete" danger onOk={async () => {
      await ec2("DeleteLaunchTemplateVersions", { LaunchTemplateId: m.rows[0].LaunchTemplateId, Versions: [ver] }); m.reload();
    }}><FormField label="Version to delete" description="The default version can't be deleted."><Input type="number" value={ver} onChange={e => setVer(e.detail.value)} /></FormField></ActionModal>
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete launch template" ok="Delete" danger onOk={async () => {
      await ec2("DeleteLaunchTemplate", { LaunchTemplateId: m.rows[0].LaunchTemplateId }); flash.notify({ type: "success", content: `Deleted ${m.rows[0].LaunchTemplateName}.` }); m.reload();
    }}><Box>Delete {m.rows[0]?.LaunchTemplateName} and all its versions?</Box></ActionModal>
  </>;
}
function TemplateVersions({ id }: { id: string }) {
  const v = useAsync(async () => (await ec2("DescribeLaunchTemplateVersions", { LaunchTemplateId: id })).LaunchTemplateVersions || [], [id]);
  const [sel, setSel] = useState<any[]>([]);
  return (
    <SpaceBetween size="m">
      <Table variant="embedded" items={v.data || []} loading={v.loading} trackBy="VersionNumber" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
        columnDefinitions={[
          { id: "v", header: "Version", cell: (x: any) => <>{x.VersionNumber} {x.DefaultVersion ? <Badge color="blue">Default</Badge> : null}</> },
          { id: "d", header: "Description", cell: (x: any) => x.VersionDescription || "-" },
          { id: "a", header: "AMI ID", cell: (x: any) => x.LaunchTemplateData?.ImageId || "-" },
          { id: "t", header: "Instance type", cell: (x: any) => x.LaunchTemplateData?.InstanceType || "-" },
          { id: "c", header: "Create time", cell: (x: any) => fmt(x.CreateTime) },
          { id: "l", header: "", cell: (x: any) => <Link href={`#/ec2/launch?template=${id}&version=${x.VersionNumber}`}>Launch</Link> },
        ]} />
      {sel[0] && <JsonBlock value={JSON.stringify(sel[0].LaunchTemplateData)} empty="" />}
    </SpaceBetween>
  );
}

// ---------------- Instance types ----------------
export function InstanceTypes() {
  useCrumbs(crumbs("Instance types"));
  return (
    <ResourcePage<any>
      title="Instance types" trackBy="InstanceType" multi={false}
      load={allInstanceTypes}
      columns={[
        { id: "t", header: "Instance type", cell: t => t.InstanceType, sortingField: "InstanceType" },
        { id: "v", header: "vCPUs", cell: t => t.VCpuInfo?.DefaultVCpus },
        { id: "a", header: "Architecture", cell: t => (t.ProcessorInfo?.SupportedArchitectures || []).join(", ") },
        { id: "m", header: "Memory (GiB)", cell: t => ((t.MemoryInfo?.SizeInMiB || 0) / 1024).toFixed(2).replace(/\.00$/, "") },
        { id: "s", header: "Storage (GB)", cell: t => t.InstanceStorageInfo?.TotalSizeInGB ?? "EBS only" },
        { id: "n", header: "Network performance", cell: t => t.NetworkInfo?.NetworkPerformance || "-" },
        { id: "g", header: "Current generation", cell: t => t.CurrentGeneration ? "true" : "false" },
        { id: "f", header: "Free-Tier eligible", cell: t => t.FreeTierEligible ? "true" : "false" },
        { id: "h", header: "Hibernation support", cell: t => t.HibernationSupported ? "true" : "false", hidden: true },
      ]}
      detail={t => [{ id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
        <ValueWithLabel label="Instance type">{t.InstanceType}</ValueWithLabel>
        <ValueWithLabel label="Hypervisor">{t.Hypervisor || "-"}</ValueWithLabel>
        <ValueWithLabel label="Default cores / threads">{t.VCpuInfo?.DefaultCores} / {t.VCpuInfo?.DefaultThreadsPerCore}</ValueWithLabel>
        <ValueWithLabel label="Sustained clock speed">{t.ProcessorInfo?.SustainedClockSpeedInGhz ? `${t.ProcessorInfo.SustainedClockSpeedInGhz} GHz` : "-"}</ValueWithLabel>
        <ValueWithLabel label="Maximum network interfaces">{t.NetworkInfo?.MaximumNetworkInterfaces}</ValueWithLabel>
        <ValueWithLabel label="EBS optimized support">{t.EbsInfo?.EbsOptimizedSupport}</ValueWithLabel>
        <ValueWithLabel label="Burstable">{t.BurstablePerformanceSupported ? "Yes" : "No"}</ValueWithLabel>
        <ValueWithLabel label="Supported usage classes">{(t.SupportedUsageClasses || []).join(", ")}</ValueWithLabel>
      </ColumnLayout> }]}
    />
  );
}

// ---------------- Spot requests ----------------
export function SpotRequests() {
  useCrumbs(crumbs("Spot Requests"));
  const flash = useFlash();
  const m = useModal<any>();
  const [f, setF] = useState({ ami: "", type: { value: "t3.micro", label: "t3.micro" }, count: "1", price: "" });
  const amis = useAsync(async () => ((await ec2("DescribeImages", { Owners: ["amazon"] })).Images || []).slice(0, 80).map((a: any) => ({ value: a.ImageId, label: a.Name, description: a.ImageId })), []);
  return <>
    <ResourcePage<any>
      title="Spot Requests" trackBy="SpotInstanceRequestId"
      load={async () => (await ec2("DescribeSpotInstanceRequests")).SpotInstanceRequests || []}
      create={{ text: "Request Spot Instances", onClick: r => m.open("request", [], r) }}
      columns={[
        { id: "id", header: "Request ID", cell: s => s.SpotInstanceRequestId },
        { id: "t", header: "Request type", cell: s => s.Type },
        { id: "it", header: "Instance type", cell: s => s.LaunchSpecification?.InstanceType },
        { id: "st", header: "State", cell: s => <State s={s.State} /> },
        { id: "status", header: "Status", cell: s => s.Status?.Code },
        { id: "i", header: "Instance", cell: s => s.InstanceId ? <Link href={instHref(s.InstanceId)}>{s.InstanceId}</Link> : "-" },
        { id: "p", header: "Max price", cell: s => s.SpotPrice || "On-Demand price" },
        { id: "c", header: "Created", cell: s => fmt(s.CreateTime) },
      ]}
      actions={[{ id: "cancel", text: "Cancel request", run: async (s, r) => { await ec2("CancelSpotInstanceRequests", { SpotInstanceRequestIds: s.map(x => x.SpotInstanceRequestId) }); flash.notify({ type: "success", content: "Spot requests cancelled." }); r(); } }]}
    />
    <ActionModal visible={m.is("request")} onDismiss={m.close} header="Request Spot Instances" ok="Launch" disabled={!f.ami} onOk={async () => {
      await ec2("RequestSpotInstances", { InstanceCount: Number(f.count), ...(f.price ? { SpotPrice: f.price } : {}), LaunchSpecification: { ImageId: f.ami, InstanceType: f.type.value } });
      flash.notify({ type: "success", content: "Spot request submitted." }); m.reload();
    }}>
      <FormField label="AMI"><Select selectedOption={amis.data?.find((a: any) => a.value === f.ami) || null} placeholder="Choose an AMI" filteringType="auto" options={amis.data || []} onChange={e => setF({ ...f, ami: e.detail.selectedOption.value! })} /></FormField>
      <FormField label="Instance type"><Select selectedOption={f.type} filteringType="auto" options={INSTANCE_TYPES.map(t => ({ value: t, label: t }))} onChange={e => setF({ ...f, type: e.detail.selectedOption as any })} /></FormField>
      <FormField label="Target capacity"><Input type="number" value={f.count} onChange={e => setF({ ...f, count: e.detail.value })} /></FormField>
      <FormField label="Maximum price - optional" description="Leave empty to use the On-Demand price as the maximum."><Input value={f.price} onChange={e => setF({ ...f, price: e.detail.value })} placeholder="0.05" /></FormField>
    </ActionModal>
  </>;
}

// ---------------- Dedicated hosts ----------------
export function DedicatedHosts() {
  useCrumbs(crumbs("Dedicated Hosts"));
  const flash = useFlash();
  const m = useModal<any>();
  const [f, setF] = useState({ type: "m5.large", az: "us-east-1a", qty: "1", auto: "off" });
  return <>
    <ResourcePage<any>
      title="Dedicated Hosts" trackBy="HostId"
      load={async () => (await ec2("DescribeHosts")).Hosts || []}
      create={{ text: "Allocate Dedicated Host", onClick: r => m.open("alloc", [], r) }}
      columns={[
        { id: "id", header: "Host ID", cell: h => h.HostId },
        { id: "n", header: "Name", cell: h => nameOf(h) || "-" },
        { id: "t", header: "Instance type", cell: h => h.HostProperties?.InstanceType || h.HostProperties?.InstanceFamily },
        { id: "s", header: "State", cell: h => <State s={h.State} /> },
        { id: "az", header: "Availability Zone", cell: h => h.AvailabilityZone },
        { id: "a", header: "Auto-placement", cell: h => h.AutoPlacement },
        { id: "i", header: "Instances", cell: h => (h.Instances || []).length },
      ]}
      actions={[{ id: "release", text: "Release host", run: async (s, r) => { await ec2("ReleaseHosts", { HostIds: s.map(h => h.HostId) }); flash.notify({ type: "success", content: "Hosts released." }); r(); } }]}
    />
    <ActionModal visible={m.is("alloc")} onDismiss={m.close} header="Allocate Dedicated Host" ok="Allocate" onOk={async () => {
      await ec2("AllocateHosts", { InstanceType: f.type, AvailabilityZone: f.az, Quantity: Number(f.qty), AutoPlacement: f.auto }); flash.notify({ type: "success", content: "Dedicated Host allocated." }); m.reload();
    }}>
      <FormField label="Instance type"><Select selectedOption={{ value: f.type, label: f.type }} filteringType="auto" options={INSTANCE_TYPES.map(t => ({ value: t, label: t }))} onChange={e => setF({ ...f, type: e.detail.selectedOption.value! })} /></FormField>
      <FormField label="Availability Zone"><Select selectedOption={{ value: f.az, label: f.az }} options={AZS.map(a => ({ value: a, label: a }))} onChange={e => setF({ ...f, az: e.detail.selectedOption.value! })} /></FormField>
      <FormField label="Quantity"><Input type="number" value={f.qty} onChange={e => setF({ ...f, qty: e.detail.value })} /></FormField>
      <FormField label="Instance auto-placement"><RadioGroup value={f.auto} onChange={e => setF({ ...f, auto: e.detail.value })} items={[{ value: "on", label: "Enable" }, { value: "off", label: "Disable" }]} /></FormField>
    </ActionModal>
  </>;
}

// ---------------- Capacity reservations ----------------
export function CapacityReservations() {
  useCrumbs(crumbs("Capacity Reservations"));
  const flash = useFlash();
  const m = useModal<any>();
  const [f, setF] = useState({ type: "t3.micro", platform: "Linux/UNIX", az: "us-east-1a", count: "1", match: "open" });
  return <>
    <ResourcePage<any>
      title="Capacity Reservations" trackBy="CapacityReservationId"
      load={async () => (await ec2("DescribeCapacityReservations")).CapacityReservations || []}
      create={{ text: "Create On-Demand Capacity Reservation", onClick: r => m.open("create", [], r) }}
      columns={[
        { id: "id", header: "Capacity Reservation ID", cell: c => c.CapacityReservationId },
        { id: "t", header: "Instance type", cell: c => c.InstanceType },
        { id: "p", header: "Platform", cell: c => c.InstancePlatform },
        { id: "az", header: "Availability Zone", cell: c => c.AvailabilityZone },
        { id: "s", header: "State", cell: c => <State s={c.State} /> },
        { id: "u", header: "Total / available", cell: c => `${c.TotalInstanceCount} / ${c.AvailableInstanceCount}` },
        { id: "m", header: "Instance eligibility", cell: c => c.InstanceMatchCriteria },
        { id: "e", header: "End date", cell: c => c.EndDate ? fmt(c.EndDate) : "Manually" },
      ]}
      actions={[{ id: "cancel", text: "Cancel reservation", run: async (s, r) => { for (const c of s) await ec2("CancelCapacityReservation", { CapacityReservationId: c.CapacityReservationId }); r(); } }]}
    />
    <ActionModal visible={m.is("create")} onDismiss={m.close} header="Create a Capacity Reservation" ok="Create" onOk={async () => {
      await ec2("CreateCapacityReservation", { InstanceType: f.type, InstancePlatform: f.platform, AvailabilityZone: f.az, InstanceCount: Number(f.count), InstanceMatchCriteria: f.match }); flash.notify({ type: "success", content: "Capacity Reservation created." }); m.reload();
    }}>
      <FormField label="Instance type"><Select selectedOption={{ value: f.type, label: f.type }} filteringType="auto" options={INSTANCE_TYPES.map(t => ({ value: t, label: t }))} onChange={e => setF({ ...f, type: e.detail.selectedOption.value! })} /></FormField>
      <FormField label="Platform"><Select selectedOption={{ value: f.platform, label: f.platform }} options={["Linux/UNIX", "Red Hat Enterprise Linux", "SUSE Linux", "Windows"].map(p => ({ value: p, label: p }))} onChange={e => setF({ ...f, platform: e.detail.selectedOption.value! })} /></FormField>
      <FormField label="Availability Zone"><Select selectedOption={{ value: f.az, label: f.az }} options={AZS.map(a => ({ value: a, label: a }))} onChange={e => setF({ ...f, az: e.detail.selectedOption.value! })} /></FormField>
      <FormField label="Total capacity"><Input type="number" value={f.count} onChange={e => setF({ ...f, count: e.detail.value })} /></FormField>
      <FormField label="Instance eligibility"><RadioGroup value={f.match} onChange={e => setF({ ...f, match: e.detail.value })} items={[{ value: "open", label: "Any instance with matching details" }, { value: "targeted", label: "Only instances that specify this reservation" }]} /></FormField>
    </ActionModal>
  </>;
}

// ---------------- Events ----------------
export function Events() {
  useCrumbs(crumbs("Events"));
  return (
    <ResourcePage<any>
      title="Events" trackBy={e => `${e.InstanceId}-${e.Code}-${e.NotBefore}`} multi={false}
      description="Scheduled events for your instances, such as reboots and retirements."
      load={async () => {
        const [st, inst] = await Promise.all([ec2("DescribeInstanceStatus", { IncludeAllInstances: true }), allInstances()]);
        const names = new Map(inst.map(i => [i.InstanceId, nameOf(i)]));
        return (st.InstanceStatuses || []).flatMap((s: any) => (s.Events || []).map((e: any) => ({ ...e, InstanceId: s.InstanceId, Name: names.get(s.InstanceId) })));
      }}
      columns={[
        { id: "r", header: "Resource ID", cell: e => <Link href={instHref(e.InstanceId)}>{e.InstanceId}</Link> },
        { id: "n", header: "Resource name", cell: e => e.Name || "-" },
        { id: "t", header: "Event type", cell: e => e.Code },
        { id: "d", header: "Description", cell: e => e.Description },
        { id: "s", header: "Start time", cell: e => fmt(e.NotBefore) },
        { id: "e", header: "Deadline", cell: e => fmt(e.NotBeforeDeadline) },
      ]}
      empty={<Box textAlign="center" color="inherit"><b>No events</b><Box variant="p" color="inherit">No scheduled events for your instances.</Box></Box>}
    />
  );
}

