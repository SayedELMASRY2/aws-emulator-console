import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Stacks from "./Stacks";
import CreateStack from "./CreateStack";
import StackDetail from "./StackDetail";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/cloudformation/${path}`,
  info,
});

export const CFN_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "CloudFormation", href: "#/cloudformation/stacks" },
  items: [
    L("Stacks", "stacks"),
    { type: "divider" },
    {
      type: "section",
      text: "Infrastructure management",
      defaultExpanded: true,
      items: [
        L("StackSets", "unsupported/stacksets", na),
        L("Public extensions", "unsupported/public-extensions", na),
        L("Activated extensions", "unsupported/activated-extensions", na),
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

export default function CloudFormationRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="stacks" replace />} />
      <Route path="stacks" element={<Stacks />} />
      <Route path="stacks/create" element={<CreateStack />} />
      <Route path="stacks/:stackName" element={<Fresh><StackDetail /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
