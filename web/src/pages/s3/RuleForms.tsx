// Create/edit forms for lifecycle, replication, inventory, event notification and Intelligent-Tiering archive rules.
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Tiles from "@cloudscape-design/components/tiles";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Spinner from "@cloudscape-design/components/spinner";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { s3, getOr, bucketHref, storageClassLabel, TRANSITION_CLASSES, EVENT_TYPES, STORAGE_CLASSES } from "./lib";

// ---------- shared frame ----------
function RulePage({ title, tab, load, children, onSave, validate }: {
  title: string; tab: string; load: Promise<any> | null; children: (ready: boolean) => ReactNode; onSave: () => Promise<void>; validate?: () => string | undefined;
}) {
  const { bucket = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [ready, setReady] = useState(!load);
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: "Buckets", href: "#/s3/buckets" }, { text: bucket, href: bucketHref(bucket, tab) }, { text: title, href: "#" }]);
  useEffect(() => { if (load) load.then(() => setReady(true), e => { setErr(e); setReady(true); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const back = () => nav({ pathname: `/s3/buckets/${encodeURIComponent(bucket)}`, search: `?tab=${tab}` });
  const save = async () => {
    const p = validate?.();
    if (p) { setErr(new Error(p)); return; }
    setBusy(true); setErr(null);
    try { await onSave(); flash.notify({ type: "success", content: `${title}: saved.` }); back(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      {!ready ? <Box textAlign="center" padding="xl"><Spinner size="large" /></Box> : (
        <form onSubmit={e => { e.preventDefault(); save(); }}>
          <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
            actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={back}>Cancel</Button><Button variant="primary" loading={busy}>Save</Button></SpaceBetween>}>
            <SpaceBetween size="l">{children(ready)}</SpaceBetween>
          </Form>
        </form>
      )}
    </ContentLayout>
  );
}

type Tag = { key: string; value: string };
function TagFilter({ tags, onChange }: { tags: Tag[]; onChange: (t: Tag[]) => void }) {
  return (
    <AttributeEditor items={tags} addButtonText="Add tag" removeButtonText="Remove" empty="No tags."
      onAddButtonClick={() => onChange([...tags, { key: "", value: "" }])}
      onRemoveButtonClick={e => onChange(tags.filter((_, i) => i !== e.detail.itemIndex))}
      definition={[
        { label: "Key", control: (t, i) => <Input value={t.key} onChange={e => onChange(tags.map((x, j) => j === i ? { ...x, key: e.detail.value } : x))} /> },
        { label: "Value - optional", control: (t, i) => <Input value={t.value} onChange={e => onChange(tags.map((x, j) => j === i ? { ...x, value: e.detail.value } : x))} /> },
      ]} />
  );
}
function buildFilter(prefix: string, tags: Tag[], min?: string, max?: string, sizes = false) {
  const t = tags.filter(x => x.key).map(x => ({ Key: x.key, Value: x.value }));
  const parts = (prefix ? 1 : 0) + t.length + (sizes && min ? 1 : 0) + (sizes && max ? 1 : 0);
  if (parts === 0) return {};
  if (parts === 1) {
    if (prefix) return { Prefix: prefix };
    if (t.length) return { Tag: t[0] };
    if (min) return { ObjectSizeGreaterThan: Number(min) };
    return { ObjectSizeLessThan: Number(max) };
  }
  const and: any = {};
  if (prefix) and.Prefix = prefix;
  if (t.length) and.Tags = t;
  if (sizes && min) and.ObjectSizeGreaterThan = Number(min);
  if (sizes && max) and.ObjectSizeLessThan = Number(max);
  return { And: and };
}
function parseFilter(f: any) {
  const and = f?.And || {};
  const tags = (f?.Tag ? [f.Tag] : and.Tags || []).map((t: any) => ({ key: t.Key, value: t.Value }));
  return { prefix: f?.Prefix ?? and.Prefix ?? "", tags, min: String(f?.ObjectSizeGreaterThan ?? and.ObjectSizeGreaterThan ?? ""), max: String(f?.ObjectSizeLessThan ?? and.ObjectSizeLessThan ?? "") };
}

function ScopeFields({ scope, setScope, prefix, setPrefix, tags, setTags, sizes, min, setMin, max, setMax, ack, setAck, what }: any) {
  return (
    <SpaceBetween size="l">
      <FormField label="Choose a rule scope">
        <RadioGroup value={scope} onChange={e => setScope(e.detail.value)} items={[
          { value: "filter", label: "Limit the scope of this rule using one or more filters" },
          { value: "all", label: "Apply to all objects in the bucket" },
        ]} />
      </FormField>
      {scope === "all" && setAck && (
        <Alert type="warning" header={`Apply to all objects in the bucket`}>
          <SpaceBetween size="xs">
            <Box>If you want the rule to apply to specific objects, you must use a filter to identify those objects.</Box>
            <Checkbox checked={ack} onChange={e => setAck(e.detail.checked)}>I acknowledge that this rule will apply to all objects in the bucket.</Checkbox>
          </SpaceBetween>
        </Alert>
      )}
      {scope === "filter" && <>
        <FormField label="Prefix" description={`Add filter to limit the scope of this ${what} to a single prefix.`}><Input value={prefix} onChange={e => setPrefix(e.detail.value)} placeholder="Enter prefix" /></FormField>
        <FormField label="Object tags" description={`You can limit the scope of this ${what} to the key/value pairs added below.`}><TagFilter tags={tags} onChange={setTags} /></FormField>
        {sizes && <FormField label="Object size" description="Limit the scope of this rule to objects within a size range, in bytes.">
          <ColumnLayout columns={2}>
            <FormField label="Minimum object size (bytes)"><Input type="number" value={min} onChange={e => setMin(e.detail.value)} /></FormField>
            <FormField label="Maximum object size (bytes)"><Input type="number" value={max} onChange={e => setMax(e.detail.value)} /></FormField>
          </ColumnLayout>
        </FormField>}
      </>}
    </SpaceBetween>
  );
}

const classOpts = TRANSITION_CLASSES.map(c => ({ value: c, label: storageClassLabel(c) }));

// ---------- Lifecycle ----------
export function LifecycleRuleForm() {
  const { bucket = "", id = "new" } = useParams();
  const isNew = id === "new";
  const [rules, setRules] = useState<any[]>([]);
  const [name, setName] = useState(isNew ? "" : id);
  const [status, setStatus] = useState("Enabled");
  const [scope, setScope] = useState("filter");
  const [ack, setAck] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [act, setAct] = useState({ tc: false, tn: false, ec: false, dn: false, dm: false, mp: false });
  const [tCur, setTCur] = useState<{ cls: string; days: string }[]>([{ cls: "STANDARD_IA", days: "30" }]);
  const [tNon, setTNon] = useState<{ cls: string; days: string; keep: string }[]>([{ cls: "STANDARD_IA", days: "30", keep: "" }]);
  const [expDays, setExpDays] = useState("365");
  const [nonDays, setNonDays] = useState("30");
  const [nonKeep, setNonKeep] = useState("");
  const [mpDays, setMpDays] = useState("7");
  const [load] = useState(() => getOr("GetBucketLifecycleConfiguration", { Bucket: bucket }, { Rules: [] }).then((r: any) => {
    setRules(r.Rules || []);
    const ru = (r.Rules || []).find((x: any) => x.ID === id);
    if (!ru) return;
    setStatus(ru.Status);
    const f = parseFilter(ru.Filter);
    setScope(f.prefix || f.tags.length || f.min || f.max ? "filter" : "all"); setAck(true);
    setPrefix(f.prefix); setTags(f.tags); setMin(f.min === "undefined" ? "" : f.min); setMax(f.max === "undefined" ? "" : f.max);
    setAct({ tc: !!ru.Transitions?.length, tn: !!ru.NoncurrentVersionTransitions?.length, ec: !!(ru.Expiration?.Days || ru.Expiration?.Date), dn: !!ru.NoncurrentVersionExpiration, dm: !!ru.Expiration?.ExpiredObjectDeleteMarker, mp: !!ru.AbortIncompleteMultipartUpload });
    if (ru.Transitions?.length) setTCur(ru.Transitions.map((t: any) => ({ cls: t.StorageClass, days: String(t.Days ?? "") })));
    if (ru.NoncurrentVersionTransitions?.length) setTNon(ru.NoncurrentVersionTransitions.map((t: any) => ({ cls: t.StorageClass, days: String(t.NoncurrentDays), keep: String(t.NewerNoncurrentVersions ?? "") })));
    if (ru.Expiration?.Days) setExpDays(String(ru.Expiration.Days));
    if (ru.NoncurrentVersionExpiration) { setNonDays(String(ru.NoncurrentVersionExpiration.NoncurrentDays)); setNonKeep(String(ru.NoncurrentVersionExpiration.NewerNoncurrentVersions ?? "")); }
    if (ru.AbortIncompleteMultipartUpload) setMpDays(String(ru.AbortIncompleteMultipartUpload.DaysAfterInitiation));
  }));
  const sizesUsed = scope === "filter" && (min || max);
  const validate = () => {
    if (!name) return "Lifecycle rule name is required.";
    if (isNew && rules.some(r => r.ID === name)) return "A rule with this name already exists.";
    if (scope === "all" && !ack) return "Acknowledge that the rule applies to all objects in the bucket.";
    if (!Object.values(act).some(Boolean)) return "Choose at least one lifecycle rule action.";
    if (act.ec && act.dm) return "\"Delete expired object delete markers\" can't be combined with \"Expire current versions of objects\".";
    return undefined;
  };
  const save = async () => {
    const rule: any = { ID: name, Status: status, Filter: scope === "all" ? {} : buildFilter(prefix, tags, min, max, true) };
    if (act.tc) rule.Transitions = tCur.map(t => ({ Days: Number(t.days), StorageClass: t.cls }));
    if (act.tn) rule.NoncurrentVersionTransitions = tNon.map(t => ({ NoncurrentDays: Number(t.days), StorageClass: t.cls, ...(t.keep ? { NewerNoncurrentVersions: Number(t.keep) } : {}) }));
    if (act.ec) rule.Expiration = { Days: Number(expDays) };
    if (act.dm) rule.Expiration = { ExpiredObjectDeleteMarker: true };
    if (act.dn) rule.NoncurrentVersionExpiration = { NoncurrentDays: Number(nonDays), ...(nonKeep ? { NewerNoncurrentVersions: Number(nonKeep) } : {}) };
    if (act.mp) rule.AbortIncompleteMultipartUpload = { DaysAfterInitiation: Number(mpDays) };
    const all = isNew ? [...rules, rule] : rules.map(r => r.ID === id ? rule : r);
    await s3("PutBucketLifecycleConfiguration", { Bucket: bucket, LifecycleConfiguration: { Rules: all } });
  };
  const A = (k: keyof typeof act, label: string) => <Checkbox checked={act[k]} onChange={e => setAct({ ...act, [k]: e.detail.checked })}>{label}</Checkbox>;
  return (
    <RulePage title={isNew ? "Create lifecycle rule" : `Edit lifecycle rule ${id}`} tab="management" load={load} onSave={save} validate={validate}>
      {() => <>
        <Container header={<Header variant="h2">Lifecycle rule configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Lifecycle rule name" constraintText="Up to 255 characters"><Input value={name} disabled={!isNew} onChange={e => setName(e.detail.value)} /></FormField>
            {!isNew && <FormField label="Status"><RadioGroup value={status} onChange={e => setStatus(e.detail.value)} items={[{ value: "Enabled", label: "Enabled" }, { value: "Disabled", label: "Disabled" }]} /></FormField>}
            <ScopeFields {...{ scope, setScope, prefix, setPrefix, tags, setTags, min, setMin, max, setMax, ack, setAck }} sizes what="rule" />
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2" description="Choose the actions you want this rule to perform.">Lifecycle rule actions</Header>}>
          <SpaceBetween size="xs">
            {A("tc", "Transition current versions of objects between storage classes")}
            {A("tn", "Transition noncurrent versions of objects between storage classes")}
            {A("ec", "Expire current versions of objects")}
            {A("dn", "Permanently delete noncurrent versions of objects")}
            {A("dm", "Delete expired object delete markers")}
            {A("mp", "Delete incomplete multipart uploads")}
            {sizesUsed ? <Box variant="small" color="text-body-secondary">Transitions of objects smaller than 128 KB aren't applied by default.</Box> : null}
          </SpaceBetween>
        </Container>
        {act.tc && <Container header={<Header variant="h2">Transition current versions of objects between storage classes</Header>}>
          <AttributeEditor items={tCur} addButtonText="Add transition" removeButtonText="Remove"
            onAddButtonClick={() => setTCur([...tCur, { cls: "GLACIER", days: "90" }])} onRemoveButtonClick={e => setTCur(tCur.filter((_, i) => i !== e.detail.itemIndex))}
            definition={[
              { label: "Choose storage class transitions", control: (t, i) => <Select selectedOption={classOpts.find(o => o.value === t.cls)!} options={classOpts} onChange={e => setTCur(tCur.map((x, j) => j === i ? { ...x, cls: e.detail.selectedOption.value! } : x))} /> },
              { label: "Days after object creation", control: (t, i) => <Input type="number" value={t.days} onChange={e => setTCur(tCur.map((x, j) => j === i ? { ...x, days: e.detail.value } : x))} /> },
            ]} />
        </Container>}
        {act.tn && <Container header={<Header variant="h2">Transition noncurrent versions of objects between storage classes</Header>}>
          <AttributeEditor items={tNon} addButtonText="Add transition" removeButtonText="Remove"
            onAddButtonClick={() => setTNon([...tNon, { cls: "GLACIER", days: "90", keep: "" }])} onRemoveButtonClick={e => setTNon(tNon.filter((_, i) => i !== e.detail.itemIndex))}
            definition={[
              { label: "Choose storage class transitions", control: (t, i) => <Select selectedOption={classOpts.find(o => o.value === t.cls)!} options={classOpts} onChange={e => setTNon(tNon.map((x, j) => j === i ? { ...x, cls: e.detail.selectedOption.value! } : x))} /> },
              { label: "Days after objects become noncurrent", control: (t, i) => <Input type="number" value={t.days} onChange={e => setTNon(tNon.map((x, j) => j === i ? { ...x, days: e.detail.value } : x))} /> },
              { label: "Number of newer versions to retain - optional", control: (t, i) => <Input type="number" value={t.keep} onChange={e => setTNon(tNon.map((x, j) => j === i ? { ...x, keep: e.detail.value } : x))} /> },
            ]} />
        </Container>}
        {act.ec && <Container header={<Header variant="h2">Expire current versions of objects</Header>}>
          <FormField label="Days after object creation"><Input type="number" value={expDays} onChange={e => setExpDays(e.detail.value)} /></FormField>
        </Container>}
        {act.dn && <Container header={<Header variant="h2">Permanently delete noncurrent versions of objects</Header>}>
          <ColumnLayout columns={2}>
            <FormField label="Days after objects become noncurrent"><Input type="number" value={nonDays} onChange={e => setNonDays(e.detail.value)} /></FormField>
            <FormField label="Number of newer versions to retain - optional"><Input type="number" value={nonKeep} onChange={e => setNonKeep(e.detail.value)} /></FormField>
          </ColumnLayout>
        </Container>}
        {act.mp && <Container header={<Header variant="h2">Delete incomplete multipart uploads</Header>}>
          <FormField label="Number of days"><Input type="number" value={mpDays} onChange={e => setMpDays(e.detail.value)} /></FormField>
        </Container>}
      </>}
    </RulePage>
  );
}

// ---------- Replication ----------
export function ReplicationRuleForm() {
  const { bucket = "", id = "new" } = useParams();
  const isNew = id === "new";
  const flash = useFlash();
  const [cfg, setCfg] = useState<any>(null);
  const [name, setName] = useState(isNew ? "" : id);
  const [status, setStatus] = useState("Enabled");
  const [priority, setPriority] = useState("0");
  const [scope, setScope] = useState("all");
  const [prefix, setPrefix] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [dest, setDest] = useState<{ value: string; label: string } | null>(null);
  const [roleMode, setRoleMode] = useState("create");
  const [roleArn, setRoleArn] = useState("");
  const [changeClass, setChangeClass] = useState(false);
  const [cls, setCls] = useState({ value: "STANDARD_IA", label: storageClassLabel("STANDARD_IA") });
  const [opts, setOpts] = useState({ rtc: false, metrics: false, dm: false, mod: false, kms: false });
  const srcVer = useAsync(() => getOr("GetBucketVersioning", { Bucket: bucket }, {}), [bucket]);
  const buckets = useAsync(async () => ((await s3("ListBuckets")).Buckets || []).filter((b: any) => b.Name !== bucket).map((b: any) => ({ value: b.Name, label: b.Name })), [bucket]);
  const destVer = useAsync(async () => dest ? getOr("GetBucketVersioning", { Bucket: dest.value }, {}) : null, [dest?.value]);
  const [load] = useState(() => getOr("GetBucketReplication", { Bucket: bucket }, null).then((r: any) => {
    const c = r?.ReplicationConfiguration;
    setCfg(c);
    if (c?.Role) { setRoleMode("existing"); setRoleArn(c.Role); }
    const ru = c?.Rules?.find((x: any) => x.ID === id);
    if (!ru) { setPriority(String((c?.Rules?.length || 0))); return; }
    setStatus(ru.Status); setPriority(String(ru.Priority ?? 0));
    const f = parseFilter(ru.Filter);
    setScope(f.prefix || f.tags.length ? "filter" : "all"); setPrefix(f.prefix); setTags(f.tags);
    const db = String(ru.Destination.Bucket).replace("arn:aws:s3:::", "");
    setDest({ value: db, label: db });
    if (ru.Destination.StorageClass) { setChangeClass(true); setCls({ value: ru.Destination.StorageClass, label: storageClassLabel(ru.Destination.StorageClass) }); }
    setOpts({ rtc: ru.Destination.ReplicationTime?.Status === "Enabled", metrics: ru.Destination.Metrics?.Status === "Enabled", dm: ru.DeleteMarkerReplication?.Status === "Enabled", mod: ru.SourceSelectionCriteria?.ReplicaModifications?.Status === "Enabled", kms: ru.SourceSelectionCriteria?.SseKmsEncryptedObjects?.Status === "Enabled" });
  }));
  const enableVersioning = async (b: string, reload: () => void) => {
    try { await s3("PutBucketVersioning", { Bucket: b, VersioningConfiguration: { Status: "Enabled" } }); flash.notify({ type: "success", content: `Versioning enabled on ${b}.` }); reload(); }
    catch (e) { flash.error(e); }
  };
  const validate = () => {
    if (!name) return "Replication rule name is required.";
    if (!dest) return "Choose a destination bucket.";
    if (srcVer.data?.Status !== "Enabled") return "The source bucket must have versioning enabled.";
    if (destVer.data?.Status !== "Enabled") return "The destination bucket must have versioning enabled.";
    if (roleMode === "existing" && !roleArn) return "Enter an IAM role ARN.";
    return undefined;
  };
  const save = async () => {
    let role = roleArn;
    if (roleMode === "create") {
      const rn = `s3crr_role_for_${bucket}`.slice(0, 64);
      try { role = (await api.call("iam", "GetRole", { RoleName: rn })).Role.Arn; }
      catch { role = (await api.call("iam", "CreateRole", { RoleName: rn, AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "s3.amazonaws.com" }, Action: "sts:AssumeRole" }] }) })).Role.Arn; }
    }
    const destination: any = { Bucket: `arn:aws:s3:::${dest!.value}` };
    if (changeClass) destination.StorageClass = cls.value;
    if (opts.rtc) { destination.ReplicationTime = { Status: "Enabled", Time: { Minutes: 15 } }; destination.Metrics = { Status: "Enabled", EventThreshold: { Minutes: 15 } }; }
    else if (opts.metrics) destination.Metrics = { Status: "Enabled", EventThreshold: { Minutes: 15 } };
    const rule: any = { ID: name, Status: status, Priority: Number(priority), Filter: scope === "all" ? {} : buildFilter(prefix, tags), DeleteMarkerReplication: { Status: opts.dm ? "Enabled" : "Disabled" }, Destination: destination };
    const ssc: any = {};
    if (opts.mod) ssc.ReplicaModifications = { Status: "Enabled" };
    if (opts.kms) ssc.SseKmsEncryptedObjects = { Status: "Enabled" };
    if (Object.keys(ssc).length) rule.SourceSelectionCriteria = ssc;
    const rules = isNew ? [...(cfg?.Rules || []), rule] : (cfg?.Rules || []).map((r: any) => r.ID === id ? rule : r);
    await s3("PutBucketReplication", { Bucket: bucket, ReplicationConfiguration: { Role: role, Rules: rules } });
  };
  const O = (k: keyof typeof opts, label: string, desc: string) => <Checkbox checked={opts[k]} onChange={e => setOpts({ ...opts, [k]: e.detail.checked })} description={desc}>{label}</Checkbox>;
  return (
    <RulePage title={isNew ? "Create replication rule" : `Edit replication rule ${id}`} tab="management" load={load} onSave={save} validate={validate}>
      {() => <>
        {srcVer.data && srcVer.data.Status !== "Enabled" && (
          <Alert type="warning" header="Replication requires versioning to be enabled for the source bucket" action={<Button formAction="none" onClick={() => enableVersioning(bucket, srcVer.reload)}>Enable Bucket Versioning</Button>}>
            Bucket Versioning is currently {srcVer.data.Status ? srcVer.data.Status.toLowerCase() : "disabled"} on {bucket}.
          </Alert>
        )}
        <Container header={<Header variant="h2">Replication rule configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Replication rule name"><Input value={name} disabled={!isNew} onChange={e => setName(e.detail.value)} /></FormField>
            <FormField label="Status"><RadioGroup value={status} onChange={e => setStatus(e.detail.value)} items={[{ value: "Enabled", label: "Enabled" }, { value: "Disabled", label: "Disabled" }]} /></FormField>
            <FormField label="Priority" description="The priority value resolves conflicts that occur when an object is eligible for replication under multiple rules to the same destination."><Input type="number" value={priority} onChange={e => setPriority(e.detail.value)} /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Source bucket</Header>}>
          <SpaceBetween size="l">
            <FormField label="Source bucket name"><Box>{bucket}</Box></FormField>
            <FormField label="Source Region"><Box>US East (N. Virginia) us-east-1</Box></FormField>
            <ScopeFields {...{ scope, setScope, prefix, setPrefix, tags, setTags }} what="replication rule" />
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Destination</Header>}>
          <SpaceBetween size="l">
            <Tiles value="same" items={[{ value: "same", label: "Choose a bucket in this account" }, { value: "other", label: "Specify a bucket in another account", disabled: true, description: "The emulator has a single account." }]} />
            <FormField label="Bucket name" errorText={buckets.data && !buckets.data.length ? "Create another bucket to replicate into." : undefined}>
              <Select selectedOption={dest} placeholder="Choose bucket" options={buckets.data || []} statusType={buckets.loading ? "loading" : "finished"} onChange={e => setDest(e.detail.selectedOption as any)} />
            </FormField>
            {dest && destVer.data && destVer.data.Status !== "Enabled" && (
              <Alert type="warning" header="Bucket Versioning must be enabled on the destination bucket" action={<Button formAction="none" onClick={() => enableVersioning(dest.value, destVer.reload)}>Enable bucket versioning</Button>}>{dest.value} doesn't have versioning enabled.</Alert>
            )}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">IAM role</Header>}>
          <SpaceBetween size="l">
            <RadioGroup value={roleMode} onChange={e => setRoleMode(e.detail.value)} items={[{ value: "create", label: "Create new role" }, { value: "existing", label: "Enter IAM role ARN" }]} />
            {roleMode === "existing" && <FormField label="IAM role ARN"><Input value={roleArn} onChange={e => setRoleArn(e.detail.value)} placeholder="arn:aws:iam::000000000000:role/…" /></FormField>}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Encryption</Header>}>
          {O("kms", "Replicate objects encrypted with AWS Key Management Service (AWS KMS)", "Objects encrypted with SSE-KMS are replicated only when you opt in.")}
        </Container>
        <Container header={<Header variant="h2">Destination storage class</Header>}>
          <SpaceBetween size="m">
            <Checkbox checked={changeClass} onChange={e => setChangeClass(e.detail.checked)}>Change the storage class for the replicated objects</Checkbox>
            {changeClass && <Select selectedOption={cls} options={STORAGE_CLASSES.map(s => ({ value: s.value, label: s.label }))} onChange={e => setCls(e.detail.selectedOption as any)} />}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Additional replication options</Header>}>
          <SpaceBetween size="s">
            {O("rtc", "Replication Time Control (RTC)", "Replicate 99.99% of new objects within 15 minutes, and get replication metrics and notifications.")}
            {O("metrics", "Replication metrics", "Monitor the progress of your replication with Amazon CloudWatch metrics.")}
            {O("dm", "Delete marker replication", "Delete markers created by S3 delete operations will be replicated.")}
            {O("mod", "Replica modification sync", "Replicate metadata changes made to replicas in this bucket to the destination bucket.")}
          </SpaceBetween>
        </Container>
      </>}
    </RulePage>
  );
}

