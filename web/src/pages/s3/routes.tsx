import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Fragment, type ReactElement } from "react";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import BucketsList from "./BucketsList";
import CreateBucket from "./CreateBucket";
import BucketDetail from "./BucketDetail";
import EditBucketSetting from "./EditBucketSetting";
import { LifecycleRuleForm, ReplicationRuleForm, InventoryForm, EventNotificationForm, TieringForm } from "./RuleForms";
import Upload from "./Upload";
import ObjectDetail from "./ObjectDetail";
import EditObjectSetting from "./EditObjectSetting";
import Unsupported from "./Unsupported";
import AccountBpa from "./AccountBpa";

const na = <Badge color="grey">n/a</Badge>;
export const S3_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon S3", href: "#/s3/buckets" },
  items: [
    { type: "section", text: "Buckets", defaultExpanded: true, items: [
      { type: "link", text: "General purpose buckets", href: "#/s3/buckets" },
      { type: "link", text: "Directory buckets", href: "#/s3/directory-buckets" },
      { type: "link", text: "Table buckets", href: "#/s3/unsupported/table-buckets", info: na },
      { type: "link", text: "Vector buckets", href: "#/s3/unsupported/vector-buckets", info: na },
    ] },
    { type: "section", text: "Access management and security", defaultExpanded: true, items: [
      { type: "link", text: "Access Points", href: "#/s3/unsupported/access-points", info: na },
      { type: "link", text: "Object Lambda Access Points", href: "#/s3/unsupported/object-lambda", info: na },
      { type: "link", text: "Multi-Region Access Points", href: "#/s3/unsupported/mrap", info: na },
      { type: "link", text: "Access Grants", href: "#/s3/unsupported/access-grants", info: na },
      { type: "link", text: "IAM Access Analyzer", href: "#/s3/unsupported/access-analyzer", info: na },
      { type: "link", text: "Block Public Access settings for this account", href: "#/s3/account-bpa" },
    ] },
    { type: "section", text: "Data management", defaultExpanded: true, items: [
      { type: "link", text: "Batch Operations", href: "#/s3/unsupported/batch-operations", info: na },
    ] },
    { type: "section", text: "Storage Lens", defaultExpanded: false, items: [
      { type: "link", text: "Dashboards", href: "#/s3/unsupported/storage-lens", info: na },
      { type: "link", text: "Storage Lens groups", href: "#/s3/unsupported/storage-lens-groups", info: na },
    ] },
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

// Remount a page whenever its URL changes, so state from a previous rule/setting never leaks into the next one.
function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function S3Routes() {
  return (
    <Routes>
      <Route index element={<Navigate to="buckets" replace />} />
      <Route path="buckets" element={<BucketsList kind="general" />} />
      <Route path="directory-buckets" element={<BucketsList kind="directory" />} />
      <Route path="bucket/create" element={<Fresh><CreateBucket /></Fresh>} />
      <Route path="account-bpa" element={<AccountBpa />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
      <Route path="buckets/:bucket" element={<BucketDetail />} />
      <Route path="buckets/:bucket/upload" element={<Fresh><Upload /></Fresh>} />
      <Route path="buckets/:bucket/edit/:setting" element={<Fresh><EditBucketSetting /></Fresh>} />
      <Route path="buckets/:bucket/lifecycle/:id" element={<Fresh><LifecycleRuleForm /></Fresh>} />
      <Route path="buckets/:bucket/replication/:id" element={<Fresh><ReplicationRuleForm /></Fresh>} />
      <Route path="buckets/:bucket/inventory/:id" element={<Fresh><InventoryForm /></Fresh>} />
      <Route path="buckets/:bucket/notification/:id" element={<Fresh><EventNotificationForm /></Fresh>} />
      <Route path="buckets/:bucket/tiering/:id" element={<Fresh><TieringForm /></Fresh>} />
      <Route path="buckets/:bucket/object" element={<Fresh><ObjectDetail /></Fresh>} />
      <Route path="buckets/:bucket/object/edit/:setting" element={<Fresh><EditObjectSetting /></Fresh>} />
      <Route path="*" element={<Navigate to="buckets" replace />} />
    </Routes>
  );
}
