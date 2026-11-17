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
  msk,
  crumbs,
  MSK_TYPES,
  KAFKA_VERSIONS,
  useVpcs,
  useSubnets,
  useSecurityGroups,
  useMskConfigurations,
} from "./lib";

export default function CreateCluster() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/msk/clusters" },
      { text: "Create cluster" }
    )
  );

  const [clusterType, setClusterType] = useState("PROVISIONED");
  const [clusterName, setClusterName] = useState("");
  const [kafkaVersion, setKafkaVersion] = useState(KAFKA_VERSIONS[0]);

  // Brokers
  const [brokerNodes, setBrokerNodes] = useState("2");
  const [brokerType, setBrokerType] = useState(MSK_TYPES[1]);
  const [storageGb, setStorageGb] = useState("100");

  // Networking
  const vpcs = useVpcs();
  const [selectedVpc, setSelectedVpc] = useState<any | null>(null);
  const subnets = useSubnets(selectedVpc?.value);
  const [selectedSubnets, setSelectedSubnets] = useState<any[]>([]);
  const sgs = useSecurityGroups(selectedVpc?.value);
  const [selectedSgs, setSelectedSgs] = useState<any[]>([]);

  // Configurations
  const configs = useMskConfigurations();
  const [selectedConfig, setSelectedConfig] = useState<any | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!clusterName.trim()) return;
    const subList = selectedSubnets.map(s => s.value);
    if (!subList.length) {
      setError(new Error("Please select at least two subnets in different Availability Zones."));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (clusterType === "SERVERLESS") {
        const vpcConfig: Record<string, any> = { SubnetIds: subList };
        if (selectedSgs.length) {
          vpcConfig.SecurityGroupIds = selectedSgs.map(g => g.value);
        }
        await msk("CreateClusterV2", {
          ClusterName: clusterName.trim(),
          Serverless: {
            VpcConfigs: [vpcConfig],
            ClientAuthentication: {
              Sasl: { Iam: { Enabled: true } },
            },
          },
        });
      } else {
        const bng: Record<string, any> = {
          InstanceType: brokerType.value,
          ClientSubnets: subList,
          StorageInfo: {
            EbsStorageInfo: {
              VolumeSize: parseInt(storageGb, 10) || 100,
            },
          },
        };
        if (selectedSgs.length) {
          bng.SecurityGroups = selectedSgs.map(g => g.value);
        }

        const p: Record<string, any> = {
          ClusterName: clusterName.trim(),
          KafkaVersion: kafkaVersion.value,
          NumberOfBrokerNodes: parseInt(brokerNodes, 10) || 2,
          BrokerNodeGroupInfo: bng,
        };

        if (selectedConfig?.value) {
          const [arn, rev] = selectedConfig.value.split("|");
          p.ConfigurationInfo = {
            Arn: arn,
            Revision: parseInt(rev, 10) || 1,
          };
        }

        await msk("CreateCluster", p);
      }

      flash.notify({
        type: "success",
        content: `Created MSK cluster ${clusterName}.`,
      });
      nav("/msk/clusters");
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
          description="Create a fully managed Apache Kafka cluster to ingest and process streaming data."
        >
          Create cluster
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Cluster type</Header>}>
          <FormField label="Choose a cluster type">
            <RadioGroup
              value={clusterType}
              onChange={e => setClusterType(e.detail.value)}
              items={[
                {
                  value: "PROVISIONED",
                  label: "Provisioned",
                  description: "Full control over broker instance sizes, storage, and cluster configurations.",
                },
                {
                  value: "SERVERLESS",
                  label: "Serverless",
                  description: "Automatically scale capacity without managing broker instances or storage.",
                },
              ]}
            />
          </FormField>
        </Container>

        <Container header={<Header variant="h2">Cluster settings</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Cluster name"
              description="A unique name for your MSK cluster."
              constraintText="Required"
            >
              <Input
                value={clusterName}
                placeholder="my-streaming-cluster"
                onChange={e => setClusterName(e.detail.value)}
              />
            </FormField>

            {clusterType === "PROVISIONED" && (
              <FormField
                label="Apache Kafka version"
                description="The version of Apache Kafka software to run on the brokers."
              >
                <Select
                  selectedOption={kafkaVersion}
                  onChange={e => setKafkaVersion(e.detail.selectedOption as any)}
                  options={KAFKA_VERSIONS}
                />
              </FormField>
            )}
          </SpaceBetween>
        </Container>

        {clusterType === "PROVISIONED" && (
          <Container header={<Header variant="h2">Brokers</Header>}>
            <SpaceBetween size="m">
              <ColumnLayout columns={3}>
                <FormField
                  label="Number of broker nodes"
                  description="Should be a multiple of the selected subnets."
                >
                  <Input
                    type="number"
                    value={brokerNodes}
                    onChange={e => setBrokerNodes(e.detail.value)}
                  />
                </FormField>

                <FormField label="Broker instance type">
                  <Select
                    selectedOption={brokerType}
                    onChange={e => setBrokerType(e.detail.selectedOption as any)}
                    options={MSK_TYPES}
                  />
                </FormField>

                <FormField label="EBS storage per broker (GiB)">
                  <Input
                    type="number"
                    value={storageGb}
                    onChange={e => setStorageGb(e.detail.value)}
                  />
                </FormField>
              </ColumnLayout>

              <FormField
                label="Cluster configuration (optional)"
                description="Custom server.properties configuration revision to apply."
              >
                <Select
                  selectedOption={selectedConfig}
                  onChange={e => setSelectedConfig(e.detail.selectedOption)}
                  options={configs.data || []}
                  placeholder="Default (Amazon MSK defaults)"
                  empty="No custom configurations available"
                  loadingText="Loading configurations..."
                />
              </FormField>
            </SpaceBetween>
          </Container>
        )}

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
              description="Choose 2 or 3 subnets in different Availability Zones."
              constraintText="At least 2 subnets required"
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
              Create cluster
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
