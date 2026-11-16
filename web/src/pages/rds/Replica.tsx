import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { rds, crumbs, dbHref, clusterHref, STORAGE_TYPES } from "./lib";
import { ClassPicker, Section } from "./CreateDatabase";

const opt = (v: string, l?: string) => ({ value: v, label: l || v });

export function CreateReplica() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: id, href: dbHref(id) }, { text: "Create read replica" }));
  const src = useAsync(async () => (await rds("DescribeDBInstances", { DBInstanceIdentifier: id })).DBInstances[0], [id]);
  const [f, setF] = useState({ name: `${id}-replica`, cls: "", az: "", multiAz: false, pub: false, stype: "", auto: true, max: "1000", pi: false, del: false, autoMinor: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (src.error) return <ErrorAlert error={src.error} />;
  const s = src.data;
  if (!s) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const cls = f.cls || s.DBInstanceClass, stype = f.stype || s.StorageType;
  const azs = (s.DBSubnetGroup?.Subnets || []).map((x: any) => x.SubnetAvailabilityZone.Name);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await rds("CreateDBInstanceReadReplica", {
        DBInstanceIdentifier: f.name, SourceDBInstanceIdentifier: id, DBInstanceClass: cls, StorageType: stype, MultiAZ: f.multiAz, PubliclyAccessible: f.pub,
        ...(f.az && !f.multiAz ? { AvailabilityZone: f.az } : {}), ...(f.auto ? { MaxAllocatedStorage: Number(f.max) } : {}),
        EnablePerformanceInsights: f.pi, DeletionProtection: f.del, AutoMinorVersionUpgrade: f.autoMinor,
      });
      flash.notify({ type: "success", content: `Creating read replica ${f.name} of ${id}.` });
      nav("/rds/databases");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="You are creating a replica DB instance from a source DB instance. This new DB instance will have the source DB instance's DB security groups and DB parameter groups.">Create read replica DB instance</Header>}>
      <SpaceBetween size="l">
        <Section title="Settings">
          <FormField label="Replica source"><Box>{id}</Box></FormField>
          <FormField label="DB instance identifier" constraintText="1 to 60 alphanumeric characters or hyphens. First character must be a letter."><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value.toLowerCase() })} /></FormField>
        </Section>
        <Section title="Instance configuration"><ClassPicker value={cls} onChange={v => setF({ ...f, cls: v })} /></Section>
        <Section title="Storage">
          <FormField label="Storage type"><Select selectedOption={STORAGE_TYPES.find(x => x.value === stype) || opt(stype)} options={STORAGE_TYPES} onChange={e => setF({ ...f, stype: e.detail.selectedOption.value! })} /></FormField>
          <Checkbox checked={f.auto} onChange={e => setF({ ...f, auto: e.detail.checked })}>Enable storage autoscaling</Checkbox>
          {f.auto && <FormField label="Maximum storage threshold (GiB)"><Input type="number" value={f.max} onChange={e => setF({ ...f, max: e.detail.value })} /></FormField>}
        </Section>
        <Section title="Availability">
          <RadioGroup value={f.multiAz ? "multi" : "single"} onChange={e => setF({ ...f, multiAz: e.detail.value === "multi" })} items={[{ value: "multi", label: "Multi-AZ DB instance" }, { value: "single", label: "Single-AZ DB instance" }]} />
          {!f.multiAz && <FormField label="Availability Zone"><Select selectedOption={opt(f.az, f.az || "No preference")} options={[opt("", "No preference"), ...azs.map((a: string) => opt(a))]} onChange={e => setF({ ...f, az: e.detail.selectedOption.value! })} /></FormField>}
        </Section>
        <Section title="Connectivity">
          <FormField label="Public access"><RadioGroup value={f.pub ? "yes" : "no"} onChange={e => setF({ ...f, pub: e.detail.value === "yes" })} items={[{ value: "yes", label: "Publicly accessible" }, { value: "no", label: "Not publicly accessible" }]} /></FormField>
        </Section>
        <Section title="Additional configuration">
          <Checkbox checked={f.pi} onChange={e => setF({ ...f, pi: e.detail.checked })}>Enable Performance Insights</Checkbox>
          <Checkbox checked={f.autoMinor} onChange={e => setF({ ...f, autoMinor: e.detail.checked })}>Enable auto minor version upgrade</Checkbox>
          <Checkbox checked={f.del} onChange={e => setF({ ...f, del: e.detail.checked })}>Enable deletion protection</Checkbox>
        </Section>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name} onClick={submit}>Create read replica</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function AddReader() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: id, href: clusterHref(id) }, { text: "Add reader" }));
  const d = useAsync(async () => {
    const c = (await rds("DescribeDBClusters", { DBClusterIdentifier: id })).DBClusters[0];
    const w = c.DBClusterMembers?.find((m: any) => m.IsClusterWriter);
    const wi = w ? (await rds("DescribeDBInstances", { DBInstanceIdentifier: w.DBInstanceIdentifier })).DBInstances[0] : null;
    const sg = (await rds("DescribeDBSubnetGroups", { DBSubnetGroupName: c.DBSubnetGroup })).DBSubnetGroups?.[0];
    return { c, wi, azs: (sg?.Subnets || []).map((s: any) => s.SubnetAvailabilityZone.Name) };
  }, [id]);
  const [f, setF] = useState({ name: "", cls: "", az: "", pub: false, pi: false, tier: "1", autoMinor: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const { c, wi, azs } = d.data;
  const name = f.name || `${id}-instance-${(c.DBClusterMembers || []).length + 1}`;
  const cls = f.cls || wi?.DBInstanceClass || "db.r6g.large";
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await rds("CreateDBInstance", { DBInstanceIdentifier: name, DBClusterIdentifier: id, Engine: c.Engine, DBInstanceClass: cls, PubliclyAccessible: f.pub,
        ...(f.az ? { AvailabilityZone: f.az } : {}), EnablePerformanceInsights: f.pi, PromotionTier: Number(f.tier), AutoMinorVersionUpgrade: f.autoMinor });
      flash.notify({ type: "success", content: `Adding reader ${name} to ${id}.` });
      nav(clusterHref(id).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Add reader</Header>}>
      <SpaceBetween size="l">
        <Section title="Settings">
          <FormField label="DB cluster identifier"><Box>{id}</Box></FormField>
          <FormField label="Reader instance identifier"><Input value={name} onChange={e => setF({ ...f, name: e.detail.value.toLowerCase() })} /></FormField>
        </Section>
        <Section title="Instance configuration"><ClassPicker aurora value={cls} onChange={v => setF({ ...f, cls: v })} /></Section>
        <Section title="Connectivity">
          <FormField label="Availability Zone"><Select selectedOption={opt(f.az, f.az || "No preference")} options={[opt("", "No preference"), ...azs.map((a: string) => opt(a))]} onChange={e => setF({ ...f, az: e.detail.selectedOption.value! })} /></FormField>
          <FormField label="Public access"><RadioGroup value={f.pub ? "yes" : "no"} onChange={e => setF({ ...f, pub: e.detail.value === "yes" })} items={[{ value: "yes", label: "Publicly accessible" }, { value: "no", label: "Not publicly accessible" }]} /></FormField>
        </Section>
        <Section title="Additional configuration">
          <FormField label="Failover priority" description="Readers with a lower tier are promoted first."><Select selectedOption={opt(f.tier, `tier-${f.tier}`)} options={Array.from({ length: 16 }, (_, k) => opt(String(k), `tier-${k}`))} onChange={e => setF({ ...f, tier: e.detail.selectedOption.value! })} /></FormField>
          <Checkbox checked={f.pi} onChange={e => setF({ ...f, pi: e.detail.checked })}>Enable Performance Insights</Checkbox>
          <Checkbox checked={f.autoMinor} onChange={e => setF({ ...f, autoMinor: e.detail.checked })}>Enable auto minor version upgrade</Checkbox>
        </Section>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Add reader</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
