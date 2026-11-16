import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Form from "@cloudscape-design/components/form";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, EmulatorNote } from "../../common";
import { asg, ec2, elb, fmt, instHref, useSubnets } from "./lib";
import { ResourcePage, ActionModal, useModal } from "./ResourcePage";

export function AutoScalingGroups() {
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Auto Scaling groups", href: "#" }]);
  const flash = useFlash();
  const m = useModal<any>();
  const [cap, setCap] = useState({ min: "1", des: "1", max: "1" });
  return <>
    <ResourcePage<any>
      title="Auto Scaling groups" trackBy="AutoScalingGroupName"
      load={async () => (await asg("DescribeAutoScalingGroups")).AutoScalingGroups || []}
      create={{ text: "Create Auto Scaling group", href: "#/ec2/auto-scaling-groups/create" }}
      columns={[
        { id: "n", header: "Name", cell: g => g.AutoScalingGroupName },
        { id: "lt", header: "Launch template/configuration", cell: g => g.LaunchTemplate ? `${g.LaunchTemplate.LaunchTemplateName} | Version ${g.LaunchTemplate.Version}` : g.LaunchConfigurationName || "-" },
        { id: "i", header: "Instances", cell: g => (g.Instances || []).length },
        { id: "s", header: "Status", cell: g => g.Status || "-" },
        { id: "d", header: "Desired capacity", cell: g => g.DesiredCapacity },
        { id: "min", header: "Min", cell: g => g.MinSize },
        { id: "max", header: "Max", cell: g => g.MaxSize },
        { id: "az", header: "Availability Zones", cell: g => (g.AvailabilityZones || []).join(", ") },
      ]}
      actions={[
        { id: "cap", text: "Edit capacity", disabled: s => s.length !== 1, run: (s, r) => { setCap({ min: String(s[0].MinSize), des: String(s[0].DesiredCapacity), max: String(s[0].MaxSize) }); m.open("cap", s, r); } },
        { id: "delete", text: "Delete", run: (s, r) => m.open("delete", s, r) },
      ]}
      detail={g => [
        { id: "d", label: "Details", content: <ColumnLayout columns={4} variant="text-grid">
          <ValueWithLabel label="Desired / min / max">{g.DesiredCapacity} / {g.MinSize} / {g.MaxSize}</ValueWithLabel>
          <ValueWithLabel label="Health check type">{g.HealthCheckType}</ValueWithLabel>
          <ValueWithLabel label="Health check grace period">{g.HealthCheckGracePeriod}s</ValueWithLabel>
          <ValueWithLabel label="Created">{fmt(g.CreatedTime)}</ValueWithLabel>
          <ValueWithLabel label="Subnets">{g.VPCZoneIdentifier || "-"}</ValueWithLabel>
          <ValueWithLabel label="Target groups">{(g.TargetGroupARNs || []).map((a: string) => a.split("/")[1]).join(", ") || "-"}</ValueWithLabel>
        </ColumnLayout> },
        { id: "i", label: "Instance management", content: <Table variant="embedded" items={g.Instances || []} empty={<Box color="text-body-secondary">No instances</Box>} columnDefinitions={[
          { id: "i", header: "Instance ID", cell: (i: any) => <Link href={instHref(i.InstanceId)}>{i.InstanceId}</Link> },
          { id: "l", header: "Lifecycle", cell: (i: any) => i.LifecycleState }, { id: "h", header: "Health status", cell: (i: any) => i.HealthStatus },
          { id: "t", header: "Instance type", cell: (i: any) => i.InstanceType }, { id: "z", header: "Availability Zone", cell: (i: any) => i.AvailabilityZone },
        ]} /> },
        { id: "a", label: "Activity", content: <Activity name={g.AutoScalingGroupName} /> },
        { id: "p", label: "Automatic scaling", content: <Policies name={g.AutoScalingGroupName} /> },
      ]}
    />
    <ActionModal visible={m.is("cap")} onDismiss={m.close} header="Edit capacity" ok="Update" onOk={async () => {
      await asg("UpdateAutoScalingGroup", { AutoScalingGroupName: m.rows[0].AutoScalingGroupName, MinSize: Number(cap.min), DesiredCapacity: Number(cap.des), MaxSize: Number(cap.max) }); flash.notify({ type: "success", content: "Capacity updated." }); m.reload();
    }}><ColumnLayout columns={3}>
      <FormField label="Desired capacity"><Input type="number" value={cap.des} onChange={e => setCap({ ...cap, des: e.detail.value })} /></FormField>
      <FormField label="Min desired capacity"><Input type="number" value={cap.min} onChange={e => setCap({ ...cap, min: e.detail.value })} /></FormField>
      <FormField label="Max desired capacity"><Input type="number" value={cap.max} onChange={e => setCap({ ...cap, max: e.detail.value })} /></FormField>
    </ColumnLayout></ActionModal>
    <ActionModal visible={m.is("delete")} onDismiss={m.close} header="Delete Auto Scaling group" ok="Delete" danger onOk={async () => {
      for (const g of m.rows) await asg("DeleteAutoScalingGroup", { AutoScalingGroupName: g.AutoScalingGroupName, ForceDelete: true }); flash.notify({ type: "success", content: "Deleting Auto Scaling groups and their instances." }); m.reload();
    }}><Box>Delete {m.rows.map(g => g.AutoScalingGroupName).join(", ")}? Its instances are terminated.</Box></ActionModal>
  </>;
}
function Activity({ name }: { name: string }) {
  const a = useAsync(async () => (await asg("DescribeScalingActivities", { AutoScalingGroupName: name })).Activities || [], [name]);
  return <Table variant="embedded" items={a.data || []} loading={a.loading} empty={<Box color="text-body-secondary">No activity</Box>} columnDefinitions={[{ id: "s", header: "Status", cell: (x: any) => x.StatusCode }, { id: "d", header: "Description", cell: (x: any) => x.Description }, { id: "t", header: "Start time", cell: (x: any) => fmt(x.StartTime) }]} />;
}
function Policies({ name }: { name: string }) {
  const flash = useFlash();
  const p = useAsync(async () => (await asg("DescribePolicies", { AutoScalingGroupName: name })).ScalingPolicies || [], [name]);
  const [target, setTarget] = useState("50");
  return (
    <SpaceBetween size="m">
      <Table variant="embedded" items={p.data || []} loading={p.loading} empty={<Box color="text-body-secondary">No scaling policies</Box>} columnDefinitions={[
        { id: "n", header: "Policy name", cell: (x: any) => x.PolicyName }, { id: "t", header: "Policy type", cell: (x: any) => x.PolicyType },
        { id: "v", header: "Target", cell: (x: any) => x.TargetTrackingConfiguration ? `${x.TargetTrackingConfiguration.PredefinedMetricSpecification?.PredefinedMetricType} = ${x.TargetTrackingConfiguration.TargetValue}` : "-" },
      ]} />
      <SpaceBetween direction="horizontal" size="xs" alignItems="end">
        <FormField label="Target average CPU utilization (%)"><Input type="number" value={target} onChange={e => setTarget(e.detail.value)} /></FormField>
        <Button onClick={async () => { try { await asg("PutScalingPolicy", { AutoScalingGroupName: name, PolicyName: "Target Tracking Policy", PolicyType: "TargetTrackingScaling", TargetTrackingConfiguration: { PredefinedMetricSpecification: { PredefinedMetricType: "ASGAverageCPUUtilization" }, TargetValue: Number(target) } }); p.reload(); } catch (e) { flash.error(e); } }}>Create target tracking policy</Button>
      </SpaceBetween>
      <EmulatorNote>Scheduled actions aren't implemented in AWS Emulator (PutScheduledUpdateGroupAction).</EmulatorNote>
    </SpaceBetween>
  );
}

