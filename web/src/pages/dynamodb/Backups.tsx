import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCollection } from "@cloudscape-design/collection-hooks";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Table from "@cloudscape-design/components/table";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Form from "@cloudscape-design/components/form";
import Container from "@cloudscape-design/components/container";
import RadioGroup from "@cloudscape-design/components/radio-group";
import DatePicker from "@cloudscape-design/components/date-picker";
import TimeInput from "@cloudscape-design/components/time-input";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Tiles from "@cloudscape-design/components/tiles";
import { useCrumbs } from "../../App";
import { ConfirmModal, ErrorAlert, fmtBytes, fmtDate, useAsync, useFlash, ValueWithLabel } from "../../common";
import { ddb, listTableNames, tableHref } from "./lib";
import { EncryptionFields, sseSpec, type Enc } from "./fields";

export function BackupsPage() {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Backups", href: "#" }]);
  const data = useAsync(async () => (await ddb("ListBackups")).BackupSummaries || [], []);
  const tables = useAsync(async () => (await listTableNames()).map(n => ({ value: n, label: n })), []);
  const [sel, setSel] = useState<any[]>([]);
  const [create, setCreate] = useState(false);
  const [tbl, setTbl] = useState<any>(null);
  const [name, setName] = useState("");
  const [del, setDel] = useState(false);
  const { items, filterProps, paginationProps, collectionProps } = useCollection(data.data || [], { filtering: {}, pagination: { pageSize: 20 }, sorting: {} });
  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {data.error ? <ErrorAlert error={data.error} /> : null}
        <Table {...collectionProps} variant="full-page"
          header={<Header variant="awsui-h1-sticky" counter={`(${data.data?.length || 0})`} description="On-demand backups of your tables. Restoring creates a new table."
            actions={<SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" onClick={() => data.reload()} />
              <Button disabled={!sel.length} onClick={() => setDel(true)}>Delete</Button>
              <Button disabled={!sel.length || sel[0].BackupStatus !== "AVAILABLE"} onClick={() => nav(`/dynamodb/backups/restore?arn=${encodeURIComponent(sel[0].BackupArn)}`)}>Restore</Button>
              <Button variant="primary" onClick={() => setCreate(true)}>Create backup</Button>
            </SpaceBetween>}>Backups</Header>}
          items={items} loading={data.loading} trackBy="BackupArn" selectionType="single" selectedItems={sel} onSelectionChange={e => setSel(e.detail.selectedItems)}
          filter={<TextFilter {...filterProps} filteringPlaceholder="Find backups" />} pagination={<Pagination {...paginationProps} />}
          empty={<Box textAlign="center" color="inherit"><b>No backups</b><Box variant="p" color="inherit">You don't have any backups.</Box></Box>}
          columnDefinitions={[
            { id: "n", header: "Name", cell: (b: any) => b.BackupName, sortingField: "BackupName" },
            { id: "t", header: "Source table", cell: (b: any) => <Link href={tableHref(b.TableName)}>{b.TableName}</Link> },
            { id: "s", header: "Status", cell: (b: any) => b.BackupStatus === "AVAILABLE" ? <StatusIndicator type="success">Available</StatusIndicator> : <StatusIndicator type="in-progress">{b.BackupStatus}</StatusIndicator> },
            { id: "c", header: "Creation time", cell: (b: any) => fmtDate(b.BackupCreationDateTime), sortingField: "BackupCreationDateTime" },
            { id: "sz", header: "Size", cell: (b: any) => fmtBytes(b.BackupSizeBytes || 0) },
            { id: "ty", header: "Backup type", cell: (b: any) => b.BackupType },
          ]}
        />
      </SpaceBetween>
      <Modal visible={create} onDismiss={() => setCreate(false)} header="Create on-demand backup"
        footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => setCreate(false)}>Cancel</Button>
          <Button variant="primary" disabled={!tbl || !name} onClick={async () => { try { await ddb("CreateBackup", { TableName: tbl.value, BackupName: name }); flash.notify({ type: "success", content: `Creating backup ${name}.` }); setCreate(false); data.reload(); } catch (e) { flash.error(e); } }}>Create backup</Button></SpaceBetween></Box>}>
        <SpaceBetween size="m">
          <FormField label="Source table"><Select selectedOption={tbl} placeholder="Choose a table" options={tables.data || []} onChange={e => { setTbl(e.detail.selectedOption); setName(`${e.detail.selectedOption.value}-${new Date().toISOString().slice(0, 10)}`); }} /></FormField>
          <FormField label="Backup name"><Input value={name} onChange={e => setName(e.detail.value)} /></FormField>
        </SpaceBetween>
      </Modal>
      <ConfirmModal visible={del} onDismiss={() => setDel(false)} header={`Delete backup ${sel[0]?.BackupName}`} confirmText="delete"
        onConfirm={async () => { try { await ddb("DeleteBackup", { BackupArn: sel[0].BackupArn }); setSel([]); data.reload(); } catch (e) { flash.error(e); } setDel(false); }}>
        <Box>The backup will be permanently deleted.</Box>
      </ConfirmModal>
    </ContentLayout>
  );
}

