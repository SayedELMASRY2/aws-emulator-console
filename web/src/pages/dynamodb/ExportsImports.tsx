import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Form from "@cloudscape-design/components/form";
import Container from "@cloudscape-design/components/container";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Tiles from "@cloudscape-design/components/tiles";
import Alert from "@cloudscape-design/components/alert";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Modal from "@cloudscape-design/components/modal";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { ErrorAlert, fmtBytes, fmtDate, useAsync, useFlash, ValueWithLabel } from "../../common";
import { ddb, listTableNames, tableHref } from "./lib";
import { KeyInput, type Key } from "./fields";

const statusInd = (s: string) => s === "COMPLETED" ? <StatusIndicator type="success">Completed</StatusIndicator> : s === "FAILED" || s === "CANCELLED" ? <StatusIndicator type="error">{s.charAt(0) + s.slice(1).toLowerCase()}</StatusIndicator> : <StatusIndicator type="in-progress">In progress</StatusIndicator>;
const s3Link = (b: string, p = "") => <Link href={`#/s3/buckets/${encodeURIComponent(b)}${p ? `?prefix=${encodeURIComponent(p)}` : ""}`}>s3://{b}/{p}</Link>;
const usePoll = (busy: boolean, reload: () => void, dep: unknown) => useEffect(() => { if (!busy) return; const t = setTimeout(reload, 2500); return () => clearTimeout(t); }, [busy, dep]); // eslint-disable-line react-hooks/exhaustive-deps

