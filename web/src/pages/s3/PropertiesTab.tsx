import { useState, type ReactNode } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import { ConfirmModal, Copyable, EmulatorNote, ErrorAlert, fmtDate, useAsync, useFlash, ValueWithLabel } from "../../common";
import { s3, getOr, bucketArn, editHref, bucketHref } from "./lib";
import { encLabel } from "./fields";

export function Section({ title, description, edit, actions, children, counter }: { title: string; description?: ReactNode; edit?: string; actions?: ReactNode; children: ReactNode; counter?: string }) {
  return (
    <Container header={<Header variant="h2" counter={counter} description={description}
      actions={actions || (edit ? <Button href={edit}>Edit</Button> : undefined)}>{title}</Header>}>
      {children}
    </Container>
  );
}
export const Enabled = ({ on, onText = "Enabled", offText = "Disabled" }: { on: boolean; onText?: string; offText?: string }) =>
  on ? <StatusIndicator type="success">{onText}</StatusIndicator> : <StatusIndicator type="stopped">{offText}</StatusIndicator>;

async function loadProps(bucket: string) {
  const g = (op: string, fb: any, extra: Record<string, unknown> = {}) => getOr(op, { Bucket: bucket, ...extra }, fb).catch((e: unknown) => ({ __error: e }));
  const [list, ver, tags, enc, tier, log, notif, acc, lock, pay, web] = await Promise.all([
    s3("ListBuckets").catch(() => ({ Buckets: [] })),
    g("GetBucketVersioning", {}), g("GetBucketTagging", { TagSet: [] }), g("GetBucketEncryption", null),
    g("ListBucketIntelligentTieringConfigurations", { IntelligentTieringConfigurationList: [] }),
    g("GetBucketLogging", {}), g("GetBucketNotificationConfiguration", {}), g("GetBucketAccelerateConfiguration", {}),
    g("GetObjectLockConfiguration", null), g("GetBucketRequestPayment", { Payer: "BucketOwner" }), g("GetBucketWebsite", null),
  ]);
  return { created: list.Buckets.find((b: any) => b.Name === bucket)?.CreationDate, ver, tags, enc, tier, log, notif, acc, lock, pay, web };
}

