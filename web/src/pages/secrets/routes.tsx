import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Secrets from "./Secrets";
import CreateSecret from "./CreateSecret";
import SecretDetail from "./SecretDetail";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/secrets/${path}`,
  info,
});

export const SECRETS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "AWS Secrets Manager", href: "#/secrets" },
  items: [
    { type: "link", text: "Secrets", href: "#/secrets" },
    { type: "divider" },
    L("Rotation templates", "unsupported/rotation-templates", na),
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function SecretsRoutes() {
  return (
    <Routes>
      <Route index element={<Secrets />} />
      <Route path="create" element={<CreateSecret />} />
      <Route path=":secretName" element={<Fresh><SecretDetail /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