export function CreateAutoScalingGroup() {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Auto Scaling groups", href: "#/ec2/auto-scaling-groups" }, { text: "Create Auto Scaling group", href: "#" }]);
  const lts = useAsync(async () => ((await ec2("DescribeLaunchTemplates")).LaunchTemplates || []).map((t: any) => ({ value: t.LaunchTemplateId, label: t.LaunchTemplateName })), []);
  const subnets = useSubnets();
  const tgs = useAsync(async () => ((await elb("DescribeTargetGroups")).TargetGroups || []).map((t: any) => ({ value: t.TargetGroupArn, label: t.TargetGroupName })), []);
  const [f, setF] = useState<any>({ name: "", lt: null, subnets: [], tgs: [], min: "1", des: "1", max: "2" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async () => {
    if (!f.name || !f.lt || !f.subnets.length) { setErr(new Error("Name, launch template and at least one subnet are required.")); return; }
    setBusy(true); setErr(null);
    try {
      await asg("CreateAutoScalingGroup", { AutoScalingGroupName: f.name, LaunchTemplate: { LaunchTemplateId: f.lt.value, Version: "$Default" }, VPCZoneIdentifier: f.subnets.map((s: any) => s.value).join(","),
        MinSize: Number(f.min), DesiredCapacity: Number(f.des), MaxSize: Number(f.max), ...(f.tgs.length ? { TargetGroupARNs: f.tgs.map((t: any) => t.value) } : {}) });
      flash.notify({ type: "success", content: `Auto Scaling group ${f.name} created.` }); nav("/ec2/auto-scaling-groups");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Create Auto Scaling group</Header>}>
      <Form errorText={err ? <ErrorAlert error={err} /> : undefined} actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create Auto Scaling group</Button></SpaceBetween>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Name and launch template</Header>}>
            <SpaceBetween size="m">
              <FormField label="Auto Scaling group name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
              <FormField label="Launch template" description={<Link href="#/ec2/launch-templates/create">Create a launch template</Link>}><Select selectedOption={f.lt} placeholder="Select a launch template" options={lts.data || []} onChange={e => setF({ ...f, lt: e.detail.selectedOption })} /></FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Network</Header>}>
            <FormField label="Availability Zones and subnets"><Multiselect selectedOptions={f.subnets} options={subnets.data || []} onChange={e => setF({ ...f, subnets: e.detail.selectedOptions })} placeholder="Select subnets" /></FormField>
          </Container>
          <Container header={<Header variant="h2">Load balancing - optional</Header>}>
            <FormField label="Existing load balancer target groups"><Multiselect selectedOptions={f.tgs} options={tgs.data || []} onChange={e => setF({ ...f, tgs: e.detail.selectedOptions })} placeholder="Select target groups" /></FormField>
          </Container>
          <Container header={<Header variant="h2">Group size</Header>}>
            <ColumnLayout columns={3}>
              <FormField label="Desired capacity"><Input type="number" value={f.des} onChange={e => setF({ ...f, des: e.detail.value })} /></FormField>
              <FormField label="Min desired capacity"><Input type="number" value={f.min} onChange={e => setF({ ...f, min: e.detail.value })} /></FormField>
              <FormField label="Max desired capacity"><Input type="number" value={f.max} onChange={e => setF({ ...f, max: e.detail.value })} /></FormField>
            </ColumnLayout>
          </Container>
        </SpaceBetween>
      </Form>
    </ContentLayout>
  );
}
