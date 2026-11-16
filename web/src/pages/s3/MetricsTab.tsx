import { useState } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import PieChart from "@cloudscape-design/components/pie-chart";
import { ConfirmModal, EmulatorNote, ErrorAlert, fmtBytes, useAsync, useFlash, ValueWithLabel } from "../../common";
import { s3, getOr, listAllObjects, storageClassLabel } from "./lib";
import { Section } from "./PropertiesTab";

export default function MetricsTab({ bucket }: { bucket: string }) {
  const flash = useFlash();
  const stats = useAsync(async () => {
    const objs = await listAllObjects(bucket);
    const byClass = new Map<string, { n: number; size: number }>();
    for (const o of objs) {
      const c = o.StorageClass || "STANDARD";
      const x = byClass.get(c) || { n: 0, size: 0 };
      x.n++; x.size += o.Size || 0; byClass.set(c, x);
    }
    return { count: objs.length, size: objs.reduce((a, o) => a + (o.Size || 0), 0), byClass: [...byClass.entries()].map(([c, v]) => ({ c, ...v })) };
  }, [bucket]);
  const analytics = useAsync(() => getOr("ListBucketAnalyticsConfigurations", { Bucket: bucket }, {}).then((r: any) => r.AnalyticsConfigurationList || []), [bucket]);
  const metrics = useAsync(() => getOr("ListBucketMetricsConfigurations", { Bucket: bucket }, {}).then((r: any) => r.MetricsConfigurationList || []), [bucket]);
  const [selA, setSelA] = useState<any[]>([]);
  const [selM, setSelM] = useState<any[]>([]);
  const [modal, setModal] = useState<"" | "analytics" | "metrics" | "delA" | "delM">("");

  return (
    <SpaceBetween size="l">
      <Section title="Bucket metrics" description="Storage metrics for this bucket. In AWS these come from CloudWatch once a day; here they're computed live from the emulator.">
        {stats.error ? <ErrorAlert error={stats.error} /> : (
          <ColumnLayout columns={2}>
            <SpaceBetween size="l">
              <ValueWithLabel label="Total bucket size"><Box fontSize="display-l" fontWeight="bold">{stats.data ? fmtBytes(stats.data.size) : "…"}</Box></ValueWithLabel>
              <ValueWithLabel label="Total number of objects"><Box fontSize="display-l" fontWeight="bold">{stats.data ? stats.data.count : "…"}</Box></ValueWithLabel>
              <Button iconName="refresh" onClick={() => stats.reload()}>Refresh</Button>
            </SpaceBetween>
            <PieChart
              size="medium"
              variant="donut"
              hideFilter
              statusType={stats.loading ? "loading" : "finished"}
              data={(stats.data?.byClass || []).map(x => ({ title: storageClassLabel(x.c), value: x.size }))}
              segmentDescription={d => fmtBytes(d.value)}
              innerMetricDescription="bytes"
              innerMetricValue={stats.data ? fmtBytes(stats.data.size) : ""}
              ariaLabel="Storage by storage class"
              empty={<Box textAlign="center" color="inherit">No objects</Box>}
            />
          </ColumnLayout>
        )}
      </Section>

      <Container header={<Header variant="h2" counter={`(${analytics.data?.length || 0})`}
        description="Analyze storage access patterns to help you decide when to transition objects to the appropriate storage class."
        actions={<SpaceBetween direction="horizontal" size="xs"><Button disabled={!selA.length} onClick={() => setModal("delA")}>Delete</Button><Button onClick={() => setModal("analytics")}>Create analytics configuration</Button></SpaceBetween>}>Storage Class Analysis</Header>}>
        {analytics.error ? <ErrorAlert error={analytics.error} /> : (
          <Table variant="embedded" loading={analytics.loading} items={analytics.data || []} trackBy="Id" selectionType="multi" selectedItems={selA} onSelectionChange={e => setSelA(e.detail.selectedItems)}
            empty={<Box textAlign="center" color="inherit"><b>No analytics configurations</b></Box>}
            columnDefinitions={[
              { id: "n", header: "Name", cell: (a: any) => a.Id },
              { id: "f", header: "Filter", cell: (a: any) => a.Filter?.Prefix ? `Prefix: ${a.Filter.Prefix}` : a.Filter?.And?.Prefix ? `Prefix: ${a.Filter.And.Prefix}` : "Entire bucket" },
              { id: "e", header: "Export destination", cell: (a: any) => a.StorageClassAnalysis?.DataExport?.Destination?.S3BucketDestination?.Bucket || "-" },
            ]} />
        )}
      </Container>

      <Container header={<Header variant="h2" counter={`(${metrics.data?.length || 0})`}
        description="Request metrics give one-minute CloudWatch metrics for requests, filtered by prefix, tag or access point."
        actions={<SpaceBetween direction="horizontal" size="xs"><Button disabled={!selM.length} onClick={() => setModal("delM")}>Delete</Button><Button onClick={() => setModal("metrics")}>Create filter</Button></SpaceBetween>}>Request metrics filters</Header>}>
        <SpaceBetween size="s">
          {metrics.error ? <ErrorAlert error={metrics.error} /> : (
            <Table variant="embedded" loading={metrics.loading} items={metrics.data || []} trackBy="Id" selectionType="multi" selectedItems={selM} onSelectionChange={e => setSelM(e.detail.selectedItems)}
              empty={<Box textAlign="center" color="inherit"><b>No filters</b></Box>}
              columnDefinitions={[
                { id: "n", header: "Filter name", cell: (m: any) => m.Id },
                { id: "s", header: "Filter scope", cell: (m: any) => m.Filter?.Prefix ? `Prefix: ${m.Filter.Prefix}` : m.Filter?.Tag ? `Tag: ${m.Filter.Tag.Key}=${m.Filter.Tag.Value}` : "Entire bucket" },
              ]} />
          )}
          <EmulatorNote>The filters are stored, but the emulator doesn't produce CloudWatch request metric graphs.</EmulatorNote>
        </SpaceBetween>
      </Container>

      <Section title="Replication metrics" description="Monitor bytes pending, operations pending and replication latency for replication rules.">
        <EmulatorNote>Replication metrics come from CloudWatch and aren't produced by the emulator.</EmulatorNote>
      </Section>

      <AnalyticsModal visible={modal === "analytics"} onDismiss={() => setModal("")} bucket={bucket} onDone={() => analytics.reload()} />
      <MetricsFilterModal visible={modal === "metrics"} onDismiss={() => setModal("")} bucket={bucket} onDone={() => metrics.reload()} />
      <ConfirmModal visible={modal === "delA" || modal === "delM"} onDismiss={() => setModal("")} header="Delete configurations"
        onConfirm={async () => {
          try {
            if (modal === "delA") { for (const a of selA) await s3("DeleteBucketAnalyticsConfiguration", { Bucket: bucket, Id: a.Id }); setSelA([]); analytics.reload(); }
            else { for (const m of selM) await s3("DeleteBucketMetricsConfiguration", { Bucket: bucket, Id: m.Id }); setSelM([]); metrics.reload(); }
            flash.notify({ type: "success", content: "Deleted." });
          } catch (e) { flash.error(e); }
          setModal("");
        }}>
        <Box>Delete {(modal === "delA" ? selA : selM).map(x => x.Id).join(", ")}?</Box>
      </ConfirmModal>
    </SpaceBetween>
  );
}