// ---------- Inventory ----------
const INV_FIELDS = ["Size", "LastModifiedDate", "StorageClass", "ETag", "IsMultipartUploaded", "ReplicationStatus", "EncryptionStatus", "BucketKeyStatus", "ObjectLockRetainUntilDate", "ObjectLockMode", "ObjectLockLegalHoldStatus", "IntelligentTieringAccessTier", "ChecksumAlgorithm", "ObjectAccessControlList", "ObjectOwner"];
export function InventoryForm() {
  const { bucket = "", id = "new" } = useParams();
  const isNew = id === "new";
  const [name, setName] = useState(isNew ? "" : id);
  const [prefix, setPrefix] = useState("");
  const [versions, setVersions] = useState("Current");
  const [dest, setDest] = useState(`s3://${bucket}/inventory/`);
  const [freq, setFreq] = useState("Daily");
  const [fmt, setFmt] = useState("CSV");
  const [on, setOn] = useState(true);
  const [enc, setEnc] = useState("none");
  const [kms, setKms] = useState("");
  const [fields, setFields] = useState<string[]>(["Size", "LastModifiedDate", "StorageClass"]);
  const [load] = useState(() => isNew ? null : s3("GetBucketInventoryConfiguration", { Bucket: bucket, Id: id }).then((r: any) => {
    const c = r.InventoryConfiguration;
    setPrefix(c.Filter?.Prefix || ""); setVersions(c.IncludedObjectVersions); setFreq(c.Schedule.Frequency); setOn(c.IsEnabled);
    const d = c.Destination.S3BucketDestination;
    setDest(`s3://${String(d.Bucket).replace("arn:aws:s3:::", "")}/${d.Prefix || ""}`); setFmt(d.Format);
    setEnc(d.Encryption?.SSEKMS ? "kms" : d.Encryption?.SSES3 ? "s3" : "none"); setKms(d.Encryption?.SSEKMS?.KeyId || "");
    setFields(c.OptionalFields || []);
  }));
  const m = dest.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  const validate = () => !name ? "Inventory configuration name is required." : !m ? "Destination must be an S3 URI like s3://bucket/prefix/." : undefined;
  const save = async () => {
    const d: any = { Bucket: `arn:aws:s3:::${m![1]}`, Format: fmt };
    if (m![2]) d.Prefix = m![2];
    if (enc === "s3") d.Encryption = { SSES3: {} };
    if (enc === "kms") d.Encryption = { SSEKMS: { KeyId: kms || "alias/aws/s3" } };
    const c: any = { Id: name, IsEnabled: on, IncludedObjectVersions: versions, Schedule: { Frequency: freq }, Destination: { S3BucketDestination: d }, OptionalFields: fields };
    if (prefix) c.Filter = { Prefix: prefix };
    await s3("PutBucketInventoryConfiguration", { Bucket: bucket, Id: name, InventoryConfiguration: c });
  };
  return (
    <RulePage title={isNew ? "Create inventory configuration" : `Edit inventory configuration ${id}`} tab="management" load={load} onSave={save} validate={validate}>
      {() => <>
        <Container header={<Header variant="h2">Inventory configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Inventory configuration name"><Input value={name} disabled={!isNew} onChange={e => setName(e.detail.value)} /></FormField>
            <FormField label="Inventory scope" description="Specify a prefix to limit the inventory, or leave it empty for the entire bucket."><Input value={prefix} onChange={e => setPrefix(e.detail.value)} placeholder="Enter prefix" /></FormField>
            <FormField label="Object versions">
              <RadioGroup value={versions} onChange={e => setVersions(e.detail.value)} items={[{ value: "Current", label: "Current version only" }, { value: "All", label: "Include all versions" }]} />
            </FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Report details</Header>}>
          <SpaceBetween size="l">
            <FormField label="Destination" description="Format: s3://bucket/prefix" errorText={!m ? "Enter an S3 URI." : undefined}><Input value={dest} onChange={e => setDest(e.detail.value)} /></FormField>
            <Alert type="info">The emulator stores this configuration. AWS delivers reports within 48 hours; this console hasn't verified whether the emulator writes report files.</Alert>
            <FormField label="Frequency"><RadioGroup value={freq} onChange={e => setFreq(e.detail.value)} items={[{ value: "Daily", label: "Daily" }, { value: "Weekly", label: "Weekly" }]} /></FormField>
            <FormField label="Output format"><RadioGroup value={fmt} onChange={e => setFmt(e.detail.value)} items={[{ value: "CSV", label: "CSV" }, { value: "ORC", label: "Apache ORC" }, { value: "Parquet", label: "Apache Parquet" }]} /></FormField>
            <FormField label="Status"><RadioGroup value={on ? "on" : "off"} onChange={e => setOn(e.detail.value === "on")} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Inventory report server-side encryption</Header>}>
          <SpaceBetween size="m">
            <RadioGroup value={enc} onChange={e => setEnc(e.detail.value)} items={[{ value: "none", label: "Do not specify an encryption key" }, { value: "s3", label: "Amazon S3 managed keys (SSE-S3)" }, { value: "kms", label: "AWS Key Management Service key (SSE-KMS)" }]} />
            {enc === "kms" && <FormField label="AWS KMS key"><Input value={kms} onChange={e => setKms(e.detail.value)} placeholder="alias/aws/s3" /></FormField>}
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2" description="Choose additional metadata fields to include in the report.">Additional metadata fields</Header>}>
          <ColumnLayout columns={3}>
            {INV_FIELDS.map(f => <Checkbox key={f} checked={fields.includes(f)} onChange={e => setFields(e.detail.checked ? [...fields, f] : fields.filter(x => x !== f))}>{f.replace(/([a-z])([A-Z])/g, "$1 $2")}</Checkbox>)}
          </ColumnLayout>
        </Container>
      </>}
    </RulePage>
  );
}

