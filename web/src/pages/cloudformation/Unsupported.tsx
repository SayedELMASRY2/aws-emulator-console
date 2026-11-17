import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "stacksets": "AWS CloudFormation StackSets multi-account and multi-region deployment orchestration is not supported in the local single-account emulator.",
  "public-extensions": "CloudFormation Registry public 3rd-party resource extensions and modules are not hosted in the emulator.",
  "activated-extensions": "Private extension activation in CloudFormation Registry is not supported in the emulator.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This AWS CloudFormation feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
