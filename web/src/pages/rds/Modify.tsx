import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Table from "@cloudscape-design/components/table";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { useSgs } from "../ec2/lib";
import { rds, crumbs, STORAGE_TYPES, storageLabel, useParamGroups, useOptionGroups, dbHref, clusterHref, isAurora } from "./lib";
import { ClassPicker, Section } from "./CreateDatabase";

type Change = { label: string; cur: string; next: string; param: Record<string, unknown> };
const opt = (v: string, l?: string) => ({ value: v, label: l || v });

function Review({ changes, apply, setApply, busy, err, onBack, onSubmit, kind }: { changes: Change[]; apply: string; setApply: (v: string) => void; busy: boolean; err: unknown; onBack: () => void; onSubmit: () => void; kind: string }) {
  return (
    <SpaceBetween size="l">
      <Table variant="container" header={<Header variant="h2" description="You are about to submit the following modifications. Only values that will change are displayed.">Summary of modifications</Header>}
        items={changes} empty={<Box color="text-body-secondary">No changes.</Box>}
        columnDefinitions={[{ id: "a", header: "Attribute", cell: c => c.label }, { id: "c", header: "Current value", cell: c => c.cur || "-" }, { id: "n", header: "New value", cell: c => c.next || "-" }]} />
      <Container header={<Header variant="h2">Schedule modifications</Header>}>
        <FormField label="When to apply modifications">
          <RadioGroup value={apply} onChange={e => setApply(e.detail.value)} items={[
            { value: "window", label: "Apply during the next scheduled maintenance window", description: "Current maintenance window: as configured on the database." },
            { value: "now", label: "Apply immediately", description: "The modifications in this request and any pending modifications will be asynchronously applied as soon as possible." },
          ]} />
        </FormField>
      </Container>
      <ErrorAlert error={err} />
      <Box float="right"><SpaceBetween direction="horizontal" size="xs">
        <Button variant="link" onClick={onBack}>Back</Button>
        <Button variant="primary" loading={busy} disabled={!changes.length} onClick={onSubmit}>Modify {kind}</Button>
      </SpaceBetween></Box>
    </SpaceBetween>
  );
}

