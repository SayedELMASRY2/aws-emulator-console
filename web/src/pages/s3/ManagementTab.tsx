import { useState } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ConfirmModal, ErrorAlert, useAsync, useFlash } from "../../common";
import { s3, getOr, storageClassLabel } from "./lib";

const scope = (f: any) => {
  if (!f) return "Entire bucket";
  const p = f.Prefix ?? f.And?.Prefix;
  const tags = f.Tag ? [f.Tag] : f.And?.Tags || [];
  const parts = [p ? `Prefix: ${p}` : null, ...tags.map((t: any) => `Tag: ${t.Key}=${t.Value}`), f.ObjectSizeGreaterThan ?? f.And?.ObjectSizeGreaterThan ? `Size > ${f.ObjectSizeGreaterThan ?? f.And?.ObjectSizeGreaterThan} B` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "Entire bucket";
};
const st = (s: string) => s === "Enabled" ? <StatusIndicator type="success">Enabled</StatusIndicator> : <StatusIndicator type="stopped">Disabled</StatusIndicator>;

export default function ManagementTab({ bucket }: { bucket: string }) {
  const flash = useFlash();
  const b = encodeURIComponent(bucket);
  const lc = useAsync(() => getOr("GetBucketLifecycleConfiguration", { Bucket: bucket }, { Rules: [] }).then((r: any) => r.Rules || []), [bucket]);
  const rep = useAsync(() => getOr("GetBucketReplication", { Bucket: bucket }, null).then((r: any) => r?.ReplicationConfiguration || null), [bucket]);
  const inv = useAsync(() => getOr("ListBucketInventoryConfigurations", { Bucket: bucket }, {}).then((r: any) => r.InventoryConfigurationList || []), [bucket]);
  const [selL, setSelL] = useState<any[]>([]);
  const [selR, setSelR] = useState<any[]>([]);
  const [selI, setSelI] = useState<any[]>([]);
  const [del, setDel] = useState<"" | "lc" | "rep" | "inv">("");

  const saveLifecycle = async (rules: any[]) => {
    if (rules.length) await s3("PutBucketLifecycleConfiguration", { Bucket: bucket, LifecycleConfiguration: { Rules: rules } });
    else await s3("DeleteBucketLifecycle", { Bucket: bucket });
    setSelL([]); lc.reload();
  };
  const setLcStatus = async (status: "Enabled" | "Disabled") => {
    try { await saveLifecycle(lc.data!.map((r: any) => selL.some(s => s.ID === r.ID) ? { ...r, Status: status } : r)); flash.notify({ type: "success", content: `Rules ${status.toLowerCase()}.` }); }
    catch (e) { flash.error(e); }
  };
  const setRepStatus = async (status: "Enabled" | "Disabled") => {
    try {
      await s3("PutBucketReplication", { Bucket: bucket, ReplicationConfiguration: { ...rep.data, Rules: rep.data.Rules.map((r: any) => selR.some(s => s.ID === r.ID) ? { ...r, Status: status } : r) } });
      flash.notify({ type: "success", content: `Rules ${status.toLowerCase()}.` }); setSelR([]); rep.reload();
    } catch (e) { flash.error(e); }
  };
  const lcActions = (r: any) => {
    const a: string[] = [];
    (r.Transitions || []).forEach((t: any) => a.push(`Transition to ${storageClassLabel(t.StorageClass)} after ${t.Days ?? t.Date} days`));
    if (r.Expiration?.Days) a.push(`Expire after ${r.Expiration.Days} days`);
    if (r.Expiration?.Date) a.push(`Expire on ${r.Expiration.Date}`);
    return a.join("; ") || "-";
  };
  const lcNoncurrent = (r: any) => {
    const a: string[] = [];
    (r.NoncurrentVersionTransitions || []).forEach((t: any) => a.push(`Transition to ${storageClassLabel(t.StorageClass)} after ${t.NoncurrentDays} days`));
    if (r.NoncurrentVersionExpiration) a.push(`Delete ${r.NoncurrentVersionExpiration.NoncurrentDays} days after becoming noncurrent${r.NoncurrentVersionExpiration.NewerNoncurrentVersions ? `, keep ${r.NoncurrentVersionExpiration.NewerNoncurrentVersions} newer` : ""}`);
    return a.join("; ") || "-";
  };

  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2" counter={`(${lc.data?.length || 0})`}
        description="Use lifecycle rules to define actions you want Amazon S3 to take during an object's lifetime such as transitioning objects to another storage class, archiving them, or deleting them after a specified period of time."
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Refresh" onClick={() => lc.reload()} />
          <Button disabled={selL.length !== 1} href={selL[0] ? `#/s3/buckets/${b}/lifecycle/${encodeURIComponent(selL[0].ID)}` : undefined}>Edit</Button>
          <Button disabled={!selL.length} onClick={() => setDel("lc")}>Delete</Button>
          <ButtonDropdown disabled={!selL.length} onItemClick={e => setLcStatus(e.detail.id as any)} items={[{ id: "Enabled", text: "Enable rule" }, { id: "Disabled", text: "Disable rule" }]}>Actions</ButtonDropdown>
          <Button variant="primary" href={`#/s3/buckets/${b}/lifecycle/new`}>Create lifecycle rule</Button>
        </SpaceBetween>}>Lifecycle rules</Header>}>
        {lc.error ? <ErrorAlert error={lc.error} /> : (
          <Table variant="embedded" loading={lc.loading} items={lc.data || []} trackBy="ID" selectionType="multi" selectedItems={selL} onSelectionChange={e => setSelL(e.detail.selectedItems)}
            empty={<Box textAlign="center" color="inherit"><b>No lifecycle rules</b><Box variant="p" color="inherit">There are no lifecycle rules for this bucket.</Box></Box>}
            columnDefinitions={[
              { id: "n", header: "Lifecycle rule name", cell: (r: any) => r.ID },
              { id: "s", header: "Status", cell: (r: any) => st(r.Status) },
              { id: "sc", header: "Scope", cell: (r: any) => scope(r.Filter) },
              { id: "c", header: "Current version actions", cell: lcActions },
              { id: "nc", header: "Noncurrent versions actions", cell: lcNoncurrent },
              { id: "dm", header: "Expired object delete markers", cell: (r: any) => r.Expiration?.ExpiredObjectDeleteMarker ? "Delete" : "-" },
              { id: "mp", header: "Incomplete multipart uploads", cell: (r: any) => r.AbortIncompleteMultipartUpload ? `Delete after ${r.AbortIncompleteMultipartUpload.DaysAfterInitiation} days` : "-" },
            ]} />
        )}
      </Container>

      <Container header={<Header variant="h2" counter={`(${rep.data?.Rules?.length || 0})`}
        description="Use replication rules to define options you want Amazon S3 to apply during replication such as server-side encryption, replica ownership, transitioning replicas to another storage class, and more."
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Refresh" onClick={() => rep.reload()} />
          <Button disabled={selR.length !== 1} href={selR[0] ? `#/s3/buckets/${b}/replication/${encodeURIComponent(selR[0].ID)}` : undefined}>Edit rule</Button>
          <Button disabled={!selR.length} onClick={() => setDel("rep")}>Delete</Button>
          <ButtonDropdown disabled={!selR.length} onItemClick={e => setRepStatus(e.detail.id as any)} items={[{ id: "Enabled", text: "Enable rule" }, { id: "Disabled", text: "Disable rule" }]}>Actions</ButtonDropdown>
          <Button variant="primary" href={`#/s3/buckets/${b}/replication/new`}>Create replication rule</Button>
        </SpaceBetween>}>Replication rules</Header>}>
        {rep.error ? <ErrorAlert error={rep.error} /> : (
          <Table variant="embedded" loading={rep.loading} items={rep.data?.Rules || []} trackBy="ID" selectionType="multi" selectedItems={selR} onSelectionChange={e => setSelR(e.detail.selectedItems)}
            empty={<Box textAlign="center" color="inherit"><b>No replication rules</b><Box variant="p" color="inherit">There are no replication rules for this bucket. Replication needs Bucket Versioning on the source and destination.</Box></Box>}
            columnDefinitions={[
              { id: "n", header: "Replication rule name", cell: (r: any) => r.ID },
              { id: "s", header: "Status", cell: (r: any) => st(r.Status) },
              { id: "d", header: "Destination bucket", cell: (r: any) => String(r.Destination?.Bucket || "").replace("arn:aws:s3:::", "") },
              { id: "r", header: "Destination Region", cell: () => "US East (N. Virginia) us-east-1" },
              { id: "p", header: "Priority", cell: (r: any) => r.Priority ?? "-" },
              { id: "sc", header: "Scope", cell: (r: any) => scope(r.Filter) },
              { id: "c", header: "Storage class", cell: (r: any) => r.Destination?.StorageClass ? storageClassLabel(r.Destination.StorageClass) : "Same as source" },
              { id: "o", header: "Replica owner", cell: (r: any) => r.Destination?.AccessControlTranslation ? "Destination bucket owner" : "Same as source" },
              { id: "dm", header: "Delete marker replication", cell: (r: any) => r.DeleteMarkerReplication?.Status || "-" },
            ]} />
        )}
        {rep.data?.Role && <Box variant="small" color="text-body-secondary" margin={{ top: "s" }}>IAM role: {rep.data.Role}</Box>}
      </Container>

      <Container header={<Header variant="h2" counter={`(${inv.data?.length || 0})`}
        description="You can create inventory configurations on a bucket to generate a flat file list of your objects and metadata. These scheduled reports can include all objects in the bucket or be limited to a shared prefix."
        actions={<SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Refresh" onClick={() => inv.reload()} />
          <Button disabled={selI.length !== 1} href={selI[0] ? `#/s3/buckets/${b}/inventory/${encodeURIComponent(selI[0].Id)}` : undefined}>Edit</Button>
          <Button disabled={!selI.length} onClick={() => setDel("inv")}>Delete</Button>
          <Button variant="primary" href={`#/s3/buckets/${b}/inventory/new`}>Create inventory configuration</Button>
        </SpaceBetween>}>Inventory configurations</Header>}>
        {inv.error ? <ErrorAlert error={inv.error} /> : (
          <Table variant="embedded" loading={inv.loading} items={inv.data || []} trackBy="Id" selectionType="multi" selectedItems={selI} onSelectionChange={e => setSelI(e.detail.selectedItems)}
            empty={<Box textAlign="center" color="inherit"><b>No inventory configurations</b></Box>}
            columnDefinitions={[
              { id: "n", header: "Name", cell: (c: any) => c.Id },
              { id: "s", header: "Status", cell: (c: any) => st(c.IsEnabled ? "Enabled" : "Disabled") },
              { id: "sc", header: "Scope", cell: (c: any) => c.Filter?.Prefix ? `Prefix: ${c.Filter.Prefix}` : "Entire bucket" },
              { id: "d", header: "Destination", cell: (c: any) => `${String(c.Destination?.S3BucketDestination?.Bucket || "").replace("arn:aws:s3:::", "s3://")}/${c.Destination?.S3BucketDestination?.Prefix || ""}` },
              { id: "f", header: "Frequency", cell: (c: any) => c.Schedule?.Frequency },
              { id: "fm", header: "Format", cell: (c: any) => c.Destination?.S3BucketDestination?.Format },
              { id: "v", header: "Object versions", cell: (c: any) => c.IncludedObjectVersions === "All" ? "Include all versions" : "Current version only" },
            ]} />
        )}
      </Container>

      <ConfirmModal visible={!!del} onDismiss={() => setDel("")} header="Delete" confirmText="delete"
        onConfirm={async () => {
          try {
            if (del === "lc") await saveLifecycle(lc.data!.filter((r: any) => !selL.some(s => s.ID === r.ID)));
            if (del === "rep") {
              const rest = rep.data.Rules.filter((r: any) => !selR.some(s => s.ID === r.ID));
              if (rest.length) await s3("PutBucketReplication", { Bucket: bucket, ReplicationConfiguration: { ...rep.data, Rules: rest } });
              else await s3("DeleteBucketReplication", { Bucket: bucket });
              setSelR([]); rep.reload();
            }
            if (del === "inv") { for (const c of selI) await s3("DeleteBucketInventoryConfiguration", { Bucket: bucket, Id: c.Id }); setSelI([]); inv.reload(); }
            flash.notify({ type: "success", content: "Deleted." });
          } catch (e) { flash.error(e); }
          setDel("");
        }}>
        <Box>Delete {(del === "lc" ? selL.map(r => r.ID) : del === "rep" ? selR.map(r => r.ID) : selI.map(r => r.Id)).join(", ")}?</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}
