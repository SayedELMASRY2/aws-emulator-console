import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "addons": "Use the Add-ons tab within an individual cluster to manage cluster add-ons.",
  "access-entries": "EKS Access Entries (fine-grained IAM-to-Kubernetes RBAC mappings) are not implemented in the local emulator. Connect via the generated kubeconfig directly.",
  "insights": "EKS Insights upgrade readiness checks are not available in the local emulator.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This Amazon EKS feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
