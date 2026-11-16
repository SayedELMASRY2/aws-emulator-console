import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Clusters from "./Clusters";
import CreateCluster from "./CreateCluster";
import ClusterDetail from "./ClusterDetail";
import CreateService from "./CreateService";
import ServiceDetail from "./ServiceDetail";
import RunTask from "./RunTask";
import TaskDetail from "./TaskDetail";
import TaskDefinitions from "./TaskDefinitions";
import CreateTaskDefinition from "./CreateTaskDefinition";
import TaskDefinitionDetail from "./TaskDefinitionDetail";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/ecs/${path}`,
  info,
});

export const ECS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon ECS", href: "#/ecs/clusters" },
  items: [
    L("Clusters", "clusters"),
    L("Task definitions", "task-definitions"),
    { type: "divider" },
    {
      type: "section",
      text: "Cluster management",
      defaultExpanded: true,
      items: [
        L("Capacity providers", "unsupported/capacity-providers", na),
        L("Service Connect", "unsupported/service-connect", na),
      ],
    },
    { type: "divider" },
    L("Account settings", "unsupported/account-settings", na),
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function EcsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="clusters" replace />} />
      <Route path="clusters" element={<Clusters />} />
      <Route path="clusters/create" element={<CreateCluster />} />
      <Route path="clusters/:cluster" element={<Fresh><ClusterDetail /></Fresh>} />
      <Route path="clusters/:cluster/services/create" element={<Fresh><CreateService /></Fresh>} />
      <Route path="clusters/:cluster/services/:service" element={<Fresh><ServiceDetail /></Fresh>} />
      <Route path="clusters/:cluster/tasks/run" element={<Fresh><RunTask /></Fresh>} />
      <Route path="clusters/:cluster/tasks/:taskId" element={<Fresh><TaskDetail /></Fresh>} />
      <Route path="task-definitions" element={<TaskDefinitions />} />
      <Route path="task-definitions/create" element={<CreateTaskDefinition />} />
      <Route path="task-definitions/:family/:revision" element={<Fresh><TaskDefinitionDetail /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
