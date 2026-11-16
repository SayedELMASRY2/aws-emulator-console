import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import Checkbox from "@cloudscape-design/components/checkbox";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import { useCrumbs } from "../../App";
import {
  ecs,
  crumbs,
  useTaskDefOptions,
  useVpcs,
  useSubnets,
  useSecurityGroups,
} from "./lib";

export default function RunTask() {
  const { cluster = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/ecs/clusters" },
      { text: cluster, href: `#/ecs/clusters/${encodeURIComponent(cluster)}` },
      { text: "Run task" }
    )
  );

  const taskDefs = useTaskDefOptions();
  const vpcs = useVpcs();

  const [selectedTd, setSelectedTd] = useState<any | null>(null);
  const [taskCount, setTaskCount] = useState("1");
  const [launchType, setLaunchType] = useState<{ value: string; label: string }>({
    value: "FARGATE",
    label: "Fargate (Serverless)",
  });

  // Networking
  const [selectedVpc, setSelectedVpc] = useState<any | null>(null);
  const subnets = useSubnets(selectedVpc?.value);
  const [selectedSubnets, setSelectedSubnets] = useState<any[]>([]);
  const sgs = useSecurityGroups(selectedVpc?.value);
  const [selectedSgs, setSelectedSgs] = useState<any[]>([]);
  const [assignPublicIp, setAssignPublicIp] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!selectedTd) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        cluster,
        taskDefinition: selectedTd.value,
        count: parseInt(taskCount, 10) || 1,
        launchType: launchType.value,
      };

      if (launchType.value === "FARGATE") {
        const subList = selectedSubnets.map(s => s.value);
        if (!subList.length) {
          throw new Error("At least one subnet is required for Fargate tasks.");
        }
        const awsvpc: Record<string, any> = {
          subnets: subList,
          assignPublicIp: assignPublicIp ? "ENABLED" : "DISABLED",
        };
        if (selectedSgs.length) {
          awsvpc.securityGroups = selectedSgs.map(g => g.value);
        }
        p.networkConfiguration = { awsvpcConfiguration: awsvpc };
      }

      const res = await ecs("RunTask", p);
      const count = res.tasks?.length || 1;
      flash.notify({
        type: "success",
        content: `Started ${count} task${count > 1 ? "s" : ""} on cluster ${cluster}.`,
      });
      nav(`/ecs/clusters/${encodeURIComponent(cluster)}`);
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
          description={`Run a standalone task on cluster ${cluster}.`}
        >
          Run task
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Environment</Header>}>
          <ColumnLayout columns={2}>
            <FormField label="Cluster">
              <Input value={cluster} disabled />
            </FormField>
            <FormField label="Launch type">
              <Select
                selectedOption={launchType}
                onChange={e => setLaunchType(e.detail.selectedOption as any)}
                options={[
                  { value: "FARGATE", label: "Fargate (Serverless)" },
                  { value: "EC2", label: "EC2 (Host instances)" },
                ]}
              />
            </FormField>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Deployment configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Task definition"
              description="Select the task definition and revision to run."
              constraintText="Required"
            >
              <Select
                selectedOption={selectedTd}
                onChange={e => setSelectedTd(e.detail.selectedOption)}
                options={taskDefs.data || []}
                loadingText="Loading task definitions..."
                statusType={taskDefs.loading ? "loading" : undefined}
                placeholder="Choose task definition"
                empty="No active task definitions found"
              />
            </FormField>

            <FormField label="Number of tasks" description="How many copies of the task to launch.">
              <Input
                type="number"
                value={taskCount}
                onChange={e => setTaskCount(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        {launchType.value === "FARGATE" && (
          <Container header={<Header variant="h2">Networking</Header>}>
            <SpaceBetween size="m">
              <FormField label="Virtual Private Cloud (VPC)">
                <Select
                  selectedOption={selectedVpc}
                  onChange={e => {
                    setSelectedVpc(e.detail.selectedOption);
                    setSelectedSubnets([]);
                    setSelectedSgs([]);
                  }}
                  options={vpcs.data || []}
                  placeholder="Select a VPC"
                  loadingText="Loading VPCs..."
                />
              </FormField>

              <FormField
                label="Subnets"
                description="Subnets where tasks can receive elastic network interfaces."
                constraintText="At least one subnet required"
              >
                <Multiselect
                  selectedOptions={selectedSubnets}
                  onChange={e => setSelectedSubnets(e.detail.selectedOptions as any)}
                  options={subnets.data || []}
                  placeholder="Select subnets"
                  loadingText="Loading subnets..."
                  disabled={!selectedVpc}
                  empty={selectedVpc ? "No subnets found" : "Select a VPC first"}
                />
              </FormField>

              <FormField label="Security groups">
                <Multiselect
                  selectedOptions={selectedSgs}
                  onChange={e => setSelectedSgs(e.detail.selectedOptions as any)}
                  options={sgs.data || []}
                  placeholder="Select security groups"
                  loadingText="Loading security groups..."
                />
              </FormField>

              <Checkbox
                checked={assignPublicIp}
                onChange={e => setAssignPublicIp(e.detail.checked)}
              >
                Auto-assign public IP
              </Checkbox>
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
              disabled={!selectedTd}
              onClick={submit}
            >
              Run task
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
