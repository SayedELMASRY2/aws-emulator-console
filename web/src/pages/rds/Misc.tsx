import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash, EmulatorNote } from "../../common";
import { ResourcePage, ActionModal } from "../ec2/ResourcePage";
import { rds, rdsAll, crumbs, Status, dbHref, clusterHref, fmtWhen } from "./lib";

const opt = (v: string, l?: string) => ({ value: v, label: l || v });
const SOURCE_TYPES = [opt("db-instance", "Instances"), opt("db-cluster", "Clusters"), opt("db-snapshot", "Snapshots"), opt("db-cluster-snapshot", "Cluster snapshots"), opt("db-parameter-group", "Parameter groups"), opt("db-security-group", "Security groups"), opt("db-proxy", "Proxies"), opt("blue-green-deployment", "Blue/Green deployments")];
const srcHref = (t: string, id: string) => t === "db-instance" ? dbHref(id) : t === "db-cluster" ? clusterHref(id) : t === "db-snapshot" ? `#/rds/snapshots/instance/${encodeURIComponent(id)}` : t === "db-cluster-snapshot" ? `#/rds/snapshots/cluster/${encodeURIComponent(id)}` : t === "db-parameter-group" ? `#/rds/parameter-groups/db/${encodeURIComponent(id)}` : undefined;

export function Events() {
  useCrumbs(crumbs({ text: "Events" }));
  return <ResourcePage<any> title="Events" description="Events from the last 14 days." load={async () => ((await rds("DescribeEvents", { Duration: 20160, MaxRecords: 100 })).Events || []).reverse()}
    trackBy={e => `${e.Date}${e.SourceIdentifier}${e.Message}`} multi={false}
    columns={[
      { id: "s", header: "Source", cell: e => srcHref(e.SourceType, e.SourceIdentifier) ? <Link href={srcHref(e.SourceType, e.SourceIdentifier)}>{e.SourceIdentifier}</Link> : e.SourceIdentifier, sortingField: "SourceIdentifier" },
      { id: "t", header: "Type", cell: e => SOURCE_TYPES.find(x => x.value === e.SourceType)?.label || e.SourceType },
      { id: "d", header: "Time", cell: e => fmtWhen(e.Date), sortingField: "Date" },
      { id: "m", header: "Message", cell: e => e.Message },
      { id: "c", header: "Categories", cell: e => (e.EventCategories || []).join(", ") },
    ]} />;
}

export function EventSubscriptions() {
  useCrumbs(crumbs({ text: "Event subscriptions" }));
  const flash = useFlash();
  const [del, setDel] = useState<{ s: any[]; r: () => void } | null>(null);
  const toggle = async (s: any, r: () => void) => { await rds("ModifyEventSubscription", { SubscriptionName: s.CustSubscriptionId, Enabled: !s.Enabled }); flash.notify({ type: "success", content: `${s.Enabled ? "Disabled" : "Enabled"} ${s.CustSubscriptionId}.` }); r(); };
  return (
    <>
      <ResourcePage<any> title="Event subscriptions" load={() => rdsAll("DescribeEventSubscriptions", "EventSubscriptionsList")} trackBy="CustSubscriptionId"
        actions={[
          { id: "toggle", text: "Enable / disable", disabled: s => s.length !== 1, run: (s, r) => toggle(s[0], r) },
          { id: "delete", text: "Delete", run: (s, r) => setDel({ s, r }) },
        ]}
        create={{ text: "Create event subscription", href: "#/rds/event-subscriptions/create" }}
        columns={[
          { id: "n", header: "Name", cell: s => s.CustSubscriptionId, sortingField: "CustSubscriptionId" },
          { id: "st", header: "Status", cell: s => <Status s={s.Status} /> },
          { id: "e", header: "Enabled", cell: s => s.Enabled ? <StatusIndicator>Yes</StatusIndicator> : <StatusIndicator type="stopped">No</StatusIndicator> },
          { id: "t", header: "Source type", cell: s => SOURCE_TYPES.find(x => x.value === s.SourceType)?.label || s.SourceType || "All" },
          { id: "src", header: "Sources", cell: s => (s.SourceIdsList || []).join(", ") || "All" },
          { id: "c", header: "Event categories", cell: s => (s.EventCategoriesList || []).join(", ") || "All" },
          { id: "sns", header: "SNS topic", cell: s => String(s.SnsTopicArn).split(":").pop() },
        ]} />
      {del && <ActionModal visible danger onDismiss={() => setDel(null)} header="Delete event subscriptions" ok="Delete" onOk={async () => {
        for (const s of del.s) await rds("DeleteEventSubscription", { SubscriptionName: s.CustSubscriptionId });
        flash.notify({ type: "success", content: "Event subscription deleted." }); del.r();
      }}><Box>Delete {del.s.map(s => s.CustSubscriptionId).join(", ")}?</Box></ActionModal>}
    </>
  );
}