// ---------------- Exports ----------------
export function ExportsPage() {
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Exports to S3", href: "#" }]);
  const data = useAsync(async () => {
    const list = (await ddb("ListExports")).ExportSummaries || [];
    return Promise.all(list.map((e: any) => ddb("DescribeExport", { ExportArn: e.ExportArn }).then((r: any) => r.ExportDescription).catch(() => e)));
  }, []);
  const [detail, setDetail] = useState<any>(null);
  usePoll((data.data || []).some((e: any) => e.ExportStatus === "IN_PROGRESS"), data.reload, data.data);
  return (
    <ContentLayout>
      {data.error ? <ErrorAlert error={data.error} /> : null}
      <Table variant="full-page"
        header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`} description="Export table data to Amazon S3 from any point in time within the PITR window, without using read capacity."
          actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => data.reload()} /><Button variant="primary" href="#/dynamodb/exports/new">Export to S3</Button></SpaceBetween>}>Exports to S3</Header>}
        items={data.data || []} loading={data.loading && !data.data}
        empty={<Box textAlign="center" color="inherit"><b>No exports</b><Box variant="p" color="inherit">You haven't exported any tables.</Box></Box>}
        columnDefinitions={[
          { id: "a", header: "Export ARN", cell: (e: any) => <Link onFollow={ev => { ev.preventDefault(); setDetail(e); }} href="#">{String(e.ExportArn).split("/").pop()}</Link> },
          { id: "t", header: "Source table", cell: (e: any) => e.TableArn ? <Link href={tableHref(String(e.TableArn).split("/").pop()!)}>{String(e.TableArn).split("/").pop()}</Link> : "-" },
          { id: "d", header: "Destination S3 bucket", cell: (e: any) => e.S3Bucket ? s3Link(e.S3Bucket, e.S3Prefix || "") : "-" },
          { id: "s", header: "Status", cell: (e: any) => statusInd(e.ExportStatus) },
          { id: "ty", header: "Export type", cell: (e: any) => e.ExportType === "INCREMENTAL_EXPORT" ? "Incremental" : "Full" },
          { id: "st", header: "Start time", cell: (e: any) => fmtDate(e.StartTime) },
          { id: "i", header: "Items", cell: (e: any) => e.ItemCount ?? "-" },
        ]}
      />
      <Modal visible={!!detail} onDismiss={() => setDetail(null)} header="Export details" size="large">
        {detail && <ColumnLayout columns={2} variant="text-grid">
          <ValueWithLabel label="Export ARN">{detail.ExportArn}</ValueWithLabel>
          <ValueWithLabel label="Status">{statusInd(detail.ExportStatus)}</ValueWithLabel>
          <ValueWithLabel label="Format">{detail.ExportFormat}</ValueWithLabel>
          <ValueWithLabel label="Export time">{fmtDate(detail.ExportTime)}</ValueWithLabel>
          <ValueWithLabel label="Items exported">{detail.ItemCount ?? "-"}</ValueWithLabel>
          <ValueWithLabel label="Billed size">{fmtBytes(detail.BilledSizeBytes || 0)}</ValueWithLabel>
          <ValueWithLabel label="Manifest">{detail.ExportManifest ? s3Link(detail.S3Bucket, String(detail.ExportManifest).replace(/[^/]+$/, "")) : "-"}</ValueWithLabel>
          {detail.FailureMessage && <ValueWithLabel label="Failure">{detail.FailureMessage}</ValueWithLabel>}
        </ColumnLayout>}
      </Modal>
    </ContentLayout>
  );
}

export function ExportForm() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Exports to S3", href: "#/dynamodb/exports" }, { text: "Export table to Amazon S3", href: "#" }]);
  const tables = useAsync(async () => (await listTableNames()).map(n => ({ value: n, label: n })), []);
  const [table, setTable] = useState<any>(sp.get("table") ? { value: sp.get("table"), label: sp.get("table") } : null);
  const [dest, setDest] = useState("");
  const [type, setType] = useState("FULL_EXPORT");
  const [from, setFrom] = useState("now");
  const [hoursAgo, setHoursAgo] = useState("1");
  const [format, setFormat] = useState("DYNAMODB_JSON");
  const [enc, setEnc] = useState("AES256");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const pitr = useAsync(async () => table ? (await ddb("DescribeContinuousBackups", { TableName: table.value })).ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === "ENABLED" : null, [table?.value]);
  const buckets = useAsync(async () => ((await api.call("s3", "ListBuckets")).Buckets || []).map((b: any) => b.Name), []);
  const m = dest.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  const enablePitr = async () => { try { await ddb("UpdateContinuousBackups", { TableName: table.value, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } }); pitr.reload(); } catch (e) { flash.error(e); } };
  const go = async () => {
    if (!table || !m) { setErr(new Error("Choose a source table and enter a destination like s3://bucket/prefix")); return; }
    setBusy(true); setErr(null);
    try {
      const arn = (await ddb("DescribeTable", { TableName: table.value })).Table.TableArn;
      const p: any = { TableArn: arn, S3Bucket: m[1], ExportFormat: format, S3SseAlgorithm: enc, ExportType: type };
      if (m[2]) p.S3Prefix = m[2];
      if (type === "INCREMENTAL_EXPORT") p.IncrementalExportSpecification = { ExportFromTime: new Date(Date.now() - Number(hoursAgo) * 3600e3).toISOString(), ExportToTime: new Date().toISOString(), ExportViewType: "NEW_AND_OLD_IMAGES" };
      else if (from === "earlier") p.ExportTime = new Date(Date.now() - Number(hoursAgo) * 3600e3).toISOString();
      await ddb("ExportTableToPointInTime", p);
      flash.notify({ type: "success", content: `Exporting ${table.value} to ${dest}.` });
      nav("/dynamodb/exports");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1">Export table to Amazon S3</Header>}>
      <form onSubmit={e => { e.preventDefault(); go(); }}>
        <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} disabled={pitr.data === false}>Export</Button></SpaceBetween>}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Source table</Header>}>
              <SpaceBetween size="m">
                <FormField label="Source table"><Select selectedOption={table} placeholder="Choose a table" options={tables.data || []} onChange={e => setTable(e.detail.selectedOption)} /></FormField>
                {pitr.data === false && <Alert type="warning" header="Point-in-time recovery is off" action={<Button formAction="none" onClick={enablePitr}>Turn on PITR</Button>}>Exports read from the PITR backup, so it must be turned on for {table?.value}.</Alert>}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Destination S3 bucket</Header>}>
              <SpaceBetween size="s">
                <FormField label="S3 bucket URI" description="Format: s3://bucket/prefix" errorText={dest && !m ? "Enter an S3 URI." : undefined}><Input value={dest} onChange={e => setDest(e.detail.value)} placeholder="s3://bucket/prefix" /></FormField>
                <SpaceBetween direction="horizontal" size="xs">{(buckets.data || []).map((b: string) => <Button key={b} formAction="none" variant="inline-link" onClick={() => setDest(`s3://${b}/`)}>{b}</Button>)}</SpaceBetween>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Export settings</Header>}>
              <SpaceBetween size="l">
                <FormField label="Export type">
                  <Tiles value={type} onChange={e => setType(e.detail.value)} items={[
                    { value: "FULL_EXPORT", label: "Full export", description: "Export all items in the table at a point in time." },
                    { value: "INCREMENTAL_EXPORT", label: "Incremental export", description: "Export only items that changed within a time window." },
                  ]} />
                </FormField>
                {type === "FULL_EXPORT" ? (
                  <FormField label="Export from a specific point in time">
                    <RadioGroup value={from} onChange={e => setFrom(e.detail.value)} items={[{ value: "now", label: "Current time" }, { value: "earlier", label: "Earlier point in time" }]} />
                  </FormField>
                ) : null}
                {(type === "INCREMENTAL_EXPORT" || from === "earlier") && <FormField label={type === "INCREMENTAL_EXPORT" ? "Export changes from the last (hours)" : "Hours ago"}><Input type="number" value={hoursAgo} onChange={e => setHoursAgo(e.detail.value)} /></FormField>}
                <FormField label="Output format"><RadioGroup value={format} onChange={e => setFormat(e.detail.value)} items={[{ value: "DYNAMODB_JSON", label: "DynamoDB JSON" }, { value: "ION", label: "Amazon Ion" }]} /></FormField>
                <FormField label="Encryption key type"><RadioGroup value={enc} onChange={e => setEnc(e.detail.value)} items={[{ value: "AES256", label: "Amazon S3 key (SSE-S3)" }, { value: "KMS", label: "AWS KMS key (SSE-KMS)" }]} /></FormField>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}

// ---------------- Imports ----------------
export function ImportsPage() {
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Imports from S3", href: "#" }]);
  const data = useAsync(async () => {
    const list = (await ddb("ListImports")).ImportSummaryList || [];
    return Promise.all(list.map((i: any) => ddb("DescribeImport", { ImportArn: i.ImportArn }).then((r: any) => r.ImportTableDescription).catch(() => i)));
  }, []);
  usePoll((data.data || []).some((e: any) => e.ImportStatus === "IN_PROGRESS"), data.reload, data.data);
  return (
    <ContentLayout>
      {data.error ? <ErrorAlert error={data.error} /> : null}
      <Table variant="full-page"
        header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`} description="Import data from Amazon S3 into a new DynamoDB table."
          actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => data.reload()} /><Button variant="primary" href="#/dynamodb/imports/new">Import from S3</Button></SpaceBetween>}>Imports from S3</Header>}
        items={data.data || []} loading={data.loading && !data.data}
        empty={<Box textAlign="center" color="inherit"><b>No imports</b></Box>}
        columnDefinitions={[
          { id: "t", header: "Target table", cell: (i: any) => i.TableArn ? <Link href={tableHref(String(i.TableArn).split("/").pop()!)}>{String(i.TableArn).split("/").pop()}</Link> : "-" },
          { id: "s", header: "Status", cell: (i: any) => statusInd(i.ImportStatus) },
          { id: "src", header: "Source", cell: (i: any) => i.S3BucketSource ? s3Link(i.S3BucketSource.S3Bucket, i.S3BucketSource.S3KeyPrefix || "") : "-" },
          { id: "f", header: "Format", cell: (i: any) => i.InputFormat },
          { id: "n", header: "Items imported", cell: (i: any) => i.ImportedItemCount ?? "-" },
          { id: "e", header: "Errors", cell: (i: any) => i.ErrorCount ?? 0 },
          { id: "st", header: "Start time", cell: (i: any) => fmtDate(i.StartTime) },
        ]}
      />
    </ContentLayout>
  );
}

export function ImportForm() {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Imports from S3", href: "#/dynamodb/imports" }, { text: "Import from S3", href: "#" }]);
  const [src, setSrc] = useState("");
  const [format, setFormat] = useState("CSV");
  const [compression, setCompression] = useState("NONE");
  const [delim, setDelim] = useState(",");
  const [header, setHeader] = useState("first");
  const [headers, setHeaders] = useState("");
  const [name, setName] = useState("");
  const [pk, setPk] = useState<Key>({ name: "", type: "S" });
  const [sk, setSk] = useState<Key>({ name: "", type: "S" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const m = src.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  const go = async () => {
    if (!m || !name || !pk.name) { setErr(new Error("Enter the S3 source, a table name and a partition key.")); return; }
    setBusy(true); setErr(null);
    try {
      const p: any = {
        S3BucketSource: { S3Bucket: m[1], ...(m[2] ? { S3KeyPrefix: m[2] } : {}) }, InputFormat: format, InputCompressionType: compression,
        TableCreationParameters: {
          TableName: name, BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [pk, ...(sk.name ? [sk] : [])].map(k => ({ AttributeName: k.name, AttributeType: k.type })),
          KeySchema: [{ AttributeName: pk.name, KeyType: "HASH" }, ...(sk.name ? [{ AttributeName: sk.name, KeyType: "RANGE" }] : [])],
        },
      };
      if (format === "CSV") p.InputFormatOptions = { Csv: { Delimiter: delim, ...(header === "custom" ? { HeaderList: headers.split(",").map(s => s.trim()).filter(Boolean) } : {}) } };
      await ddb("ImportTable", p);
      flash.notify({ type: "success", content: `Importing into the new table ${name}.` });
      nav("/dynamodb/imports");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="Import data from S3 into a new table. The import doesn't consume write capacity.">Import from S3</Header>}>
      <form onSubmit={e => { e.preventDefault(); go(); }}>
        <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy}>Import</Button></SpaceBetween>}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Import options</Header>}>
              <SpaceBetween size="l">
                <FormField label="Source S3 URL" description="A bucket and optional prefix. Every matching object is imported." errorText={src && !m ? "Enter an S3 URI like s3://bucket/prefix/" : undefined}>
                  <Input value={src} onChange={e => setSrc(e.detail.value)} placeholder="s3://bucket/prefix/" />
                </FormField>
                <FormField label="Import file format"><RadioGroup value={format} onChange={e => setFormat(e.detail.value)} items={[{ value: "CSV", label: "CSV" }, { value: "DYNAMODB_JSON", label: "DynamoDB JSON" }, { value: "ION", label: "Amazon Ion" }]} /></FormField>
                <FormField label="Import file compression"><RadioGroup value={compression} onChange={e => setCompression(e.detail.value)} items={[{ value: "NONE", label: "No compression" }, { value: "GZIP", label: "GZIP" }, { value: "ZSTD", label: "ZSTD" }]} /></FormField>
                {format === "CSV" && <>
                  <FormField label="CSV header"><RadioGroup value={header} onChange={e => setHeader(e.detail.value)} items={[{ value: "first", label: "Use first line of source file as header" }, { value: "custom", label: "Custom header" }]} /></FormField>
                  {header === "custom" && <FormField label="Header list" description="Comma-separated column names."><Input value={headers} onChange={e => setHeaders(e.detail.value)} /></FormField>}
                  <FormField label="CSV delimiter"><Select selectedOption={{ value: delim, label: delim === "," ? "Comma (,)" : delim === "\t" ? "Tab" : delim === ";" ? "Semicolon (;)" : "Pipe (|)" }}
                    options={[{ value: ",", label: "Comma (,)" }, { value: "\t", label: "Tab" }, { value: ";", label: "Semicolon (;)" }, { value: "|", label: "Pipe (|)" }]} onChange={e => setDelim(e.detail.selectedOption.value!)} /></FormField>
                </>}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" description="The import creates a new on-demand table.">Destination table</Header>}>
              <SpaceBetween size="l">
                <FormField label="Table name"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
                <KeyInput label="Partition key" value={pk} onChange={setPk} />
                <KeyInput label="Sort key" optional value={sk} onChange={setSk} />
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
