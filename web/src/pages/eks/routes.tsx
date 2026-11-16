import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Clusters from "./Clusters";
import CreateCluster from "./CreateCluster";
import ClusterDetail from "./ClusterDetail";
import CreateNodegroup from "./CreateNodegroup";
import CreateAddon from "./CreateAddon";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/eks/${path}`,
  info,
});

export const EKS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon EKS", href: "#/eks/clusters" },
  items: [
    L("Clusters", "clusters"),
    { type: "divider" },
    {
      type: "section",
      text: "Cluster management",
      defaultExpanded: true,
      items: [
        L("Add-ons", "unsupported/addons", na),
        L("Access entries", "unsupported/access-entries", na),
        L("Insights", "unsupported/insights", na),
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

export default function EksRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="clusters" replace />} />
      <Route path="clusters" element={<Clusters />} />
      <Route path="clusters/create" element={<CreateCluster />} />
      <Route path="clusters/:cluster" element={<Fresh><ClusterDetail /></Fresh>} />
      <Route path="clusters/:cluster/nodegroups/create" element={<Fresh><CreateNodegroup /></Fresh>} />
      <Route path="clusters/:cluster/addons/create" element={<Fresh><CreateAddon /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
