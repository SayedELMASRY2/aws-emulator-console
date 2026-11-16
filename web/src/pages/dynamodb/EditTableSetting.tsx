import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Textarea from "@cloudscape-design/components/textarea";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { Tags } from "../s3/fields";
import { fromTagSet, toTagSet, type KV } from "../s3/lib";
import { ddb, tableHref, isOnDemand, STREAM_VIEWS } from "./lib";
import { CapacityFields, CAP_DEFAULT, capacityParams, EncryptionFields, sseSpec, type Capacity, type Enc } from "./fields";
import { applyAutoScaling } from "./CreateTable";

type Ctx = { t: any; extra: any };
type Def = { title: string; tab: string; load: (c: Ctx) => any; render: (v: any, set: (v: any) => void, c: Ctx) => ReactNode; save: (t: any, v: any, c: Ctx) => Promise<void>; validate?: (v: any) => string | undefined };

async function waitActive(name: string) {
  for (let i = 0; i < 40; i++) {
    const t = (await ddb("DescribeTable", { TableName: name })).Table;
    if (t.TableStatus === "ACTIVE") return;
    await new Promise(r => setTimeout(r, 500));
  }
}

const DEFS: Record<string, Def> = {
  capacity: {
    title: "Edit read/write capacity", tab: "settings",
    load: ({ t, extra }) => {
      const tgt = (side: string) => (extra.scaling || []).find((s: any) => s.ScalableDimension === `dynamodb:table:${side}CapacityUnits`);
      const pol = (side: string) => (extra.policies || []).find((p: any) => p.ScalableDimension === `dynamodb:table:${side}CapacityUnits`);
      const side = (s: "Read" | "Write") => {
        const g = tgt(s), p = pol(s);
        return g ? { auto: true, units: String(t.ProvisionedThroughput?.[`${s}CapacityUnits`] || 5), min: String(g.MinCapacity), max: String(g.MaxCapacity), target: String(p?.TargetTrackingScalingPolicyConfiguration?.TargetValue ?? 70) }
          : { auto: false, units: String(t.ProvisionedThroughput?.[`${s}CapacityUnits`] || 5), min: "1", max: "10", target: "70" };
      };
      return { ...CAP_DEFAULT, mode: isOnDemand(t) ? "PAY_PER_REQUEST" : "PROVISIONED", read: side("Read"), write: side("Write"),
        maxRead: t.OnDemandThroughput?.MaxReadRequestUnits > 0 ? String(t.OnDemandThroughput.MaxReadRequestUnits) : "", maxWrite: t.OnDemandThroughput?.MaxWriteRequestUnits > 0 ? String(t.OnDemandThroughput.MaxWriteRequestUnits) : "" } as Capacity;
    },
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Switching between capacity modes is allowed a limited number of times per day in AWS.">Read/write capacity settings</Header>}>
        <CapacityFields value={v} onChange={set} />
      </Container>
    ),
    save: async (t, v: Capacity) => {
      const p: any = { TableName: t.TableName, ...capacityParams(v) };
      if (v.mode === "PROVISIONED" && (t.GlobalSecondaryIndexes || []).length && isOnDemand(t))
        p.GlobalSecondaryIndexUpdates = t.GlobalSecondaryIndexes.map((g: any) => ({ Update: { IndexName: g.IndexName, ProvisionedThroughput: p.ProvisionedThroughput } }));
      const same = !isOnDemand(t) && v.mode === "PROVISIONED" && t.ProvisionedThroughput.ReadCapacityUnits === p.ProvisionedThroughput.ReadCapacityUnits && t.ProvisionedThroughput.WriteCapacityUnits === p.ProvisionedThroughput.WriteCapacityUnits;
      if (!same) { await ddb("UpdateTable", p); await waitActive(t.TableName); }
      // Remove old auto scaling, then apply the new one.
      for (const side of ["Read", "Write"]) {
        await api.call("application-autoscaling", "DeregisterScalableTarget", { ServiceNamespace: "dynamodb", ResourceId: `table/${t.TableName}`, ScalableDimension: `dynamodb:table:${side}CapacityUnits` }).catch(() => {});
      }
      await applyAutoScaling(t.TableName, v);
    },
  },
  warm: {
    title: "Edit warm throughput", tab: "settings",
    load: ({ t }) => ({ read: String(t.WarmThroughput?.ReadUnitsPerSecond || 12000), write: String(t.WarmThroughput?.WriteUnitsPerSecond || 4000) }),
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Warm throughput is the number of read and write operations your table can instantly support. You can increase it, but not decrease it.">Warm throughput</Header>}>
        <ColumnLayout columns={2}>
          <FormField label="Read units per second"><Input type="number" value={v.read} onChange={e => set({ ...v, read: e.detail.value })} /></FormField>
          <FormField label="Write units per second"><Input type="number" value={v.write} onChange={e => set({ ...v, write: e.detail.value })} /></FormField>
        </ColumnLayout>
      </Container>
    ),
    save: async (t, v) => { await ddb("UpdateTable", { TableName: t.TableName, WarmThroughput: { ReadUnitsPerSecond: Number(v.read), WriteUnitsPerSecond: Number(v.write) } }); },
  },
  ttl: {
    title: "Turn on Time to Live (TTL)", tab: "settings",
    load: ({ extra }) => ({ on: extra.ttl?.TimeToLiveStatus === "ENABLED", attr: extra.ttl?.AttributeName || "expireAt", orig: extra.ttl }),
    render: (v, set) => (
      <Container header={<Header variant="h2" description="TTL deletes items after the date and time in the TTL attribute, a Number in Unix epoch seconds. Deletion happens in the background and items may stay for a while after they expire.">Time to Live settings</Header>}>
        <SpaceBetween size="l">
          <RadioGroup value={v.on ? "on" : "off"} onChange={e => set({ ...v, on: e.detail.value === "on" })} items={[{ value: "on", label: "Turn on" }, { value: "off", label: "Turn off" }]} />
          {v.on && <FormField label="TTL attribute name" description="The name of the attribute that will be stored in the TTL timestamp." constraintText="Between 1 and 255 characters."><Input value={v.attr} onChange={e => set({ ...v, attr: e.detail.value })} /></FormField>}
          {v.on && <Alert type="info">Example: an item with <Box variant="code">{v.attr}: {Math.floor(Date.now() / 1000) + 86400}</Box> expires one day from now.</Alert>}
        </SpaceBetween>
      </Container>
    ),
    validate: v => v.on && !v.attr ? "TTL attribute name is required." : undefined,
    save: async (t, v) => {
      const curOn = v.orig?.TimeToLiveStatus === "ENABLED";
      if (v.on === curOn && (!v.on || v.attr === v.orig?.AttributeName)) return;
      await ddb("UpdateTimeToLive", { TableName: t.TableName, TimeToLiveSpecification: { Enabled: v.on, AttributeName: v.on ? v.attr : v.orig?.AttributeName } });
    },
  },
  encryption: {
    title: "Manage encryption", tab: "settings",
    load: ({ t }) => {
      const s = t.SSEDescription;
      if (!s || s.Status === "DISABLED") return { kind: "owned", key: "" } as Enc;
      return { kind: s.KMSMasterKeyArn && !/aws\/dynamodb/.test(s.KMSMasterKeyArn) ? "cmk" : "managed", key: s.KMSMasterKeyArn || "" } as Enc;
    },
    render: (v, set) => <Container header={<Header variant="h2" description="Choose the AWS KMS key that encrypts this table at rest.">Encryption at rest</Header>}><EncryptionFields value={v} onChange={set} /></Container>,
    save: async (t, v: Enc) => { await ddb("UpdateTable", { TableName: t.TableName, SSESpecification: sseSpec(v) }); },
  },
  "deletion-protection": {
    title: "Deletion protection", tab: "settings",
    load: ({ t }) => !!t.DeletionProtectionEnabled,
    render: (v, set) => (
      <Container header={<Header variant="h2" description="When deletion protection is turned on, the table can't be deleted.">Deletion protection</Header>}>
        <Checkbox checked={v} onChange={e => set(e.detail.checked)}>Turn on deletion protection</Checkbox>
      </Container>
    ),
    save: async (t, v) => { await ddb("UpdateTable", { TableName: t.TableName, DeletionProtectionEnabled: v }); },
  },
  "table-class": {
    title: "Edit table class", tab: "settings",
    load: ({ t }) => t.TableClassSummary?.TableClass || "STANDARD",
    render: (v, set) => (
      <Container header={<Header variant="h2">Table class</Header>}>
        <Tiles value={v} onChange={e => set(e.detail.value)} items={[
          { value: "STANDARD", label: "DynamoDB Standard", description: "The default general-purpose table class." },
          { value: "STANDARD_INFREQUENT_ACCESS", label: "DynamoDB Standard-IA", description: "For tables whose dominant cost is storage." },
        ]} />
      </Container>
    ),
    save: async (t, v) => { if (v !== (t.TableClassSummary?.TableClass || "STANDARD")) await ddb("UpdateTable", { TableName: t.TableName, TableClass: v }); },
  },
  pitr: {
    title: "Edit point-in-time recovery settings", tab: "backups",
    load: ({ extra }) => ({ on: extra.pitr?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === "ENABLED", days: String(extra.pitr?.PointInTimeRecoveryDescription?.RecoveryPeriodInDays || 35) }),
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Point-in-time recovery lets you restore the table to any second within the recovery period.">Point-in-time recovery</Header>}>
        <SpaceBetween size="l">
          <Checkbox checked={v.on} onChange={e => set({ ...v, on: e.detail.checked })}>Turn on point-in-time recovery</Checkbox>
          {v.on && <FormField label="Backup recovery period" constraintText="1 to 35 days."><Input type="number" value={v.days} onChange={e => set({ ...v, days: e.detail.value })} /></FormField>}
        </SpaceBetween>
      </Container>
    ),
    save: async (t, v) => { await ddb("UpdateContinuousBackups", { TableName: t.TableName, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: v.on, ...(v.on ? { RecoveryPeriodInDays: Number(v.days) } : {}) } }); },
  },
  stream: {
    title: "Turn on DynamoDB stream", tab: "streams",
    load: ({ t }) => t.StreamSpecification?.StreamViewType || "NEW_AND_OLD_IMAGES",
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Choose what information about modified items is written to the stream.">View type</Header>}>
        <RadioGroup value={v} onChange={e => set(e.detail.value)} items={STREAM_VIEWS} />
      </Container>
    ),
    save: async (t, v) => { await ddb("UpdateTable", { TableName: t.TableName, StreamSpecification: { StreamEnabled: true, StreamViewType: v } }); },
  },
  policy: {
    title: "Resource-based policy", tab: "permissions",
    load: ({ extra }) => extra.policy ? JSON.stringify(JSON.parse(extra.policy), null, 2) : "",
    render: (v, set, { t }) => (
      <Container header={<Header variant="h2" description="The emulator stores the policy but doesn't evaluate it."
        actions={<Button formAction="none" onClick={() => set(JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "ReadOnlyFromAccount", Effect: "Allow", Principal: { AWS: "arn:aws:iam::000000000000:root" }, Action: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"], Resource: t.TableArn }] }, null, 2))}>Insert example</Button>}>Policy</Header>}>
        <FormField errorText={v ? (() => { try { JSON.parse(v); return undefined; } catch (e: any) { return "Invalid JSON: " + e.message; } })() : undefined}>
          <Textarea rows={20} value={v} onChange={e => set(e.detail.value)} />
        </FormField>
      </Container>
    ),
    validate: v => { if (!v.trim()) return "Enter a policy."; try { JSON.parse(v); return undefined; } catch (e: any) { return "Invalid JSON: " + e.message; } },
    save: async (t, v) => { await ddb("PutResourcePolicy", { ResourceArn: t.TableArn, Policy: v }); },
  },
  tags: {
    title: "Manage tags", tab: "settings",
    load: ({ extra }) => fromTagSet(extra.tags),
    render: (v, set) => <Container header={<Header variant="h2">Tags</Header>}><Tags tags={v} onChange={set} /></Container>,
    save: async (t, v: KV[], { extra }) => {
      const keep = toTagSet(v);
      const removed = (extra.tags || []).map((x: any) => x.Key).filter((k: string) => !keep.some(x => x.Key === k));
      if (removed.length) await ddb("UntagResource", { ResourceArn: t.TableArn, TagKeys: removed });
      if (keep.length) await ddb("TagResource", { ResourceArn: t.TableArn, Tags: keep });
    },
  },
};

export default function EditTableSetting() {
  const { table = "", setting = "" } = useParams();
  const def = DEFS[setting];
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Tables", href: "#/dynamodb/tables" }, { text: table, href: tableHref(table, def?.tab) }, { text: def?.title || setting, href: "#" }]);
  const ctx = useAsync(async () => {
    const t = (await ddb("DescribeTable", { TableName: table })).Table;
    const extra: any = {};
    if (setting === "capacity") {
      extra.scaling = (await api.call("application-autoscaling", "DescribeScalableTargets", { ServiceNamespace: "dynamodb", ResourceIds: [`table/${table}`] })).ScalableTargets;
      extra.policies = (await api.call("application-autoscaling", "DescribeScalingPolicies", { ServiceNamespace: "dynamodb", ResourceId: `table/${table}` })).ScalingPolicies;
    }
    if (setting === "ttl") extra.ttl = (await ddb("DescribeTimeToLive", { TableName: table })).TimeToLiveDescription;
    if (setting === "pitr") extra.pitr = (await ddb("DescribeContinuousBackups", { TableName: table })).ContinuousBackupsDescription;
    if (setting === "tags") extra.tags = (await ddb("ListTagsOfResource", { ResourceArn: t.TableArn })).Tags;
    if (setting === "policy") extra.policy = await ddb("GetResourcePolicy", { ResourceArn: t.TableArn }).then((r: any) => r.Policy).catch(() => null);
    return { t, extra };
  }, [table, setting]);
  const [v, setV] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (ctx.data && def) setV(def.load(ctx.data)); }, [ctx.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <Alert type="error">Unknown setting "{setting}".</Alert>;
  const back = () => nav(tableHref(table, def.tab).slice(1));
  const save = async () => {
    const p = def.validate?.(v);
    if (p) { setErr(new Error(p)); return; }
    setBusy(true); setErr(null);
    try { await def.save(ctx.data!.t, v, ctx.data!); flash.notify({ type: "success", content: `The ${table} table was updated successfully.` }); back(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const title = setting === "ttl" && ctx.data?.extra?.ttl?.TimeToLiveStatus === "ENABLED" ? "Edit Time to Live (TTL)" : def.title;
  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      {ctx.loading || v === undefined ? (ctx.error ? <ErrorAlert error={ctx.error} /> : <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>) : (
        <form onSubmit={e => { e.preventDefault(); save(); }}>
          <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
            actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={back}>Cancel</Button><Button variant="primary" loading={busy}>Save changes</Button></SpaceBetween>}>
            {def.render(v, setV, ctx.data!)}
          </Form>
        </form>
      )}
    </ContentLayout>
  );
}
