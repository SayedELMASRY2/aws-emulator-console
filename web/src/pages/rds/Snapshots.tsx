import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Tiles from "@cloudscape-design/components/tiles";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash, ValueWithLabel, Copyable, EmulatorNote } from "../../common";
import { useSgs } from "../ec2/lib";
import { ResourcePage, ActionModal, type Col } from "../ec2/ResourcePage";
import { rds, rdsAll, crumbs, Status, engineLabel, dbHref, clusterHref, fmtWhen, enabled, storageLabel, STORAGE_TYPES, isAurora, useSubnetGroups, useParamGroups, useOptionGroups } from "./lib";
import { ClassPicker, Section } from "./CreateDatabase";
import { TagsTab } from "./DatabaseDetail";

type Snap = { kind: "instance" | "cluster"; id: string; db: string; raw: any };
const opt = (v: string, l?: string) => ({ value: v, label: l || v });
const snapHref = (s: Snap) => `#/rds/snapshots/${s.kind}/${encodeURIComponent(s.id)}`;

async function loadSnaps(type: string): Promise<Snap[]> {
  const [a, b] = await Promise.all([
    rdsAll("DescribeDBSnapshots", "DBSnapshots", { SnapshotType: type }).catch(() => []),
    rdsAll("DescribeDBClusterSnapshots", "DBClusterSnapshots", { SnapshotType: type }).catch(() => []),
  ]);
  return [
    ...a.map((s: any) => ({ kind: "instance" as const, id: s.DBSnapshotIdentifier, db: s.DBInstanceIdentifier, raw: s })),
    ...b.map((s: any) => ({ kind: "cluster" as const, id: s.DBClusterSnapshotIdentifier, db: s.DBClusterIdentifier, raw: s })),
  ].filter(s => s.raw.SnapshotType === type || !s.raw.SnapshotType);
}

function SnapList({ type }: { type: string }) {
  const nav = useNavigate();
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; s: Snap; reload: () => void } | null>(null);
  const cols: Col<Snap>[] = [
    { id: "n", header: "Snapshot name", cell: s => <Link href={snapHref(s)}>{s.id}</Link>, sortingField: "id" },
    { id: "e", header: "Engine version", cell: s => s.raw.EngineVersion || "-" },
    { id: "d", header: "DB instance or cluster", cell: s => <Link href={s.kind === "cluster" ? clusterHref(s.db) : dbHref(s.db)}>{s.db}</Link> },
    { id: "t", header: "Snapshot creation time", cell: s => fmtWhen(s.raw.SnapshotCreateTime) },
    { id: "c", header: "DB instance created time", cell: s => fmtWhen(s.raw.InstanceCreateTime || s.raw.ClusterCreateTime) },
    { id: "s", header: "Status", cell: s => <Status s={s.raw.Status} /> },
    { id: "p", header: "Progress", cell: s => s.raw.Status === "available" ? "Completed" : `${s.raw.PercentProgress ?? 0}%` },
    { id: "v", header: "VPC", cell: s => s.raw.VpcId || "-" },
    { id: "ty", header: "Snapshot type", cell: s => s.raw.SnapshotType },
    { id: "sz", header: "Storage", cell: s => `${s.raw.AllocatedStorage ?? "-"} GiB` },
    { id: "k", header: "Snapshot DB type", cell: s => s.kind === "cluster" ? "Cluster" : "Instance" },
    { id: "en", header: "Engine", cell: s => engineLabel(s.raw.Engine), hidden: true },
  ];
  const one = (sel: Snap[]) => sel.length !== 1 || sel[0].raw.Status !== "available";
  return (
    <>
      <ResourcePage<Snap> title={type === "manual" ? "Manual snapshots" : "System snapshots"} load={() => loadSnaps(type)} trackBy={s => `${s.kind}:${s.id}`} columns={cols}
        poll={s => s.raw.Status !== "available" && s.raw.Status !== "failed"}
        primaryActions={[{ id: "restore", text: "Restore snapshot", disabled: one, run: sel => nav(`/rds/snapshots/${sel[0].kind}/${encodeURIComponent(sel[0].id)}/restore`) }]}
        actions={[
          { id: "copy", text: "Copy snapshot", disabled: one, run: (sel, r) => setM({ id: "copy", s: sel[0], reload: r }) },
          { id: "share", text: "Share snapshot", disabled: () => true, disabledReason: "Not implemented in the emulator.", run: () => {} },
          { id: "export", text: "Export to Amazon S3", disabled: one, run: (sel, r) => setM({ id: "export", s: sel[0], reload: r }) },
          { id: "delete", text: "Delete snapshot", disabled: sel => !sel.length || type !== "manual", run: (sel, r) => setM({ id: "delete", s: sel[0], reload: r }) },
        ]}
        create={type === "manual" ? { text: "Take snapshot", href: "#/rds/snapshots/take" } : undefined}
      />
      {m?.id === "copy" && <CopyModal s={m.s} close={() => setM(null)} done={() => { setM(null); m.reload(); }} />}
      {m?.id === "export" && <ExportModal s={m.s} close={() => setM(null)} done={() => { setM(null); flash.notify({ type: "success", content: "Export task started." }); }} />}
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header={`Delete snapshot ${m.s.id}?`} ok="Delete" onOk={async () => {
        if (m.s.kind === "cluster") await rds("DeleteDBClusterSnapshot", { DBClusterSnapshotIdentifier: m.s.id });
        else await rds("DeleteDBSnapshot", { DBSnapshotIdentifier: m.s.id });
        flash.notify({ type: "success", content: `Deleted snapshot ${m.s.id}.` }); m.reload();
      }}><Box>This permanently deletes the manual snapshot <b>{m.s.id}</b>.</Box></ActionModal>}
    </>
  );
}

