import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Toggle from "@cloudscape-design/components/toggle";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Icon from "@cloudscape-design/components/icon";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Alert from "@cloudscape-design/components/alert";
import RadioGroup from "@cloudscape-design/components/radio-group";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { api } from "../../api";
import { ConfirmModal, Copyable, ErrorAlert, errText, fmtBytes, fmtDate, useAsync, useFlash, ValueWithLabel } from "../../common";
import {
  s3, getOr, bucketHref, objectHref, s3Uri, objectUrl, isFolder, baseName, storageClassLabel,
  listAllObjects, emptyPrefix, folderStats,
} from "./lib";

type Row = { Key: string; folder?: boolean; Size?: number; LastModified?: string; StorageClass?: string; VersionId?: string; IsLatest?: boolean; deleteMarker?: boolean; ETag?: string };

export default function ObjectsTab({ bucket, prefix }: { bucket: string; prefix: string }) {
  const nav = useNavigate();
  const flash = useFlash();
  const [showVersions, setShowVersions] = useState(false);
  const [selected, setSelected] = useState<Row[]>([]);
  const [modal, setModal] = useState<string>("");
  const versioning = useAsync(() => getOr("GetBucketVersioning", { Bucket: bucket }, {}), [bucket]);
  const versioned = !!versioning.data?.Status;

  const data = useAsync<Row[]>(async () => {
    const rows: Row[] = [];
    if (showVersions) {
      let km: string | undefined, vm: string | undefined;
      do {
        const r: any = await s3("ListObjectVersions", { Bucket: bucket, Prefix: prefix, Delimiter: "/", KeyMarker: km, VersionIdMarker: vm });
        (r.CommonPrefixes || []).forEach((p: any) => rows.push({ Key: p.Prefix, folder: true }));
        (r.Versions || []).filter((v: any) => v.Key !== prefix).forEach((v: any) => rows.push(v));
        (r.DeleteMarkers || []).forEach((v: any) => rows.push({ ...v, deleteMarker: true }));
        km = r.IsTruncated ? r.NextKeyMarker : undefined; vm = r.IsTruncated ? r.NextVersionIdMarker : undefined;
      } while (km);
      const seen = new Set<string>();
      return rows.filter(r => !r.folder || (!seen.has(r.Key) && seen.add(r.Key)));
    }
    let token: string | undefined;
    do {
      const r: any = await s3("ListObjectsV2", { Bucket: bucket, Prefix: prefix, Delimiter: "/", ContinuationToken: token });
      (r.CommonPrefixes || []).forEach((p: any) => rows.push({ Key: p.Prefix, folder: true }));
      (r.Contents || []).filter((o: any) => o.Key !== prefix).forEach((o: any) => rows.push(o));
      token = r.NextContinuationToken;
    } while (token);
    return rows;
  }, [bucket, prefix, showVersions]);

  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(data.data || [], {
    filtering: { filteringFunction: (r, text) => baseName(r.Key, prefix).toLowerCase().startsWith(text.toLowerCase()) },
    pagination: { pageSize: 50 },
    sorting: {},
  });

  const reload = () => { setSelected([]); data.reload(); };
  const one = selected.length === 1 ? selected[0] : undefined;
  const files = selected.filter(r => !r.folder && !r.deleteMarker);
  const copy = (t: string, what: string) => navigator.clipboard.writeText(t).then(() => flash.notify({ type: "success", content: `${what} copied` }));
  const keysParam = () => encodeURIComponent(JSON.stringify(files.map(f => f.Key)));

  const onAction = (id: string) => {
    if (["storage-class", "encryption", "metadata", "tags"].includes(id)) nav(`/s3/buckets/${encodeURIComponent(bucket)}/object/edit/${id}?keys=${keysParam()}&back=${encodeURIComponent(prefix)}`);
    else setModal(id);
  };

  const versionCols = showVersions ? [
    { id: "version", header: "Version ID", cell: (r: Row) => r.folder ? "" : <Box variant="code" fontSize="body-s">{r.VersionId === "null" || !r.VersionId ? "null" : r.VersionId}</Box> },
  ] : [];

  return (
    <SpaceBetween size="l">
      {data.error ? <ErrorAlert error={data.error} /> : null}
      <Table
        {...collectionProps}
        items={items}
        loading={data.loading}
        loadingText="Loading objects"
        trackBy={r => r.Key + "|" + (r.VersionId || "")}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={e => setSelected(e.detail.selectedItems)}
        header={
          <Header
            counter={data.data ? `(${data.data.length})` : undefined}
            description={<>Objects are the fundamental entities stored in Amazon S3. You can use <Link href={bucketHref(bucket, "management")} variant="primary" fontSize="inherit">Amazon S3 inventory</Link> to get a list of all objects in your bucket. For others to access your objects, you'll need to explicitly grant them permissions.</>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={reload} />
                <Button disabled={!one} onClick={() => copy(s3Uri(bucket, one!.Key), "S3 URI")}>Copy S3 URI</Button>
                <Button disabled={!one || one.folder} onClick={() => copy(objectUrl(bucket, one!.Key), "Object URL")}>Copy URL</Button>
                <Button disabled={!one || one.folder || one.deleteMarker} href={one && !one.folder ? api.downloadUrl(bucket, one.Key, { versionId: showVersions ? one.VersionId : undefined }) : undefined}>Download</Button>
                <Button disabled={!one || one.folder || one.deleteMarker} iconName="external" iconAlign="right" target="_blank"
                  href={one && !one.folder ? api.downloadUrl(bucket, one.Key, { inline: true, versionId: showVersions ? one.VersionId : undefined }) : undefined}>Open</Button>
                <Button disabled={!selected.length} onClick={() => setModal("delete")}>Delete</Button>
                <ButtonDropdown
                  onItemClick={e => onAction(e.detail.id)}
                  items={[
                    { id: "presign", text: "Share with a presigned URL", disabled: !one || !!one.folder || !!one.deleteMarker },
                    { id: "size", text: "Calculate total size", disabled: !selected.length },
                    { id: "copy", text: "Copy", disabled: !selected.length || showVersions },
                    { id: "move", text: "Move", disabled: !selected.length || showVersions },
                    { id: "restore", text: "Initiate restore", disabled: !files.length },
                    { id: "select", text: "Query with S3 Select", disabled: true, disabledReason: "S3 Select isn't supported by AWS Emulator." },
                    { id: "edit", text: "Edit actions", items: [
                      { id: "rename", text: "Rename object", disabled: !one || !!one.folder || showVersions },
                      { id: "storage-class", text: "Edit storage class", disabled: !files.length || showVersions },
                      { id: "encryption", text: "Edit server-side encryption", disabled: !files.length || showVersions },
                      { id: "metadata", text: "Edit metadata", disabled: !files.length || showVersions },
                      { id: "tags", text: "Edit tags", disabled: !files.length || showVersions },
                      { id: "public", text: "Make public using ACL", disabled: !files.length },
                    ] },
                  ]}
                >Actions</ButtonDropdown>
                <Button onClick={() => setModal("folder")}>Create folder</Button>
                <Button variant="primary" iconName="upload" onClick={() => nav(`/s3/buckets/${encodeURIComponent(bucket)}/upload?prefix=${encodeURIComponent(prefix)}`)}>Upload</Button>
              </SpaceBetween>
            }
          >Objects</Header>
        }
        filter={
          <SpaceBetween direction="horizontal" size="l" alignItems="center">
            <div style={{ minWidth: 320 }}><TextFilter {...filterProps} filteringPlaceholder="Find objects by prefix" countText={`${filteredItemsCount} matches`} /></div>
            {versioned || showVersions ? <Toggle checked={showVersions} onChange={e => { setSelected([]); setShowVersions(e.detail.checked); }}>Show versions</Toggle> : null}
          </SpaceBetween>
        }
        pagination={<Pagination {...paginationProps} />}
        empty={
          <Box textAlign="center" color="inherit">
            <b>No objects</b>
            <Box variant="p" color="inherit">You don't have any objects in this {prefix ? "folder" : "bucket"}.</Box>
            <Button iconName="upload" onClick={() => nav(`/s3/buckets/${encodeURIComponent(bucket)}/upload?prefix=${encodeURIComponent(prefix)}`)}>Upload</Button>
          </Box>
        }
        columnDefinitions={[
          { id: "name", header: "Name", isRowHeader: true, sortingField: "Key", cell: r => r.folder
            ? <Link href={bucketHref(bucket, "objects", r.Key)}><Icon name="folder" /> {baseName(r.Key, prefix)}</Link>
            : r.deleteMarker ? <Box color="text-status-inactive"><Icon name="file" /> {baseName(r.Key, prefix)}</Box>
              : <Link href={objectHref(bucket, r.Key, showVersions ? r.VersionId : undefined)}><Icon name="file" /> {baseName(r.Key, prefix)}</Link> },
          ...versionCols,
          { id: "type", header: "Type", cell: r => r.folder ? "Folder" : r.deleteMarker ? "Delete marker" : (r.Key.includes(".") ? r.Key.split(".").pop() : "-") },
          { id: "modified", header: "Last modified", sortingField: "LastModified", cell: r => r.folder ? "-" : fmtDate(r.LastModified) },
          { id: "size", header: "Size", sortingField: "Size", cell: r => r.folder || r.deleteMarker ? "-" : fmtBytes(r.Size) },
          { id: "class", header: "Storage class", cell: r => r.folder || r.deleteMarker ? "-" : storageClassLabel(r.StorageClass) },
        ]}
      />

      <CreateFolderModal visible={modal === "folder"} onDismiss={() => setModal("")} bucket={bucket} prefix={prefix} onDone={reload} />
      <DeleteObjectsModal visible={modal === "delete"} onDismiss={() => setModal("")} bucket={bucket} rows={selected} permanent={showVersions || !versioned} versioned={versioned} onDone={reload} />
      <PresignModal visible={modal === "presign"} onDismiss={() => setModal("")} bucket={bucket} row={one} />
      <SizeModal visible={modal === "size"} onDismiss={() => setModal("")} bucket={bucket} rows={selected} />
      <CopyMoveModal visible={modal === "copy" || modal === "move"} move={modal === "move"} onDismiss={() => setModal("")} bucket={bucket} rows={selected} onDone={reload} />
      <RenameModal visible={modal === "rename"} onDismiss={() => setModal("")} bucket={bucket} row={one} prefix={prefix} onDone={reload} />
      <RestoreModal visible={modal === "restore"} onDismiss={() => setModal("")} bucket={bucket} rows={files} onDone={reload} />
      <ConfirmModal visible={modal === "public"} onDismiss={() => setModal("")} header="Make public using ACL" confirmLabel="Make public"
        onConfirm={async () => {
          try { for (const f of files) await s3("PutObjectAcl", { Bucket: bucket, Key: f.Key, ACL: "public-read", VersionId: showVersions ? f.VersionId : undefined }); flash.notify({ type: "success", content: `Made ${files.length} object(s) public.` }); }
          catch (e) { flash.error(e, "Couldn't make objects public"); }
          setModal("");
        }}>
        <Alert type="warning">When public read access is granted, anyone in the world can access the specified objects. This fails if the bucket has ACLs disabled (Bucket owner enforced) or Block Public Access turned on.</Alert>
        <Box>{files.map(f => f.Key).join(", ")}</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}

// ---------------- modals ----------------
function Footer({ onCancel, onOk, ok, busy, disabled }: { onCancel: () => void; onOk: () => void; ok: string; busy?: boolean; disabled?: boolean }) {
  return <Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={onCancel}>Cancel</Button><Button variant="primary" loading={busy} disabled={disabled} onClick={onOk}>{ok}</Button></SpaceBetween></Box>;
}

function CreateFolderModal({ visible, onDismiss, bucket, prefix, onDone }: any) {
  const flash = useFlash();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const err = name.includes("/") ? "Folder names can't contain \"/\"." : undefined;
  const go = async () => {
    if (!name || err) return;
    setBusy(true);
    try { await s3("PutObject", { Bucket: bucket, Key: `${prefix}${name}/`, Body: "" }); flash.notify({ type: "success", content: `Successfully created folder "${name}".` }); setName(""); onDismiss(); onDone(); }
    catch (e) { flash.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Create folder" footer={<Footer onCancel={onDismiss} onOk={go} ok="Create folder" busy={busy} disabled={!name || !!err} />}>
      <SpaceBetween size="m">
        <Box variant="p">Use folders to group objects in buckets. When you create a folder, S3 creates an object using the name that you specify followed by a slash (/).</Box>
        <FormField label="Folder name" errorText={err} constraintText="Folder names can't contain &quot;/&quot;.">
          <Input value={name} onChange={e => setName(e.detail.value)} placeholder="Enter folder name" onKeyDown={e => e.detail.key === "Enter" && go()} />
        </FormField>
        <Box variant="small">Destination: <Box variant="code">{s3Uri(bucket, prefix)}{name ? name + "/" : ""}</Box></Box>
      </SpaceBetween>
    </Modal>
  );
}

function DeleteObjectsModal({ visible, onDismiss, bucket, rows, permanent, versioned, onDone }: { visible: boolean; onDismiss: () => void; bucket: string; rows: Row[]; permanent: boolean; versioned: boolean; onDone: () => void }) {
  const flash = useFlash();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const r of rows) {
        if (r.folder) n += permanent ? await emptyPrefix(bucket, r.Key) : await (async () => {
          const objs = await listAllObjects(bucket, r.Key);
          for (let i = 0; i < objs.length; i += 1000) await s3("DeleteObjects", { Bucket: bucket, Delete: { Objects: objs.slice(i, i + 1000).map(o => ({ Key: o.Key })), Quiet: true } });
          return objs.length;
        })();
        else { await s3("DeleteObject", { Bucket: bucket, Key: r.Key, VersionId: permanent && r.VersionId ? r.VersionId : undefined }); n++; }
      }
      flash.notify({ type: "success", content: `Successfully deleted ${n} object(s)${!permanent && versioned ? " (delete markers added; earlier versions are kept)" : ""}.` });
      onDismiss(); onDone();
    } catch (e) { flash.error(e, "Failed to delete objects"); } finally { setBusy(false); }
  };
  return (
    <ConfirmModal visible={visible} onDismiss={onDismiss} onConfirm={go} busy={busy}
      header="Delete objects" confirmText={permanent ? "permanently delete" : "delete"} confirmLabel="Delete objects">
      {permanent
        ? <Alert type="warning" header="Deleting the specified objects can't be undone.">{versioned ? "The selected object versions are permanently deleted." : "This bucket isn't versioned, so the objects are permanently deleted."}</Alert>
        : <Alert type="info">This bucket has versioning turned on. Deleting adds a delete marker; the previous versions stay and can be restored by deleting the marker.</Alert>}
      <Table variant="embedded" items={rows} columnDefinitions={[
        { id: "n", header: "Name", cell: r => r.Key },
        { id: "t", header: "Type", cell: r => r.folder ? "Folder (all objects inside)" : r.deleteMarker ? "Delete marker" : "Object" },
        ...(permanent && versioned ? [{ id: "v", header: "Version ID", cell: (r: Row) => r.VersionId || "-" }] : []),
      ]} />
    </ConfirmModal>
  );
}