export default function PropertiesTab({ bucket }: { bucket: string }) {
  const flash = useFlash();
  const d = useAsync(() => loadProps(bucket), [bucket]);
  const [del, setDel] = useState<{ kind: "notif" | "tier"; ids: string[] } | null>(null);
  const [selNotif, setSelNotif] = useState<any[]>([]);
  const [selTier, setSelTier] = useState<any[]>([]);
  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  const p = d.data!;
  const b = encodeURIComponent(bucket);

  const notifs: any[] = [
    ...(p.notif.QueueConfigurations || []).map((c: any) => ({ ...c, destType: "SQS queue", dest: c.QueueArn })),
    ...(p.notif.TopicConfigurations || []).map((c: any) => ({ ...c, destType: "SNS topic", dest: c.TopicArn })),
    ...(p.notif.LambdaFunctionConfigurations || []).map((c: any) => ({ ...c, destType: "Lambda function", dest: c.LambdaFunctionArn })),
  ];
  const filterText = (c: any) => (c.Filter?.Key?.FilterRules || []).map((r: any) => `${r.Name}: ${r.Value}`).join(", ") || "-";
  const website = p.web && !p.web.__error ? p.web : null;
  const encRule = p.enc?.ServerSideEncryptionConfiguration?.Rules?.[0];
  const lockOn = p.lock?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled";
  const lockRule = p.lock?.ObjectLockConfiguration?.Rule?.DefaultRetention;

  const removeNotifs = async (ids: string[]) => {
    const cfg = { ...p.notif };
    for (const k of ["QueueConfigurations", "TopicConfigurations", "LambdaFunctionConfigurations"])
      if (cfg[k]) cfg[k] = cfg[k].filter((c: any) => !ids.includes(c.Id));
    await s3("PutBucketNotificationConfiguration", { Bucket: bucket, NotificationConfiguration: cfg });
  };

  return (
    <SpaceBetween size="l">
      <Section title="Bucket overview">
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="AWS Region">US East (N. Virginia) us-east-1</ValueWithLabel>
          <ValueWithLabel label="Amazon Resource Name (ARN)"><Copyable text={bucketArn(bucket)} label="ARN" /></ValueWithLabel>
          <ValueWithLabel label="Creation date">{fmtDate(p.created)}</ValueWithLabel>
        </ColumnLayout>
      </Section>

      <Section title="Bucket Versioning" edit={editHref(bucket, "versioning")}
        description="Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket.">
        <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="Bucket Versioning">{p.ver.Status === "Enabled" ? <StatusIndicator type="success">Enabled</StatusIndicator> : p.ver.Status === "Suspended" ? <StatusIndicator type="warning">Suspended</StatusIndicator> : <StatusIndicator type="stopped">Disabled</StatusIndicator>}</ValueWithLabel>
          <ValueWithLabel label="Multi-factor authentication (MFA) delete">{p.ver.MFADelete === "Enabled" ? "Enabled" : "Disabled"}<Box variant="small" display="block" color="text-body-secondary">An additional layer of security that requires multi-factor authentication for changing Bucket Versioning settings and permanently deleting object versions. To modify MFA delete settings, use the AWS CLI, AWS SDK, or the Amazon S3 REST API.</Box></ValueWithLabel>
        </ColumnLayout>
      </Section>

      <Section title="Tags" counter={`(${p.tags.TagSet?.length || 0})`} edit={editHref(bucket, "tags")} description="You can use bucket tags to track storage costs and organize buckets.">
        <Table variant="embedded" items={p.tags.TagSet || []} empty={<Box textAlign="center" color="inherit"><b>No tags</b><Box variant="p" color="inherit">There are no tags associated with this resource.</Box></Box>}
          columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value || "-" }]} />
      </Section>

      <Section title="Default encryption" edit={editHref(bucket, "encryption")} description="Server-side encryption is automatically applied to new objects stored in this bucket.">
        <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="Encryption type">{encLabel(encRule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm)}</ValueWithLabel>
          <ValueWithLabel label="Bucket Key">{encRule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === "aws:kms" ? <Enabled on={!!encRule?.BucketKeyEnabled} /> : "-"}</ValueWithLabel>
          {encRule?.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID && <ValueWithLabel label="AWS KMS key ARN">{encRule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID}</ValueWithLabel>}
        </ColumnLayout>
      </Section>

      <Container header={<Header variant="h2" counter={`(${p.tier.IntelligentTieringConfigurationList?.length || 0})`}
        description="Enable objects stored in the Intelligent-Tiering storage class to tier-down to the Archive Access tier or the Deep Archive Access tier, which are optimized for objects that will be rarely accessed for long periods of time."
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!selTier.length} onClick={() => setDel({ kind: "tier", ids: selTier.map(t => t.Id) })}>Delete</Button>
          <Button disabled={selTier.length !== 1} href={selTier[0] ? `#/s3/buckets/${b}/tiering/${encodeURIComponent(selTier[0].Id)}` : undefined}>Edit</Button>
          <Button href={`#/s3/buckets/${b}/tiering/new`}>Create configuration</Button>
        </SpaceBetween>}>Intelligent-Tiering Archive configurations</Header>}>
        <Table variant="embedded" selectionType="multi" selectedItems={selTier} onSelectionChange={e => setSelTier(e.detail.selectedItems)} trackBy="Id"
          items={p.tier.IntelligentTieringConfigurationList || []}
          empty={<Box textAlign="center" color="inherit"><b>No archive configurations</b><Box variant="p" color="inherit">Choose Create configuration to archive Intelligent-Tiering objects.</Box></Box>}
          columnDefinitions={[
            { id: "n", header: "Name", cell: (t: any) => t.Id },
            { id: "s", header: "Status", cell: (t: any) => <Enabled on={t.Status === "Enabled"} /> },
            { id: "sc", header: "Scope", cell: (t: any) => t.Filter?.Prefix || t.Filter?.And?.Prefix ? `Prefix: ${t.Filter.Prefix || t.Filter.And.Prefix}` : "Entire bucket" },
            { id: "a", header: "Archive Access tier", cell: (t: any) => { const x = t.Tierings.find((y: any) => y.AccessTier === "ARCHIVE_ACCESS"); return x ? `After ${x.Days} days` : "-"; } },
            { id: "d", header: "Deep Archive Access tier", cell: (t: any) => { const x = t.Tierings.find((y: any) => y.AccessTier === "DEEP_ARCHIVE_ACCESS"); return x ? `After ${x.Days} days` : "-"; } },
          ]} />
      </Container>

      <Section title="Server access logging" edit={editHref(bucket, "logging")} description="Log requests for access to your bucket.">
        {p.log.LoggingEnabled
          ? <ColumnLayout columns={2} variant="text-grid">
              <ValueWithLabel label="Server access logging"><StatusIndicator type="success">Enabled</StatusIndicator></ValueWithLabel>
              <ValueWithLabel label="Destination bucket"><Link href={bucketHref(p.log.LoggingEnabled.TargetBucket)}>s3://{p.log.LoggingEnabled.TargetBucket}/{p.log.LoggingEnabled.TargetPrefix}</Link></ValueWithLabel>
            </ColumnLayout>
          : <ValueWithLabel label="Server access logging"><StatusIndicator type="stopped">Disabled</StatusIndicator></ValueWithLabel>}
      </Section>

      <Section title="AWS CloudTrail data events" description="Configure CloudTrail data events to log Amazon S3 object-level API operations in the CloudTrail console.">
        <EmulatorNote>CloudTrail isn't part of this console. The emulator doesn't record data events.</EmulatorNote>
      </Section>

      <Container header={<Header variant="h2" counter={`(${notifs.length})`} description="Send a notification when specific events occur in your bucket."
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!selNotif.length} onClick={() => setDel({ kind: "notif", ids: selNotif.map(n => n.Id) })}>Delete</Button>
          <Button disabled={selNotif.length !== 1} href={selNotif[0] ? `#/s3/buckets/${b}/notification/${encodeURIComponent(selNotif[0].Id)}` : undefined}>Edit</Button>
          <Button href={`#/s3/buckets/${b}/notification/new`}>Create event notification</Button>
        </SpaceBetween>}>Event notifications</Header>}>
        <Table variant="embedded" selectionType="multi" selectedItems={selNotif} onSelectionChange={e => setSelNotif(e.detail.selectedItems)} trackBy="Id" items={notifs}
          empty={<Box textAlign="center" color="inherit"><b>No event notifications</b><Box variant="p" color="inherit">Choose Create event notification to be notified when a specific event occurs.</Box></Box>}
          columnDefinitions={[
            { id: "n", header: "Name", cell: (c: any) => c.Id },
            { id: "e", header: "Event types", cell: (c: any) => c.Events.join(", ") },
            { id: "f", header: "Filters", cell: filterText },
            { id: "t", header: "Destination type", cell: (c: any) => c.destType },
            { id: "d", header: "Destination", cell: (c: any) => c.dest },
          ]} />
      </Container>

      <Section title="Amazon EventBridge" edit={editHref(bucket, "eventbridge")} description="For additional capabilities, use Amazon EventBridge to build event-driven applications at scale using S3 event notifications.">
        <ValueWithLabel label="Send notifications to Amazon EventBridge for all events in this bucket">{p.notif.EventBridgeConfiguration ? "On" : "Off"}</ValueWithLabel>
      </Section>

      <Section title="Transfer acceleration" edit={editHref(bucket, "accelerate")} description="Use an accelerated endpoint for faster data transfers.">
        <ValueWithLabel label="Transfer acceleration"><Enabled on={p.acc.Status === "Enabled"} /></ValueWithLabel>
      </Section>

      <Section title="Object Lock" edit={lockOn ? editHref(bucket, "object-lock") : undefined} description="Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely.">
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Object Lock"><Enabled on={lockOn} /></ValueWithLabel>
          {lockOn && <ValueWithLabel label="Default retention mode">{lockRule?.Mode ? (lockRule.Mode === "GOVERNANCE" ? "Governance" : "Compliance") : "Disabled"}</ValueWithLabel>}
          {lockOn && <ValueWithLabel label="Default retention period">{lockRule ? (lockRule.Days ? `${lockRule.Days} days` : `${lockRule.Years} years`) : "-"}</ValueWithLabel>}
        </ColumnLayout>
        {!lockOn && <Box variant="small" color="text-body-secondary">Object Lock can only be turned on when the bucket is created.</Box>}
      </Section>

      <Section title="Requester pays" edit={editHref(bucket, "requester-pays")} description="When enabled, the requester pays for requests and data transfer costs, and anonymous access to this bucket is disabled.">
        <ValueWithLabel label="Requester pays"><Enabled on={p.pay.Payer === "Requester"} /></ValueWithLabel>
      </Section>

      <Section title="Static website hosting" edit={editHref(bucket, "website")} description="Use this bucket to host a website or redirect requests.">
        {website
          ? <ColumnLayout columns={2} variant="text-grid">
              <ValueWithLabel label="Static website hosting"><StatusIndicator type="success">Enabled</StatusIndicator></ValueWithLabel>
              <ValueWithLabel label="Hosting type">{website.RedirectAllRequestsTo ? "Redirect requests for an object" : "Bucket hosting"}</ValueWithLabel>
              {website.IndexDocument && <ValueWithLabel label="Index document">{website.IndexDocument.Suffix}</ValueWithLabel>}
              {website.ErrorDocument && <ValueWithLabel label="Error document">{website.ErrorDocument.Key}</ValueWithLabel>}
              {website.RedirectAllRequestsTo && <ValueWithLabel label="Redirect to">{website.RedirectAllRequestsTo.Protocol ? website.RedirectAllRequestsTo.Protocol + "://" : ""}{website.RedirectAllRequestsTo.HostName}</ValueWithLabel>}
              <ValueWithLabel label="Bucket website endpoint">http://{bucket}.s3-website-us-east-1.amazonaws.com<Box variant="small" display="block" color="text-body-secondary">This is the AWS address; it doesn't resolve on your machine.</Box></ValueWithLabel>
            </ColumnLayout>
          : <ValueWithLabel label="Static website hosting"><StatusIndicator type="stopped">Disabled</StatusIndicator></ValueWithLabel>}
      </Section>

      <ConfirmModal visible={!!del} onDismiss={() => setDel(null)} header={del?.kind === "notif" ? "Delete event notifications" : "Delete archive configurations"} confirmLabel="Delete"
        onConfirm={async () => {
          try {
            if (del!.kind === "notif") await removeNotifs(del!.ids);
            else for (const id of del!.ids) await s3("DeleteBucketIntelligentTieringConfiguration", { Bucket: bucket, Id: id });
            flash.notify({ type: "success", content: `Deleted ${del!.ids.join(", ")}.` });
            setSelNotif([]); setSelTier([]); d.reload();
          } catch (e) { flash.error(e); }
          setDel(null);
        }}>
        <Box>Delete {del?.ids.join(", ")}? This can't be undone.</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}
