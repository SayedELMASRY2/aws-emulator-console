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
  useTargetGroups,
} from "./lib";

export default function CreateService() {
  const { cluster = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/ecs/clusters" },
      { text: cluster, href: `#/ecs/clusters/${encodeURIComponent(cluster)}` },
      { text: "Create service" }
    )
  );

  const taskDefs = useTaskDefOptions();
  const vpcs = useVpcs();
  const targetGroups = useTargetGroups();

  const [serviceName, setServiceName] = useState("");
  const [selectedTd, setSelectedTd] = useState<any | null>(null);
  const [desiredCount, setDesiredCount] = useState("1");
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

  // Load balancing
  const [selectedTg, setSelectedTg] = useState<any | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!serviceName.trim() || !selectedTd) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        cluster,
        serviceName: serviceName.trim(),
        taskDefinition: selectedTd.value,
        desiredCount: parseInt(desiredCount, 10) || 1,
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

      if (selectedTg?.value) {
        p.loadBalancers = [
          {
            targetGroupArn: selectedTg.value,
            containerName: "web",
            containerPort: selectedTg.containerPort || 80,
          },
        ];
      }

      await ecs("CreateService", p);
      flash.notify({
        type: "success",
        content: `Created service ${serviceName} in cluster ${cluster}.`,
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
          description={`Configure and deploy a new service on cluster ${cluster}.`}
        >
          Create service
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Environment</Header>}>
          <ColumnLayout columns={2}>
            <FormField label="Cluster">
              <Input value={cluster} disabled />
            </FormField>
            <FormField
              label="Launch type"
              description="Choose how tasks are hosted."
            >
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
              label="Service name"
              description="A unique name for your service in this cluster."
              constraintText="Required"
            >
              <Input
                value={serviceName}
                placeholder="my-service"
                onChange={e => setServiceName(e.detail.value)}
              />
            </FormField>

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

            <FormField
              label="Desired tasks"
              description="The number of task instantiations to continuously maintain in this service."
            >
              <Input
                type="number"
                value={desiredCount}
                onChange={e => setDesiredCount(e.detail.value)}
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

        <Container
          header={
            <Header
              variant="h2"
              description="Optional: distribute traffic across tasks using an Elastic Load Balancer target group."
            >
              Load balancing
            </Header>
          }
        >
          <FormField
            label="Target group"
            description="Select an existing Target Group from EC2 Load Balancing."
          >
            <Select
              selectedOption={selectedTg}
              onChange={e => setSelectedTg(e.detail.selectedOption)}
              options={targetGroups.data || []}
              placeholder="None (no load balancer)"
              loadingText="Loading target groups..."
              empty="No target groups found"
            />
          </FormField>
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
              disabled={!serviceName.trim() || !selectedTd}
              onClick={submit}
            >
              Create service
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
