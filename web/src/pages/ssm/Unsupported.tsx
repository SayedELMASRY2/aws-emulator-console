import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useCrumbs } from "../../App";
import { EmulatorNote } from "../../common";
import { crumbs } from "./lib";

const REASONS: Record<string, string> = {
  "appconfig": "AWS AppConfig feature flagging and deployment strategies are not implemented in the local emulator.",
  "fleet-manager": "Fleet Manager requires registered SSM agent daemons communicating over managed node channels, which are not hosted in the emulator.",
  "session-manager": "Session Manager interactive web shell terminals require live SSM agent websocket channels and are not implemented.",
  "run-command": "Run Command remote command dispatch across fleets is not configured in the local emulator.",
  "state-manager": "State Manager association compliance policies are not implemented in the local emulator.",
  "patch-manager": "Patch Manager automated OS patching baselines and maintenance windows are not available in the emulator.",
  "explorer": "Systems Manager Explorer aggregated operations data views are not supported in the emulator.",
  "incident-manager": "Incident Manager automated response plans and on-call escalation rotations are not available in the emulator.",
};

export default function Unsupported() {
  const { feature = "" } = useParams();
  const title = feature.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  useCrumbs(crumbs({ text: title }));

  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <EmulatorNote>
          {REASONS[feature] || "This AWS Systems Manager feature is not implemented in the local AWS Emulator."}
        </EmulatorNote>
      </Container>
    </ContentLayout>
  );
}
