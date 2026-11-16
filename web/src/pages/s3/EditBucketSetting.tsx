// "Edit <setting>" pages for a bucket, one per Properties/Permissions section.
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
import Textarea from "@cloudscape-design/components/textarea";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Table from "@cloudscape-design/components/table";
import Spinner from "@cloudscape-design/components/spinner";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync, useFlash } from "../../common";
import { s3, getOr, bucketHref, bucketArn, toTagSet, fromTagSet, DEFAULT_POLICY_TEMPLATE, type KV } from "./lib";
import { BlockPublicAccessFields, BPA_NONE, EncryptionFields, encFromConfig, encToConfig, Tags, type BPA, type Enc } from "./fields";

type Def = { title: string; tab: string; description?: string; load: (b: string) => Promise<any>; render: (v: any, set: (v: any) => void, ctx: { bucket: string; submitted: boolean }) => ReactNode; save: (b: string, v: any) => Promise<void>; validate?: (v: any) => string | undefined };

const json = (s: string) => { try { JSON.parse(s); return undefined; } catch (e: any) { return `Invalid JSON: ${e.message}`; } };

const DEFS: Record<string, Def> = {
  versioning: {
    title: "Edit Bucket Versioning", tab: "properties",
    load: async b => (await getOr("GetBucketVersioning", { Bucket: b }, {})).Status || "",
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket.">Bucket Versioning</Header>}>
        <SpaceBetween size="m">
          <RadioGroup value={v === "Enabled" ? "Enabled" : "Suspended"} onChange={e => set(e.detail.value)} items={[
            { value: "Suspended", label: v === "" ? "Disable" : "Suspend", description: v === "" ? undefined : "This suspends the creation of object versions for all operations but preserves any existing object versions." },
            { value: "Enabled", label: "Enable" },
          ]} />
          {v !== "Enabled" && v !== "" && <Alert type="info">After you suspend versioning, existing versions are kept. New uploads get the version ID "null".</Alert>}
          <Box variant="small" color="text-body-secondary">Multi-factor authentication (MFA) delete can only be changed using the AWS CLI, SDK or REST API.</Box>
        </SpaceBetween>
      </Container>
    ),
    save: async (b, v) => { if (v === "" ) return; await s3("PutBucketVersioning", { Bucket: b, VersioningConfiguration: { Status: v } }); },
  },
  tags: {
    title: "Edit bucket tags", tab: "properties",
    load: async b => fromTagSet((await getOr("GetBucketTagging", { Bucket: b }, { TagSet: [] })).TagSet),
    render: (v, set) => <Container header={<Header variant="h2" description="You can use bucket tags to track storage costs and organize buckets.">Tags</Header>}><Tags tags={v} onChange={set} /></Container>,
    save: async (b, v: KV[]) => { const ts = toTagSet(v); if (ts.length) await s3("PutBucketTagging", { Bucket: b, Tagging: { TagSet: ts } }); else await s3("DeleteBucketTagging", { Bucket: b }); },
  },
  encryption: {
    title: "Edit default encryption", tab: "properties",
    load: async b => encFromConfig(await getOr("GetBucketEncryption", { Bucket: b }, null)),
    render: (v: Enc, set) => (
      <Container header={<Header variant="h2" description="Server-side encryption is automatically applied to new objects stored in this bucket.">Default encryption</Header>}>
        <SpaceBetween size="m"><EncryptionFields value={v} onChange={set} />
          <Alert type="info">Changing the default encryption affects only new objects. Existing objects keep their encryption.</Alert></SpaceBetween>
      </Container>
    ),
    save: async (b, v) => { await s3("PutBucketEncryption", { Bucket: b, ServerSideEncryptionConfiguration: encToConfig(v) }); },
  },
  logging: {
    title: "Edit server access logging", tab: "properties",
    load: async b => {
      const l = (await getOr("GetBucketLogging", { Bucket: b }, {})).LoggingEnabled;
      return { on: !!l, target: l ? `s3://${l.TargetBucket}/${l.TargetPrefix || ""}` : "", format: l?.TargetObjectKeyFormat?.PartitionedPrefix ? "partitioned" : "simple", source: l?.TargetObjectKeyFormat?.PartitionedPrefix?.PartitionDateSource || "EventTime" };
    },
    render: (v, set, { submitted }) => (
      <Container header={<Header variant="h2" description="Server access logging provides detailed records for the requests that are made to a bucket.">Server access logging</Header>}>
        <SpaceBetween size="l">
          <RadioGroup value={v.on ? "on" : "off"} onChange={e => set({ ...v, on: e.detail.value === "on" })} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
          {v.on && <>
            <FormField label="Destination" description="Choose a destination bucket in the same Region and account. Format: s3://bucket/prefix" errorText={submitted && !/^s3:\/\/[^/]+\/?/.test(v.target) ? "Enter an S3 URI like s3://bucket/prefix/" : undefined}>
              <Input value={v.target} placeholder="s3://bucket/prefix" onChange={e => set({ ...v, target: e.detail.value })} />
            </FormField>
            <FormField label="Log object key format">
              <RadioGroup value={v.format} onChange={e => set({ ...v, format: e.detail.value })} items={[
                { value: "simple", label: "[DestinationPrefix][YYYY]-[MM]-[DD]-[hh]-[mm]-[ss]-[UniqueString]" },
                { value: "partitioned", label: "[DestinationPrefix][SourceAccountId]/[SourceRegion]/[SourceBucket]/[YYYY]/[MM]/[DD]/[YYYY]-[MM]-[DD]-[hh]-[mm]-[ss]-[UniqueString]" },
              ]} />
            </FormField>
            {v.format === "partitioned" && <FormField label="Source of date used in log object key format">
              <RadioGroup value={v.source} onChange={e => set({ ...v, source: e.detail.value })} items={[{ value: "EventTime", label: "S3 event time" }, { value: "DeliveryTime", label: "Log file delivery time" }]} />
            </FormField>}
          </>}
        </SpaceBetween>
      </Container>
    ),
    validate: v => v.on && !/^s3:\/\/[^/]+/.test(v.target) ? "Destination is required." : undefined,
    save: async (b, v) => {
      if (!v.on) { await s3("PutBucketLogging", { Bucket: b, BucketLoggingStatus: {} }); return; }
      const [, tb, tp] = v.target.match(/^s3:\/\/([^/]+)\/?(.*)$/)!;
      const le: any = { TargetBucket: tb, TargetPrefix: tp };
      le.TargetObjectKeyFormat = v.format === "partitioned" ? { PartitionedPrefix: { PartitionDateSource: v.source } } : { SimplePrefix: {} };
      await s3("PutBucketLogging", { Bucket: b, BucketLoggingStatus: { LoggingEnabled: le } });
    },
  },
  eventbridge: {
    title: "Edit Amazon EventBridge", tab: "properties",
    load: async b => !!(await getOr("GetBucketNotificationConfiguration", { Bucket: b }, {})).EventBridgeConfiguration,
    render: (v, set) => (
      <Container header={<Header variant="h2" description="For additional capabilities, use Amazon EventBridge to build event-driven applications at scale using S3 event notifications.">Amazon EventBridge</Header>}>
        <FormField label="Send notifications to Amazon EventBridge for all events in this bucket">
          <RadioGroup value={v ? "on" : "off"} onChange={e => set(e.detail.value === "on")} items={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} />
        </FormField>
      </Container>
    ),
    save: async (b, v) => {
      const cur = await getOr("GetBucketNotificationConfiguration", { Bucket: b }, {});
      const cfg: any = {};
      for (const k of ["QueueConfigurations", "TopicConfigurations", "LambdaFunctionConfigurations"]) if (cur[k]?.length) cfg[k] = cur[k];
      if (v) cfg.EventBridgeConfiguration = {};
      await s3("PutBucketNotificationConfiguration", { Bucket: b, NotificationConfiguration: cfg });
    },
  },
  accelerate: {
    title: "Edit transfer acceleration", tab: "properties",
    load: async b => (await getOr("GetBucketAccelerateConfiguration", { Bucket: b }, {})).Status === "Enabled",
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Use an accelerated endpoint for faster data transfers. Additional data transfer charges may apply.">Transfer acceleration</Header>}>
        <RadioGroup value={v ? "on" : "off"} onChange={e => set(e.detail.value === "on")} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
      </Container>
    ),
    save: async (b, v) => { await s3("PutBucketAccelerateConfiguration", { Bucket: b, AccelerateConfiguration: { Status: v ? "Enabled" : "Suspended" } }); },
  },
  "object-lock": {
    title: "Edit Object Lock", tab: "properties",
    load: async b => {
      const r = (await getOr("GetObjectLockConfiguration", { Bucket: b }, null))?.ObjectLockConfiguration?.Rule?.DefaultRetention;
      return { on: !!r, mode: r?.Mode || "GOVERNANCE", period: String(r?.Days || r?.Years || 1), unit: r?.Years ? "Years" : "Days" };
    },
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely.">Object Lock</Header>}>
        <SpaceBetween size="l">
          <FormField label="Default retention" description="Automatically protect new objects put into this bucket from being deleted or overwritten.">
            <RadioGroup value={v.on ? "on" : "off"} onChange={e => set({ ...v, on: e.detail.value === "on" })} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
          </FormField>
          {v.on && <>
            <FormField label="Default retention mode">
              <RadioGroup value={v.mode} onChange={e => set({ ...v, mode: e.detail.value })} items={[
                { value: "GOVERNANCE", label: "Governance", description: "Users with specific IAM permissions can overwrite or delete protected object versions during the retention period." },
                { value: "COMPLIANCE", label: "Compliance", description: "No users can overwrite or delete protected object versions during the retention period." },
              ]} />
            </FormField>
            <FormField label="Default retention period">
              <SpaceBetween direction="horizontal" size="xs">
                <Input type="number" value={v.period} onChange={e => set({ ...v, period: e.detail.value })} />
                <Select selectedOption={{ value: v.unit, label: v.unit }} options={[{ value: "Days", label: "Days" }, { value: "Years", label: "Years" }]} onChange={e => set({ ...v, unit: e.detail.selectedOption.value })} />
              </SpaceBetween>
            </FormField>
          </>}
        </SpaceBetween>
      </Container>
    ),
    save: async (b, v) => {
      const cfg: any = { ObjectLockEnabled: "Enabled" };
      if (v.on) cfg.Rule = { DefaultRetention: { Mode: v.mode, [v.unit]: Number(v.period) } };
      await s3("PutObjectLockConfiguration", { Bucket: b, ObjectLockConfiguration: cfg });
    },
  },
  "requester-pays": {
    title: "Edit requester pays", tab: "properties",
    load: async b => (await getOr("GetBucketRequestPayment", { Bucket: b }, {})).Payer === "Requester",
    render: (v, set) => (
      <Container header={<Header variant="h2" description="When enabled, the requester pays for requests and data transfer costs, and anonymous access to this bucket is disabled.">Requester pays</Header>}>
        <RadioGroup value={v ? "on" : "off"} onChange={e => set(e.detail.value === "on")} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
      </Container>
    ),
    save: async (b, v) => { await s3("PutBucketRequestPayment", { Bucket: b, RequestPaymentConfiguration: { Payer: v ? "Requester" : "BucketOwner" } }); },
  },
  website: {
    title: "Edit static website hosting", tab: "properties",
    load: async b => {
      const w = await getOr("GetBucketWebsite", { Bucket: b }, null);
      return {
        on: !!w, type: w?.RedirectAllRequestsTo ? "redirect" : "host",
        index: w?.IndexDocument?.Suffix || "index.html", error: w?.ErrorDocument?.Key || "",
        rules: w?.RoutingRules ? JSON.stringify(w.RoutingRules, null, 2) : "",
        host: w?.RedirectAllRequestsTo?.HostName || "", proto: w?.RedirectAllRequestsTo?.Protocol || "",
      };
    },
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Use this bucket to host a website or redirect requests.">Static website hosting</Header>}>
        <SpaceBetween size="l">
          <RadioGroup value={v.on ? "on" : "off"} onChange={e => set({ ...v, on: e.detail.value === "on" })} items={[{ value: "off", label: "Disable" }, { value: "on", label: "Enable" }]} />
          {v.on && <>
            <FormField label="Hosting type">
              <RadioGroup value={v.type} onChange={e => set({ ...v, type: e.detail.value })} items={[
                { value: "host", label: "Host a static website", description: "Use the bucket endpoint as the web address." },
                { value: "redirect", label: "Redirect requests for an object", description: "Redirect requests to another bucket or domain." },
              ]} />
            </FormField>
            {v.type === "host" ? <>
              <Alert type="info">For your customers to access content at the website endpoint, you must make all your content publicly readable. To do so, you can edit the S3 Block Public Access settings for the bucket.</Alert>
              <FormField label="Index document" description="Specify the home or default page of the website."><Input value={v.index} onChange={e => set({ ...v, index: e.detail.value })} /></FormField>
              <FormField label={<>Error document - <i>optional</i></>} description="This is returned when an error occurs."><Input value={v.error} placeholder="error.html" onChange={e => set({ ...v, error: e.detail.value })} /></FormField>
              <FormField label={<>Redirection rules - <i>optional</i></>} description="Redirection rules, written in JSON, automatically redirect webpage requests for specific content." errorText={v.rules ? json(v.rules) : undefined}>
                <Textarea rows={8} value={v.rules} onChange={e => set({ ...v, rules: e.detail.value })} placeholder='[{"Condition":{"KeyPrefixEquals":"docs/"},"Redirect":{"ReplaceKeyPrefixWith":"documents/"}}]' />
              </FormField>
            </> : <>
              <FormField label="Host name" description="Use a bucket or domain."><Input value={v.host} onChange={e => set({ ...v, host: e.detail.value })} /></FormField>
              <FormField label="Protocol - optional">
                <RadioGroup value={v.proto} onChange={e => set({ ...v, proto: e.detail.value })} items={[{ value: "", label: "none" }, { value: "http", label: "http" }, { value: "https", label: "https" }]} />
              </FormField>
            </>}
          </>}
        </SpaceBetween>
      </Container>
    ),
    validate: v => !v.on ? undefined : v.type === "host" ? (!v.index ? "Index document is required." : v.rules ? json(v.rules) : undefined) : (!v.host ? "Host name is required." : undefined),
    save: async (b, v) => {
      if (!v.on) { await s3("DeleteBucketWebsite", { Bucket: b }); return; }
      const cfg: any = v.type === "host"
        ? { IndexDocument: { Suffix: v.index }, ...(v.error ? { ErrorDocument: { Key: v.error } } : {}), ...(v.rules ? { RoutingRules: JSON.parse(v.rules) } : {}) }
        : { RedirectAllRequestsTo: { HostName: v.host, ...(v.proto ? { Protocol: v.proto } : {}) } };
      await s3("PutBucketWebsite", { Bucket: b, WebsiteConfiguration: cfg });
    },
  },
  "block-public-access": {
    title: "Edit Block public access (bucket settings)", tab: "permissions",
    load: async b => (await getOr("GetPublicAccessBlock", { Bucket: b }, null))?.PublicAccessBlockConfiguration || BPA_NONE,
    render: (v: BPA, set) => (
      <Container header={<Header variant="h2" description="Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to all your S3 buckets and objects is blocked, turn on Block all public access. These settings apply only to this bucket and its access points.">Block public access (bucket settings)</Header>}>
        <BlockPublicAccessFields value={v} onChange={set} />
      </Container>
    ),
    save: async (b, v) => {
      if (Object.values(v).some(Boolean)) await s3("PutPublicAccessBlock", { Bucket: b, PublicAccessBlockConfiguration: v });
      else await s3("DeletePublicAccessBlock", { Bucket: b });
    },
  },
  policy: {
    title: "Edit bucket policy", tab: "permissions",
    load: async b => {
      const p = (await getOr("GetBucketPolicy", { Bucket: b }, null))?.Policy;
      return p ? JSON.stringify(JSON.parse(p), null, 2) : "";
    },
    render: (v, set, { bucket }) => (
      <Container header={<Header variant="h2" description="The bucket policy, written in JSON, provides access to the objects stored in the bucket. Bucket policies don't apply to objects owned by other accounts."
        actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" onClick={() => set(DEFAULT_POLICY_TEMPLATE(bucket))}>Insert example</Button></SpaceBetween>}>Bucket policy</Header>}>
        <SpaceBetween size="m">
          <FormField label="Bucket ARN"><Box variant="code">{bucketArn(bucket)}</Box></FormField>
          <FormField label="Policy" errorText={v ? json(v) : undefined} constraintText="The emulator stores the policy but doesn't evaluate it.">
            <Textarea rows={22} value={v} onChange={e => set(e.detail.value)} spellcheck={false} placeholder='{"Version": "2012-10-17", "Statement": []}' />
          </FormField>
        </SpaceBetween>
      </Container>
    ),
    validate: v => v ? json(v) : undefined,
    save: async (b, v) => { if (v.trim()) await s3("PutBucketPolicy", { Bucket: b, Policy: v }); else await s3("DeleteBucketPolicy", { Bucket: b }); },
  },
  ownership: {
    title: "Edit Object Ownership", tab: "permissions",
    load: async b => (await getOr("GetBucketOwnershipControls", { Bucket: b }, null))?.OwnershipControls?.Rules?.[0]?.ObjectOwnership || "BucketOwnerEnforced",
    render: (v, set) => (
      <Container header={<Header variant="h2" description="Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs). Object ownership determines who can specify access to objects.">Object Ownership</Header>}>
        <SpaceBetween size="l">
          <Tiles value={v === "BucketOwnerEnforced" ? "disabled" : "enabled"} onChange={e => set(e.detail.value === "disabled" ? "BucketOwnerEnforced" : "BucketOwnerPreferred")} items={[
            { value: "disabled", label: "ACLs disabled (recommended)", description: "All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies." },
            { value: "enabled", label: "ACLs enabled", description: "Objects in this bucket can be owned by other AWS accounts. Access to this bucket and its objects can be specified using ACLs." },
          ]} />
          {v !== "BucketOwnerEnforced" && <FormField label="Object Ownership">
            <RadioGroup value={v} onChange={e => set(e.detail.value)} items={[
              { value: "BucketOwnerPreferred", label: "Bucket owner preferred", description: "If new objects written to this bucket specify the bucket-owner-full-control canned ACL, they are owned by the bucket owner. Otherwise, they are owned by the object writer." },
              { value: "ObjectWriter", label: "Object writer", description: "The object writer remains the object owner." },
            ]} />
          </FormField>}
        </SpaceBetween>
      </Container>
    ),
    save: async (b, v) => { await s3("PutBucketOwnershipControls", { Bucket: b, OwnershipControls: { Rules: [{ ObjectOwnership: v }] } }); },
  },
  acl: {
    title: "Edit access control list (ACL)", tab: "permissions",
    load: async b => {
      const acl = await s3("GetBucketAcl", { Bucket: b });
      const has = (uri: string | null, p: string) => (acl.Grants || []).some((g: any) => (uri ? g.Grantee?.URI?.endsWith(uri) : g.Grantee?.ID === acl.Owner?.ID) && (g.Permission === p || g.Permission === "FULL_CONTROL"));
      const row = (uri: string | null) => ({ READ: has(uri, "READ"), WRITE: has(uri, "WRITE"), READ_ACP: has(uri, "READ_ACP"), WRITE_ACP: has(uri, "WRITE_ACP") });
      return { owner: acl.Owner, rows: { owner: row(null), all: row("AllUsers"), auth: row("AuthenticatedUsers"), log: row("LogDelivery") } };
    },
    render: (v, set) => {
      const groups = [
        { k: "owner", label: "Bucket owner (your AWS account)" },
        { k: "all", label: "Everyone (public access)" },
        { k: "auth", label: "Authenticated users group (anyone with an AWS account)" },
        { k: "log", label: "S3 log delivery group" },
      ];
      const cb = (k: string, p: string) => <Checkbox checked={v.rows[k][p]} onChange={e => set({ ...v, rows: { ...v.rows, [k]: { ...v.rows[k], [p]: e.detail.checked } } })}>{p.includes("ACP") ? (p.startsWith("READ") ? "Read" : "Write") : p === "READ" ? "List" : "Write"}</Checkbox>;
      const pub = v.rows.all.READ || v.rows.all.WRITE || v.rows.auth.READ || v.rows.auth.WRITE;
      return (
        <Container header={<Header variant="h2" description="Grant basic read/write permissions to AWS accounts.">Access control list (ACL)</Header>}>
          <SpaceBetween size="m">
            <Table variant="embedded" items={groups} columnDefinitions={[
              { id: "g", header: "Grantee", cell: g => g.label },
              { id: "o", header: "Objects", cell: g => <SpaceBetween direction="horizontal" size="m">{cb(g.k, "READ")}{cb(g.k, "WRITE")}</SpaceBetween> },
              { id: "a", header: "Bucket ACL", cell: g => <SpaceBetween direction="horizontal" size="m">{cb(g.k, "READ_ACP")}{cb(g.k, "WRITE_ACP")}</SpaceBetween> },
            ]} />
            {pub && <Alert type="warning">Granting access to Everyone or Authenticated users makes the bucket public.</Alert>}
          </SpaceBetween>
        </Container>
      );
    },
    save: async (b, v) => {
      const uri: Record<string, string> = { all: "http://acs.amazonaws.com/groups/global/AllUsers", auth: "http://acs.amazonaws.com/groups/global/AuthenticatedUsers", log: "http://acs.amazonaws.com/groups/s3/LogDelivery" };
      const grants: any[] = [];
      for (const [k, perms] of Object.entries<any>(v.rows))
        for (const [p, on] of Object.entries(perms)) if (on)
          grants.push({ Grantee: k === "owner" ? { Type: "CanonicalUser", ID: v.owner.ID } : { Type: "Group", URI: uri[k] }, Permission: p });
      await s3("PutBucketAcl", { Bucket: b, AccessControlPolicy: { Owner: v.owner, Grants: grants } });
    },
  },
  cors: {
    title: "Edit cross-origin resource sharing (CORS)", tab: "permissions",
    load: async b => { const c = await getOr("GetBucketCors", { Bucket: b }, null); return c?.CORSRules ? JSON.stringify(c.CORSRules, null, 2) : ""; },
    render: (v, set) => (
      <Container header={<Header variant="h2" description="The CORS configuration, written in JSON, defines a way for client web applications that are loaded in one domain to interact with resources in a different domain."
        actions={<Button formAction="none" onClick={() => set(JSON.stringify([{ AllowedHeaders: ["*"], AllowedMethods: ["GET", "PUT", "POST"], AllowedOrigins: ["http://localhost:3000"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3000 }], null, 2))}>Insert example</Button>}>Cross-origin resource sharing (CORS)</Header>}>
        <FormField errorText={v ? json(v) : undefined}><Textarea rows={18} value={v} onChange={e => set(e.detail.value)} spellcheck={false} placeholder="[ ]" /></FormField>
      </Container>
    ),
    validate: v => v ? json(v) : undefined,
    save: async (b, v) => {
      const rules = v.trim() ? JSON.parse(v) : [];
      if (rules.length) await s3("PutBucketCors", { Bucket: b, CORSConfiguration: { CORSRules: rules } });
      else await s3("DeleteBucketCors", { Bucket: b });
    },
  },
};

export default function EditBucketSetting() {
  const { bucket = "", setting = "" } = useParams();
  const def = DEFS[setting];
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: "Buckets", href: "#/s3/buckets" }, { text: bucket, href: bucketHref(bucket, def?.tab) }, { text: def?.title || setting, href: "#" }]);
  const init = useAsync(() => def ? def.load(bucket) : Promise.resolve(null), [bucket, setting]);
  const [v, setV] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (init.data !== undefined) setV(init.data); }, [init.data]);
  if (!def) return <Alert type="error">Unknown setting "{setting}".</Alert>;
  const back = () => nav({ pathname: `/s3/buckets/${encodeURIComponent(bucket)}`, search: `?tab=${def.tab}` });
  const save = async () => {
    setSubmitted(true);
    const problem = def.validate?.(v);
    if (problem) { setErr(new Error(problem)); return; }
    setBusy(true); setErr(null);
    try {
      await def.save(bucket, v);
      flash.notify({ type: "success", content: `Successfully edited ${def.title.replace(/^Edit /, "")}.` });
      back();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description={def.description}>{def.title}</Header>}>
      {init.loading || v === undefined ? <Box textAlign="center" padding="xl"><Spinner size="large" /></Box> : init.error ? <ErrorAlert error={init.error} /> : (
        <form onSubmit={e => { e.preventDefault(); save(); }}>
          <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
            actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={back}>Cancel</Button><Button variant="primary" loading={busy}>Save changes</Button></SpaceBetween>}>
            {def.render(v, setV, { bucket, submitted })}
          </Form>
        </form>
      )}
    </ContentLayout>
  );
}
