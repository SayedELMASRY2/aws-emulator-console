import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Functions from "./Functions";
import CreateFunction from "./CreateFunction";
import FunctionDetail from "./FunctionDetail";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/lambda/${path}`,
  info,
});

export const LAMBDA_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "AWS Lambda", href: "#/lambda/functions" },
  items: [
    L("Functions", "functions"),
    { type: "divider" },
    {
      type: "section",
      text: "Additional resources",
      defaultExpanded: true,
      items: [
        L("Code signing configurations", "unsupported/code-signing", na),
        L("Layers", "unsupported/layers", na),
        L("Applications", "unsupported/applications", na),
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

export default function LambdaRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="functions" replace />} />
      <Route path="functions" element={<Functions />} />
      <Route path="functions/create" element={<CreateFunction />} />
      <Route path="functions/:name" element={<Fresh><FunctionDetail /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