export function RestoreBackup() {
  const [sp] = useSearchParams();
  const arn = sp.get("arn");
  const pitrTable = sp.get("pitr");
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: pitrTable ? "Tables" : "Backups", href: pitrTable ? "#/dynamodb/tables" : "#/dynamodb/backups" }, { text: pitrTable ? "Restore to point in time" : "Restore backup", href: "#" }]);
  const src = useAsync(async () => {
    if (arn) return (await ddb("DescribeBackup", { BackupArn: arn })).BackupDescription;
    const [t, c] = await Promise.all([ddb("DescribeTable", { TableName: pitrTable }), ddb("DescribeContinuousBackups", { TableName: pitrTable })]);
    return { table: t.Table, pitr: c.ContinuousBackupsDescription.PointInTimeRecoveryDescription };
  }, [arn, pitrTable]);
  const [name, setName] = useState("");
  const [when, setWhen] = useState("latest");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 8));
  const [idx, setIdx] = useState("all");
  const [encMode, setEncMode] = useState("same");
  const [enc, setEnc] = useState<Enc>({ kind: "owned", key: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const p: any = { TargetTableName: name };
      if (idx === "none") p.GlobalSecondaryIndexOverride = [];
      if (encMode === "custom") p.SSESpecificationOverride = sseSpec(enc);
      if (arn) await ddb("RestoreTableFromBackup", { ...p, BackupArn: arn });
      else {
        p.SourceTableName = pitrTable;
        if (when === "latest") p.UseLatestRestorableTime = true; else p.RestoreDateTime = new Date(`${date}T${time}`).toISOString();
        await ddb("RestoreTableToPointInTime", p);
      }
      flash.notify({ type: "success", content: <>Restoring to the new table {name}. <a href={tableHref(name)}>View table</a></> });
      nav("/dynamodb/tables");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const s: any = src.data;
  return (
    <ContentLayout header={<Header variant="h1" description="Restoring creates a new table with the data from the backup or point in time.">{pitrTable ? `Restore ${pitrTable} to a point in time` : "Restore table from backup"}</Header>}>
      {src.error ? <ErrorAlert error={src.error} /> : (
        <form onSubmit={e => { e.preventDefault(); go(); }}>
          <Form errorText={err ? <ErrorAlert error={err} /> : undefined}
            actions={<SpaceBetween direction="horizontal" size="xs"><Button formAction="none" variant="link" onClick={() => nav(-1)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name}>Restore</Button></SpaceBetween>}>
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Source</Header>}>
                {s && (arn
                  ? <ColumnLayout columns={3} variant="text-grid">
                      <ValueWithLabel label="Backup name">{s.BackupDetails?.BackupName}</ValueWithLabel>
                      <ValueWithLabel label="Source table">{s.SourceTableDetails?.TableName}</ValueWithLabel>
                      <ValueWithLabel label="Backup created">{fmtDate(s.BackupDetails?.BackupCreationDateTime)}</ValueWithLabel>
                    </ColumnLayout>
                  : <ColumnLayout columns={3} variant="text-grid">
                      <ValueWithLabel label="Source table">{pitrTable}</ValueWithLabel>
                      <ValueWithLabel label="Earliest restore time">{fmtDate(s.pitr?.EarliestRestorableDateTime)}</ValueWithLabel>
                      <ValueWithLabel label="Latest restore time">{fmtDate(s.pitr?.LatestRestorableDateTime)}</ValueWithLabel>
                    </ColumnLayout>)}
              </Container>
              <Container header={<Header variant="h2">Table details</Header>}>
                <SpaceBetween size="l">
                  <FormField label="New table name" constraintText="Between 3 and 255 characters."><Input value={name} onChange={e => setName(e.detail.value)} placeholder="Enter the new table name" /></FormField>
                  {pitrTable && <>
                    <FormField label="Restore date and time">
                      <RadioGroup value={when} onChange={e => setWhen(e.detail.value)} items={[{ value: "latest", label: "Latest restorable time" }, { value: "custom", label: "Specify date and time" }]} />
                    </FormField>
                    {when === "custom" && <SpaceBetween direction="horizontal" size="xs"><DatePicker value={date} onChange={e => setDate(e.detail.value)} placeholder="YYYY/MM/DD" /><TimeInput value={time} onChange={e => setTime(e.detail.value)} format="hh:mm:ss" /></SpaceBetween>}
                  </>}
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2">Secondary indexes</Header>}>
                <RadioGroup value={idx} onChange={e => setIdx(e.detail.value)} items={[{ value: "all", label: "Restore the entire table with all secondary indexes" }, { value: "none", label: "Restore the table without global secondary indexes" }]} />
              </Container>
              <Container header={<Header variant="h2">Encryption at rest</Header>}>
                <SpaceBetween size="m">
                  <Tiles value={encMode} onChange={e => setEncMode(e.detail.value)} items={[{ value: "same", label: "Same as the source" }, { value: "custom", label: "Choose an encryption key" }]} />
                  {encMode === "custom" && <EncryptionFields value={enc} onChange={setEnc} />}
                </SpaceBetween>
              </Container>
            </SpaceBetween>
          </Form>
        </form>
      )}
    </ContentLayout>
  );
}
