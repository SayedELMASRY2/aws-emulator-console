import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { EmulatorNote } from "../../common";
import { useCrumbs } from "../../App";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "account-settings": "Account settings (such as dual-stack IPv6 endpoints and Fargate container runtime versions) are managed at the AWS account level and are not configured in the local emulator.",
  "capacity-providers": "Custom Auto Scaling Group capacity providers are not supported in the emulator. Default FARGATE and FARGATE_SPOT capacity providers are available automatically on clusters.",
  "service-connect": "ECS Service Connect uses AWS Cloud Map and an Envoy sidecar proxy mesh, which is not implemented in the local emulator.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
