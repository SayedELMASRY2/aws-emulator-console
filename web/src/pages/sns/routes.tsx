import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Topics from "./Topics";
import CreateTopic from "./CreateTopic";
import TopicDetail from "./TopicDetail";
import PublishMessage from "./PublishMessage";
import Subscriptions from "./Subscriptions";
import CreateSubscription from "./CreateSubscription";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/sns/${path}`,
  info,
});

export const SNS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon SNS", href: "#/sns/topics" },
  items: [
    L("Topics", "topics"),
    L("Subscriptions", "subscriptions"),
    { type: "divider" },
    {
      type: "section",
      text: "Mobile",
      defaultExpanded: true,
      items: [
        L("Push notifications", "unsupported/push-notifications", na),
        L("Text messaging (SMS)", "unsupported/sms", na),
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

export default function SnsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="topics" replace />} />
      <Route path="topics" element={<Topics />} />
      <Route path="topics/create" element={<CreateTopic />} />
      <Route path="topics/:topicArn" element={<Fresh><TopicDetail /></Fresh>} />
      <Route path="topics/:topicArn/publish" element={<Fresh><PublishMessage /></Fresh>} />
      <Route path="subscriptions" element={<Subscriptions />} />
      <Route path="subscriptions/create" element={<CreateSubscription />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
