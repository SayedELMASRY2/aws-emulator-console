import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Parameters from "./Parameters";
import CreateParameter from "./CreateParameter";
import ParameterDetail from "./ParameterDetail";
import EditParameter from "./EditParameter";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/ssm/${path}`,
  info,
});

export const SSM_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "AWS Systems Manager", href: "#/ssm/parameters" },
  items: [
    {
      type: "section",
      text: "Application Management",
      defaultExpanded: true,
      items: [
        L("Parameter Store", "parameters"),
        L("AppConfig", "unsupported/appconfig", na),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: "Node Management",
      defaultExpanded: true,
      items: [
        L("Fleet Manager", "unsupported/fleet-manager", na),
        L("Session Manager", "unsupported/session-manager", na),
        L("Run Command", "unsupported/run-command", na),
        L("State Manager", "unsupported/state-manager", na),
        L("Patch Manager", "unsupported/patch-manager", na),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: "Operations Management",
      defaultExpanded: true,
      items: [
        L("Explorer", "unsupported/explorer", na),
        L("Incident Manager", "unsupported/incident-manager", na),
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

export default function SsmRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="parameters" replace />} />
      <Route path="parameters" element={<Parameters />} />
      <Route path="parameters/create" element={<CreateParameter />} />
      <Route path="parameters/:paramName" element={<Fresh><ParameterDetail /></Fresh>} />
      <Route path="parameters/:paramName/edit" element={<Fresh><EditParameter /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
