import { useState } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { ConfirmModal, Copyable, ErrorAlert, useAsync, useFlash, ValueWithLabel } from "../../common";
import { getOr, s3, editHref, bucketArn, grantLabel } from "./lib";
import { Section } from "./PropertiesTab";

export function JsonBlock({ value, empty }: { value?: string | null; empty: string }) {
  if (!value) return <Box color="text-body-secondary">{empty}</Box>;
  let pretty = value;
  try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch { /* raw */ }
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", right: 8, top: 8 }}><Copyable text={pretty} label="JSON" iconOnly /></div>
      <pre style={{ margin: 0, padding: 12, borderRadius: 8, overflow: "auto", maxHeight: 420, fontSize: 13, border: "1px solid var(--color-border-divider-default-cx07f2, #c6c6cd)" }}>{pretty}</pre>
    </div>
  );
}

export function aclMatrix(grants: any[]) {
  const by = new Map<string, { label: string; perms: Set<string> }>();
  for (const g of grants || []) {
    const k = g.Grantee?.URI || g.Grantee?.ID || g.Grantee?.EmailAddress || "?";
    if (!by.has(k)) by.set(k, { label: grantLabel(g), perms: new Set() });
    by.get(k)!.perms.add(g.Permission);
  }
  return [...by.values()].map(v => {
    const has = (p: string) => v.perms.has(p) || v.perms.has("FULL_CONTROL");
    return { grantee: v.label, objects: [has("READ") && "List", has("WRITE") && "Write"].filter(Boolean).join(", ") || "-", acl: [has("READ_ACP") && "Read", has("WRITE_ACP") && "Write"].filter(Boolean).join(", ") || "-" };
  });
}

