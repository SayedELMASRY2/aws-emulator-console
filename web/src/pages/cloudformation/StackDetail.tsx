import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Modal from "@cloudscape-design/components/modal";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Textarea from "@cloudscape-design/components/textarea";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { cfn, crumbs, St, fmt, enc } from "./lib";

export default function StackDetail() {
  const { stackName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Stacks", href: "#/cloudformation/stacks" },
      { text: stackName }
    )
  );

  const stackData = useAsync(async () => {
    const res = await cfn("DescribeStacks", { StackName: stackName });
    const s = (res.Stacks || [])[0];
    if (!s) throw new Error(`Stack ${stackName} not found`);
    return s;
  }, [stackName]);

  const resourcesData = useAsync(async () => {
    try {
      const res = await cfn("DescribeStackResources", { StackName: stackName });
      return res.StackResources || [];
    } catch {
      return [];
    }
  }, [stackName]);

  const eventsData = useAsync(async () => {
    try {
      const res = await cfn("DescribeStackEvents", { StackName: stackName });
      return res.StackEvents || [];
    } catch {
      return [];
    }
  }, [stackName]);

  const templateData = useAsync(async () => {
    try {
      const res = await cfn("GetTemplate", { StackName: stackName });
      const body = res.TemplateBody;
      return typeof body === "string" ? body : JSON.stringify(body, null, 2);
    } catch {
      return "";
    }
  }, [stackName]);

  const stk = stackData.data;

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await cfn("DeleteStack", { StackName: stackName });
      flash.notify({ type: "success", content: `Requested deletion of stack ${stackName}.` });
      nav("/cloudformation/stacks");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleteOpen(true)}>
                Delete stack
              </Button>
            </SpaceBetween>
          }
        >
          {stackName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Stack overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={stk?.StackStatus} />
            </ValueWithLabel>
            <ValueWithLabel label="Description">{stk?.Description || "-"}</ValueWithLabel>
            <ValueWithLabel label="Created time">{fmt(stk?.CreationTime)}</ValueWithLabel>
            <ValueWithLabel label="Updated time">{fmt(stk?.LastUpdatedTime || stk?.CreationTime)}</ValueWithLabel>
            <ValueWithLabel label="Stack ID">
              {stk?.StackId ? <Copyable text={stk.StackId} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "resources",
              label: `Resources (${resourcesData.data?.length ?? 0})`,
              content: (
                <Table
                  items={resourcesData.data || []}
                  loading={resourcesData.loading}
                  columnDefinitions={[
                    {
                      id: "logical",
                      header: "Logical ID",
                      cell: (r: any) => <b>{r.LogicalResourceId}</b>,
                    },
                    {
                      id: "physical",
                      header: "Physical ID",
                      cell: (r: any) => (
                        <SpaceBetween direction="horizontal" size="xxs">
                          <code>{r.PhysicalResourceId || "-"}</code>
                          {r.PhysicalResourceId && <Copyable text={r.PhysicalResourceId} iconOnly />}
                        </SpaceBetween>
                      ),
                    },
                    {
                      id: "type",
                      header: "Type",
                      cell: (r: any) => <code>{r.ResourceType}</code>,
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (r: any) => <St s={r.ResourceStatus} />,
                    },
                    {
                      id: "timestamp",
                      header: "Last updated",
                      cell: (r: any) => fmt(r.Timestamp),
                    },
                  ]}
                  empty="No resources found in this stack."
                />
              ),
            },
            {
              id: "events",
              label: `Events (${eventsData.data?.length ?? 0})`,
              content: (
                <Table
                  items={eventsData.data || []}
                  loading={eventsData.loading}
                  columnDefinitions={[
                    {
                      id: "time",
                      header: "Timestamp",
                      cell: (e: any) => fmt(e.Timestamp),
                    },
                    {
                      id: "logical",
                      header: "Logical ID",
                      cell: (e: any) => <b>{e.LogicalResourceId}</b>,
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (e: any) => <St s={e.ResourceStatus} />,
                    },
                    {
                      id: "type",
                      header: "Resource type",
                      cell: (e: any) => <code>{e.ResourceType}</code>,
                    },
                    {
                      id: "reason",
                      header: "Status reason",
                      cell: (e: any) => e.ResourceStatusReason || "-",
                    },
                  ]}
                  empty="No events recorded for this stack."
                />
              ),
            },
            {
              id: "outputs",
              label: `Outputs (${stk?.Outputs?.length ?? 0})`,
              content: (
                <Table
                  items={stk?.Outputs || []}
                  columnDefinitions={[
                    { id: "key", header: "Key", cell: (o: any) => <b>{o.OutputKey}</b> },
                    {
                      id: "val",
                      header: "Value",
                      cell: (o: any) => (
                        <SpaceBetween direction="horizontal" size="xxs">
                          <code>{o.OutputValue}</code>
                          <Copyable text={o.OutputValue} iconOnly />
                        </SpaceBetween>
                      ),
                    },
                    { id: "desc", header: "Description", cell: (o: any) => o.Description || "-" },
                  ]}
                  empty="No outputs defined in this template."
                />
              ),
            },
            {
              id: "template",
              label: "Template",
              content: (
                <Container header={<Header variant="h2">Template document</Header>}>
                  <div className="code-editor">
                    <Textarea value={templateData.data || "Loading template..."} rows={18} readOnly />
                  </div>
                </Container>
              ),
            },
          ]}
        />

        {/* Delete Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete stack: ${stackName}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={deleting}
                    disabled={confirmName !== stackName}
                    onClick={handleDelete}
                  >
                    Delete stack
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete stack <b>{stackName}</b>?
                All resources provisioned by this stack will be deleted.
              </Box>
              <FormField label={`To confirm deletion, type "${stackName}" in the field below:`}>
                <Input
                  value={confirmName}
                  placeholder={stackName}
                  onChange={e => setConfirmName(e.detail.value)}
                />
              </FormField>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
