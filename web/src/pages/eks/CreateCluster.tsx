import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Multiselect from "@cloudscape-design/components/multiselect";
import RadioGroup from "@cloudscape-design/components/radio-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import {
  eks,
  crumbs,
  useVpcs,
  useSubnets,
  useSecurityGroups,
  useEksRoles,
} from "./lib";

const K8S_VERSIONS = [
  { value: "1.31", label: "1.31 (Default, supported by emulator)" },
];

export default function CreateCluster() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/eks/clusters" },
      { text: "Create cluster" }
    )
  );

  const [clusterName, setClusterName] = useState("");
  const [k8sVersion, setK8sVersion] = useState(K8S_VERSIONS[0]);

  // Roles
  const roles = useEksRoles();
  const [selectedRole, setSelectedRole] = useState<any | null>(null);

  // Networking
  const vpcs = useVpcs();
  const [selectedVpc, setSelectedVpc] = useState<any | null>(null);
  const subnets = useSubnets(selectedVpc?.value);
  const [selectedSubnets, setSelectedSubnets] = useState<any[]>([]);
  const sgs = useSecurityGroups(selectedVpc?.value);
  const [selectedSgs, setSelectedSgs] = useState<any[]>([]);
  const [endpointAccess, setEndpointAccess] = useState("public");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!clusterName.trim()) return;
    const subList = selectedSubnets.map(s => s.value);
    if (!subList.length) {
      setError(new Error("Please select at least two subnets across availability zones."));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const roleArn = selectedRole?.value || "arn:aws:iam::000000000000:role/eks-cluster-role";

      const p: Record<string, any> = {
        name: clusterName.trim(),
        version: k8sVersion.value,
        roleArn,
        resourcesVpcConfig: {
          subnetIds: subList,
          endpointPublicAccess: endpointAccess === "public" || endpointAccess === "both",
          endpointPrivateAccess: endpointAccess === "private" || endpointAccess === "both",
        },
      };

      if (selectedSgs.length) {
        p.resourcesVpcConfig.securityGroupIds = selectedSgs.map(g => g.value);
      }

      await eks("CreateCluster", p);
      flash.notify({
        type: "success",
        content: `Created EKS cluster ${clusterName}.`,
      });
      nav(`/eks/clusters/${encodeURIComponent(clusterName.trim())}`);
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
          description="Create a managed Kubernetes cluster control plane."
        >
          Create cluster
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Cluster configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Name"
              description="A unique name for your cluster."
              constraintText="Required. Must start with an alphanumeric character and contain only alphanumeric characters, dashes, and underscores."
            >
              <Input
                value={clusterName}
                placeholder="my-eks-cluster"
                onChange={e => setClusterName(e.detail.value)}
              />
            </FormField>

            <FormField
              label="Kubernetes version"
              description="The Kubernetes control plane version to install."
            >
              <Select
                selectedOption={k8sVersion}
                onChange={e => setK8sVersion(e.detail.selectedOption as any)}
                options={K8S_VERSIONS}
              />
            </FormField>

            <FormField
              label="Cluster service role"
              description="IAM role that provides permissions for the Kubernetes control plane."
            >
              <Select
                selectedOption={selectedRole}
                onChange={e => setSelectedRole(e.detail.selectedOption)}
                options={roles.data || []}
                placeholder="Select an IAM role (or default role)"
                loadingText="Loading IAM roles..."
                empty="Default emulator role will be used"
              />
            </FormField>
          </SpaceBetween>
        </Container>

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
              description="Subnets must be in at least two Availability Zones."
              constraintText="Select at least two subnets"
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

            <FormField label="Cluster endpoint access">
              <RadioGroup
                value={endpointAccess}
                onChange={e => setEndpointAccess(e.detail.value)}
                items={[
                  {
                    value: "public",
                    label: "Public",
                    description: "The cluster API server is accessible from outside your VPC.",
                  },
                  {
                    value: "private",
                    label: "Private",
                    description: "The cluster API server is only accessible from within your VPC.",
                  },
                  {
                    value: "both",
                    label: "Public and private",
                    description: "The cluster API server can be reached from both internal and external networks.",
                  },
                ]}
              />
            </FormField>
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