export function Snapshots() {
  useCrumbs(crumbs({ text: "Snapshots" }));
  return (
    <ContentLayout header={<Header variant="h1">Snapshots</Header>}>
      <Tabs tabs={[
        { id: "manual", label: "Manual", content: <SnapList type="manual" /> },
        { id: "system", label: "System", content: <SnapList type="automated" /> },
        { id: "shared", label: "Shared with me", content: <Container><EmulatorNote>Snapshot sharing between accounts isn't implemented in the emulator (ModifyDBSnapshotAttribute returns NotImplemented).</EmulatorNote></Container> },
        { id: "public", label: "Public", content: <Container><Box color="text-body-secondary">No public snapshots.</Box></Container> },
        { id: "backup", label: "Backup service", content: <Container><Box color="text-body-secondary">No snapshots created by AWS Backup.</Box></Container> },
      ]} />
    </ContentLayout>
  );
}

function CopyModal({ s, close, done }: { s: Snap; close: () => void; done: () => void }) {
  const flash = useFlash();
  const [name, setName] = useState(`${s.id}-copy`);
  const [tags, setTags] = useState(true);
  return (
    <ActionModal visible onDismiss={close} header="Copy snapshot" ok="Copy snapshot" disabled={!name} onOk={async () => {
      if (s.kind === "cluster") await rds("CopyDBClusterSnapshot", { SourceDBClusterSnapshotIdentifier: s.id, TargetDBClusterSnapshotIdentifier: name, CopyTags: tags });
      else await rds("CopyDBSnapshot", { SourceDBSnapshotIdentifier: s.id, TargetDBSnapshotIdentifier: name, CopyTags: tags });
      flash.notify({ type: "success", content: `Copying ${s.id} to ${name}.` }); done();
    }}>
      <FormField label="Source DB snapshot"><Box>{s.id}</Box></FormField>
      <FormField label="Destination Region"><Select selectedOption={opt("us-east-1", "US East (N. Virginia)")} options={[opt("us-east-1", "US East (N. Virginia)")]} disabled /></FormField>
      <FormField label="New DB snapshot identifier"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
      <Checkbox checked={tags} onChange={e => setTags(e.detail.checked)}>Copy tags</Checkbox>
    </ActionModal>
  );
}

function ExportModal({ s, close, done }: { s: Snap; close: () => void; done: () => void }) {
  const buckets = useAsync(async () => ((await api.call("s3", "ListBuckets")).Buckets || []).map((b: any) => opt(b.Name)), []);
  const roles = useAsync(async () => ((await api.call("iam", "ListRoles")).Roles || []).map((r: any) => opt(r.Arn, r.RoleName)), []);
  const keys = useAsync(async () => {
    const [k, a] = await Promise.all([api.call("kms", "ListKeys"), api.call("kms", "ListAliases").catch(() => ({ Aliases: [] }))]);
    return (k.Keys || []).map((x: any) => { const al = (a.Aliases || []).find((y: any) => y.TargetKeyId === x.KeyId); return opt(x.KeyArn, al ? `${al.AliasName} (${x.KeyId})` : x.KeyId); });
  }, []);
  const [f, setF] = useState<any>({ name: `${s.id}-export`.slice(0, 60), scope: "all", tables: "", bucket: null, prefix: "", newRole: true, roleName: `rds-s3-export-role-${Date.now().toString(36)}`, role: null, key: null });
  const createKey = async () => { await api.call("kms", "CreateKey", { Description: "RDS snapshot export key" }); keys.reload(); };
  return (
    <ActionModal visible onDismiss={close} header="Export to Amazon S3" ok="Export to Amazon S3" size="medium" disabled={!f.name || !f.bucket || (f.newRole ? !f.roleName : !f.role) || !f.key} onOk={async () => {
      let roleArn = f.role?.value;
      if (f.newRole) {
        const r = await api.call("iam", "CreateRole", { RoleName: f.roleName, AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "export.rds.amazonaws.com" }, Action: "sts:AssumeRole" }] }) });
        await api.call("iam", "PutRolePolicy", { RoleName: f.roleName, PolicyName: "ExportPolicy", PolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["s3:PutObject*", "s3:ListBucket", "s3:GetObject*", "s3:DeleteObject*", "s3:GetBucketLocation"], Resource: [`arn:aws:s3:::${f.bucket.value}`, `arn:aws:s3:::${f.bucket.value}/*`] },
        ] }) });
        roleArn = r.Role.Arn;
      }
      await rds("StartExportTask", { ExportTaskIdentifier: f.name, SourceArn: s.raw.DBSnapshotArn || s.raw.DBClusterSnapshotArn, S3BucketName: f.bucket.value,
        ...(f.prefix ? { S3Prefix: f.prefix } : {}), IamRoleArn: roleArn, KmsKeyId: f.key.value,
        ...(f.scope === "partial" && f.tables ? { ExportOnly: f.tables.split(/[\s,]+/).filter(Boolean) } : {}) });
      done();
    }}>
      <Alert type="info">The emulator runs the export and writes the export metadata files (export_info and export_tables_info) under the export identifier in the bucket.</Alert>
      <FormField label="Export identifier"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
      <FormField label="Exported data"><RadioGroup value={f.scope} onChange={e => setF({ ...f, scope: e.detail.value })} items={[{ value: "all", label: "All" }, { value: "partial", label: "Partial" }]} /></FormField>
      {f.scope === "partial" && <FormField label="Identifiers" description="Databases, schemas or tables, separated by spaces (e.g. mydb.mytable)."><Input value={f.tables} onChange={e => setF({ ...f, tables: e.detail.value })} /></FormField>}
      <FormField label="S3 bucket"><Select selectedOption={f.bucket} options={buckets.data || []} onChange={e => setF({ ...f, bucket: e.detail.selectedOption })} placeholder="Choose a bucket" statusType={buckets.loading ? "loading" : "finished"} empty="No buckets" /></FormField>
      <FormField label="S3 prefix - optional"><Input value={f.prefix} onChange={e => setF({ ...f, prefix: e.detail.value })} /></FormField>
      <FormField label="IAM role" description="The role must trust export.rds.amazonaws.com and be allowed to write to the bucket.">
        <RadioGroup value={f.newRole ? "new" : "existing"} onChange={e => setF({ ...f, newRole: e.detail.value === "new" })} items={[{ value: "new", label: "Create a new IAM role" }, { value: "existing", label: "Choose an existing role" }]} />
      </FormField>
      {f.newRole
        ? <FormField label="IAM role name"><Input value={f.roleName} onChange={e => setF({ ...f, roleName: e.detail.value })} /></FormField>
        : <FormField label="Existing role"><Select selectedOption={f.role} options={roles.data || []} onChange={e => setF({ ...f, role: e.detail.selectedOption })} placeholder="Choose a role" filteringType="auto" empty="No roles" /></FormField>}
      <FormField label="AWS KMS key" description="Customer managed key used to encrypt the exported data." secondaryControl={<Button onClick={createKey}>Create key</Button>}>
        <Select selectedOption={f.key} options={keys.data || []} onChange={e => setF({ ...f, key: e.detail.selectedOption })} placeholder="Choose a key" empty="No KMS keys yet. Use Create key." statusType={keys.loading ? "loading" : "finished"} />
      </FormField>
    </ActionModal>
  );
}