export function ModifyInstance() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: id, href: dbHref(id) }, { text: "Modify" }));
  const d = useAsync(async () => (await rds("DescribeDBInstances", { DBInstanceIdentifier: id })).DBInstances[0], [id]);
  const i = d.data;
  const inCluster = !!i?.DBClusterIdentifier;
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (!i) return;
    setF({
      newId: i.DBInstanceIdentifier, pw: "", pw2: "", cls: i.DBInstanceClass, stype: i.StorageType, size: String(i.AllocatedStorage), iops: String(i.Iops || 3000),
      auto: !!i.MaxAllocatedStorage, max: String(i.MaxAllocatedStorage || 1000), multiAz: !!i.MultiAZ, sgs: (i.VpcSecurityGroups || []).map((g: any) => g.VpcSecurityGroupId),
      pub: !!i.PubliclyAccessible, ca: i.CACertificateIdentifier, port: String(i.Endpoint?.Port || ""), iam: !!i.IAMDatabaseAuthenticationEnabled, pi: !!i.PerformanceInsightsEnabled,
      em: !!i.MonitoringInterval, pg: i.DBParameterGroups?.[0]?.DBParameterGroupName, og: i.OptionGroupMemberships?.[0]?.OptionGroupName, ret: String(i.BackupRetentionPeriod ?? 1),
      copyTags: !!i.CopyTagsToSnapshot, autoMinor: !!i.AutoMinorVersionUpgrade, mw: i.PreferredMaintenanceWindow, bw: i.PreferredBackupWindow, del: !!i.DeletionProtection,
      logs: i.EnabledCloudwatchLogsExports || [],
    });
  }, [i]);
  const family = i?.DBParameterGroups?.[0]?.DBParameterGroupName?.startsWith("default.") ? i.DBParameterGroups[0].DBParameterGroupName.slice(8) : undefined;
  const famQ = useAsync(async () => {
    if (!i || family) return family;
    const r = await rds("DescribeDBParameterGroups", { DBParameterGroupName: i.DBParameterGroups?.[0]?.DBParameterGroupName });
    return r.DBParameterGroups?.[0]?.DBParameterGroupFamily;
  }, [i]);
  const pgs = useParamGroups(famQ.data || family);
  const major = i ? (i.Engine === "postgres" ? i.EngineVersion.split(".")[0] : i.EngineVersion.split(".").slice(0, 2).join(".")) : undefined;
  const ogs = useOptionGroups(i && !inCluster ? i.Engine : undefined, major);
  const sgs = useSgs(i?.DBSubnetGroup?.VpcId);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [apply, setApply] = useState("window");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!i || !f) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });

  const changes: Change[] = [];
  const add = (label: string, cur: any, next: any, param: Record<string, unknown>) => { if (String(cur ?? "") !== String(next ?? "")) changes.push({ label, cur: String(cur ?? ""), next: String(next ?? ""), param }); };
  add("DB instance identifier", i.DBInstanceIdentifier, f.newId, { NewDBInstanceIdentifier: f.newId });
  if (f.pw) changes.push({ label: "Master password", cur: "****", next: "New password", param: { MasterUserPassword: f.pw } });
  add("DB instance class", i.DBInstanceClass, f.cls, { DBInstanceClass: f.cls });
  if (!inCluster) {
    add("Storage type", storageLabel(i.StorageType), storageLabel(f.stype), { StorageType: f.stype });
    add("Allocated storage", `${i.AllocatedStorage} GiB`, `${f.size} GiB`, { AllocatedStorage: Number(f.size) });
    if (f.stype.startsWith("io")) add("Provisioned IOPS", i.Iops, f.iops, { Iops: Number(f.iops) });
    add("Maximum storage threshold", i.MaxAllocatedStorage ? `${i.MaxAllocatedStorage} GiB` : "Disabled", f.auto ? `${f.max} GiB` : "Disabled", { MaxAllocatedStorage: f.auto ? Number(f.max) : Number(f.size) });
    add("Multi-AZ deployment", i.MultiAZ ? "Yes" : "No", f.multiAz ? "Yes" : "No", { MultiAZ: f.multiAz });
    add("Security groups", (i.VpcSecurityGroups || []).map((g: any) => g.VpcSecurityGroupId).join(", "), f.sgs.join(", "), { VpcSecurityGroupIds: f.sgs });
    add("Database port", i.Endpoint?.Port, f.port, { DBPortNumber: Number(f.port) });
    add("IAM DB authentication", i.IAMDatabaseAuthenticationEnabled ? "Enabled" : "Disabled", f.iam ? "Enabled" : "Disabled", { EnableIAMDatabaseAuthentication: f.iam });
    add("Option group", i.OptionGroupMemberships?.[0]?.OptionGroupName, f.og, { OptionGroupName: f.og });
    add("Backup retention period", `${i.BackupRetentionPeriod} days`, `${f.ret} days`, { BackupRetentionPeriod: Number(f.ret) });
    add("Backup window", i.PreferredBackupWindow, f.bw, { PreferredBackupWindow: f.bw });
    add("Copy tags to snapshots", i.CopyTagsToSnapshot ? "Enabled" : "Disabled", f.copyTags ? "Enabled" : "Disabled", { CopyTagsToSnapshot: f.copyTags });
    add("Deletion protection", i.DeletionProtection ? "Enabled" : "Disabled", f.del ? "Enabled" : "Disabled", { DeletionProtection: f.del });
    add("Log exports", (i.EnabledCloudwatchLogsExports || []).join(", "), f.logs.join(", "), { CloudwatchLogsExportConfiguration: { EnableLogTypes: f.logs.filter((l: string) => !(i.EnabledCloudwatchLogsExports || []).includes(l)), DisableLogTypes: (i.EnabledCloudwatchLogsExports || []).filter((l: string) => !f.logs.includes(l)) } });
  }
  add("Publicly accessible", i.PubliclyAccessible ? "Yes" : "No", f.pub ? "Yes" : "No", { PubliclyAccessible: f.pub });
  add("Certificate authority", i.CACertificateIdentifier, f.ca, { CACertificateIdentifier: f.ca });
  add("Performance Insights", i.PerformanceInsightsEnabled ? "Enabled" : "Disabled", f.pi ? "Enabled" : "Disabled", { EnablePerformanceInsights: f.pi });
  add("Enhanced Monitoring", i.MonitoringInterval ? "Enabled" : "Disabled", f.em ? "Enabled" : "Disabled", { MonitoringInterval: f.em ? 60 : 0 });
  add("DB parameter group", i.DBParameterGroups?.[0]?.DBParameterGroupName, f.pg, { DBParameterGroupName: f.pg });
  add("Auto minor version upgrade", i.AutoMinorVersionUpgrade ? "Enabled" : "Disabled", f.autoMinor ? "Enabled" : "Disabled", { AutoMinorVersionUpgrade: f.autoMinor });
  add("Maintenance window", i.PreferredMaintenanceWindow, f.mw, { PreferredMaintenanceWindow: f.mw });

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await rds("ModifyDBInstance", { DBInstanceIdentifier: i.DBInstanceIdentifier, ApplyImmediately: apply === "now", ...Object.assign({}, ...changes.map(c => c.param)) });
      flash.notify({ type: "success", content: `Successfully modified DB instance ${i.DBInstanceIdentifier}.${apply === "now" ? "" : " Changes will be applied during the next maintenance window."}` });
      nav(dbHref(f.newId).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  if (step === "review") return <ContentLayout header={<Header variant="h1">Modify DB instance: {i.DBInstanceIdentifier}</Header>}><Review kind="DB instance" changes={changes} apply={apply} setApply={setApply} busy={busy} err={err} onBack={() => setStep("edit")} onSubmit={submit} /></ContentLayout>;
  const pwErr = f.pw && f.pw.length < 8 ? "Must be at least 8 characters." : f.pw2 && f.pw !== f.pw2 ? "Passwords don't match." : undefined;
  return (
    <ContentLayout header={<Header variant="h1">Modify DB instance: {i.DBInstanceIdentifier}</Header>}>
      <SpaceBetween size="l">
        <Section title="Settings">
          <FormField label="Engine version"><Box>{i.EngineVersion}</Box></FormField>
          <FormField label="DB instance identifier" constraintText="1 to 60 alphanumeric characters or hyphens. First character must be a letter."><Input value={f.newId} onChange={e => set("newId")(e.detail.value.toLowerCase())} /></FormField>
          {!inCluster && <SpaceBetween size="l">
            <FormField label="New master password" description="Leave empty to keep the current password." errorText={pwErr && !pwErr.includes("match") ? pwErr : undefined}><Input type="password" value={f.pw} onChange={e => set("pw")(e.detail.value)} /></FormField>
            <FormField label="Confirm master password" errorText={pwErr?.includes("match") ? pwErr : undefined}><Input type="password" value={f.pw2} onChange={e => set("pw2")(e.detail.value)} /></FormField>
          </SpaceBetween>}
        </Section>
        <Section title="Instance configuration"><ClassPicker aurora={isAurora(i.Engine)} value={f.cls} onChange={set("cls")} /></Section>
        {!inCluster && <Section title="Storage">
          <FormField label="Storage type"><Select selectedOption={STORAGE_TYPES.find(s => s.value === f.stype) || opt(f.stype)} options={STORAGE_TYPES} onChange={e => set("stype")(e.detail.selectedOption.value)} /></FormField>
          <FormField label="Allocated storage (GiB)" constraintText={`Current: ${i.AllocatedStorage} GiB. Storage can only be increased.`}><Input type="number" value={f.size} onChange={e => set("size")(e.detail.value)} /></FormField>
          {f.stype.startsWith("io") && <FormField label="Provisioned IOPS"><Input type="number" value={f.iops} onChange={e => set("iops")(e.detail.value)} /></FormField>}
          <Checkbox checked={f.auto} onChange={e => set("auto")(e.detail.checked)}>Enable storage autoscaling</Checkbox>
          {f.auto && <FormField label="Maximum storage threshold (GiB)"><Input type="number" value={f.max} onChange={e => set("max")(e.detail.value)} /></FormField>}
        </Section>}
        {!inCluster && <Section title="Availability & durability">
          <RadioGroup value={f.multiAz ? "multi" : "single"} onChange={e => set("multiAz")(e.detail.value === "multi")} items={[
            { value: "multi", label: "Multi-AZ DB instance", description: "Creates a standby DB instance in a different Availability Zone." },
            { value: "single", label: "Single-AZ DB instance", description: "No standby DB instance." },
          ]} />
        </Section>}
        <Section title="Connectivity">
          {!inCluster && <FormField label="Security group"><Multiselect selectedOptions={(sgs.data || []).filter((g: any) => f.sgs.includes(g.value))} options={sgs.data || []} onChange={e => set("sgs")(e.detail.selectedOptions.map(o => o.value))} /></FormField>}
          <FormField label="Public access"><RadioGroup value={f.pub ? "yes" : "no"} onChange={e => set("pub")(e.detail.value === "yes")} items={[{ value: "yes", label: "Publicly accessible" }, { value: "no", label: "Not publicly accessible" }]} /></FormField>
          <FormField label="Certificate authority"><Select selectedOption={opt(f.ca)} options={["rds-ca-rsa2048-g1", "rds-ca-rsa4096-g1", "rds-ca-ecc384-g1"].map(x => opt(x))} onChange={e => set("ca")(e.detail.selectedOption.value)} /></FormField>
          {!inCluster && <FormField label="Database port"><Input type="number" value={f.port} onChange={e => set("port")(e.detail.value)} /></FormField>}
        </Section>
        {!inCluster && <Section title="Database authentication">
          <RadioGroup value={f.iam ? "iam" : "password"} onChange={e => set("iam")(e.detail.value === "iam")} items={[{ value: "password", label: "Password authentication" }, { value: "iam", label: "Password and IAM database authentication" }]} />
        </Section>}
        <Section title="Monitoring">
          <Checkbox checked={f.pi} onChange={e => set("pi")(e.detail.checked)}>Enable Performance Insights</Checkbox>
          <Checkbox checked={f.em} onChange={e => set("em")(e.detail.checked)}>Enable Enhanced monitoring</Checkbox>
        </Section>
        <Section title="Additional configuration">
          <FormField label="DB parameter group"><Select selectedOption={opt(f.pg)} options={pgs.data || []} onChange={e => set("pg")(e.detail.selectedOption.value)} statusType={pgs.loading ? "loading" : "finished"} /></FormField>
          {!inCluster && <FormField label="Option group"><Select selectedOption={opt(f.og)} options={ogs.data || []} onChange={e => set("og")(e.detail.selectedOption.value)} /></FormField>}
          {!inCluster && <SpaceBetween size="l">
            <FormField label="Backup retention period (days)"><Select selectedOption={opt(f.ret, `${f.ret} days`)} options={Array.from({ length: 36 }, (_, k) => opt(String(k), `${k} days`))} onChange={e => set("ret")(e.detail.selectedOption.value)} /></FormField>
            <FormField label="Backup window (UTC)" constraintText="Format hh24:mi-hh24:mi"><Input value={f.bw} onChange={e => set("bw")(e.detail.value)} /></FormField>
            <Checkbox checked={f.copyTags} onChange={e => set("copyTags")(e.detail.checked)}>Copy tags to snapshots</Checkbox>
            {i.Engine && /mysql|mariadb|postgres/.test(i.Engine) && <FormField label="Log exports"><SpaceBetween size="xxs">
              {(/postgres/.test(i.Engine) ? ["postgresql", "upgrade"] : ["audit", "error", "general", "slowquery"]).map(l => <Checkbox key={l} checked={f.logs.includes(l)} onChange={e => set("logs")(e.detail.checked ? [...f.logs, l] : f.logs.filter((x: string) => x !== l))}>{l}</Checkbox>)}
            </SpaceBetween></FormField>}
          </SpaceBetween>}
          <Checkbox checked={f.autoMinor} onChange={e => set("autoMinor")(e.detail.checked)}>Enable auto minor version upgrade</Checkbox>
          <FormField label="Maintenance window (UTC)" constraintText="Format ddd:hh24:mi-ddd:hh24:mi"><Input value={f.mw} onChange={e => set("mw")(e.detail.value)} /></FormField>
          {!inCluster && <Checkbox checked={f.del} onChange={e => set("del")(e.detail.checked)}>Enable deletion protection</Checkbox>}
        </Section>
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" disabled={!!pwErr} onClick={() => setStep("review")}>Continue</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function ModifyCluster() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Databases", href: "#/rds/databases" }, { text: id, href: clusterHref(id) }, { text: "Modify" }));
  const d = useAsync(async () => (await rds("DescribeDBClusters", { DBClusterIdentifier: id })).DBClusters[0], [id]);
  const c = d.data;
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (!c) return;
    setF({ newId: c.DBClusterIdentifier, pw: "", pw2: "", port: String(c.Port), sgs: (c.VpcSecurityGroups || []).map((g: any) => g.VpcSecurityGroupId), iam: !!c.IAMDatabaseAuthenticationEnabled,
      cpg: c.DBClusterParameterGroup, ret: String(c.BackupRetentionPeriod), bw: c.PreferredBackupWindow, mw: c.PreferredMaintenanceWindow, copyTags: !!c.CopyTagsToSnapshot,
      del: !!c.DeletionProtection, http: !!c.HttpEndpointEnabled, io: c.StorageType === "aurora-iopt1", autoMinor: !!c.AutoMinorVersionUpgrade,
      min: String(c.ServerlessV2ScalingConfiguration?.MinCapacity ?? ""), max: String(c.ServerlessV2ScalingConfiguration?.MaxCapacity ?? "") });
  }, [c]);
  const fam = useAsync(async () => c ? (await rds("DescribeDBClusterParameterGroups", { DBClusterParameterGroupName: c.DBClusterParameterGroup })).DBClusterParameterGroups?.[0]?.DBParameterGroupFamily : undefined, [c]);
  const cpgs = useParamGroups(fam.data, true);
  const vpc = useAsync(async () => c ? (await rds("DescribeDBSubnetGroups", { DBSubnetGroupName: c.DBSubnetGroup })).DBSubnetGroups?.[0]?.VpcId : undefined, [c]);
  const sgs = useSgs(vpc.data);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [apply, setApply] = useState("window");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!c || !f) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const changes: Change[] = [];
  const add = (label: string, cur: any, next: any, param: Record<string, unknown>) => { if (String(cur ?? "") !== String(next ?? "")) changes.push({ label, cur: String(cur ?? ""), next: String(next ?? ""), param }); };
  const en = (b: boolean) => b ? "Enabled" : "Disabled";
  add("DB cluster identifier", c.DBClusterIdentifier, f.newId, { NewDBClusterIdentifier: f.newId });
  if (f.pw) changes.push({ label: "Master password", cur: "****", next: "New password", param: { MasterUserPassword: f.pw } });
  add("Cluster storage configuration", c.StorageType === "aurora-iopt1" ? "I/O-Optimized" : "Standard", f.io ? "I/O-Optimized" : "Standard", { StorageType: f.io ? "aurora-iopt1" : "aurora" });
  if (c.ServerlessV2ScalingConfiguration) add("Capacity range", `${c.ServerlessV2ScalingConfiguration.MinCapacity}-${c.ServerlessV2ScalingConfiguration.MaxCapacity} ACUs`, `${f.min}-${f.max} ACUs`, { ServerlessV2ScalingConfiguration: { MinCapacity: Number(f.min), MaxCapacity: Number(f.max) } });
  add("Security groups", (c.VpcSecurityGroups || []).map((g: any) => g.VpcSecurityGroupId).join(", "), f.sgs.join(", "), { VpcSecurityGroupIds: f.sgs });
  add("Database port", c.Port, f.port, { Port: Number(f.port) });
  add("IAM DB authentication", en(c.IAMDatabaseAuthenticationEnabled), en(f.iam), { EnableIAMDatabaseAuthentication: f.iam });
  add("Data API", en(c.HttpEndpointEnabled), en(f.http), { EnableHttpEndpoint: f.http });
  add("DB cluster parameter group", c.DBClusterParameterGroup, f.cpg, { DBClusterParameterGroupName: f.cpg });
  add("Backup retention period", `${c.BackupRetentionPeriod} days`, `${f.ret} days`, { BackupRetentionPeriod: Number(f.ret) });
  add("Backup window", c.PreferredBackupWindow, f.bw, { PreferredBackupWindow: f.bw });
  add("Copy tags to snapshots", en(c.CopyTagsToSnapshot), en(f.copyTags), { CopyTagsToSnapshot: f.copyTags });
  add("Auto minor version upgrade", en(c.AutoMinorVersionUpgrade), en(f.autoMinor), { AutoMinorVersionUpgrade: f.autoMinor });
  add("Maintenance window", c.PreferredMaintenanceWindow, f.mw, { PreferredMaintenanceWindow: f.mw });
  add("Deletion protection", en(c.DeletionProtection), en(f.del), { DeletionProtection: f.del });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await rds("ModifyDBCluster", { DBClusterIdentifier: c.DBClusterIdentifier, ApplyImmediately: apply === "now", ...Object.assign({}, ...changes.map(x => x.param)) });
      flash.notify({ type: "success", content: `Successfully modified DB cluster ${c.DBClusterIdentifier}.` });
      nav(clusterHref(f.newId).slice(1));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (step === "review") return <ContentLayout header={<Header variant="h1">Modify DB cluster: {c.DBClusterIdentifier}</Header>}><Review kind="cluster" changes={changes} apply={apply} setApply={setApply} busy={busy} err={err} onBack={() => setStep("edit")} onSubmit={submit} /></ContentLayout>;
  const pwErr = f.pw && f.pw.length < 8 ? "Must be at least 8 characters." : f.pw2 && f.pw !== f.pw2 ? "Passwords don't match." : undefined;
  return (
    <ContentLayout header={<Header variant="h1">Modify DB cluster: {c.DBClusterIdentifier}</Header>}>
      <SpaceBetween size="l">
        <Alert type="info">To change the instance class of a cluster's instances, modify each DB instance.</Alert>
        <Section title="Settings">
          <FormField label="Engine version"><Box>{c.EngineVersion}</Box></FormField>
          <FormField label="DB cluster identifier"><Input value={f.newId} onChange={e => set("newId")(e.detail.value.toLowerCase())} /></FormField>
          <FormField label="New master password" description="Leave empty to keep the current password." errorText={pwErr && !pwErr.includes("match") ? pwErr : undefined}><Input type="password" value={f.pw} onChange={e => set("pw")(e.detail.value)} /></FormField>
          <FormField label="Confirm master password" errorText={pwErr?.includes("match") ? pwErr : undefined}><Input type="password" value={f.pw2} onChange={e => set("pw2")(e.detail.value)} /></FormField>
        </Section>
        <Section title="Cluster storage configuration">
          <RadioGroup value={f.io ? "io" : "std"} onChange={e => set("io")(e.detail.value === "io")} items={[{ value: "io", label: "Aurora I/O-Optimized" }, { value: "std", label: "Aurora Standard" }]} />
        </Section>
        {c.ServerlessV2ScalingConfiguration && <Section title="Capacity range">
          <SpaceBetween direction="horizontal" size="s">
            <FormField label="Minimum capacity (ACUs)"><Input type="number" value={f.min} onChange={e => set("min")(e.detail.value)} /></FormField>
            <FormField label="Maximum capacity (ACUs)"><Input type="number" value={f.max} onChange={e => set("max")(e.detail.value)} /></FormField>
          </SpaceBetween>
        </Section>}
        <Section title="Connectivity">
          <FormField label="Security group"><Multiselect selectedOptions={(sgs.data || []).filter((g: any) => f.sgs.includes(g.value))} options={sgs.data || []} onChange={e => set("sgs")(e.detail.selectedOptions.map(o => o.value))} /></FormField>
          <FormField label="Database port"><Input type="number" value={f.port} onChange={e => set("port")(e.detail.value)} /></FormField>
          <Checkbox checked={f.http} onChange={e => set("http")(e.detail.checked)} description="Lets applications run SQL through the RDS Data API.">Enable the RDS Data API</Checkbox>
        </Section>
        <Section title="Database authentication">
          <RadioGroup value={f.iam ? "iam" : "password"} onChange={e => set("iam")(e.detail.value === "iam")} items={[{ value: "password", label: "Password authentication" }, { value: "iam", label: "Password and IAM database authentication" }]} />
        </Section>
        <Section title="Additional configuration">
          <FormField label="DB cluster parameter group"><Select selectedOption={opt(f.cpg)} options={cpgs.data || []} onChange={e => set("cpg")(e.detail.selectedOption.value)} /></FormField>
          <FormField label="Backup retention period (days)"><Select selectedOption={opt(f.ret, `${f.ret} days`)} options={Array.from({ length: 35 }, (_, k) => opt(String(k + 1), `${k + 1} days`))} onChange={e => set("ret")(e.detail.selectedOption.value)} /></FormField>
          <FormField label="Backup window (UTC)"><Input value={f.bw} onChange={e => set("bw")(e.detail.value)} /></FormField>
          <Checkbox checked={f.copyTags} onChange={e => set("copyTags")(e.detail.checked)}>Copy tags to snapshots</Checkbox>
          <Checkbox checked={f.autoMinor} onChange={e => set("autoMinor")(e.detail.checked)}>Enable auto minor version upgrade</Checkbox>
          <FormField label="Maintenance window (UTC)"><Input value={f.mw} onChange={e => set("mw")(e.detail.value)} /></FormField>
          <Checkbox checked={f.del} onChange={e => set("del")(e.detail.checked)}>Enable deletion protection</Checkbox>
        </Section>
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" disabled={!!pwErr} onClick={() => setStep("review")}>Continue</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
