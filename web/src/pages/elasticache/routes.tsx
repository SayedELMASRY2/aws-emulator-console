import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Dashboard from "./Dashboard";
import { RedisClusters, MemcachedClusters } from "./Clusters";
import CreateCluster from "./CreateCluster";
import ClusterDetail from "./ClusterDetail";
import SubnetGroups, { CreateSubnetGroup } from "./SubnetGroups";
import ParameterGroups, { CreateParameterGroup } from "./ParameterGroups";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/elasticache/${path}`,
  info,
});

export const ELASTICACHE_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon ElastiCache", href: "#/elasticache/dashboard" },
  items: [
    L("Dashboard", "dashboard"),
    { type: "divider" },
    {
      type: "section",
      text: "Caches",
      defaultExpanded: true,
      items: [
        L("Redis clusters", "redis"),
        L("Memcached clusters", "memcached"),
        L("Serverless caches", "unsupported/serverless", na),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: "Cache management",
      defaultExpanded: true,
      items: [
        L("Subnet groups", "subnet-groups"),
        L("Parameter groups", "parameter-groups"),
        L("User groups", "unsupported/user-groups", na),
        L("Backups", "unsupported/backups", na),
      ],
    },
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function ElastiCacheRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="redis" element={<RedisClusters />} />
      <Route path="memcached" element={<MemcachedClusters />} />
      <Route path="clusters/create" element={<CreateCluster />} />
      <Route path="clusters/:clusterId" element={<Fresh><ClusterDetail /></Fresh>} />
      <Route path="subnet-groups" element={<SubnetGroups />} />
      <Route path="subnet-groups/create" element={<CreateSubnetGroup />} />
      <Route path="parameter-groups" element={<ParameterGroups />} />
      <Route path="parameter-groups/create" element={<CreateParameterGroup />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
