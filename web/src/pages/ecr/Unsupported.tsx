import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "registry-permissions": "Registry-wide IAM policies and cross-account access are not implemented in the local emulator.",
  "replication": "Multi-region and cross-account ECR replication is not available in the local single-region emulator.",
  "pull-through-cache": "Pull through cache rules (caching external public registries into your private namespace) are not supported by the local emulator.",
  "public-repositories": "Amazon ECR Public (gallery.ecr.aws) is a global public catalog service and is not hosted in the local emulator. Use local private repositories instead.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This ECR feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