function PresignModal({ visible, onDismiss, bucket, row }: { visible: boolean; onDismiss: () => void; bucket: string; row?: Row }) {
  const [mins, setMins] = useState("60");
  const [unit, setUnit] = useState({ value: "60", label: "Minutes" });
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const go = async () => {
    setErr(null);
    try { setUrl((await api.presign(bucket, row!.Key, Number(mins) * Number(unit.value), row?.VersionId)).url); }
    catch (e) { setErr(e); }
  };
  return (
    <Modal visible={visible} onDismiss={() => { setUrl(""); onDismiss(); }} header="Share with a presigned URL"
      footer={<Footer onCancel={() => { setUrl(""); onDismiss(); }} onOk={go} ok="Create presigned URL" />}>
      <SpaceBetween size="m">
        <Box variant="p">A presigned URL grants time-limited access to <b>{row?.Key}</b> without credentials. Anyone with the URL can download the object until it expires.</Box>
        <FormField label="Time interval until the presigned URL expires" constraintText="Maximum 7 days (12 hours in the console when signed with temporary credentials).">
          <SpaceBetween direction="horizontal" size="xs">
            <Input type="number" value={mins} onChange={e => setMins(e.detail.value)} />
            <Select selectedOption={unit} onChange={e => setUnit(e.detail.selectedOption as any)} options={[{ value: "60", label: "Minutes" }, { value: "3600", label: "Hours" }]} />
          </SpaceBetween>
        </FormField>
        <ErrorAlert error={err} />
        {url && <Alert type="success" header="Presigned URL created">
          <Box variant="code" fontSize="body-s"><span style={{ wordBreak: "break-all" }}>{url}</span></Box>
          <Box margin={{ top: "xs" }}><Copyable text={url} label="presigned URL" iconOnly /> Copy URL</Box>
        </Alert>}
      </SpaceBetween>
    </Modal>
  );
}

