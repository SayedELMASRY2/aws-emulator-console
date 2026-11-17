import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Dashboard from "./Dashboard";
import Roles from "./Roles";
import CreateRole from "./CreateRole";
import RoleDetail from "./RoleDetail";
import Policies from "./Policies";
import CreatePolicy from "./CreatePolicy";
import PolicyDetail from "./PolicyDetail";
import Users, { CreateUser } from "./Users";
import UserGroups from "./UserGroups";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/iam/${path}`,
  info,
});

export const IAM_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "IAM", href: "#/iam/dashboard" },
  items: [
    L("Dashboard", "dashboard"),
    { type: "divider" },
    {
      type: "section",
      text: "Access management",
      defaultExpanded: true,
      items: [
        L("User groups", "user-groups"),
        L("Users", "users"),
        L("Roles", "roles"),
        L("Policies", "policies"),
        L("Identity providers", "unsupported/identity-providers", na),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: "Access reports",
      defaultExpanded: true,
      items: [L("Credential report", "unsupported/credential-report", na)],
    },
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function IamRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="roles" element={<Roles />} />
      <Route path="roles/create" element={<CreateRole />} />
      <Route path="roles/:roleName" element={<Fresh><RoleDetail /></Fresh>} />
      <Route path="policies" element={<Policies />} />
      <Route path="policies/create" element={<CreatePolicy />} />
      <Route path="policies/:policyArn" element={<Fresh><PolicyDetail /></Fresh>} />
      <Route path="users" element={<Users />} />
      <Route path="users/create" element={<CreateUser />} />
      <Route path="user-groups" element={<UserGroups />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
