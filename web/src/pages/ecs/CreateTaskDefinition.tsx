import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Tiles from "@cloudscape-design/components/tiles";
import Checkbox from "@cloudscape-design/components/checkbox";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useFlash, ErrorAlert } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, crumbs } from "./lib";

const CPU_OPTIONS = [
  { value: "256", label: ".25 vCPU (256 CPU units)" },
  { value: "512", label: ".5 vCPU (512 CPU units)" },
  { value: "1024", label: "1 vCPU (1024 CPU units)" },
  { value: "2048", label: "2 vCPU (2048 CPU units)" },
  { value: "4096", label: "4 vCPU (4096 CPU units)" },
];

const MEM_OPTIONS = [
  { value: "512", label: "0.5 GB (512 MiB)" },
  { value: "1024", label: "1 GB (1024 MiB)" },
  { value: "2048", label: "2 GB (2048 MiB)" },
  { value: "4096", label: "4 GB (4096 MiB)" },
  { value: "8192", label: "8 GB (8192 MiB)" },
];

export default function CreateTaskDefinition() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Task definitions", href: "#/ecs/task-definitions" },
      { text: "Create new task definition" }
    )
  );

  const [mode, setMode] = useState<string>("form");
  const [family, setFamily] = useState("");
  const [cpu, setCpu] = useState(CPU_OPTIONS[0]);
  const [memory, setMemory] = useState(MEM_OPTIONS[0]);
  const [launchFargate, setLaunchFargate] = useState(true);
  const [launchEc2, setLaunchEc2] = useState(true);

  // Container fields
  const [containerName, setContainerName] = useState("web");
  const [image, setImage] = useState("nginx:alpine");
  const [containerPort, setContainerPort] = useState("80");
  const [envVars, setEnvVars] = useState("PORT=80\nENV=local");

  // JSON mode
  const [jsonText, setJsonText] = useState(
    JSON.stringify(
      {
        family: "sample-app",
        requiresCompatibilities: ["FARGATE", "EC2"],
        networkMode: "awsvpc",
        cpu: "256",
        memory: "512",
        containerDefinitions: [
          {
            name: "web",
            image: "nginx:alpine",
            essential: true,
            portMappings: [{ containerPort: 80, protocol: "tcp" }],
            environment: [
              { name: "PORT", value: "80" },
              { name: "ENV", value: "local" },
            ],
          },
        ],
      },
      null,
      2
    )
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let params: any;
      if (mode === "json") {
        try {
          params = JSON.parse(jsonText);
        } catch {
          throw new Error("Invalid JSON in task definition editor.");
        }
      } else {
        if (!family.trim()) throw new Error("Task definition family is required.");
        if (!containerName.trim()) throw new Error("Container name is required.");
        if (!image.trim()) throw new Error("Container image URI is required.");

        const compat: string[] = [];
        if (launchFargate) compat.push("FARGATE");
        if (launchEc2) compat.push("EC2");

        const env = envVars
          .split("\n")
          .map(l => l.trim())
          .filter(Boolean)
          .map(l => {
            const idx = l.indexOf("=");
            return idx > 0
              ? { name: l.slice(0, idx), value: l.slice(idx + 1) }
              : { name: l, value: "" };
          });

        const containerDef: any = {
          name: containerName.trim(),
          image: image.trim(),
          essential: true,
        };

        if (containerPort) {
          containerDef.portMappings = [
            { containerPort: parseInt(containerPort, 10), protocol: "tcp" },
          ];
        }
        if (env.length) {
          containerDef.environment = env;
        }

        params = {
          family: family.trim(),
          requiresCompatibilities: compat.length ? compat : ["FARGATE"],
          networkMode: "awsvpc",
          cpu: cpu.value,
          memory: memory.value,
          containerDefinitions: [containerDef],
        };
      }

      const res = await ecs("RegisterTaskDefinition", params);
      const td = res.taskDefinition;
      flash.notify({
        type: "success",
        content: `Registered task definition ${td.family}:${td.revision}.`,
      });
      nav(`/ecs/task-definitions/${encodeURIComponent(td.family)}/${td.revision}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="A task definition describes one or more containers that form your application."
        >
          Create new task definition
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Creation method</Header>}>
          <Tiles
            value={mode}
            onChange={e => setMode(e.detail.value)}
            items={[
              {
                value: "form",
                label: "Form editor",
                description: "Guided form configuration for single-container or primary applications.",
              },
              {
                value: "json",
                label: "JSON editor",
                description: "Full RegisterTaskDefinition JSON specification for advanced multi-container setups.",
              },
            ]}
          />
        </Container>

        {mode === "form" ? (
          <>
            <Container header={<Header variant="h2">Task configuration</Header>}>
              <SpaceBetween size="m">
                <FormField
                  label="Task definition family"
                  description="A unique name for your task definition."
                  constraintText="Required"
                >
                  <Input
                    value={family}
                    placeholder="my-app"
                    onChange={e => setFamily(e.detail.value)}
                  />
                </FormField>

                <FormField label="Infrastructure requirements">
                  <ColumnLayout columns={2}>
                    <FormField label="CPU">
                      <Select
                        selectedOption={cpu}
                        onChange={e => setCpu(e.detail.selectedOption as any)}
                        options={CPU_OPTIONS}
                      />
                    </FormField>
                    <FormField label="Memory">
                      <Select
                        selectedOption={memory}
                        onChange={e => setMemory(e.detail.selectedOption as any)}
                        options={MEM_OPTIONS}
                      />
                    </FormField>
                  </ColumnLayout>
                </FormField>

                <FormField label="Launch type compatibility">
                  <SpaceBetween direction="horizontal" size="s">
                    <Checkbox
                      checked={launchFargate}
                      onChange={e => setLaunchFargate(e.detail.checked)}
                    >
                      AWS Fargate
                    </Checkbox>
                    <Checkbox
                      checked={launchEc2}
                      onChange={e => setLaunchEc2(e.detail.checked)}
                    >
                      Amazon EC2
                    </Checkbox>
                  </SpaceBetween>
                </FormField>
              </SpaceBetween>
            </Container>

            <Container header={<Header variant="h2">Container - 1</Header>}>
              <SpaceBetween size="m">
                <ColumnLayout columns={2}>
                  <FormField label="Name" constraintText="Required">
                    <Input
                      value={containerName}
                      placeholder="app"
                      onChange={e => setContainerName(e.detail.value)}
                    />
                  </FormField>
                  <FormField
                    label="Image URI"
                    description="Docker Hub, Public ECR, or local image."
                    constraintText="Required"
                  >
                    <Input
                      value={image}
                      placeholder="public.ecr.aws/docker/library/nginx:alpine"
                      onChange={e => setImage(e.detail.value)}
                    />
                  </FormField>
                </ColumnLayout>

                <FormField label="Port mappings" description="Port exposed by the container.">
                  <Input
                    type="number"
                    value={containerPort}
                    placeholder="80"
                    onChange={e => setContainerPort(e.detail.value)}
                  />
                </FormField>

                <FormField
                  label="Environment variables"
                  description="One KEY=value pair per line."
                >
                  <Textarea
                    value={envVars}
                    rows={4}
                    placeholder="KEY=value"
                    onChange={e => setEnvVars(e.detail.value)}
                  />
                </FormField>
              </SpaceBetween>
            </Container>
          </>
        ) : (
          <Container header={<Header variant="h2">Task definition JSON</Header>}>
            <SpaceBetween size="m">
              <Box variant="p" color="text-body-secondary">
                Configure your complete RegisterTaskDefinition JSON schema below.
              </Box>
              <div className="code-editor">
                <Textarea
                  value={jsonText}
                  rows={20}
                  onChange={e => setJsonText(e.detail.value)}
                />
              </div>
            </SpaceBetween>
          </Container>
        )}

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={mode === "form" && !family.trim()}
              onClick={submit}
            >
              Create
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
