import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "redrive": "Dead-letter queue automated redrive tasks to source queues are managed via asynchronous AWS backend workflows and are not implemented in the local emulator.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This Amazon SQS feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
