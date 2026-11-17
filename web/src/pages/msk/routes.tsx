import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Clusters from "./Clusters";
import CreateCluster from "./CreateCluster";
import ClusterDetail from "./ClusterDetail";
import Configurations from "./Configurations";
import CreateConfiguration from "./CreateConfiguration";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/msk/${path}`,
  info,
});

export const MSK_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon MSK", href: "#/msk/clusters" },
  items: [
    L("Clusters", "clusters"),
    L("Cluster configurations", "configurations"),
    { type: "divider" },
    {
      type: "section",
      text: "MSK Connect",
      defaultExpanded: true,
      items: [
        L("Custom plugins", "unsupported/custom-plugins", na),
        L("Connectors", "unsupported/connectors", na),
        L("Worker configurations", "unsupported/worker-configurations", na),
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

export default function MskRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="clusters" replace />} />
      <Route path="clusters" element={<Clusters />} />
      <Route path="clusters/create" element={<CreateCluster />} />
      <Route path="clusters/:arn" element={<Fresh><ClusterDetail /></Fresh>} />
      <Route path="configurations" element={<Configurations />} />
      <Route path="configurations/create" element={<CreateConfiguration />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
