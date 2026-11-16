import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Badge from "@cloudscape-design/components/badge";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ConfirmModal, Copyable, ErrorAlert, fmtBytes, fmtDate, useAsync, useFlash, ValueWithLabel } from "../../common";
import { s3, getOr, bucketHref, objectHref, s3Uri, objectArn, objectUrl, storageClassLabel } from "./lib";
import { encLabel, metaFromHead } from "./fields";
import { Section } from "./PropertiesTab";
import { aclMatrix } from "./PermissionsTab";

export default function ObjectDetail() {
  const { bucket = "" } = useParams();
  const [sp] = useSearchParams();
  const key = sp.get("key") || "";
  const versionId = sp.get("versionId") || undefined;
  const nav = useNavigate();
  const flash = useFlash();
  const [tab, setTab] = useState("properties");
  const [delV, setDelV] = useState<any[] | null>(null);
  const [selV, setSelV] = useState<any[]>([]);
  const parts = key.split("/").filter(Boolean);
  const name = parts[parts.length - 1] || key;
  useCrumbs([
    { text: "Amazon S3", href: "#/s3/buckets" }, { text: "Buckets", href: "#/s3/buckets" }, { text: bucket, href: bucketHref(bucket) },
    ...parts.slice(0, -1).map((p, i) => ({ text: p + "/", href: bucketHref(bucket, "objects", parts.slice(0, i + 1).join("/") + "/") })),
    { text: name, href: "#" },
  ]);
  const V = versionId ? { VersionId: versionId } : {};
  const d = useAsync(async () => {
    const head = await s3("HeadObject", { Bucket: bucket, Key: key, ...V });
    const [tags, acl, attrs, hold, ret, own, lockCfg, ver, versions] = await Promise.all([
      getOr("GetObjectTagging", { Bucket: bucket, Key: key, ...V }, { TagSet: [] }),
      getOr("GetObjectAcl", { Bucket: bucket, Key: key, ...V }, { Grants: [] }),
      getOr("GetObjectAttributes", { Bucket: bucket, Key: key, ...V, ObjectAttributes: ["ETag", "Checksum", "ObjectParts", "StorageClass", "ObjectSize"] }, {}),
      getOr("GetObjectLegalHold", { Bucket: bucket, Key: key, ...V }, null).catch(() => null),
      getOr("GetObjectRetention", { Bucket: bucket, Key: key, ...V }, null).catch(() => null),
      getOr("GetBucketOwnershipControls", { Bucket: bucket }, null),
      getOr("GetObjectLockConfiguration", { Bucket: bucket }, null),
      getOr("GetBucketVersioning", { Bucket: bucket }, {}),
      s3("ListObjectVersions", { Bucket: bucket, Prefix: key }).then((r: any) => [
        ...(r.Versions || []).filter((v: any) => v.Key === key),
        ...(r.DeleteMarkers || []).filter((v: any) => v.Key === key).map((v: any) => ({ ...v, deleteMarker: true })),
      ].sort((a, b) => String(b.LastModified).localeCompare(String(a.LastModified)))).catch(() => []),
    ]);
    return { head, tags: tags.TagSet || [], acl, attrs, hold: hold?.LegalHold?.Status, ret: ret?.Retention, aclsEnabled: !!own && own.OwnershipControls?.Rules?.[0]?.ObjectOwnership !== "BucketOwnerEnforced", lock: lockCfg?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled", versioning: ver.Status || "Disabled", versions };
  }, [bucket, key, versionId]);

  const editUrl = (s: string) => `#/s3/buckets/${encodeURIComponent(bucket)}/object/edit/${s}?${new URLSearchParams({ key, ...(versionId ? { versionId } : {}) })}`;
  const copy = (t: string, w: string) => navigator.clipboard.writeText(t).then(() => flash.notify({ type: "success", content: `${w} copied` }));

  if (d.loading && !d.data) return <Box textAlign="center" padding="xl"><Spinner size="large" /></Box>;
  if (d.error) return <ErrorAlert error={d.error} />;
  const o = d.data!;
  const h = o.head;
  const checks = o.attrs?.Checksum || {};

  const properties = (
    <SpaceBetween size="l">
      <Section title="Object overview">
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Owner">{o.acl.Owner?.DisplayName || o.acl.Owner?.ID?.slice(0, 16) || "-"}</ValueWithLabel>
          <ValueWithLabel label="AWS Region">US East (N. Virginia) us-east-1</ValueWithLabel>
          <ValueWithLabel label="Last modified">{fmtDate(h.LastModified)}</ValueWithLabel>
          <ValueWithLabel label="Size">{fmtBytes(h.ContentLength)}</ValueWithLabel>
          <ValueWithLabel label="Type">{name.includes(".") ? name.split(".").pop() : "-"}</ValueWithLabel>
          <ValueWithLabel label="Key"><Copyable text={key} label="key" /></ValueWithLabel>
          <ValueWithLabel label="S3 URI"><Copyable text={s3Uri(bucket, key)} label="S3 URI" /></ValueWithLabel>
          <ValueWithLabel label="Amazon Resource Name (ARN)"><Copyable text={objectArn(bucket, key)} label="ARN" /></ValueWithLabel>
          <ValueWithLabel label="Entity tag (Etag)">{String(h.ETag || "").replace(/"/g, "")}</ValueWithLabel>
          <ValueWithLabel label="Object URL"><span style={{ wordBreak: "break-all" }}><Copyable text={objectUrl(bucket, key)} label="URL" /></span></ValueWithLabel>
          {h.VersionId && <ValueWithLabel label="Version ID">{h.VersionId}</ValueWithLabel>}
        </ColumnLayout>
      </Section>
      <Section title="Object management overview" description="The following bucket properties and object management configurations impact the behavior of this object.">
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Bucket Versioning">{o.versioning}</ValueWithLabel>
          <ValueWithLabel label="Replication status">{h.ReplicationStatus || "-"}</ValueWithLabel>
          <ValueWithLabel label="Expiration rule">{h.Expiration || "-"}</ValueWithLabel>
          {h.Restore && <ValueWithLabel label="Restoration status">{h.Restore}</ValueWithLabel>}
        </ColumnLayout>
      </Section>
      <Section title="Storage class" edit={versionId ? undefined : editUrl("storage-class")} description="Amazon S3 offers a range of storage classes designed for different use cases.">
        <ValueWithLabel label="Storage class">{storageClassLabel(h.StorageClass)}</ValueWithLabel>
      </Section>
      <Section title="Server-side encryption settings" edit={versionId ? undefined : editUrl("encryption")} description="Server-side encryption protects data at rest.">
        <ColumnLayout columns={3} variant="text-grid">
          <ValueWithLabel label="Encryption">{h.ServerSideEncryption ? "Enabled" : "Disabled"}</ValueWithLabel>
          <ValueWithLabel label="Encryption type">{h.ServerSideEncryption ? encLabel(h.ServerSideEncryption) : "-"}</ValueWithLabel>
          <ValueWithLabel label="Bucket Key">{h.ServerSideEncryption === "aws:kms" ? (h.BucketKeyEnabled ? "Enabled" : "Disabled") : "-"}</ValueWithLabel>
          {h.SSEKMSKeyId && <ValueWithLabel label="Encryption key ARN">{h.SSEKMSKeyId}</ValueWithLabel>}
        </ColumnLayout>
      </Section>
      <Section title="Additional checksums" description="Checksum functions are used for additional data integrity verification of new objects.">
        {Object.keys(checks).filter(k => k.startsWith("Checksum")).length
          ? <ColumnLayout columns={2} variant="text-grid">{Object.entries(checks).filter(([k]) => k.startsWith("Checksum") && k !== "ChecksumType").map(([k, v]) => <ValueWithLabel key={k} label={k.replace("Checksum", "")}>{String(v)}</ValueWithLabel>)}</ColumnLayout>
          : <ValueWithLabel label="Additional checksums">Off</ValueWithLabel>}
      </Section>
      <Section title="Tags" counter={`(${o.tags.length})`} edit={editUrl("tags")} description="You can use object tags to analyze, manage, and specify permissions for objects.">
        <Table variant="embedded" items={o.tags} empty={<Box textAlign="center" color="inherit"><b>No tags</b><Box variant="p" color="inherit">There are no tags associated with this resource.</Box></Box>}
          columnDefinitions={[{ id: "k", header: "Key", cell: (t: any) => t.Key }, { id: "v", header: "Value", cell: (t: any) => t.Value || "-" }]} />
      </Section>
      <Section title="Metadata" counter={`(${metaFromHead(h).length})`} edit={versionId ? undefined : editUrl("metadata")} description="Metadata is optional information provided as a name-value (key-value) pair.">
        <Table variant="embedded" items={metaFromHead(h)} empty={<Box textAlign="center" color="inherit">No metadata</Box>}
          columnDefinitions={[{ id: "t", header: "Type", cell: m => m.type === "system" ? "System defined" : "User defined" }, { id: "k", header: "Key", cell: m => m.key }, { id: "v", header: "Value", cell: m => m.value }]} />
      </Section>
      {o.lock && <>
        <Section title="Object Lock legal hold" edit={editUrl("legal-hold")} description="Prevent an object version from being overwritten or deleted. A legal hold has no expiration date.">
          <ValueWithLabel label="Legal hold">{o.hold === "ON" ? <StatusIndicator type="warning">Enabled</StatusIndicator> : <StatusIndicator type="stopped">Disabled</StatusIndicator>}</ValueWithLabel>
        </Section>
        <Section title="Object Lock retention" edit={editUrl("retention")} description="Prevent an object version from being overwritten or deleted for a fixed amount of time.">
          <ColumnLayout columns={2} variant="text-grid">
            <ValueWithLabel label="Retention mode">{o.ret?.Mode ? (o.ret.Mode === "GOVERNANCE" ? "Governance mode" : "Compliance mode") : "Disabled"}</ValueWithLabel>
            <ValueWithLabel label="Retain until date">{o.ret?.RetainUntilDate ? fmtDate(o.ret.RetainUntilDate) : "-"}</ValueWithLabel>
          </ColumnLayout>
        </Section>
      </>}
    </SpaceBetween>
  );

  const permissions = (
    <Container header={<Header variant="h2" description="Grant basic read/write permissions to other AWS accounts." actions={<Button disabled={!o.aclsEnabled} href={o.aclsEnabled ? editUrl("acl") : undefined}>Edit</Button>}>Access control list (ACL)</Header>}>
      <SpaceBetween size="s">
        {!o.aclsEnabled && <Alert type="info">This bucket has the bucket owner enforced setting applied for Object Ownership. When bucket owner enforced is applied, use bucket policies to control access.</Alert>}
        <Table variant="embedded" items={aclMatrix(o.acl.Grants).map(r => ({ ...r }))} columnDefinitions={[
          { id: "g", header: "Grantee", cell: r => r.grantee },
          { id: "o", header: "Object", cell: r => r.objects.replace("List", "Read") },
          { id: "a", header: "Object ACL", cell: r => r.acl },
        ]} />
      </SpaceBetween>
    </Container>
  );

  const versions = (
    <Table
      header={<Header counter={`(${o.versions.length})`} description="Versions of this object, newest first."
        actions={<Button disabled={!selV.length} onClick={() => setDelV(selV)}>Delete</Button>}>Versions</Header>}
      items={o.versions} trackBy="VersionId" selectionType="multi" selectedItems={selV} onSelectionChange={e => setSelV(e.detail.selectedItems)}
      empty={<Box textAlign="center" color="inherit">This bucket isn't versioned. Only the current object exists.</Box>}
      columnDefinitions={[
        { id: "v", header: "Version ID", cell: (v: any) => v.deleteMarker ? <SpaceBetween direction="horizontal" size="xs"><span>{v.VersionId}</span><Badge color="red">Delete marker</Badge></SpaceBetween> : <Link href={objectHref(bucket, key, v.VersionId)}>{v.VersionId}</Link> },
        { id: "c", header: "", cell: (v: any) => v.IsLatest ? <Badge color="blue">Current version</Badge> : null },
        { id: "m", header: "Last modified", cell: (v: any) => fmtDate(v.LastModified) },
        { id: "s", header: "Size", cell: (v: any) => v.deleteMarker ? "-" : fmtBytes(v.Size) },
        { id: "sc", header: "Storage class", cell: (v: any) => v.deleteMarker ? "-" : storageClassLabel(v.StorageClass) },
        { id: "a", header: "", cell: (v: any) => v.deleteMarker ? null : <Link href={api.downloadUrl(bucket, key, { versionId: v.VersionId })}>Download</Link> },
      ]} />
  );

  return (
    <ContentLayout header={
      <Header variant="h1" description={versionId ? `Version ${versionId}` : undefined}
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="copy" onClick={() => copy(s3Uri(bucket, key), "S3 URI")}>Copy S3 URI</Button>
          <Button iconName="download" href={api.downloadUrl(bucket, key, { versionId })}>Download</Button>
          <Button iconName="external" iconAlign="right" target="_blank" href={api.downloadUrl(bucket, key, { inline: true, versionId })}>Open</Button>
          <ButtonDropdown onItemClick={e => {
            const id = e.detail.id;
            if (id === "presign") api.presign(bucket, key, 3600, versionId).then(r => copy(r.url, "Presigned URL (valid 1 hour)"), err => flash.error(err));
            else if (id === "delete") setDelV([{ VersionId: versionId, current: !versionId }]);
            else nav(editUrl(id).slice(1));
          }} items={[
            { id: "presign", text: "Copy presigned URL (1 hour)" },
            { id: "storage-class", text: "Edit storage class", disabled: !!versionId },
            { id: "encryption", text: "Edit server-side encryption", disabled: !!versionId },
            { id: "metadata", text: "Edit metadata", disabled: !!versionId },
            { id: "tags", text: "Edit tags" },
            { id: "delete", text: "Delete" },
          ]}>Object actions</ButtonDropdown>
        </SpaceBetween>}>{name}</Header>
    }>
      <SpaceBetween size="l">
        {h.DeleteMarker && <Alert type="warning">This version is a delete marker.</Alert>}
        <Tabs activeTabId={tab} onChange={e => setTab(e.detail.activeTabId)} tabs={[
          { id: "properties", label: "Properties", content: properties },
          { id: "permissions", label: "Permissions", content: permissions },
          { id: "versions", label: "Versions", content: versions },
        ]} />
      </SpaceBetween>
      <ConfirmModal visible={!!delV} onDismiss={() => setDelV(null)} header="Delete object" confirmText={delV?.some(v => v.VersionId) ? "permanently delete" : "delete"} confirmLabel="Delete"
        onConfirm={async () => {
          try {
            for (const v of delV!) await s3("DeleteObject", { Bucket: bucket, Key: key, ...(v.VersionId ? { VersionId: v.VersionId } : {}) });
            flash.notify({ type: "success", content: `Deleted ${key}${delV!.some(v => v.VersionId) ? " (selected versions)" : ""}.` });
            setDelV(null); setSelV([]);
            if (delV!.some(v => v.current) || delV!.some(v => v.VersionId === versionId)) nav(bucketHref(bucket, "objects", key.replace(/[^/]+$/, "")).slice(1).replace(/^/, ""));
            else d.reload();
          } catch (e) { flash.error(e); setDelV(null); }
        }}>
        {delV?.some(v => v.VersionId)
          ? <Alert type="warning">Deleting a specific version permanently removes it. This can't be undone.</Alert>
          : <Box>{o.versioning === "Enabled" ? "A delete marker will be added; earlier versions remain." : "The object will be permanently deleted."}</Box>}
      </ConfirmModal>
    </ContentLayout>
  );
}