export default function PermissionsTab({ bucket }: { bucket: string }) {
  const flash = useFlash();
  const [delPolicy, setDelPolicy] = useState(false);
  const d = useAsync(async () => {
    const g = (op: string, fb: any) => getOr(op, { Bucket: bucket }, fb);
    const [bpa, policy, status, own, acl, cors] = await Promise.all([
      g("GetPublicAccessBlock", null), g("GetBucketPolicy", null), g("GetBucketPolicyStatus", null),
      g("GetBucketOwnershipControls", null), g("GetBucketAcl", { Grants: [] }), g("GetBucketCors", null),
    ]);
    return { bpa: bpa?.PublicAccessBlockConfiguration, policy: policy?.Policy as string | undefined, isPublic: !!status?.PolicyStatus?.IsPublic, own: own?.OwnershipControls?.Rules?.[0]?.ObjectOwnership || "BucketOwnerEnforced", acl, cors: cors?.CORSRules };
  }, [bucket]);
  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  const p = d.data!;
  const bpa = p.bpa || { BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false };
  const allBlocked = Object.values(bpa).every(Boolean);
  const aclPublic = (p.acl.Grants || []).some((g: any) => /AllUsers|AuthenticatedUsers/.test(g.Grantee?.URI || ""));
  const access = allBlocked || (!p.isPublic && !aclPublic) ? "Bucket and objects not public" : p.isPublic ? "Public" : "Objects can be public";
  const aclsDisabled = p.own === "BucketOwnerEnforced";
  const on = (b: boolean) => b ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>;

  return (
    <SpaceBetween size="l">
      <Section title="Permissions overview">
        <ValueWithLabel label="Access">
          {access === "Public" ? <StatusIndicator type="warning">Public</StatusIndicator> : access === "Objects can be public" ? <StatusIndicator type="info">Objects can be public</StatusIndicator> : <StatusIndicator type="success">Bucket and objects not public</StatusIndicator>}
        </ValueWithLabel>
        <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>Worked out from Block Public Access, the bucket policy status and the ACL. The emulator stores these but doesn't enforce access.</Box>
      </Section>

      <Section title="Block public access (bucket settings)" edit={editHref(bucket, "block-public-access")}
        description="Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to all your S3 buckets and objects is blocked, turn on Block all public access.">
        <SpaceBetween size="s">
          <ValueWithLabel label="Block all public access">{allBlocked ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>}</ValueWithLabel>
          <ColumnLayout columns={2} variant="text-grid">
            <ValueWithLabel label="Block public access to buckets and objects granted through new access control lists (ACLs)">{on(bpa.BlockPublicAcls)}</ValueWithLabel>
            <ValueWithLabel label="Block public access to buckets and objects granted through any access control lists (ACLs)">{on(bpa.IgnorePublicAcls)}</ValueWithLabel>
            <ValueWithLabel label="Block public access to buckets and objects granted through new public bucket or access point policies">{on(bpa.BlockPublicPolicy)}</ValueWithLabel>
            <ValueWithLabel label="Block public and cross-account access to buckets and objects through any public bucket or access point policies">{on(bpa.RestrictPublicBuckets)}</ValueWithLabel>
          </ColumnLayout>
        </SpaceBetween>
      </Section>

      <Container header={<Header variant="h2" description="The bucket policy, written in JSON, provides access to the objects stored in the bucket. Bucket policies don't apply to objects owned by other accounts."
        actions={<SpaceBetween direction="horizontal" size="xs"><Button href={editHref(bucket, "policy")}>Edit</Button><Button disabled={!p.policy} onClick={() => setDelPolicy(true)}>Delete</Button></SpaceBetween>}>Bucket policy</Header>}>
        <JsonBlock value={p.policy} empty="No policy to display." />
      </Container>

      <Section title="Object Ownership" edit={editHref(bucket, "ownership")} description="Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs). Object ownership determines who can specify access to objects.">
        <ValueWithLabel label={p.own === "BucketOwnerEnforced" ? "Bucket owner enforced" : p.own === "BucketOwnerPreferred" ? "Bucket owner preferred" : "Object writer"}>
          {p.own === "BucketOwnerEnforced"
            ? "ACLs are disabled. All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies."
            : p.own === "BucketOwnerPreferred"
              ? "ACLs are enabled. Objects uploaded with the bucket-owner-full-control canned ACL are owned by the bucket owner; otherwise the object writer owns them."
              : "ACLs are enabled. The object writer remains the object owner."}
        </ValueWithLabel>
      </Section>

      <Container header={<Header variant="h2" description="Grant basic read/write permissions to other AWS accounts."
        actions={<Button href={aclsDisabled ? undefined : editHref(bucket, "acl")} disabled={aclsDisabled}>Edit</Button>}>Access control list (ACL)</Header>}>
        <SpaceBetween size="s">
          {aclsDisabled && <Alert type="info">This bucket has the bucket owner enforced setting applied for Object Ownership. When bucket owner enforced is applied, use bucket policies to control access.</Alert>}
          <Table variant="embedded" items={aclMatrix(p.acl.Grants)} columnDefinitions={[
            { id: "g", header: "Grantee", cell: r => r.grantee },
            { id: "o", header: "Objects", cell: r => r.objects },
            { id: "a", header: "Bucket ACL", cell: r => r.acl },
          ]} />
        </SpaceBetween>
      </Container>

      <Section title="Cross-origin resource sharing (CORS)" edit={editHref(bucket, "cors")} description="The CORS configuration, written in JSON, defines a way for client web applications that are loaded in one domain to interact with resources in a different domain.">
        <JsonBlock value={p.cors ? JSON.stringify(p.cors) : null} empty="No configurations to display." />
      </Section>

      <ConfirmModal visible={delPolicy} onDismiss={() => setDelPolicy(false)} header="Delete bucket policy" confirmText="delete"
        onConfirm={async () => {
          try { await s3("DeleteBucketPolicy", { Bucket: bucket }); flash.notify({ type: "success", content: "Successfully deleted bucket policy." }); d.reload(); }
          catch (e) { flash.error(e); }
          setDelPolicy(false);
        }}>
        <Box>The policy for <b>{bucketArn(bucket)}</b> will be deleted. This can't be undone.</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}