export function TakeSnapshot() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Snapshots", href: "#/rds/snapshots" }, { text: "Take snapshot" }));
  const [kind, setKind] = useState(sp.get("kind") === "cluster" ? "cluster" : "instance");
  const dbs = useAsync(async () => kind === "cluster"
    ? (await rdsAll("DescribeDBClusters", "DBClusters")).map((c: any) => opt(c.DBClusterIdentifier))
    : (await rdsAll("DescribeDBInstances", "DBInstances")).filter((i: any) => !i.DBClusterIdentifier).map((i: any) => opt(i.DBInstanceIdentifier)), [kind]);
  const [db, setDb] = useState<any>(sp.get("db") ? opt(sp.get("db")!) : null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (kind === "cluster") await rds("CreateDBClusterSnapshot", { DBClusterIdentifier: db.value, DBClusterSnapshotIdentifier: name });
      else await rds("CreateDBSnapshot", { DBInstanceIdentifier: db.value, DBSnapshotIdentifier: name });
      flash.notify({ type: "success", content: `Creating snapshot ${name}.` });
      nav("/rds/snapshots");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="This feature is currently supported for InnoDB storage engine for MySQL and MariaDB.">Take DB snapshot</Header>}>
      <SpaceBetween size="l">
        <Section title="Settings">
          <FormField label="Snapshot type"><Tiles value={kind} onChange={e => { setKind(e.detail.value); setDb(null); }} items={[{ value: "instance", label: "DB instance" }, { value: "cluster", label: "DB cluster" }]} /></FormField>
          <FormField label={kind === "cluster" ? "DB cluster" : "DB instance"}><Select selectedOption={db} options={dbs.data || []} onChange={e => setDb(e.detail.selectedOption)} placeholder="Select database" statusType={dbs.loading ? "loading" : "finished"} /></FormField>
          <FormField label="Snapshot name" constraintText="1 to 255 letters, digits or hyphens. First character must be a letter."><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
        </Section>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!db || !name} onClick={submit}>Take snapshot</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

