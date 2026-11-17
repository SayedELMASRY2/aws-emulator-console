import { useState } from "react";
import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import { useCrumbs } from "../../App";
import { useAsync, ErrorAlert, Copyable } from "../../common";
import { logs, crumbs, fmt, enc } from "./lib";

export interface LogEventRow {
  timestamp: number;
  message: string;
  ingestionTime?: number;
}

export default function LogStreamViewer() {
  const { groupName = "", streamName = "" } = useParams();

  useCrumbs(
    crumbs(
      { text: "Log groups", href: "#/logs/log-groups" },
      { text: groupName, href: `#/logs/log-groups/${enc(groupName)}` },
      { text: streamName }
    )
  );

  const [filterPattern, setFilterPattern] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const eventsData = useAsync(async () => {
    if (activeFilter.trim()) {
      const res = await logs("FilterLogEvents", {
        logGroupName: groupName,
        logStreamNames: [streamName],
        filterPattern: activeFilter.trim(),
      });
      return (res.events || []) as LogEventRow[];
    } else {
      const res = await logs("GetLogEvents", {
        logGroupName: groupName,
        logStreamName: streamName,
        startFromHead: true,
        limit: 100,
      });
      return (res.events || []) as LogEventRow[];
    }
  }, [groupName, streamName, activeFilter]);

  const handleSearch = () => {
    setActiveFilter(filterPattern);
  };

  const handleClear = () => {
    setFilterPattern("");
    setActiveFilter("");
  };

  const events = eventsData.data || [];

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <Button
              iconName="refresh"
              loading={eventsData.loading}
              onClick={() => eventsData.reload()}
            >
              Refresh
            </Button>
          }
        >
          {streamName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container>
          <SpaceBetween direction="horizontal" size="xs">
            <div style={{ flex: 1, minWidth: "300px" }}>
              <Input
                type="search"
                value={filterPattern}
                placeholder="Filter events (e.g. ERROR, START, orderId)"
                onChange={e => setFilterPattern(e.detail.value)}
                onKeyDown={e => {
                  if (e.detail.key === "Enter") handleSearch();
                }}
              />
            </div>
            <Button onClick={handleSearch}>Filter</Button>
            {activeFilter && <Button onClick={handleClear}>Clear</Button>}
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header variant="h2" counter={`(${events.length})`}>
              Log events
            </Header>
          }
        >
          <div
            style={{
              background: "#161d26",
              borderRadius: "4px",
              padding: "8px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "12px",
              color: "#d5dbdb",
              maxHeight: "600px",
              overflowY: "auto",
            }}
          >
            {eventsData.loading && !events.length ? (
              <Box padding="m" color="text-body-secondary">
                Loading log events...
              </Box>
            ) : events.length ? (
              events.map((ev, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: "16px",
                    padding: "3px 8px",
                    borderBottom: "1px solid #232f3e",
                    lineHeight: "1.5",
                  }}
                >
                  <span style={{ color: "#879596", minWidth: "160px", userSelect: "none" }}>
                    {fmt(ev.timestamp)}
                  </span>
                  <span style={{ flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {ev.message}
                  </span>
                </div>
              ))
            ) : (
              <Box padding="m" color="text-body-secondary" textAlign="center">
                No log events found matching the criteria.
              </Box>
            )}
          </div>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
