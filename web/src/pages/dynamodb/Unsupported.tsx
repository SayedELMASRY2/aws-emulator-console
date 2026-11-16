import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";

const F: Record<string, { title: string; what: string; why: string }> = {
  integrations: { title: "Integrations", what: "Zero-ETL integrations from DynamoDB to Amazon OpenSearch Service, Amazon Redshift and SageMaker Lakehouse.", why: "Integrations run in those other services, which this console doesn't cover. Use Exports to S3 or DynamoDB Streams to move data instead." },
  "reserved-capacity": { title: "Reserved capacity", what: "Buy discounted provisioned capacity for one or three years.", why: "Reserved capacity is a billing purchase. The emulator has no billing." },
  settings: { title: "Settings", what: "Account-level DynamoDB settings such as default service quotas.", why: "Account-level settings aren't part of the emulator. Per-table settings are on each table's Additional settings tab." },
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const f = F[feature] || { title: feature, what: "", why: "This feature isn't available in AWS Emulator." };
  useCrumbs([{ text: "DynamoDB", href: "#/dynamodb/dashboard" }, { text: f.title, href: "#" }]);
  return (
    <ContentLayout header={<Header variant="h1" description={f.what}>{f.title}</Header>}>
      <Container><EmulatorNote>{f.why}</EmulatorNote></Container>
    </ContentLayout>
  );
}
