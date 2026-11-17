import { Fragment, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import Badge from "@cloudscape-design/components/badge";
import Rules from "./Rules";
import CreateRule from "./CreateRule";
import EventBuses from "./EventBuses";
import SendEvents from "./SendEvents";
import Unsupported from "./Unsupported";

const na = <Badge color="grey">n/a</Badge>;
const L = (text: string, path: string, info?: any): SideNavigationProps.Item => ({
  type: "link",
  text,
  href: `#/events/${path}`,
  info,
});

export const EVENTS_NAV: { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } = {
  header: { text: "Amazon EventBridge", href: "#/events/rules" },
  items: [
    {
      type: "section",
      text: "Buses",
      defaultExpanded: true,
      items: [
        L("Rules", "rules"),
        L("Event buses", "event-buses"),
        L("Send events", "send-events"),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: "Integration",
      defaultExpanded: true,
      items: [
        L("Pipes", "unsupported/pipes", na),
        L("API destinations", "unsupported/api-destinations", na),
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

export default function EventBridgeRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="rules" replace />} />
      <Route path="rules" element={<Rules />} />
      <Route path="rules/create" element={<CreateRule />} />
      <Route path="event-buses" element={<EventBuses />} />
      <Route path="send-events" element={<SendEvents />} />
      <Route path="unsupported/:feature" element={<Unsupported />} />
    </Routes>
  );
}
