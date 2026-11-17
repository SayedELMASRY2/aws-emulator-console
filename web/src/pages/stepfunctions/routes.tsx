import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import StateMachines from "./StateMachines";
import CreateStateMachine from "./CreateStateMachine";
import StateMachineDetail from "./StateMachineDetail";
import ExecutionDetail from "./ExecutionDetail";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/stepfunctions/${path}`,
  info,
});

export const SFN_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "AWS Step Functions", href: "#/stepfunctions/state-machines" },
  items: [
    L("State machines", "state-machines"),
    { type: "divider" },
    L("Activities", "unsupported/activities", na),
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function StepFunctionsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="state-machines" replace />} />
      <Route path="state-machines" element={<StateMachines />} />
      <Route path="state-machines/create" element={<CreateStateMachine />} />
      <Route path="state-machines/:smArn" element={<Fresh><StateMachineDetail /></Fresh>} />
      <Route path="executions/:execArn" element={<Fresh><ExecutionDetail /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
