import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import LogGroups from "./LogGroups";
import CreateLogGroup from "./CreateLogGroup";
import LogGroupDetail from "./LogGroupDetail";
import LogStreamViewer from "./LogStreamViewer";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/logs/${path}`,
  info,
});

export const LOGS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "CloudWatch Logs", href: "#/logs/log-groups" },
  items: [
    L("Log groups", "log-groups"),
    { type: "divider" },
    {
      type: "section",
      text: "Logs analysis",
      defaultExpanded: true,
      items: [
        L("Live Tail", "unsupported/live-tail", na),
        L("Logs Insights", "unsupported/insights", na),
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

export default function LogsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="log-groups" replace />} />
      <Route path="log-groups" element={<LogGroups />} />
      <Route path="log-groups/create" element={<CreateLogGroup />} />
      <Route path="log-groups/:groupName" element={<Fresh><LogGroupDetail /></Fresh>} />
      <Route path="log-groups/:groupName/streams/:streamName" element={<Fresh><LogStreamViewer /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
