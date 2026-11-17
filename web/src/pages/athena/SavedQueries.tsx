import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import { useCrumbs } from "../../App";
import { useFlash } from "../../common";
import { crumbs, fmt } from "./lib";

export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  database: string;
  query: string;
  createdAt: string;
}

export default function SavedQueries() {
  useCrumbs(crumbs({ text: "Saved queries" }));
  const nav = useNavigate();
  const flash = useFlash();

  const [savedList, setSavedList] = useState<SavedQuery[]>([]);
  const [selected, setSelected] = useState<SavedQuery[]>([]);

  const loadSaved = () => {
    try {
      const list = JSON.parse(localStorage.getItem("athena_saved_queries") || "[]");
      setSavedList(list);
    } catch {
      setSavedList([]);
    }
  };

  useEffect(() => {
    loadSaved();
  }, []);

  const handleDelete = () => {
    if (!selected.length) return;
    const toDeleteId = selected[0].id;
    const remaining = savedList.filter(q => q.id !== toDeleteId);
    localStorage.setItem("athena_saved_queries", JSON.stringify(remaining));
    flash.notify({ type: "success", content: `Deleted saved query "${selected[0].name}".` });
    setSelected([]);
    loadSaved();
  };

  const handleOpen = () => {
    if (!selected.length) return;
    localStorage.setItem("athena_active_query", selected[0].query);
    nav("/athena/query-editor");
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Saved SQL queries for reuse in Amazon Athena."
        >
          Saved queries
        </Header>
      }
    >
      <Container>
        <Table
          items={savedList}
          selectedItems={selected}
          onSelectionChange={e => setSelected(e.detail.selectedItems)}
          selectionType="single"
          trackBy="id"
          header={
            <Header
              variant="h2"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button disabled={!selected.length} onClick={handleDelete}>
                    Delete
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!selected.length}
                    onClick={handleOpen}
                  >
                    Open in Query editor
                  </Button>
                </SpaceBetween>
              }
            >
              Saved queries ({savedList.length})
            </Header>
          }
          columnDefinitions={[
            {
              id: "name",
              header: "Name",
              cell: q => <b>{q.name}</b>,
            },
            {
              id: "desc",
              header: "Description",
              cell: q => q.description || "-",
            },
            {
              id: "db",
              header: "Database",
              cell: q => q.database || "default",
            },
            {
              id: "query",
              header: "Query",
              cell: q => (
                <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                  {q.query.length > 60 ? q.query.slice(0, 60) + "..." : q.query}
                </span>
              ),
            },
            {
              id: "created",
              header: "Saved at",
              cell: q => fmt(q.createdAt),
            },
          ]}
          empty={
            <Box textAlign="center" color="inherit">
              <b>No saved queries</b>
              <Box variant="p" color="text-body-secondary">
                In the Query editor, choose "Save as" to save your SQL queries here.
              </Box>
            </Box>
          }
        />
      </Container>
    </ContentLayout>
  );
}