function SizeModal({ visible, onDismiss, bucket, rows }: { visible: boolean; onDismiss: () => void; bucket: string; rows: Row[] }) {
  const stats = useAsync(async () => {
    if (!visible) return null;
    let count = 0, size = 0;
    for (const r of rows) {
      if (r.folder) { const s = await folderStats(bucket, r.Key); count += s.count; size += s.size; }
      else if (!r.deleteMarker) { count++; size += r.Size || 0; }
    }
    return { count, size };
  }, [visible]);
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Calculate total size" footer={<Box float="right"><Button variant="primary" onClick={onDismiss}>Close</Button></Box>}>
      {stats.loading ? "Calculating…" : stats.error ? <ErrorAlert error={stats.error} /> : (
        <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="Total number of objects">{stats.data?.count}</ValueWithLabel>
          <ValueWithLabel label="Total size">{fmtBytes(stats.data?.size)}</ValueWithLabel>
        </ColumnLayout>
      )}
    </Modal>
  );
}

function CopyMoveModal({ visible, onDismiss, bucket, rows, move, onDone }: { visible: boolean; onDismiss: () => void; bucket: string; rows: Row[]; move: boolean; onDone: () => void }) {
  const flash = useFlash();
  const buckets = useAsync(async () => (visible ? ((await s3("ListBuckets")).Buckets || []).map((b: any) => b.Name) : []), [visible]);
  const [dest, setDest] = useState(`s3://${bucket}/`);
  const [busy, setBusy] = useState(false);
  const m = dest.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  const err = !m ? "Enter a destination like s3://bucket/prefix/" : m[2] && !m[2].endsWith("/") ? "The destination prefix must end with \"/\"." : undefined;
  const go = async () => {
    if (err || !m) return;
    const [, db, dp] = m;
    setBusy(true);
    try {
      let n = 0;
      for (const r of rows) {
        const srcPrefix = r.Key.replace(/[^/]+\/?$/, ""); // parent "directory" of the selected row
        const objs = r.folder ? await listAllObjects(bucket, r.Key) : [{ Key: r.Key }];
        for (const o of objs) {
          const target = dp + o.Key.slice(srcPrefix.length);
          if (db === bucket && target === o.Key) continue;
          await s3("CopyObject", { Bucket: db, Key: target, CopySource: { Bucket: bucket, Key: o.Key } });
          if (move) await s3("DeleteObject", { Bucket: bucket, Key: o.Key });
          n++;
        }
      }
      flash.notify({ type: "success", content: `Successfully ${move ? "moved" : "copied"} ${n} object(s) to ${dest}.` });
      onDismiss(); onDone();
    } catch (e) { flash.error(e, `Failed to ${move ? "move" : "copy"}`); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header={move ? "Move" : "Copy"} size="medium"
      footer={<Footer onCancel={onDismiss} onOk={go} ok={move ? "Move" : "Copy"} busy={busy} disabled={!!err} />}>
      <SpaceBetween size="m">
        <Box>{rows.length} item(s): {rows.map(r => r.Key).join(", ")}</Box>
        <FormField label="Destination" description="Enter an S3 URI. Folders are copied with everything inside them." errorText={err}>
          <Input value={dest} onChange={e => setDest(e.detail.value)} placeholder="s3://bucket/prefix/" />
        </FormField>
        <SpaceBetween direction="horizontal" size="xs">{(buckets.data || []).map((b: string) => <Button key={b} variant="inline-link" onClick={() => setDest(`s3://${b}/`)}>{b}</Button>)}</SpaceBetween>
        {move && <Alert type="info">Moving copies each object to the destination, then deletes the original.</Alert>}
      </SpaceBetween>
    </Modal>
  );
}

function RenameModal({ visible, onDismiss, bucket, row, prefix, onDone }: { visible: boolean; onDismiss: () => void; bucket: string; row?: Row; prefix: string; onDone: () => void }) {
  const flash = useFlash();
  const current = row ? baseName(row.Key, prefix) : "";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const val = name || current;
  const go = async () => {
    if (!row || !val || val === current) return;
    setBusy(true);
    try {
      await s3("CopyObject", { Bucket: bucket, Key: prefix + val, CopySource: { Bucket: bucket, Key: row.Key }, MetadataDirective: "COPY", TaggingDirective: "COPY" });
      await s3("DeleteObject", { Bucket: bucket, Key: row.Key });
      flash.notify({ type: "success", content: `Renamed "${current}" to "${val}".` });
      setName(""); onDismiss(); onDone();
    } catch (e) { flash.error(e, "Rename failed"); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Rename object" footer={<Footer onCancel={onDismiss} onOk={go} ok="Save changes" busy={busy} disabled={!val || val === current} />}>
      <FormField label="New object name" description="Renaming copies the object to the new name and deletes the original. The object gets a new last modified date.">
        <Input value={val} onChange={e => setName(e.detail.value)} />
      </FormField>
    </Modal>
  );
}

function RestoreModal({ visible, onDismiss, bucket, rows, onDone }: { visible: boolean; onDismiss: () => void; bucket: string; rows: Row[]; onDone: () => void }) {
  const flash = useFlash();
  const [days, setDays] = useState("1");
  const [tier, setTier] = useState("Standard");
  const [busy, setBusy] = useState(false);
  const archived = rows.filter(r => ["GLACIER", "DEEP_ARCHIVE"].includes(r.StorageClass || ""));
  const go = async () => {
    setBusy(true);
    const fails: string[] = [];
    for (const r of archived) {
      try { await s3("RestoreObject", { Bucket: bucket, Key: r.Key, RestoreRequest: { Days: Number(days), GlacierJobParameters: { Tier: tier } } }); }
      catch (e) { fails.push(`${r.Key}: ${errText(e)}`); }
    }
    setBusy(false);
    if (fails.length) flash.notify({ type: "error", header: "Some restores failed", content: fails.join("; ") });
    else flash.notify({ type: "success", content: `Restore initiated for ${archived.length} object(s).` });
    onDismiss(); onDone();
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Initiate restore" footer={<Footer onCancel={onDismiss} onOk={go} ok="Initiate restore" busy={busy} disabled={!archived.length} />}>
      <SpaceBetween size="m">
        {!archived.length ? <Alert type="info">Only objects in Glacier Flexible Retrieval or Glacier Deep Archive need restoring. None of the selected objects are.</Alert> : <Box>{archived.length} archived object(s) selected.</Box>}
        <FormField label="Number of days that the restored copy is available"><Input type="number" value={days} onChange={e => setDays(e.detail.value)} /></FormField>
        <FormField label="Retrieval tier">
          <RadioGroup value={tier} onChange={e => setTier(e.detail.value)} items={[
            { value: "Expedited", label: "Expedited retrieval", description: "Typically within 1–5 minutes (not for Deep Archive)" },
            { value: "Standard", label: "Standard retrieval", description: "Typically within 3–5 hours (12 hours for Deep Archive)" },
            { value: "Bulk", label: "Bulk retrieval", description: "Typically within 5–12 hours (48 hours for Deep Archive)" },
          ]} />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export { CreateFolderModal };
