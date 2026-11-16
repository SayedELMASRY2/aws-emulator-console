import { useState } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Grid from "@cloudscape-design/components/grid";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Box from "@cloudscape-design/components/box";
import Alert from "@cloudscape-design/components/alert";
import { useCrumbs } from "../../App";
import { ErrorAlert, useAsync } from "../../common";
import { JsonBlock } from "../s3/PermissionsTab";
import { ddb, listTableNames, avPreview, unmarshalItem } from "./lib";

export default function PartiQL() {
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "PartiQL editor", href: "#" }]);
  const names = useAsync(listTableNames, []);
  const [sql, setSql] = useState("");
  const [items, setItems] = useState<any[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [view, setView] = useState("table");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const run = async (more = false) => {
    setErr(null); setBusy(true);
    const t0 = performance.now();
    try {
      const r = await ddb("ExecuteStatement", { Statement: sql, ...(more && next ? { NextToken: next } : {}) });
      setItems(more ? [...(items || []), ...(r.Items || [])] : r.Items || []);
      setNext(r.NextToken || null);
      setMs(Math.round(performance.now() - t0));
    } catch (e) { setErr(e); setItems(null); } finally { setBusy(false); }
  };
  const cols = items ? [...new Set(items.flatMap(i => Object.keys(i)))] : [];
  const template = (t: string, kind: string) => {
    if (kind === "scan") setSql(`SELECT * FROM "${t}"`);
    if (kind === "insert") setSql(`INSERT INTO "${t}" VALUE {'pk': 'value', 'attr': 'value'}`);
    if (kind === "update") setSql(`UPDATE "${t}"\nSET attr = 'value'\nWHERE pk = 'value'`);
    if (kind === "delete") setSql(`DELETE FROM "${t}"\nWHERE pk = 'value'`);
  };
  return (
    <ContentLayout header={<Header variant="h1" description="Query, insert, update and delete table data with PartiQL, a SQL-compatible query language.">PartiQL editor</Header>}>
      <Grid gridDefinition={[{ colspan: { default: 12, m: 3 } }, { colspan: { default: 12, m: 9 } }]}>
        <Container header={<Header variant="h2" counter={`(${names.data?.length || 0})`}>Tables</Header>}>
          <SpaceBetween size="xs">
            {(names.data || []).map(n => (
              <ExpandableSection key={n} headerText={n} variant="footer">
                <ButtonDropdown variant="inline-icon" ariaLabel={`Actions for ${n}`} onItemClick={e => template(n, e.detail.id)} items={[
                  { id: "scan", text: "Scan table" }, { id: "insert", text: "Insert item" }, { id: "update", text: "Update item" }, { id: "delete", text: "Delete item" },
                ]} />
              </ExpandableSection>
            ))}
            {!names.loading && !names.data?.length && <Box color="text-body-secondary">No tables</Box>}
          </SpaceBetween>
        </Container>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="Ctrl+Enter runs the statement.">Query 1</Header>}>
            <SpaceBetween size="s">
              <div className="code-editor" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); }}>
                <Textarea rows={8} value={sql} onChange={e => setSql(e.detail.value)} spellcheck={false} placeholder={'SELECT * FROM "table-name" WHERE pk = \'value\''} />
              </div>
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="primary" loading={busy} disabled={!sql.trim()} onClick={() => run()}>Run</Button>
                <Button onClick={() => { setSql(""); setItems(null); setErr(null); }}>Clear</Button>
              </SpaceBetween>
            </SpaceBetween>
          </Container>
          {err ? <ErrorAlert error={err} /> : items && <Alert type="success">Completed · {items.length} item(s) returned · {ms} ms</Alert>}
          {items && (
            <Container header={<Header variant="h2" counter={`(${items.length})`} actions={<SegmentedControl selectedId={view} onChange={e => setView(e.detail.selectedId)} options={[{ id: "table", text: "Table view" }, { id: "json", text: "JSON view" }]} />}>Items returned</Header>}
              footer={next ? <Box textAlign="center"><Button loading={busy} onClick={() => run(true)}>Retrieve next page</Button></Box> : undefined}>
              {view === "table"
                ? <Table variant="embedded" items={items} resizableColumns empty={<Box textAlign="center" color="inherit">The statement returned no items.</Box>}
                    columnDefinitions={cols.map(c => ({ id: c, header: c, cell: (i: any) => i[c] ? avPreview(i[c]) : "" }))} />
                : <JsonBlock value={JSON.stringify(items.map(unmarshalItem))} empty="[]" />}
            </Container>
          )}
        </SpaceBetween>
      </Grid>
    </ContentLayout>
  );
}
