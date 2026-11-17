import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Queues from "./Queues";
import CreateQueue from "./CreateQueue";
import QueueDetail from "./QueueDetail";
import SendReceiveMessages from "./SendReceiveMessages";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/sqs/${path}`,
  info,
});

export const SQS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon SQS", href: "#/sqs/queues" },
  items: [
    L("Queues", "queues"),
    { type: "divider" },
    L("Dead-letter queue redrive", "unsupported/redrive", na),
    { type: "divider" },
    { type: "link", text: "Console home", href: "#/" },
  ],
};

function Fresh({ children }: { children: ReactElement }) {
  const loc = useLocation();
  return <Fragment key={loc.pathname + loc.search}>{children}</Fragment>;
}

export default function SqsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="queues" replace />} />
      <Route path="queues" element={<Queues />} />
      <Route path="queues/create" element={<CreateQueue />} />
      <Route path="queues/:queueName" element={<Fresh><QueueDetail /></Fresh>} />
      <Route path="queues/:queueName/send-receive" element={<Fresh><SendReceiveMessages /></Fresh>} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
