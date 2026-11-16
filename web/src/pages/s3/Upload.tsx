import { useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import FormField from "@cloudscape-design/components/form-field";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Checkbox from "@cloudscape-design/components/checkbox";
import Alert from "@cloudscape-design/components/alert";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import Link from "@cloudscape-design/components/link";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { fmtBytes, useAsync, ValueWithLabel, errText } from "../../common";
import { getOr, bucketHref, s3Uri, toTagSet, type KV } from "./lib";
import { StorageClassPicker, EncryptionFields, ENC_DEFAULT, Tags, MetadataEditor, metaToParams, encLabel, type Enc, type Meta } from "./fields";

type Item = { file: File; path: string; status?: "pending" | "uploading" | "done" | "error"; error?: string };

export default function Upload() {
  const { bucket = "" } = useParams();
  const [sp] = useSearchParams();
  const prefix = sp.get("prefix") || "";
  const nav = useNavigate();
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: "Buckets", href: "#/s3/buckets" }, { text: bucket, href: bucketHref(bucket, "objects", prefix) }, { text: "Upload", href: "#" }]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [acl, setAcl] = useState("private");
  const [pubAck, setPubAck] = useState(false);
  const [cls, setCls] = useState("STANDARD");
  const [encMode, setEncMode] = useState("default");
  const [enc, setEnc] = useState<Enc>(ENC_DEFAULT);
  const [checksum, setChecksum] = useState("");
  const [tags, setTags] = useState<KV[]>([]);
  const [meta, setMeta] = useState<Meta[]>([]);
  const [phase, setPhase] = useState<"edit" | "uploading" | "done">("edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const dest = useAsync(async () => {
    const [v, e, own, lock] = await Promise.all([
      getOr("GetBucketVersioning", { Bucket: bucket }, {}), getOr("GetBucketEncryption", { Bucket: bucket }, null),
      getOr("GetBucketOwnershipControls", { Bucket: bucket }, null), getOr("GetObjectLockConfiguration", { Bucket: bucket }, null),
    ]);
    return { versioning: v.Status || "Disabled", enc: e?.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm, aclsEnabled: own?.OwnershipControls?.Rules?.[0]?.ObjectOwnership !== "BucketOwnerEnforced" && !!own, lock: lock?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled" };
  }, [bucket]);

  const add = (files: File[]) => setItems(xs => {
    const seen = new Set(xs.map(x => x.path));
    return [...xs, ...files.map(f => ({ file: f, path: (f as any).webkitRelativePath || (f as any)._path || f.name })).filter(x => !seen.has(x.path))];
  });

  // Drag-and-drop with folder support via webkitGetAsEntry.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const out: File[] = [];
    const walk = async (entry: any, path: string): Promise<void> => {
      if (entry.isFile) await new Promise<void>(res => entry.file((f: File) => { (f as any)._path = path + f.name; out.push(f); res(); }, () => res()));
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch: any[] = [];
        do { batch = await new Promise<any[]>(res => reader.readEntries(res, () => res([]))); for (const c of batch) await walk(c, path + entry.name + "/"); } while (batch.length);
      }
    };
    const entries = [...e.dataTransfer.items].map(i => (i as any).webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) { for (const en of entries) await walk(en, ""); add(out); }
    else add([...e.dataTransfer.files]);
  };

  const total = items.reduce((a, i) => a + i.file.size, 0);
  const done = items.filter(i => i.status === "done");
  const failed = items.filter(i => i.status === "error");
  const canUpload = items.length > 0 && (acl !== "public-read" || pubAck);

  const upload = async () => {
    setPhase("uploading");
    const opts: Record<string, unknown> = { StorageClass: cls, ...metaToParams(meta) };
    if (encMode === "specify") { opts.ServerSideEncryption = enc.type; if (enc.type !== "AES256" && enc.kmsKey) opts.SSEKMSKeyId = enc.kmsKey; if (enc.type === "aws:kms") opts.BucketKeyEnabled = enc.bucketKey; }
    if (checksum) opts.ChecksumAlgorithm = checksum;
    const ts = toTagSet(tags);
    if (ts.length) opts.Tagging = ts.map(t => `${encodeURIComponent(t.Key)}=${encodeURIComponent(t.Value)}`).join("&");
    if (dest.data?.aclsEnabled && acl !== "private") opts.ACL = acl;
    for (let i = 0; i < items.length; i++) {
      setItems(xs => xs.map((x, j) => j === i ? { ...x, status: "uploading" } : x));
      try {
        await api.upload(bucket, prefix + items[i].path, items[i].file, { ...opts, ContentType: (opts.ContentType as string) || items[i].file.type || undefined });
        setItems(xs => xs.map((x, j) => j === i ? { ...x, status: "done" } : x));
      } catch (e) {
        setItems(xs => xs.map((x, j) => j === i ? { ...x, status: "error", error: errText(e) } : x));
      }
    }
    setPhase("done");
  };

  if (phase !== "edit") {
    const pct = Math.round(((done.length + failed.length) / items.length) * 100);
    return (
      <ContentLayout header={<Header variant="h1" actions={<Button variant="primary" disabled={phase !== "done"} onClick={() => nav({ pathname: `/s3/buckets/${encodeURIComponent(bucket)}`, search: prefix ? `?prefix=${encodeURIComponent(prefix)}` : "" })}>Close</Button>}>Upload: status</Header>}>
        <SpaceBetween size="l">
          {phase === "done" && (failed.length
            ? <Alert type="error" header={`Upload failed for ${failed.length} file(s)`}>See the error column below.</Alert>
            : <Alert type="success" header="Upload succeeded">View details below.</Alert>)}
          <Container header={<Header variant="h2">Summary</Header>}>
            <SpaceBetween size="m">
              <ProgressBar value={pct} label="Total progress" />
              <ColumnLayout columns={3} variant="text-grid">
                <ValueWithLabel label="Destination"><Link href={bucketHref(bucket, "objects", prefix)}>{s3Uri(bucket, prefix)}</Link></ValueWithLabel>
                <ValueWithLabel label="Succeeded"><StatusIndicator type="success">{done.length} file(s), {fmtBytes(done.reduce((a, i) => a + i.file.size, 0))}</StatusIndicator></ValueWithLabel>
                <ValueWithLabel label="Failed"><StatusIndicator type={failed.length ? "error" : "stopped"}>{failed.length} file(s)</StatusIndicator></ValueWithLabel>
              </ColumnLayout>
            </SpaceBetween>
          </Container>
          <Table header={<Header variant="h2" counter={`(${items.length})`}>Files and folders</Header>} items={items} columnDefinitions={[
            { id: "n", header: "Name", cell: i => i.path },
            { id: "t", header: "Type", cell: i => i.file.type || "-" },
            { id: "s", header: "Size", cell: i => fmtBytes(i.file.size) },
            { id: "st", header: "Status", cell: i => i.status === "done" ? <StatusIndicator type="success">Succeeded</StatusIndicator> : i.status === "error" ? <StatusIndicator type="error">Failed</StatusIndicator> : i.status === "uploading" ? <StatusIndicator type="in-progress">Uploading</StatusIndicator> : <StatusIndicator type="pending">Pending</StatusIndicator> },
            { id: "e", header: "Error", cell: i => i.error || "-" },
          ]} />
        </SpaceBetween>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout header={<Header variant="h1" description="Add the files and folders you want to upload to S3. To upload a file larger than 160GB, use the AWS CLI, AWS SDKs or Amazon S3 REST API.">Upload</Header>}>
      <SpaceBetween size="l">
        <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          style={{ border: `2px dashed ${over ? "#0972d3" : "#8c8c94"}`, borderRadius: 12, padding: 28, textAlign: "center", background: over ? "rgba(9,114,211,0.08)" : undefined }}>
          <Box color="text-body-secondary">Drag and drop files and folders you want to upload here, or choose <b>Add files</b> or <b>Add folder</b>.</Box>
        </div>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { add([...(e.target.files || [])]); e.target.value = ""; }} />
        <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: "" } as any)} onChange={e => { add([...(e.target.files || [])]); e.target.value = ""; }} />
        <Table
          header={<Header variant="h2" counter={`(${items.length} Total, ${fmtBytes(total)})`} description="All files and folders in this table will be uploaded."
            actions={<SpaceBetween direction="horizontal" size="xs">
              <Button disabled={!selected.length} onClick={() => { setItems(items.filter(i => !selected.includes(i))); setSelected([]); }}>Remove</Button>
              <Button onClick={() => fileRef.current?.click()}>Add files</Button>
              <Button onClick={() => dirRef.current?.click()}>Add folder</Button>
            </SpaceBetween>}>Files and folders</Header>}
          items={items} selectionType="multi" selectedItems={selected} onSelectionChange={e => setSelected(e.detail.selectedItems)} trackBy="path"
          empty={<Box textAlign="center" color="inherit"><b>No files or folders</b><Box variant="p" color="inherit">You have not chosen any files or folders to upload.</Box></Box>}
          columnDefinitions={[
            { id: "n", header: "Name", cell: i => i.path.split("/").pop() },
            { id: "f", header: "Folder", cell: i => i.path.includes("/") ? i.path.slice(0, i.path.lastIndexOf("/") + 1) : "-" },
            { id: "t", header: "Type", cell: i => i.file.type || "-" },
            { id: "s", header: "Size", cell: i => fmtBytes(i.file.size) },
          ]}
        />
        <Container header={<Header variant="h2">Destination</Header>}>
          <SpaceBetween size="m">
            <ValueWithLabel label="Destination"><Link href={bucketHref(bucket, "objects", prefix)}>{s3Uri(bucket, prefix)}</Link></ValueWithLabel>
            <ExpandableSection headerText="Destination details" headerDescription="Bucket settings that impact new objects stored in the specified destination.">
              <ColumnLayout columns={3} variant="text-grid">
                <ValueWithLabel label="Bucket Versioning">{dest.data?.versioning}</ValueWithLabel>
                <ValueWithLabel label="Default encryption">{dest.data ? encLabel(dest.data.enc) : "…"}</ValueWithLabel>
                <ValueWithLabel label="Object Lock">{dest.data?.lock ? "Enabled" : "Disabled"}</ValueWithLabel>
              </ColumnLayout>
            </ExpandableSection>
          </SpaceBetween>
        </Container>
        <ExpandableSection variant="container" headerText="Permissions" headerDescription="Grant public access and access to other AWS accounts.">
          {dest.data?.aclsEnabled ? (
            <SpaceBetween size="m">
              <FormField label="Access control list (ACL)">
                <RadioGroup value={acl} onChange={e => setAcl(e.detail.value)} items={[
                  { value: "private", label: "Choose from predefined ACLs: Private (recommended)", description: "Only the object owner has read and write permissions." },
                  { value: "public-read", label: "Grant public-read access", description: "Anyone in the world will be able to access the specified objects." },
                  { value: "bucket-owner-full-control", label: "Bucket owner full control" },
                ]} />
              </FormField>
              {acl === "public-read" && <Checkbox checked={pubAck} onChange={e => setPubAck(e.detail.checked)}>I understand the risk of granting public-read access to the specified objects.</Checkbox>}
            </SpaceBetween>
          ) : <Alert type="info">This bucket has the bucket owner enforced setting applied for Object Ownership. Use bucket policies to control access.</Alert>}
        </ExpandableSection>
        <ExpandableSection variant="container" headerText="Properties" headerDescription="Specify storage class, encryption settings, tags, and more.">
          <SpaceBetween size="xl">
            <FormField label="Storage class" description="Amazon S3 offers a range of storage classes designed for different use cases."><StorageClassPicker value={cls} onChange={setCls} /></FormField>
            <FormField label="Server-side encryption" description="Server-side encryption protects data at rest.">
              <SpaceBetween size="m">
                <RadioGroup value={encMode} onChange={e => setEncMode(e.detail.value)} items={[
                  { value: "default", label: "Do not specify an encryption key", description: "The bucket settings for default encryption are used to encrypt objects when storing them in Amazon S3." },
                  { value: "specify", label: "Specify an encryption key", description: "The specified encryption key is used to encrypt objects before storing them in Amazon S3." },
                ]} />
                {encMode === "specify" && <EncryptionFields value={enc} onChange={setEnc} />}
              </SpaceBetween>
            </FormField>
            <FormField label="Additional checksums" description="Checksum functions are used for additional data integrity verification of new objects.">
              <RadioGroup value={checksum} onChange={e => setChecksum(e.detail.value)} items={[
                { value: "", label: "Off" }, { value: "CRC32", label: "CRC32" }, { value: "CRC32C", label: "CRC32C" }, { value: "SHA1", label: "SHA-1" }, { value: "SHA256", label: "SHA-256" }, { value: "CRC64NVME", label: "CRC64NVME" },
              ]} />
            </FormField>
            <FormField label="Tags - optional" description="You can use object tags to analyze, manage, and specify permissions for objects."><Tags tags={tags} onChange={setTags} limit={10} /></FormField>
            <FormField label="Metadata - optional" description="Metadata is optional information provided as a name-value (key-value) pair."><MetadataEditor items={meta} onChange={setMeta} /></FormField>
          </SpaceBetween>
        </ExpandableSection>
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>Cancel</Button>
            <Button variant="primary" disabled={!canUpload} onClick={upload}>Upload</Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
