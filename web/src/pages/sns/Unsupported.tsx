import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "push-notifications": "Mobile Apple APNs and Firebase FCM push notification platform applications are not configured in the local emulator.",
  "sms": "Telephony and SMS worldwide carrier origination require external telecom integrations and are not available in the local emulator.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This Amazon SNS feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