function useSnap() {
  const { kind = "instance", id = "" } = useParams();
  const d = useAsync(async () => kind === "cluster"
    ? (await rds("DescribeDBClusterSnapshots", { DBClusterSnapshotIdentifier: id })).DBClusterSnapshots?.[0]
    : (await rds("DescribeDBSnapshots", { DBSnapshotIdentifier: id })).DBSnapshots?.[0], [kind, id]);
  return { kind, id, d };
}

export function SnapshotDetail() {
  const { kind, id, d } = useSnap();
  const nav = useNavigate();
  useCrumbs(crumbs({ text: "Snapshots", href: "#/rds/snapshots" }, { text: id }));
  useEffect(() => { if (d.data && d.data.Status !== "available") { const t = setTimeout(() => d.reload(), 3000); return () => clearTimeout(t); } }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.error) return <ErrorAlert error={d.error} />;
  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const s = d.data;
  if (!s) return <Alert type="error" header="Snapshot not found">{id} doesn't exist.</Alert>;
  const V = ValueWithLabel;
  const sarn = s.DBSnapshotArn || s.DBClusterSnapshotArn;
  const db = s.DBInstanceIdentifier || s.DBClusterIdentifier;
  return (
    <ContentLayout header={<Header variant="h1" actions={<Button variant="primary" disabled={s.Status !== "available"} onClick={() => nav(`/rds/snapshots/${kind}/${encodeURIComponent(id)}/restore`)}>Restore snapshot</Button>}>{id}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Details</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <V label="ARN"><Copyable text={sarn} /></V>
            <V label="Status"><Status s={s.Status} /></V>
            <V label={kind === "cluster" ? "DB cluster" : "DB instance"}><Link href={kind === "cluster" ? clusterHref(db) : dbHref(db)}>{db}</Link></V>
            <V label="Engine">{engineLabel(s.Engine)}</V><V label="Engine version">{s.EngineVersion}</V><V label="License model">{s.LicenseModel || "-"}</V>
            <V label="Snapshot type">{s.SnapshotType}</V><V label="Snapshot creation time">{fmtWhen(s.SnapshotCreateTime)}</V><V label="Progress">{s.PercentProgress ?? 100}%</V>
            <V label="Allocated storage">{s.AllocatedStorage} GiB</V><V label="Storage type">{storageLabel(s.StorageType)}</V><V label="Encrypted">{enabled(s.StorageEncrypted)}</V>
            <V label="Master username">{s.MasterUsername}</V><V label="Port">{s.Port || "-"}</V><V label="VPC">{s.VpcId || "-"}</V>
            <V label="Availability Zone">{s.AvailabilityZone || (s.AvailabilityZones || []).join(", ") || "-"}</V><V label="Option group">{s.OptionGroupName || "-"}</V>
            {s.SourceDBSnapshotIdentifier && <V label="Source snapshot">{s.SourceDBSnapshotIdentifier}</V>}
          </ColumnLayout>
        </Container>
        <TagsTab arnStr={sarn} />
      </SpaceBetween>
    </ContentLayout>
  );
}

export function RestoreSnapshot() {
  const { kind, id, d } = useSnap();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Snapshots", href: "#/rds/snapshots" }, { text: id, href: `#/rds/snapshots/${kind}/${encodeURIComponent(id)}` }, { text: "Restore" }));
  const s = d.data;
  const aurora = kind === "cluster" || isAurora(s?.Engine);
  const subnetGroups = useSubnetGroups();
  const [f, setF] = useState<any>({ name: "", cls: aurora ? "db.r6g.large" : "db.t3.micro", stype: "", subnetGroup: null, pub: false, sgs: [], az: "", multiAz: false, pg: null, og: null, del: false, port: "" });
  const sgs = useSgs(f.subnetGroup?.raw?.VpcId);
  useEffect(() => { if (!f.subnetGroup && subnetGroups.data?.length) setF((x: any) => ({ ...x, subnetGroup: subnetGroups.data!.find((g: any) => g.value === "default") || subnetGroups.data![0] })); }, [subnetGroups.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const famQ = useAsync(async () => s ? ((await rds("DescribeDBEngineVersions", { Engine: s.Engine, EngineVersion: s.EngineVersion })).DBEngineVersions?.[0]?.DBParameterGroupFamily) : undefined, [s]);
  const pgs = useParamGroups(famQ.data);
  const ogs = useOptionGroups(aurora ? undefined : s?.Engine);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (d.error) return <ErrorAlert error={d.error} />;
  if (!s) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const sgIds = f.sgs.map((x: any) => x.value);
      if (kind === "cluster") {
        await rds("RestoreDBClusterFromSnapshot", { DBClusterIdentifier: f.name, SnapshotIdentifier: id, Engine: s.Engine, ...(f.subnetGroup ? { DBSubnetGroupName: f.subnetGroup.value } : {}),
          ...(sgIds.length ? { VpcSecurityGroupIds: sgIds } : {}), DeletionProtection: f.del, ...(f.port ? { Port: Number(f.port) } : {}) });
        await rds("CreateDBInstance", { DBInstanceIdentifier: `${f.name}-instance-1`, DBClusterIdentifier: f.name, Engine: s.Engine, DBInstanceClass: f.cls, PubliclyAccessible: f.pub });
      } else {
        await rds("RestoreDBInstanceFromDBSnapshot", {
          DBInstanceIdentifier: f.name, DBSnapshotIdentifier: id, DBInstanceClass: f.cls, ...(f.stype ? { StorageType: f.stype } : {}),
          ...(f.subnetGroup ? { DBSubnetGroupName: f.subnetGroup.value } : {}), PubliclyAccessible: f.pub, ...(sgIds.length ? { VpcSecurityGroupIds: sgIds } : {}),
          MultiAZ: f.multiAz, ...(f.az && !f.multiAz ? { AvailabilityZone: f.az } : {}), ...(f.pg ? { DBParameterGroupName: f.pg.value } : {}),
          ...(f.og ? { OptionGroupName: f.og.value } : {}), DeletionProtection: f.del, ...(f.port ? { Port: Number(f.port) } : {}),
        });
      }
      flash.notify({ type: "success", content: `Restoring ${f.name} from snapshot ${id}.` });
      nav("/rds/databases");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const azs = (f.subnetGroup?.raw?.Subnets || []).map((x: any) => x.SubnetAvailabilityZone.Name);
  return (
    <ContentLayout header={<Header variant="h1">Restore snapshot</Header>}>
      <SpaceBetween size="l">
        <Alert type="info">You are creating a new DB {kind === "cluster" ? "cluster" : "instance"} from a source DB snapshot. This new DB {kind === "cluster" ? "cluster" : "instance"} will have the default DB security group and DB parameter groups unless you choose otherwise.</Alert>
        <Section title="Engine options"><FormField label="Engine type"><Box>{engineLabel(s.Engine)}</Box></FormField><FormField label="Engine version"><Box>{s.EngineVersion}</Box></FormField></Section>
        <Section title="Settings">
          <FormField label="DB snapshot ID"><Box>{id}</Box></FormField>
          <FormField label={kind === "cluster" ? "DB cluster identifier" : "DB instance identifier"} constraintText="1 to 60 alphanumeric characters or hyphens. First character must be a letter."><Input value={f.name} onChange={e => set("name")(e.detail.value.toLowerCase())} /></FormField>
        </Section>
        {!aurora && <Section title="Availability and durability">
          <RadioGroup value={f.multiAz ? "multi" : "single"} onChange={e => set("multiAz")(e.detail.value === "multi")} items={[{ value: "multi", label: "Multi-AZ DB instance" }, { value: "single", label: "Single-AZ DB instance" }]} />
        </Section>}
        <Section title="Connectivity">
          <FormField label="DB subnet group"><Select selectedOption={f.subnetGroup} options={subnetGroups.data || []} onChange={e => set("subnetGroup")(e.detail.selectedOption)} /></FormField>
          <FormField label="Public access"><RadioGroup value={f.pub ? "yes" : "no"} onChange={e => set("pub")(e.detail.value === "yes")} items={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></FormField>
          <FormField label="Existing VPC security groups"><Multiselect selectedOptions={f.sgs} options={sgs.data || []} onChange={e => set("sgs")(e.detail.selectedOptions)} placeholder="Default security group" /></FormField>
          {!aurora && !f.multiAz && <FormField label="Availability Zone"><Select selectedOption={opt(f.az, f.az || "No preference")} options={[opt("", "No preference"), ...azs.map((a: string) => opt(a))]} onChange={e => set("az")(e.detail.selectedOption.value)} /></FormField>}
          <FormField label="Database port"><Input type="number" value={f.port} onChange={e => set("port")(e.detail.value)} placeholder={String(s.Port || "")} /></FormField>
        </Section>
        <Section title="Instance configuration"><ClassPicker aurora={aurora} value={f.cls} onChange={set("cls")} /></Section>
        {!aurora && <Section title="Storage">
          <FormField label="Storage type"><Select selectedOption={STORAGE_TYPES.find(x => x.value === (f.stype || s.StorageType)) || null} options={STORAGE_TYPES} onChange={e => set("stype")(e.detail.selectedOption.value)} /></FormField>
          <FormField label="Allocated storage"><Box>{s.AllocatedStorage} GiB (from the snapshot)</Box></FormField>
        </Section>}
        <Section title="Additional configuration">
          {!aurora && <FormField label="DB parameter group"><Select selectedOption={f.pg} options={pgs.data || []} onChange={e => set("pg")(e.detail.selectedOption)} placeholder={famQ.data ? `default.${famQ.data}` : "default"} /></FormField>}
          {!aurora && <FormField label="Option group"><Select selectedOption={f.og} options={ogs.data || []} onChange={e => set("og")(e.detail.selectedOption)} placeholder={s.OptionGroupName || "default"} /></FormField>}
          <Checkbox checked={f.del} onChange={e => set("del")(e.detail.checked)}>Enable deletion protection</Checkbox>
        </Section>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name} onClick={submit}>Restore DB {kind === "cluster" ? "cluster" : "instance"}</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function Exports() {
  useCrumbs(crumbs({ text: "Exports in Amazon S3" }));
  const flash = useFlash();
  return (
    <ResourcePage<any> title="Exports in Amazon S3" description="Snapshot and cluster exports to Amazon S3 in Apache Parquet format."
      load={() => rdsAll("DescribeExportTasks", "ExportTasks")} trackBy="ExportTaskIdentifier" multi={false}
      poll={t => /STARTING|IN_PROGRESS/.test(t.Status)}
      actions={[{ id: "cancel", text: "Cancel export", disabled: s => !s.length || !/STARTING|IN_PROGRESS/.test(s[0].Status), run: async (s, r) => { await rds("CancelExportTask", { ExportTaskIdentifier: s[0].ExportTaskIdentifier }); flash.notify({ type: "success", content: "Export canceled." }); r(); } }]}
      create={{ text: "Export to Amazon S3", href: "#/rds/snapshots" }}
      columns={[
        { id: "n", header: "Export identifier", cell: t => t.ExportTaskIdentifier },
        { id: "s", header: "Status", cell: t => <Status s={t.Status} /> },
        { id: "src", header: "Source", cell: t => String(t.SourceArn).split(":").pop() },
        { id: "b", header: "S3 bucket", cell: t => `${t.S3Bucket}${t.S3Prefix ? `/${t.S3Prefix}` : ""}` },
        { id: "p", header: "Progress", cell: t => `${t.PercentProgress ?? 0}%` },
        { id: "st", header: "Start time", cell: t => fmtWhen(t.TaskStartTime) },
        { id: "et", header: "End time", cell: t => fmtWhen(t.TaskEndTime) },
        { id: "f", header: "Failure cause", cell: t => t.FailureCause || "-" },
      ]} />
  );
}
