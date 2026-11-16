import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Alert from "@cloudscape-design/components/alert";
import Tabs from "@cloudscape-design/components/tabs";
import { useCrumbs } from "../../App";
import { ConfirmModal, ErrorAlert, fmtBytes, fmtDate, useAsync, useFlash, ValueWithLabel, errText } from "../../common";
import { s3, bucketHref, bucketArn, emptyPrefix, listAllObjects } from "./lib";

export default function BucketsList({ kind }: { kind: "general" | "directory" }) {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "Amazon S3", href: "#/s3/buckets" }, { text: kind === "general" ? "Buckets" : "Directory buckets", href: "#" }]);
  const data = useAsync(async () => {
    if (kind === "directory") return ((await s3("ListDirectoryBuckets")).Buckets || []) as any[];
    return ((await s3("ListBuckets")).Buckets || []) as any[];
  }, [kind]);
  const [selected, setSelected] = useState<any[]>([]);
  const [modal, setModal] = useState<"" | "empty" | "delete">("");
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<{ size: number; count: number } | null>(null);

  useEffect(() => {
    if (kind !== "general" || !data.data) return;
    let alive = true;
    (async () => {
      let size = 0, count = 0;
      for (const b of data.data!) {
        try { const o = await listAllObjects(b.Name); size += o.reduce((a, x) => a + (x.Size || 0), 0); count += o.length; } catch { /* skip */ }
      }
      if (alive) setSnap({ size, count });
    })();
    return () => { alive = false; };
  }, [data.data, kind]);

  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(data.data || [], {
    filtering: { empty: "No buckets", noMatch: "No matches" },
    pagination: { pageSize: 20 },
    sorting: { defaultState: { sortingColumn: { sortingField: "Name" } } },
    selection: {},
  });

  const b = selected[0]?.Name as string | undefined;
  const doEmpty = async () => {
    setBusy(true);
    try { const n = await emptyPrefix(b!); flash.notify({ type: "success", content: `Successfully emptied bucket "${b}" (${n} object versions deleted).` }); setModal(""); }
    catch (e) { flash.error(e, `Failed to empty bucket "${b}"`); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true);
    try { await s3("DeleteBucket", { Bucket: b }); flash.notify({ type: "success", content: `Successfully deleted bucket "${b}".` }); setModal(""); setSelected([]); data.reload(); }
    catch (e: any) {
      flash.notify({ type: "error", header: `Failed to delete bucket "${b}"`, content: e?.code === "BucketNotEmpty" ? "The bucket isn't empty. Empty it first, then delete it." : errText(e) });
      setModal("");
    }
    finally { setBusy(false); }
  };

  const table = (
    <Table
      {...collectionProps}
      loading={data.loading}
      loadingText="Loading buckets"
      items={items}
      selectionType="single"
      selectedItems={selected}
      onSelectionChange={e => setSelected(e.detail.selectedItems)}
      trackBy="Name"
      variant="full-page"
      stickyHeader
      header={
        <Header
          variant="awsui-h1-sticky"
          counter={data.data ? `(${data.data.length})` : undefined}
          description={kind === "general"
            ? "Buckets are containers for data stored in S3."
            : "Directory buckets use the S3 Express One Zone storage class for single-digit millisecond access."}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" onClick={() => data.reload()} />
              <Button disabled={!b} onClick={() => navigator.clipboard.writeText(bucketArn(b!)).then(() => flash.notify({ type: "success", content: "ARN copied" }))}>Copy ARN</Button>
              {kind === "general" && <Button disabled={!b} onClick={() => setModal("empty")}>Empty</Button>}
              <Button disabled={!b} onClick={() => setModal("delete")}>Delete</Button>
              <Button variant="primary" onClick={() => nav(`/s3/bucket/create${kind === "directory" ? "?type=directory" : ""}`)}>Create bucket</Button>
            </SpaceBetween>
          }
        >
          {kind === "general" ? "General purpose buckets" : "Directory buckets"}
        </Header>
      }
      filter={<TextFilter {...filterProps} filteringPlaceholder="Find buckets by name" countText={`${filteredItemsCount} match${filteredItemsCount === 1 ? "" : "es"}`} />}
      pagination={<Pagination {...paginationProps} />}
      empty={
        <Box textAlign="center" color="inherit">
          <b>No buckets</b>
          <Box variant="p" color="inherit">You don't have any buckets.</Box>
          <Button onClick={() => nav("/s3/bucket/create")}>Create bucket</Button>
        </Box>
      }
      columnDefinitions={[
        { id: "name", header: "Name", sortingField: "Name", cell: x => <Link href={bucketHref(x.Name)}>{x.Name}</Link>, isRowHeader: true },
        { id: "region", header: "AWS Region", cell: x => `US East (N. Virginia) ${x.BucketRegion || "us-east-1"}` },
        ...(kind === "general" ? [{ id: "iam", header: "IAM Access Analyzer", cell: () => <Box color="text-status-inactive">Not available in emulator</Box> }] : []),
        { id: "created", header: "Creation date", sortingField: "CreationDate", cell: x => fmtDate(x.CreationDate) },
      ]}
    />
  );

  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {kind === "general" && (
          <Container header={<Header variant="h2" description="Computed live from the emulator (in AWS this comes from Storage Lens, updated every 24 hours).">Account snapshot</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <ValueWithLabel label="Total storage">{snap ? fmtBytes(snap.size) : "…"}</ValueWithLabel>
              <ValueWithLabel label="Object count">{snap ? snap.count : "…"}</ValueWithLabel>
              <ValueWithLabel label="Average object size">{snap ? fmtBytes(snap.count ? Math.round(snap.size / snap.count) : 0) : "…"}</ValueWithLabel>
            </ColumnLayout>
          </Container>
        )}
        <Tabs
          activeTabId={kind}
          onChange={e => nav(e.detail.activeTabId === "general" ? "/s3/buckets" : "/s3/directory-buckets")}
          tabs={[{ id: "general", label: "General purpose buckets" }, { id: "directory", label: "Directory buckets" }].map(t => ({ ...t, content: null }))}
        />
        {data.error ? <ErrorAlert error={data.error} /> : null}
        {table}
      </SpaceBetween>

      <ConfirmModal visible={modal === "empty"} onDismiss={() => setModal("")} onConfirm={doEmpty} busy={busy}
        header={`Empty bucket "${b}"`} confirmText="permanently delete" confirmLabel="Empty">
        <Alert type="warning" header="Emptying the bucket deletes all objects in the bucket and can't be undone.">
          Objects added to the bucket while the empty bucket action is in progress might be deleted. All object versions are deleted too.
        </Alert>
      </ConfirmModal>
      <ConfirmModal visible={modal === "delete"} onDismiss={() => setModal("")} onConfirm={doDelete} busy={busy}
        header={`Delete bucket "${b}"`} confirmText={b} confirmLabel="Delete bucket">
        <Alert type="warning">Deleting a bucket can't be undone. Bucket names are unique; another account could create a bucket with the same name after you delete it.</Alert>
      </ConfirmModal>
    </ContentLayout>
  );
}
