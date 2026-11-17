import { useState, useEffect } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Grid from "@cloudscape-design/components/grid";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Modal from "@cloudscape-design/components/modal";
import Input from "@cloudscape-design/components/input";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote, Copyable } from "../../common";
import {
  athena,
  crumbs,
  useDatabases,
  useTables,
  ensureAthenaBucket,
} from "./lib";

export default function QueryEditor() {
  useCrumbs(crumbs({ text: "Query editor" }));
  const flash = useFlash();

  // Data Catalog Selection
  const databases = useDatabases();
  const [selectedDb, setSelectedDb] = useState<any | null>(null);

  // Auto-select first database
  useEffect(() => {
    if (databases.data?.length && !selectedDb) {
      setSelectedDb(databases.data[0]);
    }
  }, [databases.data, selectedDb]);

  const tables = useTables(selectedDb?.value);

  // Query editor state
  const [query, setQuery] = useState("SELECT 1 AS id, 'Hello, Athena!' AS message;");
  const [running, setRunning] = useState(false);
  const [queryExecutionId, setQueryExecutionId] = useState<string | null>(null);
  const [queryStatus, setQueryStatus] = useState<string | null>(null);
  const [executionStats, setExecutionStats] = useState<{ durationMs?: number; dataScanned?: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Query Results
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);

  // Save Query Modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState("");
  const [saveQueryDesc, setSaveQueryDesc] = useState("");

  const runQuery = async () => {
    if (!query.trim()) return;
    setRunning(true);
    setQueryStatus("QUEUED");
    setErrorMsg(null);
    setHeaders([]);
    setRows([]);
    setExecutionStats(null);
    const start = performance.now();

    try {
      const outputLocation = await ensureAthenaBucket();
      const p: Record<string, any> = {
        QueryString: query.trim(),
        ResultConfiguration: { OutputLocation: outputLocation },
      };
      if (selectedDb?.value) {
        p.QueryExecutionContext = { Database: selectedDb.value };
      }

      const res = await athena("StartQueryExecution", p);
      const qid = res.QueryExecutionId;
      setQueryExecutionId(qid);

      // Poll query execution
      let finalState = "QUEUED";
      for (let i = 0; i < 30; i++) {
        const ex = await athena("GetQueryExecution", { QueryExecutionId: qid });
        const qe = ex.QueryExecution;
        finalState = qe?.Status?.State || "FAILED";
        setQueryStatus(finalState);

        if (finalState === "SUCCEEDED" || finalState === "FAILED" || finalState === "CANCELLED") {
          const durMs = Math.round(performance.now() - start);
          setExecutionStats({
            durationMs: durMs,
            dataScanned: qe?.Statistics?.DataScannedInBytes || 0,
          });

          if (finalState === "FAILED") {
            setErrorMsg(qe?.Status?.StateChangeReason || "Query execution failed.");
          }
          break;
        }
        await new Promise(r => setTimeout(r, 600));
      }

      if (finalState === "SUCCEEDED") {
        const resultRes = await athena("GetQueryResults", { QueryExecutionId: qid });
        const rawRows = resultRes.ResultSet?.Rows || [];
        if (rawRows.length > 0) {
          const colHeaders = (rawRows[0].Data || []).map((c: any) => c.VarCharValue || "");
          const dataRows = rawRows.slice(1).map((r: any) => (r.Data || []).map((c: any) => c.VarCharValue ?? ""));
          setHeaders(colHeaders);
          setRows(dataRows);
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to start query execution.");
      setQueryStatus("FAILED");
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = () => {
    if (!headers.length) return;
    const lines = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
      ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athena-query-${queryExecutionId || "results"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveQuery = () => {
    if (!saveQueryName.trim()) return;
    const list = JSON.parse(localStorage.getItem("athena_saved_queries") || "[]");
    list.unshift({
      id: "sq-" + Date.now(),
      name: saveQueryName.trim(),
      description: saveQueryDesc.trim(),
      database: selectedDb?.value || "default",
      query: query.trim(),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("athena_saved_queries", JSON.stringify(list));
    flash.notify({ type: "success", content: `Saved query "${saveQueryName}".` });
    setSaveModalOpen(false);
    setSaveQueryName("");
    setSaveQueryDesc("");
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Interactive SQL query service to analyze data directly in Amazon S3 using the AWS Glue Data Catalog."
        >
          Query editor
        </Header>
      }
    >
      <Grid gridDefinition={[{ colspan: { default: 12, s: 12, m: 3 } }, { colspan: { default: 12, s: 12, m: 9 } }]}>
        {/* Left Data Catalog Panel */}
        <Container header={<Header variant="h2">Data</Header>}>
          <SpaceBetween size="m">
            <FormField label="Data source">
              <Select
                selectedOption={{ value: "AwsDataCatalog", label: "AwsDataCatalog" }}
                onChange={() => {}}
                options={[{ value: "AwsDataCatalog", label: "AwsDataCatalog" }]}
                disabled
              />
            </FormField>

            <FormField label="Database">
              <Select
                selectedOption={selectedDb}
                onChange={e => setSelectedDb(e.detail.selectedOption)}
                options={databases.data || []}
                placeholder="Select database"
                empty="No databases in catalog"
                loadingText="Loading databases..."
              />
            </FormField>

            <Box variant="h3">Tables ({tables.data?.length || 0})</Box>

            {tables.loading ? (
              <Box color="text-body-secondary">Loading tables...</Box>
            ) : tables.data?.length ? (
              <SpaceBetween size="xs">
                {tables.data.map((t: any) => (
                  <div key={t.Name} style={{ borderBottom: "1px solid #eaeded", paddingBottom: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>{t.Name}</span>
                      <Button
                        variant="inline-icon"
                        iconName="external"
                        ariaLabel="Preview table"
                        onClick={() => {
                          const dbStr = selectedDb ? `"${selectedDb.value}".` : "";
                          setQuery(`SELECT * FROM ${dbStr}"${t.Name}" LIMIT 10;`);
                        }}
                      />
                    </div>
                    {t.StorageDescriptor?.Columns?.length && (
                      <ExpandableSection headerText="Columns" variant="footer">
                        <SpaceBetween size="xxs">
                          {t.StorageDescriptor.Columns.map((col: any) => (
                            <div
                              key={col.Name}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "12px",
                                fontFamily: "monospace",
                              }}
                            >
                              <span>{col.Name}</span>
                              <span style={{ color: "#545b64" }}>{col.Type}</span>
                            </div>
                          ))}
                        </SpaceBetween>
                      </ExpandableSection>
                    )}
                  </div>
                ))}
              </SpaceBetween>
            ) : (
              <Box color="text-body-secondary">
                {selectedDb ? "No tables found in this database." : "Select a database above to view tables."}
              </Box>
            )}
          </SpaceBetween>
        </Container>

        {/* Right Query Editor & Results Panel */}
        <SpaceBetween size="l">
          <Container
            header={
              <Header
                variant="h2"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={() => setQuery("")}>Clear</Button>
                    <Button onClick={() => setSaveModalOpen(true)}>Save as</Button>
                    <Button
                      variant="primary"
                      loading={running}
                      iconName="caret-right-filled"
                      onClick={runQuery}
                    >
                      Run
                    </Button>
                  </SpaceBetween>
                }
              >
                SQL Query
              </Header>
            }
          >
            <div className="code-editor">
              <Textarea
                value={query}
                rows={10}
                onChange={e => setQuery(e.detail.value)}
              />
            </div>
          </Container>

          {/* Results Panel */}
          <Container
            header={
              <Header
                variant="h2"
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    {queryExecutionId && (
                      <span style={{ fontSize: "12px", color: "#545b64", alignSelf: "center" }}>
                        Query ID: <code>{queryExecutionId.slice(0, 12)}...</code>
                      </span>
                    )}
                    <Button
                      disabled={!headers.length || running}
                      iconName="download"
                      onClick={downloadCsv}
                    >
                      Download CSV
                    </Button>
                  </SpaceBetween>
                }
              >
                Query results
              </Header>
            }
          >
            <SpaceBetween size="m">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  {queryStatus && (
                    <StatusIndicator
                      type={
                        queryStatus === "SUCCEEDED"
                          ? "success"
                          : queryStatus === "FAILED"
                          ? "error"
                          : "in-progress"
                      }
                    >
                      {queryStatus}
                    </StatusIndicator>
                  )}
                </div>
                {executionStats && (
                  <Box color="text-body-secondary" fontSize="body-s">
                    Run time: {(executionStats.durationMs! / 1000).toFixed(2)}s
                    {executionStats.dataScanned !== undefined && (
                      <> · Data scanned: {executionStats.dataScanned} bytes</>
                    )}
                  </Box>
                )}
              </div>

              {errorMsg && <ErrorAlert error={errorMsg} />}

              {headers.length > 0 ? (
                <Table
                  items={rows}
                  columnDefinitions={headers.map((h, i) => ({
                    id: `col-${i}`,
                    header: h,
                    cell: (row: any) => row[i] || "-",
                  }))}
                />
              ) : !running && !errorMsg ? (
                <Box textAlign="center" color="inherit">
                  <b>No results to display</b>
                  <Box variant="p" color="text-body-secondary">
                    Write a SQL query above and choose Run (or press Ctrl+Enter).
                  </Box>
                </Box>
              ) : null}
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Grid>

      {/* Save Query Modal */}
      {saveModalOpen && (
        <Modal
          visible={true}
          onDismiss={() => setSaveModalOpen(false)}
          header="Save query as"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setSaveModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={!saveQueryName.trim()} onClick={handleSaveQuery}>
                  Save
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Query name" constraintText="Required">
              <Input
                value={saveQueryName}
                placeholder="My daily report query"
                onChange={e => setSaveQueryName(e.detail.value)}
              />
            </FormField>
            <FormField label="Description (optional)">
              <Input
                value={saveQueryDesc}
                placeholder="Queries sales by category"
                onChange={e => setSaveQueryDesc(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Modal>
      )}
    </ContentLayout>
  );
}
