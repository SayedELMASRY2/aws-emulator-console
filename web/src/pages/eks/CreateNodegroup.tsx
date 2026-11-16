import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { eks, crumbs, useSubnets, useEksRoles, enc } from "./lib";

const INSTANCE_TYPES = [
  { value: "t3.medium", label: "t3.medium (2 vCPU, 4 GiB)" },
  { value: "t3.large", label: "t3.large (2 vCPU, 8 GiB)" },
  { value: "m5.large", label: "m5.large (2 vCPU, 8 GiB)" },
  { value: "m5.xlarge", label: "m5.xlarge (4 vCPU, 16 GiB)" },
  { value: "c5.large", label: "c5.large (2 vCPU, 4 GiB)" },
];

export default function CreateNodegroup() {
  const { cluster = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/eks/clusters" },
      { text: cluster, href: `#/eks/clusters/${enc(cluster)}` },
      { text: "Add node group" }
    )
  );

  const [nodegroupName, setNodegroupName] = useState("");
  const roles = useEksRoles();
  const [selectedRole, setSelectedRole] = useState<any | null>(null);

  // Subnets
  const subnets = useSubnets();
  const [selectedSubnets, setSelectedSubnets] = useState<any[]>([]);

  // Scaling
  const [minSize, setMinSize] = useState("1");
  const [desiredSize, setDesiredSize] = useState("2");
  const [maxSize, setMaxSize] = useState("3");

  // Compute
  const [instanceType, setInstanceType] = useState(INSTANCE_TYPES[0]);
  const [capacityType, setCapacityType] = useState<{ value: string; label: string }>({
    value: "ON_DEMAND",
    label: "On-Demand",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!nodegroupName.trim()) return;
    const subList = selectedSubnets.map(s => s.value);
    if (!subList.length) {
      setError(new Error("Please select at least one subnet for node deployment."));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const nodeRole = selectedRole?.value || "arn:aws:iam::000000000000:role/eks-node-role";

      const p: Record<string, any> = {
        clusterName: cluster,
        nodegroupName: nodegroupName.trim(),
        nodeRole,
        subnets: subList,
        scalingConfig: {
          minSize: parseInt(minSize, 10) || 1,
          desiredSize: parseInt(desiredSize, 10) || 2,
          maxSize: parseInt(maxSize, 10) || 3,
        },
        capacityType: capacityType.value,
        instanceTypes: [instanceType.value],
      };

      await eks("CreateNodegroup", p);
      flash.notify({
        type: "success",
        content: `Created node group ${nodegroupName} in cluster ${cluster}.`,
      });
      nav(`/eks/clusters/${enc(cluster)}`);
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
          description={`Add compute capacity to cluster ${cluster} using an Amazon EC2 managed node group.`}
        >
          Add node group
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Node group configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Name"
              description="A unique name for your managed node group."
              constraintText="Required"
            >
              <Input
                value={nodegroupName}
                placeholder="default-node-pool"
                onChange={e => setNodegroupName(e.detail.value)}
              />
            </FormField>

            <FormField
              label="Node IAM role"
              description="IAM role attached to the EC2 instances in this node group."
            >
              <Select
                selectedOption={selectedRole}
                onChange={e => setSelectedRole(e.detail.selectedOption)}
                options={roles.data || []}
                placeholder="Select an IAM role (or default)"
                loadingText="Loading IAM roles..."
                empty="Default emulator role will be used"
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Node group compute configuration</Header>}>
          <SpaceBetween size="m">
            <ColumnLayout columns={2}>
              <FormField label="Capacity type">
                <Select
                  selectedOption={capacityType}
                  onChange={e => setCapacityType(e.detail.selectedOption as any)}
                  options={[
                    { value: "ON_DEMAND", label: "On-Demand" },
                    { value: "SPOT", label: "Spot" },
                  ]}
                />
              </FormField>

              <FormField label="Instance types">
                <Select
                  selectedOption={instanceType}
                  onChange={e => setInstanceType(e.detail.selectedOption as any)}
                  options={INSTANCE_TYPES}
                />
              </FormField>
            </ColumnLayout>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Node group scaling configuration</Header>}>
          <ColumnLayout columns={3}>
            <FormField label="Minimum size">
              <Input
                type="number"
                value={minSize}
                onChange={e => setMinSize(e.detail.value)}
              />
            </FormField>
            <FormField label="Desired size">
              <Input
                type="number"
                value={desiredSize}
                onChange={e => setDesiredSize(e.detail.value)}
              />
            </FormField>
            <FormField label="Maximum size">
              <Input
                type="number"
                value={maxSize}
                onChange={e => setMaxSize(e.detail.value)}
              />
            </FormField>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">Subnets</Header>}>
          <FormField
            label="Subnets"
            description="Choose the subnets where the worker nodes will launch."
            constraintText="Required"
          >
            <Multiselect
              selectedOptions={selectedSubnets}
              onChange={e => setSelectedSubnets(e.detail.selectedOptions as any)}
              options={subnets.data || []}
              placeholder="Select subnets"
              loadingText="Loading subnets..."
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
              disabled={!nodegroupName.trim()}
              onClick={submit}
            >
              Create node group
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