function AnalyticsModal({ visible, onDismiss, bucket, onDone }: any) {
  const flash = useFlash();
  const [id, setId] = useState("");
  const [scope, setScope] = useState("all");
  const [prefix, setPrefix] = useState("");
  const [exp, setExp] = useState(false);
  const [dest, setDest] = useState<any>(null);
  const buckets = useAsync(async () => (visible ? ((await s3("ListBuckets")).Buckets || []).map((b: any) => ({ value: b.Name, label: b.Name })) : []), [visible]);
  const go = async () => {
    const cfg: any = { Id: id, StorageClassAnalysis: {} };
    if (scope === "prefix" && prefix) cfg.Filter = { Prefix: prefix };
    if (exp && dest) cfg.StorageClassAnalysis = { DataExport: { OutputSchemaVersion: "V_1", Destination: { S3BucketDestination: { Format: "CSV", Bucket: `arn:aws:s3:::${dest.value}`, Prefix: "analytics/" } } } };
    try { await s3("PutBucketAnalyticsConfiguration", { Bucket: bucket, Id: id, AnalyticsConfiguration: cfg }); flash.notify({ type: "success", content: `Created analytics configuration "${id}".` }); onDismiss(); onDone(); }
    catch (e) { flash.error(e); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Create analytics configuration"
      footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={onDismiss}>Cancel</Button><Button variant="primary" disabled={!id} onClick={go}>Create configuration</Button></SpaceBetween></Box>}>
      <SpaceBetween size="m">
        <FormField label="Name"><Input value={id} onChange={e => setId(e.detail.value)} /></FormField>
        <FormField label="Configuration scope">
          <RadioGroup value={scope} onChange={e => setScope(e.detail.value)} items={[{ value: "all", label: "Analyze entire bucket" }, { value: "prefix", label: "Limit the scope of the analysis using filters" }]} />
        </FormField>
        {scope === "prefix" && <FormField label="Prefix"><Input value={prefix} onChange={e => setPrefix(e.detail.value)} /></FormField>}
        <Checkbox checked={exp} onChange={e => setExp(e.detail.checked)}>Export CSV</Checkbox>
        {exp && <FormField label="Destination bucket"><Select selectedOption={dest} onChange={e => setDest(e.detail.selectedOption)} options={buckets.data || []} placeholder="Choose bucket" /></FormField>}
      </SpaceBetween>
    </Modal>
  );
}

function MetricsFilterModal({ visible, onDismiss, bucket, onDone }: any) {
  const flash = useFlash();
  const [id, setId] = useState("");
  const [scope, setScope] = useState("all");
  const [prefix, setPrefix] = useState("");
  const go = async () => {
    const cfg: any = { Id: id };
    if (scope === "prefix" && prefix) cfg.Filter = { Prefix: prefix };
    try { await s3("PutBucketMetricsConfiguration", { Bucket: bucket, Id: id, MetricsConfiguration: cfg }); flash.notify({ type: "success", content: `Created filter "${id}".` }); onDismiss(); onDone(); }
    catch (e) { flash.error(e); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Create filter"
      footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={onDismiss}>Cancel</Button><Button variant="primary" disabled={!id} onClick={go}>Save</Button></SpaceBetween></Box>}>
      <SpaceBetween size="m">
        <FormField label="Filter name"><Input value={id} onChange={e => setId(e.detail.value)} placeholder="EntireBucket" /></FormField>
        <FormField label="Filter scope">
          <RadioGroup value={scope} onChange={e => setScope(e.detail.value)} items={[{ value: "all", label: "This filter applies to all objects in the bucket" }, { value: "prefix", label: "Limit the scope of this filter using a prefix" }]} />
        </FormField>
        {scope === "prefix" && <FormField label="Prefix"><Input value={prefix} onChange={e => setPrefix(e.detail.value)} /></FormField>}
      </SpaceBetween>
    </Modal>
  );
}
