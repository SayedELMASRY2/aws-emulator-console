import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Link from "@cloudscape-design/components/link";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import { useCrumbs } from "../../App";
import { useAsync, ValueWithLabel, Copyable } from "../../common";
import { sfn, crumbs, smNameFromArn, execNameFromArn, St, fmt, enc } from "./lib";

export default function ExecutionDetail() {
  const { execArn = "" } = useParams();

  const execData = useAsync(async () => {
    const res = await sfn("DescribeExecution", { executionArn: execArn });
    return res;
  }, [execArn]);

  const historyData = useAsync(async () => {
    try {
      const res = await sfn("GetExecutionHistory", { executionArn: execArn });
      return res.events || [];
    } catch {
      return [];
    }
  }, [execArn]);

  const ex = execData.data;
  const smArn = ex?.stateMachineArn || "";
  const smName = smNameFromArn(smArn);
  const execName = ex?.name || execNameFromArn(execArn);

  useCrumbs(
    crumbs(
      { text: "State machines", href: "#/stepfunctions/state-machines" },
      { text: smName, href: `#/stepfunctions/state-machines/${enc(smArn)}` },
      { text: execName }
    )
  );

  return (
    <ContentLayout
      header={
        <Header variant="h1">
          Execution: {execName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Execution details</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={ex?.status} />
            </ValueWithLabel>
            <ValueWithLabel label="State machine">
              <Link href={`#/stepfunctions/state-machines/${enc(smArn)}`}>
                {smName}
              </Link>
            </ValueWithLabel>
            <ValueWithLabel label="Started at">{fmt(ex?.startDate)}</ValueWithLabel>
            <ValueWithLabel label="Stopped at">{fmt(ex?.stopDate)}</ValueWithLabel>
            <ValueWithLabel label="Execution ARN">
              {ex?.executionArn ? <Copyable text={ex.executionArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <ColumnLayout columns={2}>
          <Container header={<Header variant="h2">Execution input</Header>}>
            <div
              style={{
                background: "#f2f3f3",
                padding: "10px",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {ex?.input ? (
                typeof ex.input === "string" ? (
                  (() => {
                    try {
                      return JSON.stringify(JSON.parse(ex.input), null, 2);
                    } catch {
                      return ex.input;
                    }
                  })()
                ) : (
                  JSON.stringify(ex.input, null, 2)
                )
              ) : (
                "-"
              )}
            </div>
          </Container>

          <Container header={<Header variant="h2">Execution output</Header>}>
            <div
              style={{
                background: "#f2f3f3",
                padding: "10px",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {ex?.output ? (
                typeof ex.output === "string" ? (
                  (() => {
                    try {
                      return JSON.stringify(JSON.parse(ex.output), null, 2);
                    } catch {
                      return ex.output;
                    }
                  })()
                ) : (
                  JSON.stringify(ex.output, null, 2)
                )
              ) : (
                "-"
              )}
            </div>
          </Container>
        </ColumnLayout>

        <Container
          header={
            <Header variant="h2" counter={`(${historyData.data?.length ?? 0})`}>
              Execution event history
            </Header>
          }
        >
          <Table
            items={historyData.data || []}
            loading={historyData.loading}
            columnDefinitions={[
              { id: "id", header: "ID", cell: (ev: any) => <code>{ev.id}</code> },
              { id: "type", header: "Event type", cell: (ev: any) => <b>{ev.type}</b> },
              { id: "timestamp", header: "Timestamp", cell: (ev: any) => fmt(ev.timestamp) },
              {
                id: "details",
                header: "Details",
                cell: (ev: any) => {
                  const detailsKey = Object.keys(ev).find(k => k.endsWith("Details"));
                  if (!detailsKey) return "-";
                  const detail = ev[detailsKey];
                  return (
                    <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
                      {typeof detail === "object" ? JSON.stringify(detail) : String(detail)}
                    </span>
                  );
                },
              },
            ]}
            empty="No execution events recorded."
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
