import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Repositories from "./Repositories";
import CreateRepository from "./CreateRepository";
import RepositoryDetail from "./RepositoryDetail";
import EditLifecyclePolicy from "./EditLifecyclePolicy";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/ecr/${path}`,
  info,
});

export const ECR_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon ECR", href: "#/ecr/repositories" },
  items: [
    {
      type: "section",
      text: "Private registry",
      defaultExpanded: true,
      items: [
        L("Repositories", "repositories"),
        L("Registry permissions", "unsupported/registry-permissions", na),
        L("Replication", "unsupported/replication", na),
        L("Pull through cache", "unsupported/pull-through-cache", na),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: "Public registry",
      defaultExpanded: true,
      items: [L("Public repositories", "unsupported/public-repositories", na)],
    },
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function EcrRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="repositories" replace />} />
      <Route path="repositories" element={<Repositories />} />
      <Route path="repositories/create" element={<CreateRepository />} />
      <Route path="repositories/:repo" element={<Fresh><RepositoryDetail /></Fresh>} />
      <Route path="repositories/:repo/lifecycle" element={<Fresh><EditLifecyclePolicy /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
