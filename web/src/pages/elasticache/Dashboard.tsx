import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Cards from "@cloudscape-design/components/cards";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Link from "@cloudscape-design/components/link";
import { useCrumbs } from "../../App";
import { useAsync, EmulatorNote } from "../../common";
import { ecAll, crumbs } from "./lib";

export default function Dashboard() {
  useCrumbs(crumbs({ text: "Dashboard" }));

  const counts = useAsync(async () => {
    const [clusters, subnetGroups, paramGroups] = await Promise.all([
      ecAll("DescribeCacheClusters", "CacheClusters"),
      ecAll("DescribeCacheSubnetGroups", "CacheSubnetGroups"),
      ecAll("DescribeCacheParameterGroups", "CacheParameterGroups"),
    ]);

    const redis = (clusters || []).filter((c: any) => c.Engine === "redis" || c.Engine === "valkey");
    const memcached = (clusters || []).filter((c: any) => c.Engine === "memcached");

    return {
      redisCount: redis.length,
      memcachedCount: memcached.length,
      subnetGroupsCount: (subnetGroups || []).length,
      paramGroupsCount: (paramGroups || []).length,
    };
  });

  const c = counts.data || { redisCount: 0, memcachedCount: 0, subnetGroupsCount: 0, paramGroupsCount: 0 };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Amazon ElastiCache is a web service that makes it easy to deploy, operate, and scale an in-memory data store or cache in the cloud."
          actions={
            <Button variant="primary" href="#/elasticache/clusters/create">
              Create cluster
            </Button>
          }
        >
          ElastiCache Dashboard
        </Header>
      }
    >
      <SpaceBetween size="l">
        <EmulatorNote>
          The emulator executes real in-memory Redis and Memcached server sockets on <code>127.0.0.1:&lt;port&gt;</code>. You can connect to active cache clusters directly with <code>redis-cli</code> or native client libraries.
        </EmulatorNote>

        <Container header={<Header variant="h2">Resources</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">Redis clusters</Box>
              <Link href="#/elasticache/redis" fontSize="display-l">
                {c.redisCount}
              </Link>
            </div>
            <div>
              <Box variant="awsui-key-label">Memcached clusters</Box>
              <Link href="#/elasticache/memcached" fontSize="display-l">
                {c.memcachedCount}
              </Link>
            </div>
            <div>
              <Box variant="awsui-key-label">Subnet groups</Box>
              <Link href="#/elasticache/subnet-groups" fontSize="display-l">
                {c.subnetGroupsCount}
              </Link>
            </div>
            <div>
              <Box variant="awsui-key-label">Parameter groups</Box>
              <Link href="#/elasticache/parameter-groups" fontSize="display-l">
                {c.paramGroupsCount}
              </Link>
            </div>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Get started with ElastiCache</Header>}>
          <Cards
            items={[
              {
                title: "Redis clusters",
                description: "Blazing fast in-memory data structure store used as a database, cache, and message broker.",
                href: "#/elasticache/clusters/create?engine=redis",
                cta: "Create Redis cluster",
              },
              {
                title: "Memcached clusters",
                description: "High-performance, distributed memory object caching system designed for scaling web applications.",
                href: "#/elasticache/clusters/create?engine=memcached",
                cta: "Create Memcached cluster",
              },
            ]}
            cardDefinition={{
              header: item => <Link href={item.href} fontSize="heading-m"><b>{item.title}</b></Link>,
              sections: [
                {
                  id: "desc",
                  content: item => (
                    <SpaceBetween size="m">
                      <Box variant="p" color="text-body-secondary">{item.description}</Box>
                      <Button href={item.href}>{item.cta}</Button>
                    </SpaceBetween>
                  ),
                },
              ],
            }}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
