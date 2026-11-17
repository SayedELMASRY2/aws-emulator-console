import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useCrumbs } from "../../App";
import { useFlash, Copyable } from "../../common";
import { athena, crumbs, St, fmt } from "./lib";

export interface RecentQueryRow {
  QueryExecutionId: string;
  Query: string;
  StatementType?: string;
  ResultConfiguration?: { OutputLocation?: string };
  QueryExecutionContext?: { Database?: string };
  Status?: {
    State?: string;
    StateChangeReason?: string;
    SubmissionDateTime?: string;
    CompletionDateTime?: string;
  };
  Statistics?: {
    EngineExecutionTimeInMillis?: number;
    DataScannedInBytes?: number;
  };
  WorkGroup?: string;
}

export default function RecentQueries() {
  useCrumbs(crumbs({ text: "Recent queries" }));
  const nav = useNavigate();
  const flash = useFlash();

  const loadRecentQueries = async (): Promise<RecentQueryRow[]> => {
    const listRes = await athena("ListQueryExecutions", {});
    const ids: string[] = listRes.QueryExecutionIds || [];
    if (!ids.length) return [];

    const batchRes = await athena("BatchGetQueryExecution", {
      QueryExecutionIds: ids.slice(0, 50),
    });
    return (batchRes.QueryExecutions || []) as RecentQueryRow[];
  };

  const columns: Col<RecentQueryRow>[] = [
    {
      id: "query",
      header: "Query",
      cell: q => (
        <span style={{ fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap" }}>
          {q.Query.length > 80 ? q.Query.slice(0, 80) + "..." : q.Query}
        </span>
      ),
    },
    {
      id: "state",
      header: "Status",
      cell: q => <St s={q.Status?.State} />,
    },
    {
      id: "database",
      header: "Database",
      cell: q => q.QueryExecutionContext?.Database || "default",
    },
    {
      id: "runTime",
      header: "Run time",
      cell: q =>
        q.Statistics?.EngineExecutionTimeInMillis !== undefined
          ? `${(q.Statistics.EngineExecutionTimeInMillis / 1000).toFixed(2)}s`
          : "-",
    },
    {
      id: "submitted",
      header: "Submitted at",
      cell: q => fmt(q.Status?.SubmissionDateTime),
    },
    {
      id: "qid",
      header: "Query ID",
      cell: q => (
        <SpaceBetween direction="horizontal" size="xxs">
          <code>{q.QueryExecutionId.slice(0, 8)}...</code>
          <Copyable text={q.QueryExecutionId} iconOnly />
        </SpaceBetween>
      ),
    },
  ];

  const actions: Action<RecentQueryRow>[] = [
    {
      id: "open",
      text: "Open in Query editor",
      disabled: sel => sel.length !== 1,
      run: sel => {
        const item = sel[0];
        // Save to active session buffer for editor
        localStorage.setItem("athena_active_query", item.Query);
        nav("/athena/query-editor");
      },
    },
  ];

  return (
    <ResourcePage<RecentQueryRow>
      title="Recent queries"
      description="View recent queries run in Amazon Athena, their execution status, run times, and data scanned."
      load={loadRecentQueries}
      columns={columns}
      trackBy="QueryExecutionId"
      actions={actions}
      multi={false}
      poll={q => q.Status?.State === "RUNNING" || q.Status?.State === "QUEUED"}
    />
  );
}