export function CreateEventSubscription() {
  useCrumbs(crumbs({ text: "Event subscriptions", href: "#/rds/event-subscriptions" }, { text: "Create event subscription" }));
  const nav = useNavigate();
  const flash = useFlash();
  const topics = useAsync(async () => ((await api.call("sns", "ListTopics")).Topics || []).map((t: any) => opt(t.TopicArn, t.TopicArn.split(":").pop())), []);
  const cats = useAsync(async () => (await rds("DescribeEventCategories")).EventCategoriesMapList || [], []);
  const [f, setF] = useState<any>({ name: "", enabled: true, target: "existing", topic: null, newTopic: "", emails: "", type: opt("db-instance", "Instances"), allSrc: true, src: [], allCats: true, cats: [] });
  const sources = useAsync(async () => {
    const t = f.type.value;
    if (t === "db-instance") return (await rdsAll("DescribeDBInstances", "DBInstances")).map((x: any) => opt(x.DBInstanceIdentifier));
    if (t === "db-cluster") return (await rdsAll("DescribeDBClusters", "DBClusters")).map((x: any) => opt(x.DBClusterIdentifier));
    if (t === "db-snapshot") return (await rdsAll("DescribeDBSnapshots", "DBSnapshots")).map((x: any) => opt(x.DBSnapshotIdentifier));
    if (t === "db-parameter-group") return (await rdsAll("DescribeDBParameterGroups", "DBParameterGroups")).map((x: any) => opt(x.DBParameterGroupName));
    return [];
  }, [f.type.value]);
  const catOpts = ((cats.data || []).find((c: any) => c.SourceType === f.type.value)?.EventCategories || []).map((c: string) => opt(c));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: string) => (v: any) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      let arn = f.topic?.value;
      if (f.target === "new") {
        arn = (await api.call("sns", "CreateTopic", { Name: f.newTopic })).TopicArn;
        for (const e of f.emails.split(/[\s,]+/).filter(Boolean)) await api.call("sns", "Subscribe", { TopicArn: arn, Protocol: "email", Endpoint: e });
      }
      await rds("CreateEventSubscription", { SubscriptionName: f.name, SnsTopicArn: arn, SourceType: f.type.value, Enabled: f.enabled,
        ...(!f.allSrc && f.src.length ? { SourceIds: f.src.map((s: any) => s.value) } : {}), ...(!f.allCats && f.cats.length ? { EventCategories: f.cats.map((c: any) => c.value) } : {}) });
      flash.notify({ type: "success", content: `Created event subscription ${f.name}.` });
      nav("/rds/event-subscriptions");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Create event subscription</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Details</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name"><Input value={f.name} onChange={e => set("name")(e.detail.value)} /></FormField>
            <Checkbox checked={f.enabled} onChange={e => set("enabled")(e.detail.checked)}>Enabled</Checkbox>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Target</Header>}>
          <SpaceBetween size="l">
            <FormField label="Send notifications to"><Tiles value={f.target} onChange={e => set("target")(e.detail.value)} items={[{ value: "existing", label: "ARN", description: "Choose an existing Amazon SNS topic" }, { value: "new", label: "New email topic", description: "Create a new SNS topic with email subscribers" }]} /></FormField>
            {f.target === "existing"
              ? <FormField label="SNS topic"><Select selectedOption={f.topic} options={topics.data || []} onChange={e => set("topic")(e.detail.selectedOption)} placeholder="Choose a topic" empty="No SNS topics" /></FormField>
              : <SpaceBetween size="l"><FormField label="Topic name"><Input value={f.newTopic} onChange={e => set("newTopic")(e.detail.value)} /></FormField>
                  <FormField label="With these recipients" description="Email addresses, separated by commas."><Input value={f.emails} onChange={e => set("emails")(e.detail.value)} /></FormField></SpaceBetween>}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Source</Header>}>
          <SpaceBetween size="l">
            <FormField label="Source type"><Select selectedOption={f.type} options={SOURCE_TYPES} onChange={e => setF({ ...f, type: e.detail.selectedOption, src: [], cats: [] })} /></FormField>
            <FormField label={`${f.type.label} to include`}>
              <RadioGroup value={f.allSrc ? "all" : "some"} onChange={e => set("allSrc")(e.detail.value === "all")} items={[{ value: "all", label: `All ${f.type.label.toLowerCase()}` }, { value: "some", label: `Select specific ${f.type.label.toLowerCase()}` }]} />
            </FormField>
            {!f.allSrc && <Multiselect selectedOptions={f.src} options={sources.data || []} onChange={e => set("src")(e.detail.selectedOptions)} placeholder="Choose sources" />}
            <FormField label="Event categories to include">
              <RadioGroup value={f.allCats ? "all" : "some"} onChange={e => set("allCats")(e.detail.value === "all")} items={[{ value: "all", label: "All event categories" }, { value: "some", label: "Select specific event categories" }]} />
            </FormField>
            {!f.allCats && <Multiselect selectedOptions={f.cats} options={catOpts} onChange={e => set("cats")(e.detail.selectedOptions)} placeholder="Choose categories" />}
          </SpaceBetween>
        </Container>
        <ErrorAlert error={err} />
        <Box float="right"><SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!f.name || (f.target === "existing" ? !f.topic : !f.newTopic)} onClick={submit}>Create</Button>
        </SpaceBetween></Box>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function Recommendations() {
  useCrumbs(crumbs({ text: "Recommendations" }));
  const flash = useFlash();
  const sev = (s: string) => s === "high" ? <StatusIndicator type="error">High</StatusIndicator> : s === "medium" ? <StatusIndicator type="warning">Medium</StatusIndicator> : <StatusIndicator type="info">{s ? s[0].toUpperCase() + s.slice(1) : "-"}</StatusIndicator>;
  const setStatus = async (rows: any[], status: string, r: () => void) => {
    for (const x of rows) await rds("ModifyDBRecommendation", { RecommendationId: x.RecommendationId, Status: status });
    flash.notify({ type: "success", content: `${rows.length} recommendation(s) ${status === "dismissed" ? "dismissed" : "restored"}.` }); r();
  };
  return <ResourcePage<any> title="Recommendations" description="Recommendations for your databases based on configuration and usage."
    load={async () => (await rds("DescribeDBRecommendations")).DBRecommendations || []} trackBy="RecommendationId"
    actions={[{ id: "dismiss", text: "Dismiss", disabled: () => true, disabledReason: "ModifyDBRecommendation isn't implemented in the emulator.", run: (s, r) => setStatus(s, "dismissed", r) }, { id: "active", text: "Move to active", disabled: () => true, disabledReason: "ModifyDBRecommendation isn't implemented in the emulator.", run: (s, r) => setStatus(s, "active", r) }]}
    columns={[
      { id: "s", header: "Severity", cell: x => sev(x.Severity) },
      { id: "d", header: "Detection", cell: x => x.Detection || x.TypeId },
      { id: "r", header: "Resource", cell: x => { const parts = String(x.ResourceArn).split(":"); const id = parts.pop()!; const k = parts.pop(); return <Link href={k === "cluster" ? clusterHref(id) : k === "db" ? dbHref(id) : "#"}>{id}</Link>; } },
      { id: "rec", header: "Recommendation", cell: x => x.Recommendation || x.Description || "-" },
      { id: "st", header: "Status", cell: x => x.Status },
      { id: "u", header: "Updated", cell: x => fmtWhen(x.UpdatedTime) },
    ]} />;
}

