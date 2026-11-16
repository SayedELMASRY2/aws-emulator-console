import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Grid from "@cloudscape-design/components/grid";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useCrumbs } from "../../App";
import { useAsync, ErrorAlert } from "../../common";
import { rds, rdsAll, crumbs } from "./lib";

const Item = ({ label, href, children }: { label: string; href: string; children: React.ReactNode }) => (
  <Box><Link href={href}>{label}</Link> <Box variant="span" color="text-body-secondary">{children}</Box></Box>
);

export default function Dashboard() {
  useCrumbs(crumbs({ text: "Dashboard" }));
  const d = useAsync(async () => {
    const safe = <T,>(p: Promise<T>, f: T) => p.catch(() => f);
    const [inst, cl, snaps, csnaps, pgs, cpgs, ogs, sgs, subs, evs, quotas, recs, proxies] = await Promise.all([
      safe(rdsAll("DescribeDBInstances", "DBInstances"), []), safe(rdsAll("DescribeDBClusters", "DBClusters"), []),
      safe(rdsAll("DescribeDBSnapshots", "DBSnapshots"), []), safe(rdsAll("DescribeDBClusterSnapshots", "DBClusterSnapshots"), []),
      safe(rdsAll("DescribeDBParameterGroups", "DBParameterGroups"), []), safe(rdsAll("DescribeDBClusterParameterGroups", "DBClusterParameterGroups"), []),
      safe(rdsAll("DescribeOptionGroups", "OptionGroupsList"), []), safe(rdsAll("DescribeDBSubnetGroups", "DBSubnetGroups"), []),
      safe(rdsAll("DescribeEventSubscriptions", "EventSubscriptionsList"), []),
      safe(rds("DescribeEvents", { Duration: 1440 }).then(r => r.Events || []), []),
      safe(rds("DescribeAccountAttributes").then(r => r.AccountQuotas || []), []),
      safe(rds("DescribeDBRecommendations").then(r => r.DBRecommendations || []), []),
      safe(rdsAll("DescribeDBProxies", "DBProxies"), []),
    ]);
    const q = (n: string) => quotas.find((x: any) => x.AccountQuotaName === n);
    return { inst, cl, snaps, csnaps, pgs, cpgs, ogs, sgs, subs, evs, q, recs, proxies };
  }, []);
  const x = d.data;
  const all = [...(x?.pgs || []), ...(x?.cpgs || [])];
  const custom = all.filter((g: any) => !String(g.DBParameterGroupName || g.DBClusterParameterGroupName).startsWith("default.")).length;
  const ogCustom = (x?.ogs || []).filter((g: any) => !g.OptionGroupName.startsWith("default:")).length;
  const storage = (x?.inst || []).reduce((s: number, i: any) => s + (i.AllocatedStorage || 0), 0);
  const recs = (x?.recs || []).filter((r: any) => r.Status === "active");
  const sev = (s: string) => recs.filter((r: any) => r.Severity === s).length;
  return (
    <ContentLayout header={<Header variant="h1">Dashboard</Header>}>
      <SpaceBetween size="l">
        {d.error ? <ErrorAlert error={d.error} /> : null}
        <Grid gridDefinition={[{ colspan: { default: 12, l: 8 } }, { colspan: { default: 12, l: 4 } }]}>
          <Container header={<Header variant="h2" description="You are using the following Amazon RDS resources in the US East (N. Virginia) region (used/quota)" actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => d.reload()} />}>Resources</Header>}>
            {x && (
              <ColumnLayout columns={2} variant="text-grid">
                <SpaceBetween size="xs">
                  <Item label={`DB Instances (${x.inst.length}/${x.q("DBInstances")?.Max ?? 40})`} href="#/rds/databases">
                    {Object.entries(x.inst.reduce((m: any, i: any) => ({ ...m, [i.DBInstanceStatus]: (m[i.DBInstanceStatus] || 0) + 1 }), {})).map(([s, n]) => `${n} ${s}`).join(", ") || "none"}
                  </Item>
                  <Item label={`Allocated storage (${storage} GB/${Math.round((x.q("AllocatedStorage")?.Max ?? 100000) / 1000)} TB)`} href="#/rds/databases">{""}</Item>
                  <Item label={`DB Clusters (${x.cl.length}/${x.q("DBClusters")?.Max ?? 40})`} href="#/rds/databases">{""}</Item>
                  <Item label="Reserved instances (0/40)" href="#/rds/unsupported/reserved-instances">{""}</Item>
                  <Item label={`Snapshots (${x.snaps.length + x.csnaps.length})`} href="#/rds/snapshots">
                    Manual: {x.snaps.filter((s: any) => s.SnapshotType === "manual").length + x.csnaps.filter((s: any) => s.SnapshotType === "manual").length}/{x.q("ManualSnapshots")?.Max ?? 100} · Automated: {x.snaps.filter((s: any) => s.SnapshotType === "automated").length + x.csnaps.filter((s: any) => s.SnapshotType === "automated").length}
                  </Item>
                  <Item label={`Proxies (${x.proxies.length})`} href="#/rds/proxies">{""}</Item>
                </SpaceBetween>
                <SpaceBetween size="xs">
                  <Item label={`Recent events (${x.evs.length})`} href="#/rds/events">{""}</Item>
                  <Item label={`Event subscriptions (${x.subs.length}/${x.q("EventSubscriptions")?.Max ?? 20})`} href="#/rds/event-subscriptions">{""}</Item>
                  <Item label={`Parameter groups (${all.length})`} href="#/rds/parameter-groups">Custom: {custom}/{x.q("DBParameterGroups")?.Max ?? 50} · Default: {all.length - custom}</Item>
                  <Item label={`Option groups (${x.ogs.length})`} href="#/rds/option-groups">Custom: {ogCustom}/{x.q("OptionGroups")?.Max ?? 20} · Default: {x.ogs.length - ogCustom}</Item>
                  <Item label={`Subnet groups (${x.sgs.length}/${x.q("DBSubnetGroups")?.Max ?? 50})`} href="#/rds/subnet-groups">{""}</Item>
                  <Box><Box variant="span" color="text-body-secondary">Supported platforms</Box> VPC</Box>
                  <Box><Box variant="span" color="text-body-secondary">Default network</Box> {x.sgs.find((g: any) => g.DBSubnetGroupName === "default")?.VpcId || "-"}</Box>
                </SpaceBetween>
              </ColumnLayout>
            )}
          </Container>
          <Container header={<Header variant="h2" counter={`(${recs.length})`}>Recommendations</Header>}>
            <SpaceBetween size="s">
              <ColumnLayout columns={3} variant="text-grid">
                <div><Box variant="awsui-key-label">High</Box><StatusIndicator type="error">{sev("high")}</StatusIndicator></div>
                <div><Box variant="awsui-key-label">Medium</Box><StatusIndicator type="warning">{sev("medium")}</StatusIndicator></div>
                <div><Box variant="awsui-key-label">Low</Box><StatusIndicator type="info">{sev("low")}</StatusIndicator></div>
              </ColumnLayout>
              <Link href="#/rds/recommendations">View all recommendations</Link>
            </SpaceBetween>
          </Container>
        </Grid>
        <Container header={<Header variant="h2" description="Amazon Relational Database Service (RDS) makes it easy to set up, operate, and scale a relational database in the cloud.">Create database</Header>}>
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" href="#/rds/databases/create">Create database</Button>
            <Button href="#/rds/snapshots">Restore from snapshot</Button>
          </SpaceBetween>
          <Box variant="p" color="text-body-secondary" padding={{ top: "s" }}>Note: your DB instances will launch in the US East (N. Virginia) region. MySQL, MariaDB and PostgreSQL databases run as real servers on 127.0.0.1.</Box>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
