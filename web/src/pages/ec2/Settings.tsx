import { useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { EmulatorNote, useAsync, useFlash, ValueWithLabel } from "../../common";
import { ec2 } from "./lib";

export function Settings() {
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: "Settings", href: "#" }]);
  const flash = useFlash();
  const enc = useAsync(async () => (await ec2("GetEbsEncryptionByDefault")).EbsEncryptionByDefault, []);
  const serial = useAsync(async () => (await ec2("GetSerialConsoleAccessStatus")).SerialConsoleAccessEnabled, []);
  const toggle = async (op: string, reload: () => void) => { try { await ec2(op); reload(); } catch (e) { flash.error(e); } };
  return (
    <ContentLayout header={<Header variant="h1">Settings</Header>}>
      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2" actions={<Button onClick={() => toggle(enc.data ? "DisableEbsEncryptionByDefault" : "EnableEbsEncryptionByDefault", enc.reload)}>{enc.data ? "Disable" : "Enable"}</Button>}>EBS encryption</Header>}>
          <ValueWithLabel label="Always encrypt new EBS volumes">{enc.data === undefined ? "…" : enc.data ? "Enabled" : "Disabled"}</ValueWithLabel>
        </Container>
        <Container header={<Header variant="h2" actions={<Button onClick={() => toggle(serial.data ? "DisableSerialConsoleAccess" : "EnableSerialConsoleAccess", serial.reload)}>{serial.data ? "Disable" : "Enable"}</Button>}>EC2 Serial Console</Header>}>
          <ValueWithLabel label="EC2 Serial Console access">{serial.data === undefined ? "…" : serial.data ? "Allowed" : "Prevented"}</ValueWithLabel>
        </Container>
      </ColumnLayout>
    </ContentLayout>
  );
}

const F: Record<string, string> = {
  "global-view": "EC2 Global View shows resources across all Regions. The emulator runs a single Region.",
  "savings-plans": "Savings Plans are a billing purchase. The emulator has no billing.",
  "reserved-instances": "Reserved Instances are a billing purchase. The emulator has no billing.",
  "trust-stores": "Trust stores (mutual TLS for ALBs) aren't covered by this console.",
};
export function Unsupported() {
  const { feature = "" } = useParams();
  useCrumbs([{ text: "EC2", href: "#/ec2/dashboard" }, { text: feature, href: "#" }]);
  return <ContentLayout header={<Header variant="h1">{feature.replace(/-/g, " ")}</Header>}><Container><EmulatorNote>{F[feature] || "Not available in AWS Emulator."}</EmulatorNote></Container></ContentLayout>;
}