export function Certificates() {
  useCrumbs(crumbs({ text: "Certificate update" }));
  const certs = useAsync(async () => (await rds("DescribeCertificates")).Certificates || [], []);
  return (
    <SpaceBetween size="l">
      <ResourcePage<any> title="Databases" description="DB instances and the certificate authority they use for SSL/TLS."
        load={async () => (await rdsAll("DescribeDBInstances", "DBInstances"))} trackBy="DBInstanceIdentifier" multi={false}
        primaryActions={[]}
        columns={[
          { id: "n", header: "DB identifier", cell: i => <Link href={dbHref(i.DBInstanceIdentifier)}>{i.DBInstanceIdentifier}</Link> },
          { id: "c", header: "Certificate authority", cell: i => i.CACertificateIdentifier },
          { id: "v", header: "Certificate expiration", cell: i => fmtWhen(i.CertificateDetails?.ValidTill) },
          { id: "u", header: "Update", cell: i => <Link href={`${dbHref(i.DBInstanceIdentifier)}/modify`}>Modify</Link> },
        ]} />
      <Container header={<Header variant="h2" counter={`(${certs.data?.length || 0})`}>Certificate authorities</Header>}>
        <SpaceBetween size="xs">
          {(certs.data || []).map((c: any) => <Box key={c.CertificateIdentifier}><b>{c.CertificateIdentifier}</b> · {c.CertificateType} · valid until {fmtWhen(c.ValidTill)}{c.CustomerOverride ? " · default override" : ""}</Box>)}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}

export function ZeroEtl() {
  useCrumbs(crumbs({ text: "Zero-ETL integrations" }));
  return <ResourcePage<any> title="Zero-ETL integrations" description="Replicate data from Aurora and RDS to Amazon Redshift without building ETL pipelines."
    load={async () => (await rds("DescribeIntegrations")).Integrations || []} trackBy="IntegrationName" multi={false}
    banner={<EmulatorNote>The emulator lists integrations but doesn't replicate data to Redshift.</EmulatorNote>}
    columns={[
      { id: "n", header: "Integration name", cell: x => x.IntegrationName }, { id: "s", header: "Status", cell: x => <Status s={x.Status} /> },
      { id: "src", header: "Source", cell: x => String(x.SourceArn).split(":").pop() }, { id: "t", header: "Target", cell: x => x.TargetArn },
      { id: "c", header: "Created", cell: x => fmtWhen(x.CreateTime) },
    ]} />;
}

const F: Record<string, string> = {
  "query-editor": "The RDS query editor uses the Data API. Connect to the database from your machine instead: MySQL and PostgreSQL databases run on 127.0.0.1, and the database page shows the connection command.",
  "performance-insights": "Performance Insights needs database load metrics, which the emulator doesn't collect.",
  "automated-backups": "DescribeDBInstanceAutomatedBackups isn't implemented in the emulator.",
  "reserved-instances": "Reserved instances are a billing purchase. The emulator has no billing (DescribeReservedDBInstances isn't implemented).",
  "custom-engine-versions": "Custom engine versions (RDS Custom) aren't available in the emulator.",
};
export function Unsupported() {
  const { feature = "" } = useParams();
  useCrumbs(crumbs({ text: feature.replace(/-/g, " ") }));
  return <ContentLayout header={<Header variant="h1">{feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase())}</Header>}><Container><EmulatorNote>{F[feature] || "Not available in the emulator."}</EmulatorNote></Container></ContentLayout>;
}
