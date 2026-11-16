import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Grid from "@cloudscape-design/components/grid";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { fmtBytes, useAsync, ValueWithLabel } from "../../common";
import { describeAll, isOnDemand, tableHref } from "./lib";

export default function Dashboard() {
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: "Dashboard", href: "#" }]);
  const tables = useAsync(describeAll, []);
  const alarms = useAsync(async () => ((await api.call("cloudwatch", "DescribeAlarms")).MetricAlarms || []).filter((a: any) => a.Namespace === "AWS/DynamoDB"), []);
  const dax = useAsync(async () => (await api.call("dax", "DescribeClusters")).Clusters || [], []);
  const t = tables.data || [];
  const n = (f: (x: any) => boolean) => t.filter(f).length;
  return (
    <ContentLayout header={<Header variant="h1">Dashboard</Header>}>
      <Grid gridDefinition={[{ colspan: { default: 12, l: 8 } }, { colspan: { default: 12, l: 4 } }]}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="A summary of the tables in this Region.">Tables</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              <ValueWithLabel label="Total tables"><Link href="#/dynamodb/tables" fontSize="display-l">{tables.loading ? "…" : String(t.length)}</Link></ValueWithLabel>
              <ValueWithLabel label="On-demand"><Box fontSize="display-l">{n(isOnDemand)}</Box></ValueWithLabel>
              <ValueWithLabel label="Provisioned"><Box fontSize="display-l">{n(x => !isOnDemand(x))}</Box></ValueWithLabel>
              <ValueWithLabel label="Total size"><Box fontSize="display-l">{fmtBytes(t.reduce((a, x) => a + (x.TableSizeBytes || 0), 0))}</Box></ValueWithLabel>
            </ColumnLayout>
          </Container>
          <Table
            header={<Header counter={`(${alarms.data?.length || 0})`} description="CloudWatch alarms on DynamoDB metrics.">Alarms</Header>}
            loading={alarms.loading} items={alarms.data || []}
            empty={<Box textAlign="center" color="inherit"><b>No alarms</b><Box variant="p" color="inherit">There are no alarms on DynamoDB metrics.</Box></Box>}
            columnDefinitions={[
              { id: "n", header: "Alarm name", cell: (a: any) => a.AlarmName },
              { id: "s", header: "State", cell: (a: any) => <StatusIndicator type={a.StateValue === "ALARM" ? "error" : a.StateValue === "OK" ? "success" : "pending"}>{a.StateValue}</StatusIndicator> },
              { id: "m", header: "Metric", cell: (a: any) => a.MetricName },
              { id: "t", header: "Table", cell: (a: any) => { const d = (a.Dimensions || []).find((x: any) => x.Name === "TableName"); return d ? <Link href={tableHref(d.Value)}>{d.Value}</Link> : "-"; } },
            ]}
          />
          <Table
            header={<Header counter={`(${t.length})`} actions={<Button href="#/dynamodb/tables">View all tables</Button>}>Recently created tables</Header>}
            loading={tables.loading}
            items={[...t].sort((a, b) => String(b.CreationDateTime).localeCompare(String(a.CreationDateTime))).slice(0, 5)}
            empty={<Box textAlign="center" color="inherit">No tables</Box>}
            columnDefinitions={[
              { id: "n", header: "Name", cell: (x: any) => <Link href={tableHref(x.TableName)}>{x.TableName}</Link> },
              { id: "s", header: "Status", cell: (x: any) => <StatusIndicator type={x.TableStatus === "ACTIVE" ? "success" : "pending"}>{x.TableStatus === "ACTIVE" ? "Active" : x.TableStatus}</StatusIndicator> },
              { id: "i", header: "Items", cell: (x: any) => x.ItemCount ?? 0 },
            ]}
          />
        </SpaceBetween>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Create resources</Header>}>
            <SpaceBetween size="m">
              <Box>Create a table to store your data, or a DAX cluster to accelerate reads.</Box>
              <Button variant="primary" href="#/dynamodb/create-table">Create table</Button>
              <Button href="#/dynamodb/dax/clusters">Create DAX cluster</Button>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">DAX clusters</Header>}>
            <ValueWithLabel label="Clusters">{dax.loading ? "…" : (dax.data?.length ?? 0)}</ValueWithLabel>
          </Container>
        </SpaceBetween>
      </Grid>
    </ContentLayout>
  );
}