// ---------- Event notification ----------
export function EventNotificationForm() {
  const { bucket = "", id = "new" } = useParams();
  const isNew = id === "new";
  const [cur, setCur] = useState<any>({});
  const [name, setName] = useState(isNew ? "" : id);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [destType, setDestType] = useState("sqs");
  const [destMode, setDestMode] = useState("choose");
  const [destArn, setDestArn] = useState("");
  const [grant, setGrant] = useState(true);
  const [load] = useState(() => getOr("GetBucketNotificationConfiguration", { Bucket: bucket }, {}).then((r: any) => {
    setCur(r);
    const find = (k: string) => (r[k] || []).find((c: any) => c.Id === id);
    const c = find("QueueConfigurations") || find("TopicConfigurations") || find("LambdaFunctionConfigurations");
    if (!c) return;
    setEvents(c.Events);
    for (const fr of c.Filter?.Key?.FilterRules || []) (fr.Name.toLowerCase() === "prefix" ? setPrefix : setSuffix)(fr.Value);
    setDestType(c.QueueArn ? "sqs" : c.TopicArn ? "sns" : "lambda"); setDestArn(c.QueueArn || c.TopicArn || c.LambdaFunctionArn); setDestMode("arn");
  }));
  const dests = useAsync(async () => {
    if (destType === "sqs") {
      const urls = (await api.call("sqs", "ListQueues")).QueueUrls || [];
      return Promise.all(urls.map(async (u: string) => { const a = (await api.call("sqs", "GetQueueAttributes", { QueueUrl: u, AttributeNames: ["QueueArn"] })).Attributes.QueueArn; return { value: a, label: u.split("/").pop()! }; }));
    }
    if (destType === "sns") return ((await api.call("sns", "ListTopics")).Topics || []).map((t: any) => ({ value: t.TopicArn, label: t.TopicArn.split(":").pop() }));
    return ((await api.call("lambda", "ListFunctions")).Functions || []).map((f: any) => ({ value: f.FunctionArn, label: f.FunctionName }));
  }, [destType]);
  const toggle = (v: string, on: boolean) => setEvents(on ? [...events, v] : events.filter(x => x !== v));
  const validate = () => !name ? "Event name is required." : !events.length ? "Choose at least one event type." : !destArn ? "Choose a destination." : undefined;
  // Let S3 publish to the destination (what you'd otherwise do by editing the queue/topic/function policy).
  const grantAccess = async () => {
    const src = `arn:aws:s3:::${bucket}`;
    const stmt = (action: string) => ({ Sid: `s3-${bucket}-${name}`.replace(/[^A-Za-z0-9-]/g, "-"), Effect: "Allow", Principal: { Service: "s3.amazonaws.com" }, Action: action, Resource: destArn, Condition: { ArnLike: { "aws:SourceArn": src } } });
    const merge = (raw: string | undefined, st: any) => {
      const doc = raw ? JSON.parse(raw) : { Version: "2012-10-17", Statement: [] };
      doc.Statement = [...(doc.Statement || []).filter((x: any) => x.Sid !== st.Sid), st];
      return JSON.stringify(doc);
    };
    if (destType === "sqs") {
      const url = (await api.call("sqs", "GetQueueUrl", { QueueName: destArn.split(":").pop() })).QueueUrl;
      const cur = (await api.call("sqs", "GetQueueAttributes", { QueueUrl: url, AttributeNames: ["Policy"] })).Attributes?.Policy;
      await api.call("sqs", "SetQueueAttributes", { QueueUrl: url, Attributes: { Policy: merge(cur, stmt("sqs:SendMessage")) } });
    } else if (destType === "sns") {
      const cur = (await api.call("sns", "GetTopicAttributes", { TopicArn: destArn })).Attributes?.Policy;
      await api.call("sns", "SetTopicAttributes", { TopicArn: destArn, AttributeName: "Policy", AttributeValue: merge(cur, stmt("sns:Publish")) });
    } else {
      try { await api.call("lambda", "AddPermission", { FunctionName: destArn, StatementId: `s3-${bucket}-${name}`.replace(/[^A-Za-z0-9-_]/g, "-"), Action: "lambda:InvokeFunction", Principal: "s3.amazonaws.com", SourceArn: src }); }
      catch (e: any) { if (e?.code !== "ResourceConflictException") throw e; }
    }
  };
  const save = async () => {
    if (grant) await grantAccess();
    const rules = [prefix && { Name: "prefix", Value: prefix }, suffix && { Name: "suffix", Value: suffix }].filter(Boolean);
    const c: any = { Id: name, Events: events };
    if (rules.length) c.Filter = { Key: { FilterRules: rules } };
    const key = destType === "sqs" ? "QueueConfigurations" : destType === "sns" ? "TopicConfigurations" : "LambdaFunctionConfigurations";
    c[destType === "sqs" ? "QueueArn" : destType === "sns" ? "TopicArn" : "LambdaFunctionArn"] = destArn;
    const cfg: any = {};
    for (const k of ["QueueConfigurations", "TopicConfigurations", "LambdaFunctionConfigurations"]) cfg[k] = (cur[k] || []).filter((x: any) => x.Id !== id && x.Id !== name);
    cfg[key].push(c);
    if (cur.EventBridgeConfiguration) cfg.EventBridgeConfiguration = {};
    for (const k of Object.keys(cfg)) if (Array.isArray(cfg[k]) && !cfg[k].length) delete cfg[k];
    await s3("PutBucketNotificationConfiguration", { Bucket: bucket, NotificationConfiguration: cfg });
  };
  return (
    <RulePage title={isNew ? "Create event notification" : `Edit event notification ${id}`} tab="properties" load={load} onSave={save} validate={validate}>
      {() => <>
        <Container header={<Header variant="h2">General configuration</Header>}>
          <SpaceBetween size="l">
            <FormField label="Event name"><Input value={name} disabled={!isNew} onChange={e => setName(e.detail.value)} /></FormField>
            <FormField label="Prefix - optional" description="Limit the notifications to objects with key starting with specified characters."><Input value={prefix} onChange={e => setPrefix(e.detail.value)} placeholder="images/" /></FormField>
            <FormField label="Suffix - optional" description="Limit the notifications to objects with key ending with specified characters."><Input value={suffix} onChange={e => setSuffix(e.detail.value)} placeholder=".jpg" /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2" description="Specify at least one event for which you want to receive notifications. For each group, you can choose an event type for all events, or you can choose one or more individual events.">Event types</Header>}>
          <ColumnLayout columns={2}>
            {EVENT_TYPES.map(g => (
              <FormField key={g.group} label={g.group}>
                <SpaceBetween size="xxs">
                  {g.items.map(i => <Checkbox key={i.value} checked={events.includes(i.value)} onChange={e => toggle(i.value, e.detail.checked)}>{i.label} <Box variant="small" display="inline" color="text-body-secondary">{i.value}</Box></Checkbox>)}
                </SpaceBetween>
              </FormField>
            ))}
          </ColumnLayout>
        </Container>
        <Container header={<Header variant="h2" description="Choose a destination to publish the event.">Destination</Header>}>
          <SpaceBetween size="l">
            <Tiles value={destType} onChange={e => { setDestType(e.detail.value); setDestArn(""); }} items={[
              { value: "lambda", label: "Lambda function", description: "Run a Lambda function script based on S3 events." },
              { value: "sns", label: "SNS topic", description: "Fanout messages to systems for parallel processing or directly to people." },
              { value: "sqs", label: "SQS queue", description: "Send notifications to an SQS queue to be read by a server." },
            ]} />
            <RadioGroup value={destMode} onChange={e => setDestMode(e.detail.value)} items={[{ value: "choose", label: `Choose from your ${destType === "sqs" ? "SQS queues" : destType === "sns" ? "SNS topics" : "Lambda functions"}` }, { value: "arn", label: "Enter ARN" }]} />
            {destMode === "choose"
              ? <Select selectedOption={(dests.data || []).find((d: any) => d.value === destArn) || null} placeholder="Choose" options={dests.data || []} statusType={dests.loading ? "loading" : "finished"} empty="None found" onChange={e => setDestArn(e.detail.selectedOption.value!)} />
              : <Input value={destArn} onChange={e => setDestArn(e.detail.value)} placeholder="arn:aws:…" />}
            <Checkbox checked={grant} onChange={e => setGrant(e.detail.checked)}
              description="S3 can only publish to a destination whose resource policy allows it. Otherwise saving fails with &quot;Unable to validate the following destination configurations&quot;. In the AWS console you'd edit that policy yourself.">
              Grant Amazon S3 permission to publish to this destination
            </Checkbox>
          </SpaceBetween>
        </Container>
      </>}
    </RulePage>
  );
}

