import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash, EmulatorNote } from "../../common";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { glue, glueAll, crumbs, fmt, St, roleName } from "./lib";

const opt = (v: string, l?: string) => ({ value: v, label: l || v });

// ---------------- security configurations ----------------
export function SecurityConfigs() {
  useCrumbs(crumbs({ text: "Security configurations" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ rows: any[]; r: () => void } | null>(null);
  const s3 = (c: any) => c.EncryptionConfiguration?.S3Encryption?.[0]?.S3EncryptionMode || "DISABLED";
  return (
    <>
      <ResourcePage<any> title="Security configurations" description="Encryption settings for data written by crawlers, jobs and development endpoints."
        load={() => glueAll("GetSecurityConfigurations", "SecurityConfigurations")} trackBy="Name"
        primaryActions={[{ id: "delete", text: "Delete", run: (s, r) => setDel({ rows: s, r }) }]}
        create={{ text: "Add security configuration", href: "#/glue/security-configurations/create" }}
        columns={[
          { id: "n", header: "Security configuration", cell: c => c.Name, sortingField: "Name" },
          { id: "s3", header: "S3 encryption", cell: c => s3(c) },
          { id: "cw", header: "CloudWatch logs encryption", cell: c => c.EncryptionConfiguration?.CloudWatchEncryption?.CloudWatchEncryptionMode || "DISABLED" },
          { id: "jb", header: "Job bookmark encryption", cell: c => c.EncryptionConfiguration?.JobBookmarksEncryption?.JobBookmarksEncryptionMode || "DISABLED" },
          { id: "c", header: "Created", cell: c => fmt(c.CreatedTimeStamp) },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete security configurations" ok="Delete" onOk={async () => {
        for (const c of del.rows) await glue("DeleteSecurityConfiguration", { Name: c.Name });
        flash.notify({ type: "success", content: "Security configuration deleted." }); del.r();
      }}><Box>Delete {del.rows.map(c => c.Name).join(", ")}?</Box></ActionModal>}
    </>
  );
}

export function CreateSecurityConfig() {
  useCrumbs(crumbs({ text: "Security configurations", href: "#/glue/security-configurations" }, { text: "Add security configuration" }));
  const nav = useNavigate();
  const flash = useFlash();
  const keys = useAsync(async () => ((await api.call("kms", "ListKeys")).Keys || []).map((k: any) => opt(k.KeyArn, k.KeyId)), []);
  const [f, setF] = useState<any>({ name: "", s3: true, s3Mode: "SSE-S3", s3Key: null, cw: false, cwKey: null, jb: false, jbKey: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await glue("CreateSecurityConfiguration", { Name: f.name, EncryptionConfiguration: {
        S3Encryption: [f.s3 ? { S3EncryptionMode: f.s3Mode, ...(f.s3Mode === "SSE-KMS" && f.s3Key ? { KmsKeyArn: f.s3Key.value } : {}) } : { S3EncryptionMode: "DISABLED" }],
        CloudWatchEncryption: f.cw ? { CloudWatchEncryptionMode: "SSE-KMS", ...(f.cwKey ? { KmsKeyArn: f.cwKey.value } : {}) } : { CloudWatchEncryptionMode: "DISABLED" },
        JobBookmarksEncryption: f.jb ? { JobBookmarksEncryptionMode: "CSE-KMS", ...(f.jbKey ? { KmsKeyArn: f.jbKey.value } : {}) } : { JobBookmarksEncryptionMode: "DISABLED" },
      } });
      flash.notify({ type: "success", content: `Created security configuration ${f.name}.` }); nav("/glue/security-configurations");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const keySel = (k: string) => <Select selectedOption={f[k]} options={keys.data || []} onChange={e => set(k)(e.detail.selectedOption)} placeholder="Choose an AWS KMS key" empty="No KMS keys" />;
  return (
    <ContentLayout header={<Header variant="h1">Add security configuration</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Security configuration properties</Header>}>
          <FormField label="Name"><Input value={f.name} onChange={e => set("name")(e.detail.value)} /></FormField>
        </Container>
        <Container header={<Header variant="h2">Encryption settings</Header>}>
          <SpaceBetween size="l">
            <Checkbox checked={f.s3} onChange={e => set("s3")(e.detail.checked)} description="Encrypt data written to Amazon S3.">Enable S3 encryption</Checkbox>
            {f.s3 && <SpaceBetween size="s">
              <FormField label="Encryption mode"><Select selectedOption={opt(f.s3Mode)} options={[opt("SSE-S3"), opt("SSE-KMS")]} onChange={e => set("s3Mode")(e.detail.selectedOption.value)} /></FormField>
              {f.s3Mode === "SSE-KMS" && <FormField label="AWS KMS key">{keySel("s3Key")}</FormField>}
            </SpaceBetween>}
            <Checkbox checked={f.cw} onChange={e => set("cw")(e.detail.checked)}>Enable CloudWatch logs encryption</Checkbox>
            {f.cw && <FormField label="AWS KMS key">{keySel("cwKey")}</FormField>}
            <Checkbox checked={f.jb} onChange={e => set("jb")(e.detail.checked)}>Enable job bookmark encryption</Checkbox>
            {f.jb && <FormField label="AWS KMS key">{keySel("jbKey")}</FormField>}
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name} onClick={submit}>Create</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

// ---------------- interactive sessions, blueprints, classification tools ----------------
export function Sessions() {
  useCrumbs(crumbs({ text: "Interactive Sessions" }));
  const flash = useFlash();
  return <ResourcePage<any> title="Interactive sessions" load={async () => (await glue("ListSessions")).Sessions || []} trackBy="Id"
    banner={<EmulatorNote>The emulator records sessions and statements but runs no Spark runtime, so statements end with RuntimeUnavailable. Use a script editor job to run code.</EmulatorNote>}
    primaryActions={[{ id: "delete", text: "Delete", run: async (s, r) => { for (const x of s) await glue("DeleteSession", { Id: x.Id }); flash.notify({ type: "success", content: "Session deleted." }); r(); } }]}
    columns={[
      { id: "id", header: "Session ID", cell: s => s.Id }, { id: "s", header: "Status", cell: s => <St s={s.Status} /> },
      { id: "r", header: "IAM role", cell: s => roleName(s.Role) }, { id: "g", header: "Glue version", cell: s => s.GlueVersion || "-" },
      { id: "c", header: "Created", cell: s => fmt(s.CreatedOn) },
    ]} />;
}

export function Blueprints() {
  useCrumbs(crumbs({ text: "Blueprints" }));
  return <ResourcePage<any> title="Blueprints" load={async () => { const n = await glueAll("ListBlueprints", "Blueprints"); return n.length ? (await glue("BatchGetBlueprints", { Names: n })).Blueprints || [] : []; }} trackBy="Name"
    banner={<EmulatorNote>Blueprints are packaged as a ZIP archive in Amazon S3. You can list them here; authoring one is outside this console.</EmulatorNote>}
    columns={[{ id: "n", header: "Name", cell: b => b.Name }, { id: "s", header: "Status", cell: b => <St s={b.Status} /> }, { id: "l", header: "Location", cell: b => b.BlueprintLocation || "-" }, { id: "c", header: "Created", cell: b => fmt(b.CreatedOn) }]} />;
}

export function SensitiveData() {
  useCrumbs(crumbs({ text: "Sensitive data detection" }));
  const flash = useFlash();
  const [m, setM] = useState<{ id: string; rows: any[]; r: () => void } | null>(null);
  const [f, setF] = useState({ name: "", regex: "", ctx: "" });
  const [test, setTest] = useState("");
  let matches: string[] = [];
  try { matches = f.regex && test ? [...test.matchAll(new RegExp(f.regex, "g"))].map(x => x[0]) : []; } catch { matches = []; }
  return (
    <>
      <ResourcePage<any> title="Custom identifiers" description="Regular expressions that detect sensitive data in your datasets, alongside the managed data types."
        load={async () => (await glue("ListCustomEntityTypes")).CustomEntityTypes || []} trackBy="Name"
        primaryActions={[{ id: "delete", text: "Delete", run: (s, r) => setM({ id: "delete", rows: s, r }) }]}
        create={{ text: "Create custom identifier", onClick: r => setM({ id: "create", rows: [], r }) }}
        columns={[{ id: "n", header: "Name", cell: c => c.Name }, { id: "r", header: "Regular expression", cell: c => <Box variant="code">{c.RegexString}</Box> }, { id: "k", header: "Context words", cell: c => (c.ContextWords || []).join(", ") || "-" }]} />
      {m?.id === "create" && <ActionModal visible size="medium" onDismiss={() => setM(null)} header="Create custom identifier" ok="Create" disabled={!f.name || !f.regex} onOk={async () => {
        await glue("CreateCustomEntityType", { Name: f.name, RegexString: f.regex, ...(f.ctx ? { ContextWords: f.ctx.split(",").map(x => x.trim()).filter(Boolean) } : {}) });
        flash.notify({ type: "success", content: `Created ${f.name}.` }); m.r();
      }}>
        <FormField label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.detail.value })} /></FormField>
        <FormField label="Regular expression"><Input value={f.regex} onChange={e => setF({ ...f, regex: e.detail.value })} placeholder="EMP-\d{6}" /></FormField>
        <FormField label="Context words - optional" description="Comma-separated words that must appear near the match."><Input value={f.ctx} onChange={e => setF({ ...f, ctx: e.detail.value })} /></FormField>
        <FormField label="Validate with sample data" description={f.regex && test ? `${matches.length} match(es): ${matches.slice(0, 5).join(", ")}` : undefined}><Textarea value={test} onChange={e => setTest(e.detail.value)} /></FormField>
      </ActionModal>}
      {m?.id === "delete" && <ActionModal visible danger onDismiss={() => setM(null)} header="Delete custom identifiers" ok="Delete" onOk={async () => {
        for (const x of m.rows) await glue("DeleteCustomEntityType", { Name: x.Name });
        flash.notify({ type: "success", content: "Deleted." }); m.r();
      }}><Box>Delete {m.rows.map(x => x.Name).join(", ")}?</Box></ActionModal>}
    </>
  );
}

export function RecordMatching() {
  useCrumbs(crumbs({ text: "Record Matching" }));
  return <ResourcePage<any> title="Transforms" description="FindMatches machine learning transforms identify matching records."
    load={async () => (await glue("GetMLTransforms")).Transforms || []} trackBy="TransformId"
    banner={<EmulatorNote>Training a FindMatches transform needs labeled data and ML compute; this page lists transforms only.</EmulatorNote>}
    columns={[{ id: "n", header: "Name", cell: t => t.Name }, { id: "s", header: "Status", cell: t => <St s={t.Status} /> }, { id: "t", header: "Type", cell: t => t.Parameters?.TransformType || "-" }, { id: "c", header: "Created", cell: t => fmt(t.CreatedOn) }]} />;
}

const F: Record<string, string> = {
  "visual-etl": "Visual ETL (Glue Studio canvas) isn't available here. Use Script editor jobs: the emulator really runs PySpark and Python shell scripts, including GlueContext and Data Catalog reads.",
  notebooks: "Notebooks need interactive sessions, which the emulator records but doesn't execute. Use Script editor jobs instead.",
  "zero-etl": "Zero-ETL integrations aren't implemented in the emulator (DescribeIntegrations returns NotImplemented).",
  schemas: "ListSchemas isn't implemented in the emulator. Open a registry under Stream schema registries to create schemas and look them up by name.",
};
export function Unsupported() {
  const { feature = "" } = useParams();
  useCrumbs(crumbs({ text: feature.replace(/-/g, " ") }));
  return <ContentLayout header={<Header variant="h1">{feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase())}</Header>}><Container><EmulatorNote>{F[feature] || "Not available in the emulator."}</EmulatorNote></Container></ContentLayout>;
}
