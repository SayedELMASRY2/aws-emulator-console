import { useState } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useCrumbs } from "../../App";
import { useAsync, useFlash } from "../../common";
import { glueAll, crumbs, useGlueRoles, createGlueRole } from "./lib";

export default function GettingStarted() {
  useCrumbs(crumbs({ text: "Getting started" }));
  const flash = useFlash();
  const roles = useGlueRoles();
  const glueRoles = (roles.data || []).filter((r: any) => r.description === "Trusts AWS Glue");
  const [busy, setBusy] = useState(false);
  const counts = useAsync(async () => {
    const safe = (p: Promise<any[]>) => p.then(l => l.length).catch(() => NaN);
    const dbs = await glueAll("GetDatabases", "DatabaseList").catch(() => []);
    const [crawlers, jobs, triggers, workflows, conns] = await Promise.all([
      safe(glueAll("GetCrawlers", "Crawlers")), safe(glueAll("GetJobs", "Jobs")), safe(glueAll("GetTriggers", "Triggers")),
      safe(glueAll("ListWorkflows", "Workflows")), safe(glueAll("GetConnections", "ConnectionList")),
    ]);
    const tables = (await Promise.all(dbs.map((d: any) => glueAll("GetTables", "TableList", { DatabaseName: d.Name }).catch(() => [])))).flat().length;
    return [["Databases", dbs.length, "databases"], ["Tables", tables, "tables"], ["Crawlers", crawlers, "crawlers"], ["ETL jobs", jobs, "jobs"],
      ["Triggers", triggers, "triggers"], ["Workflows", workflows, "workflows"], ["Connections", conns, "connections"]] as [string, number, string][];
  }, []);
  const setup = async () => {
    setBusy(true);
    try { const a = await createGlueRole("AWSGlueServiceRole-console"); flash.notify({ type: "success", content: `Created IAM role ${a}.` }); roles.reload(); }
    catch (e) { flash.error(e, "Couldn't create the role"); } finally { setBusy(false); }
  };
  return (
    <ContentLayout header={<Header variant="h1" description="AWS Glue is a serverless data integration service that makes it easy to discover, prepare, and combine data for analytics, machine learning, and application development.">AWS Glue</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2" description="Set up IAM permissions so AWS Glue can access your data and run jobs.">Prepare your account for AWS Glue</Header>}>
          <SpaceBetween size="s">
            {glueRoles.length
              ? <StatusIndicator>{glueRoles.length} IAM role(s) that AWS Glue can assume: {glueRoles.map((r: any) => r.label).join(", ")}</StatusIndicator>
              : <StatusIndicator type="warning">No IAM role trusts AWS Glue yet.</StatusIndicator>}
            <Box variant="p" color="text-body-secondary">The emulator enforces IAM: jobs and crawlers run as their role, so the role needs access to the S3 data they read and write. The setup role gets AWSGlueServiceRole and AmazonS3FullAccess.</Box>
            <Button loading={busy} onClick={setup} disabled={glueRoles.some((r: any) => r.label === "AWSGlueServiceRole-console")}>Set up IAM role</Button>
          </SpaceBetween>
        </Container>
        <ColumnLayout columns={2}>
          <Container header={<Header variant="h2" description="Use crawlers to discover the schema of data in Amazon S3 and add tables to the Data Catalog.">Catalog and search for datasets</Header>}>
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="primary" href="#/glue/crawlers/create">Set up crawler</Button>
              <Button href="#/glue/tables/create">Add table manually</Button>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="Write Python or PySpark scripts that read, transform and write your data. Jobs run for real in the emulator.">Author and run ETL jobs</Header>}>
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="primary" href="#/glue/jobs/create?engine=spark">Author code with a script editor</Button>
              <Button href="#/glue/jobs/create?engine=pythonshell">Python shell</Button>
            </SpaceBetween>
          </Container>
        </ColumnLayout>
        <Container header={<Header variant="h2" actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => counts.reload()} />}>Resources</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            {(counts.data || []).map(([l, n, p]) => <div key={p}><Box variant="awsui-key-label">{l}</Box><Link href={`#/glue/${p}`} fontSize="display-l">{isNaN(n) ? "-" : String(n)}</Link></div>)}
          </ColumnLayout>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
