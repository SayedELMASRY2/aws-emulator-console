import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import QueryEditor from "./QueryEditor";
import RecentQueries from "./RecentQueries";
import SavedQueries from "./SavedQueries";
import Workgroups from "./Workgroups";
import CreateWorkgroup from "./CreateWorkgroup";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/athena/${path}`,
  info,
});

export const ATHENA_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon Athena", href: "#/athena/query-editor" },
  items: [
    L("Query editor", "query-editor"),
    L("Recent queries", "recent-queries"),
    L("Saved queries", "saved-queries"),
    { type: "divider" },
    {
      type: "section",
      text: "Administration",
      defaultExpanded: true,
      items: [
        L("Workgroups", "workgroups"),
        L("Data sources", "unsupported/data-sources", na),
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

export default function AthenaRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="query-editor" replace />} />
      <Route path="query-editor" element={<Fresh><QueryEditor /></Fresh>} />
      <Route path="recent-queries" element={<RecentQueries />} />
      <Route path="saved-queries" element={<SavedQueries />} />
      <Route path="workgroups" element={<Workgroups />} />
      <Route path="workgroups/create" element={<CreateWorkgroup />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
