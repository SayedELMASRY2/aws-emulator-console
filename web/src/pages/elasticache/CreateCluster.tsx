import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert, EmulatorNote } from "../../common";
import {
  ec,
  crumbs,
  CACHE_NODE_TYPES,
  useSubnetGroups,
  useParameterGroups,
  enc,
} from "./lib";

export default function CreateCluster() {
  const [params] = useSearchParams();
  const initialEngine = params.get("engine") === "memcached" ? "memcached" : "redis";
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Dashboard", href: "#/elasticache/dashboard" },
      { text: "Create cluster" }
    )
  );

  const [engine, setEngine] = useState(initialEngine);
  const [clusterId, setClusterId] = useState("");
  const [nodeType, setNodeType] = useState(CACHE_NODE_TYPES[0]);
  const [numNodes, setNumNodes] = useState("1");

  // Groups
  const subnetGroups = useSubnetGroups();
  const [selectedSubnetGroup, setSelectedSubnetGroup] = useState<any | null>(null);

  const paramGroups = useParameterGroups(engine);
  const [selectedParamGroup, setSelectedParamGroup] = useState<any | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!clusterId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        CacheClusterId: clusterId.trim(),
        Engine: engine,
        CacheNodeType: nodeType.value,
        NumCacheNodes: parseInt(numNodes, 10) || 1,
      };

      if (selectedSubnetGroup?.value) {
        p.CacheSubnetGroupName = selectedSubnetGroup.value;
      }
      if (selectedParamGroup?.value) {
        p.CacheParameterGroupName = selectedParamGroup.value;
      }

      await ec("CreateCacheCluster", p);
      flash.notify({
        type: "success",
        content: `Created ${engine} cluster ${clusterId}.`,
      });
      nav(`/elasticache/clusters/${enc(clusterId.trim())}`);
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
          description="Create an in-memory Redis or Memcached cache cluster."
        >
          Create cluster
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Engine options</Header>}>
          <FormField label="Choose cache engine">
            <RadioGroup
              value={engine}
              onChange={e => {
                setEngine(e.detail.value);
                setSelectedParamGroup(null);
              }}
              items={[
                {
                  value: "redis",
                  label: "Redis",
                  description: "Rich data structures, pub/sub, Lua scripting, and persistent in-memory caching.",
                },
                {
                  value: "memcached",
                  label: "Memcached",
                  description: "Multithreaded, simple key-value in-memory storage designed for large scale.",
                },
              ]}
            />
          </FormField>
        </Container>

        <Container header={<Header variant="h2">Cluster settings</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Cluster name"
              description="A unique name for your cache cluster."
              constraintText="Required"
            >
              <Input
                value={clusterId}
                placeholder="my-cache"
                onChange={e => setClusterId(e.detail.value)}
              />
            </FormField>

            <ColumnLayout columns={2}>
              <FormField label="Node type">
                <Select
                  selectedOption={nodeType}
                  onChange={e => setNodeType(e.detail.selectedOption as any)}
                  options={CACHE_NODE_TYPES}
                />
              </FormField>

              <FormField
                label="Number of nodes"
                description={engine === "redis" ? "Standalone Redis clusters run with 1 primary node." : "1 to 5 nodes."}
              >
                <Input
                  type="number"
                  value={numNodes}
                  disabled={engine === "redis"}
                  onChange={e => setNumNodes(e.detail.value)}
                />
              </FormField>
            </ColumnLayout>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Connectivity & parameters</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Subnet group (optional)"
              description="Subnet group used to assign VPC IP addresses."
            >
              <Select
                selectedOption={selectedSubnetGroup}
                onChange={e => setSelectedSubnetGroup(e.detail.selectedOption)}
                options={subnetGroups.data || []}
                placeholder="Default / Auto"
                loadingText="Loading subnet groups..."
                empty="No subnet groups found"
              />
            </FormField>

            <FormField
              label="Parameter group (optional)"
              description="Cache parameter group to control runtime flags."
            >
              <Select
                selectedOption={selectedParamGroup}
                onChange={e => setSelectedParamGroup(e.detail.selectedOption)}
                options={paramGroups.data || []}
                placeholder="Default"
                loadingText="Loading parameter groups..."
                empty="Using default parameter group"
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <EmulatorNote>
          The cluster creates an actual in-memory server instance locally. Once created, the cluster details page will show the active port and the <code>redis-cli</code> or <code>nc</code> connection string.
        </EmulatorNote>

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!clusterId.trim()}
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
