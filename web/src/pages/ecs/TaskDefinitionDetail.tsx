import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, crumbs, St } from "./lib";

export default function TaskDefinitionDetail() {
  const { family = "", revision = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  const name = `${family}:${revision}`;
  useCrumbs(
    crumbs(
      { text: "Task definitions", href: "#/ecs/task-definitions" },
      { text: name }
    )
  );

  const data = useAsync(async () => {
    const res = await ecs("DescribeTaskDefinition", { taskDefinition: name });
    return res.taskDefinition;
  }, [name]);

  const td = data.data;

  const deregister = async () => {
    if (!td) return;
    try {
      await ecs("DeregisterTaskDefinition", { taskDefinition: td.taskDefinitionArn });
      flash.notify({ type: "success", content: `Deregistered ${name}.` });
      data.reload();
    } catch (e) {
      flash.error(e, "Deregister failed");
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                disabled={td?.status === "INACTIVE"}
                onClick={deregister}
              >
                Deregister
              </Button>
              <Button
                variant="primary"
                onClick={() => nav("/ecs/task-definitions/create")}
              >
                Create new revision
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Configuration</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="Status">
              <St s={td?.status} />
            </ValueWithLabel>
            <ValueWithLabel label="Family">{td?.family}</ValueWithLabel>
            <ValueWithLabel label="Revision">{td?.revision}</ValueWithLabel>
            <ValueWithLabel label="Launch types">
              {(td?.requiresCompatibilities || ["EC2"]).join(", ")}
            </ValueWithLabel>
            <ValueWithLabel label="CPU">{td?.cpu || "-"}</ValueWithLabel>
            <ValueWithLabel label="Memory">{td?.memory ? `${td?.memory} MiB` : "-"}</ValueWithLabel>
            <ValueWithLabel label="Network mode">{td?.networkMode || "bridge"}</ValueWithLabel>
            <ValueWithLabel label="ARN">
              {td?.taskDefinitionArn ? <Copyable text={td.taskDefinitionArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header variant="h2" counter={`(${td?.containerDefinitions?.length || 0})`}>
              Container definitions
            </Header>
          }
        >
          <Table
            items={td?.containerDefinitions || []}
            columnDefinitions={[
              { id: "name", header: "Container name", cell: (c: any) => <b>{c.name}</b> },
              { id: "image", header: "Image URI", cell: (c: any) => c.image },
              { id: "essential", header: "Essential", cell: (c: any) => (c.essential ? "Yes" : "No") },
              {
                id: "ports",
                header: "Port mappings",
                cell: (c: any) =>
                  (c.portMappings || []).map((p: any) => `${p.containerPort}/${p.protocol || "tcp"}`).join(", ") || "-",
              },
              {
                id: "env",
                header: "Environment variables",
                cell: (c: any) =>
                  (c.environment || []).map((e: any) => `${e.name}=${e.value}`).join(", ") || "-",
              },
            ]}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