// ---------- Intelligent-Tiering archive ----------
export function TieringForm() {
  const { bucket = "", id = "new" } = useParams();
  const isNew = id === "new";
  const [name, setName] = useState(isNew ? "" : id);
  const [scope, setScope] = useState("all");
  const [prefix, setPrefix] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [on, setOn] = useState(true);
  const [arch, setArch] = useState(true);
  const [archDays, setArchDays] = useState("90");
  const [deep, setDeep] = useState(false);
  const [deepDays, setDeepDays] = useState("180");
  const [load] = useState(() => isNew ? null : s3("GetBucketIntelligentTieringConfiguration", { Bucket: bucket, Id: id }).then((r: any) => {
    const c = r.IntelligentTieringConfiguration;
    setOn(c.Status === "Enabled");
    const f = parseFilter(c.Filter);
    setScope(f.prefix || f.tags.length ? "filter" : "all"); setPrefix(f.prefix); setTags(f.tags);
    const a = c.Tierings.find((t: any) => t.AccessTier === "ARCHIVE_ACCESS"); const d = c.Tierings.find((t: any) => t.AccessTier === "DEEP_ARCHIVE_ACCESS");
    setArch(!!a); if (a) setArchDays(String(a.Days)); setDeep(!!d); if (d) setDeepDays(String(d.Days));
  }));
  const validate = () => !name ? "Configuration name is required." : !arch && !deep ? "Choose at least one archive tier." : undefined;
  const save = async () => {
    const tierings = [arch && { Days: Number(archDays), AccessTier: "ARCHIVE_ACCESS" }, deep && { Days: Number(deepDays), AccessTier: "DEEP_ARCHIVE_ACCESS" }].filter(Boolean);
    const c: any = { Id: name, Status: on ? "Enabled" : "Disabled", Tierings: tierings };
    if (scope === "filter") c.Filter = buildFilter(prefix, tags);
    await s3("PutBucketIntelligentTieringConfiguration", { Bucket: bucket, Id: name, IntelligentTieringConfiguration: c });
  };
  return (
    <RulePage title={isNew ? "Create Intelligent-Tiering Archive configuration" : `Edit ${id}`} tab="properties" load={load} onSave={save} validate={validate}>
      {() => <>
        <Container header={<Header variant="h2">Archive configuration settings</Header>}>
          <SpaceBetween size="l">
            <FormField label="Configuration name"><Input value={name} disabled={!isNew} onChange={e => setName(e.detail.value)} /></FormField>
            <ScopeFields {...{ scope, setScope, prefix, setPrefix, tags, setTags }} what="configuration" />
            <FormField label="Status"><RadioGroup value={on ? "on" : "off"} onChange={e => setOn(e.detail.value === "on")} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} /></FormField>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2" description="Objects not accessed for the number of days you set move to the archive tiers.">Archive rule actions</Header>}>
          <SpaceBetween size="l">
            <Checkbox checked={arch} onChange={e => setArch(e.detail.checked)} description="Objects in this tier are retrieved in 3–5 hours.">Archive Access tier</Checkbox>
            {arch && <FormField label="Days until transition to the Archive Access tier" constraintText="Minimum 90 days, maximum 730 days."><Input type="number" value={archDays} onChange={e => setArchDays(e.detail.value)} /></FormField>}
            <Checkbox checked={deep} onChange={e => setDeep(e.detail.checked)} description="Objects in this tier are retrieved within 12 hours.">Deep Archive Access tier</Checkbox>
            {deep && <FormField label="Days until transition to the Deep Archive Access tier" constraintText="Minimum 180 days, maximum 730 days."><Input type="number" value={deepDays} onChange={e => setDeepDays(e.detail.value)} /></FormField>}
          </SpaceBetween>
        </Container>
      </>}
    </RulePage>
  );
}
