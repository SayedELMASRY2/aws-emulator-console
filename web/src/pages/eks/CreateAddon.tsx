import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Tiles from "@cloudscape-design/components/tiles";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert } from "../../common";
import { eks, crumbs, enc } from "./lib";

const CURATED_ADDONS = [
  {
    value: "vpc-cni",
    label: "Amazon VPC CNI",
    description: "Enables Kubernetes pods to have the same IP address inside your Amazon VPC network.",
  },
  {
    value: "coredns",
    label: "CoreDNS",
    description: "Provides standard Kubernetes service discovery and DNS resolution within the cluster.",
  },
  {
    value: "kube-proxy",
    label: "kube-proxy",
    description: "Maintains network rules on nodes and handles request routing for Kubernetes services.",
  },
  {
    value: "aws-ebs-csi-driver",
    label: "Amazon EBS CSI Driver",
    description: "Allows Amazon EKS clusters to manage the lifecycle of Amazon EBS volumes for persistent storage.",
  },
];

export default function CreateAddon() {
  const { cluster = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Clusters", href: "#/eks/clusters" },
      { text: cluster, href: `#/eks/clusters/${enc(cluster)}` },
      { text: "Get more add-ons" }
    )
  );

  const [selectedAddon, setSelectedAddon] = useState("vpc-cni");

  // Load versions for selected addon
  const versionsData = useAsync(async () => {
    try {
      const res = await eks("DescribeAddonVersions", {
        kubernetesVersion: "1.31",
        addonName: selectedAddon,
      });
      const list = (res.addons || [])[0]?.addonVersions || [];
      return list.map((v: any) => ({
        value: v.addonVersion,
        label: `${v.addonVersion}${v.compatibilities?.[0]?.defaultVersion ? " (Default)" : ""}`,
      }));
    } catch {
      return [{ value: "default", label: "Default version" }];
    }
  }, [selectedAddon]);

  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        clusterName: cluster,
        addonName: selectedAddon,
      };

      if (selectedVersion?.value && selectedVersion.value !== "default") {
        p.addonVersion = selectedVersion.value;
      }

      await eks("CreateAddon", p);
      flash.notify({
        type: "success",
        content: `Installed add-on ${selectedAddon} in cluster ${cluster}.`,
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
          description={`Add capability and operational tools to your Kubernetes cluster ${cluster}.`}
        >
          Install Amazon EKS add-on
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Select add-on</Header>}>
          <SpaceBetween size="m">
            <FormField label="Available operational add-ons">
              <Tiles
                value={selectedAddon}
                onChange={e => {
                  setSelectedAddon(e.detail.value);
                  setSelectedVersion(null);
                }}
                items={CURATED_ADDONS}
              />
            </FormField>

            <FormField label="Add-on version">
              <Select
                selectedOption={selectedVersion || (versionsData.data && versionsData.data[0])}
                onChange={e => setSelectedVersion(e.detail.selectedOption)}
                options={versionsData.data || [{ value: "default", label: "Default version" }]}
                loadingText="Loading compatible versions..."
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
            <Button variant="primary" loading={busy} onClick={submit}>
              Install add-on
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
