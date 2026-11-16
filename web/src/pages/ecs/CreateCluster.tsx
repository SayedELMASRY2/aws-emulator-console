import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Checkbox from "@cloudscape-design/components/checkbox";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { useCrumbs } from "../../App";
import { ecs, crumbs } from "./lib";

export default function CreateCluster() {
  const nav = useNavigate();
  const flash = useFlash();
  useCrumbs(crumbs({ text: "Clusters", href: "#/ecs/clusters" }, { text: "Create cluster" }));

  const [clusterName, setClusterName] = useState("");
  const [fargate, setFargate] = useState(true);
  const [fargateSpot, setFargateSpot] = useState(true);
  const [containerInsights, setContainerInsights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!clusterName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const providers: string[] = [];
      if (fargate) providers.push("FARGATE");
      if (fargateSpot) providers.push("FARGATE_SPOT");

      const params: Record<string, any> = {
        clusterName: clusterName.trim(),
      };

      if (providers.length) {
        params.capacityProviders = providers;
        params.defaultCapacityProviderStrategy = providers.map(p => ({
          capacityProvider: p,
          weight: p === "FARGATE" ? 1 : 2,
        }));
      }

      if (containerInsights) {
        params.settings = [{ name: "containerInsights", value: "enabled" }];
      }

      await ecs("CreateCluster", params);
      flash.notify({
        type: "success",
        content: `Created cluster ${clusterName}.`,
      });
      nav(`/ecs/clusters/${encodeURIComponent(clusterName.trim())}`);
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
          description="Create a logical grouping of tasks and services."
        >
          Create cluster
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Cluster configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Cluster name"
              description="A unique name for your cluster (up to 255 letters, numbers, hyphens, and underscores)."
              constraintText="Required"
            >
              <Input
                value={clusterName}
                placeholder="my-cluster"
                onChange={e => setClusterName(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Specify the compute capacity to use for launching tasks in this cluster."
            >
              Infrastructure
            </Header>
          }
        >
          <SpaceBetween size="m">
            <FormField
              label="AWS Fargate (serverless)"
              description="Fargate is a serverless compute engine for containers that removes the need to provision and manage servers."
            >
              <SpaceBetween size="s">
                <Checkbox
                  checked={fargate}
                  onChange={e => setFargate(e.detail.checked)}
                >
                  Fargate
                </Checkbox>
                <Checkbox
                  checked={fargateSpot}
                  onChange={e => setFargateSpot(e.detail.checked)}
                >
                  Fargate Spot (spare capacity)
                </Checkbox>
              </SpaceBetween>
            </FormField>

            <EmulatorNote>
              In the emulator, Fargate tasks execute directly on your local system using local container runtime interfaces.
            </EmulatorNote>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Monitoring</Header>}>
          <SpaceBetween size="m">
            <Checkbox
              checked={containerInsights}
              onChange={e => setContainerInsights(e.detail.checked)}
            >
              Use Container Insights
            </Checkbox>
            <Box variant="p" color="text-body-secondary">
              Container Insights collects, aggregates, and summarizes metrics and logs from your containerized applications.
            </Box>
          </SpaceBetween>
        </Container>

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!clusterName.trim()}
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
