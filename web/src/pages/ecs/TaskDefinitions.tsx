import { useState } from "react";
import Link from "@cloudscape-design/components/link";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import { ResourcePage, type Col, type Action } from "../ec2/ResourcePage";
import { useFlash, ErrorAlert } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, ecsAll, crumbs, St, tdShort, enc } from "./lib";

export interface TaskDefRow {
  taskDefinitionArn: string;
  family: string;
  revision: number;
  status: string;
  cpu?: string;
  memory?: string;
  networkMode?: string;
  requiresCompatibilities?: string[];
  containerDefinitions: {
    name: string;
    image: string;
    cpu?: number;
    memory?: number;
    essential?: boolean;
    portMappings?: { containerPort: number; protocol?: string }[];
  }[];
}

export default function TaskDefinitions() {
  useCrumbs(crumbs({ text: "Task definitions" }));
  const flash = useFlash();

  const [deregisterTarget, setDeregisterTarget] = useState<TaskDefRow | null>(null);
  const [deregistering, setDeregistering] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadTaskDefs = async (): Promise<TaskDefRow[]> => {
    const arns: string[] = await ecsAll("ListTaskDefinitions", "taskDefinitionArns", {
      status: "ACTIVE",
    });
    if (!arns.length) return [];
    // Describe task definitions (limit to recent 50)
    const defs = await Promise.all(
      arns.slice(0, 50).map(async a => {
        try {
          const r = await ecs("DescribeTaskDefinition", { taskDefinition: a });
          return r.taskDefinition;
        } catch {
          return null;
        }
      })
    );
    return defs.filter(Boolean) as TaskDefRow[];
  };

  const columns: Col<TaskDefRow>[] = [
    {
      id: "name",
      header: "Task definition",
      cell: t => (
        <Link href={`#/ecs/task-definitions/${enc(t.family)}/${t.revision}`}>
          <b>{t.family}:{t.revision}</b>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: t => <St s={t.status} />,
    },
    {
      id: "containers",
      header: "Containers",
      cell: t => (
        <SpaceBetween size="xxs">
          {(t.containerDefinitions || []).map(c => (
            <span key={c.name}>
              <b>{c.name}</b> ({c.image})
            </span>
          ))}
        </SpaceBetween>
      ),
    },
    {
      id: "cpuMem",
      header: "CPU / Memory",
      cell: t => `${t.cpu || "-"} / ${t.memory ? `${t.memory} MiB` : "-"}`,
    },
    {
      id: "networkMode",
      header: "Network mode",
      cell: t => t.networkMode || "bridge",
    },
    {
      id: "compatibilities",
      header: "Launch types",
      cell: t => (t.requiresCompatibilities || ["EC2"]).join(", "),
    },
  ];

  const actions: Action<TaskDefRow>[] = [
    {
      id: "deregister",
      text: "Deregister revision",
      disabled: sel => sel.length !== 1 || sel[0].status === "INACTIVE",
      run: (sel, reload) => {
        setDeregisterTarget(sel[0]);
        setError(null);
      },
    },
  ];

  const handleDeregister = async (reload: () => void) => {
    if (!deregisterTarget) return;
    setDeregistering(true);
    setError(null);
    try {
      await ecs("DeregisterTaskDefinition", {
        taskDefinition: deregisterTarget.taskDefinitionArn,
      });
      flash.notify({
        type: "success",
        content: `Deregistered task definition ${deregisterTarget.family}:${deregisterTarget.revision}.`,
      });
      setDeregisterTarget(null);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setDeregistering(false);
    }
  };

  return (
    <>
      <ResourcePage<TaskDefRow>
        title="Task definitions"
        description="A task definition is required to run Docker containers in Amazon ECS. You can describe your application across multiple container definitions."
        load={loadTaskDefs}
        columns={columns}
        trackBy="taskDefinitionArn"
        create={{ text: "Create new task definition", href: "#/ecs/task-definitions/create" }}
        actions={actions}
        multi={false}
      />

      {deregisterTarget && (
        <Modal
          visible={true}
          onDismiss={() => setDeregisterTarget(null)}
          header={`Deregister ${deregisterTarget.family}:${deregisterTarget.revision}`}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeregisterTarget(null)} disabled={deregistering}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={deregistering}
                  onClick={() => handleDeregister(() => window.location.reload())}
                >
                  Deregister
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <Box>
              Are you sure you want to deregister revision <b>{deregisterTarget.family}:{deregisterTarget.revision}</b>?
              Existing running tasks will continue to run, but new tasks cannot be started using this revision.
            </Box>
            <ErrorAlert error={error} />
          </SpaceBetween>
        </Modal>
      )}
    </>
  );
}
