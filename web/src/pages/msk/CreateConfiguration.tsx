import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { msk, crumbs } from "./lib";

const DEFAULT_PROPS = `# Amazon MSK server.properties
auto.create.topics.enable=true
default.replication.factor=2
min.insync.replicas=1
num.partitions=3
log.retention.hours=168
message.max.bytes=1000000
`;

export default function CreateConfiguration() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Cluster configurations", href: "#/msk/configurations" },
      { text: "Create configuration" }
    )
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [propsText, setPropsText] = useState(DEFAULT_PROPS);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim() || !propsText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await msk("CreateConfiguration", {
        Name: name.trim(),
        Description: description.trim() || undefined,
        ServerProperties: propsText,
      });

      flash.notify({
        type: "success",
        content: `Created configuration ${name}.`,
      });
      nav("/msk/configurations");
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
          description="Create a custom server.properties configuration for your Apache Kafka brokers."
        >
          Create configuration
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Configuration details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Configuration name"
              description="A unique name for your MSK configuration."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="my-kafka-settings"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description">
              <Input
                value={description}
                placeholder="Custom log retention and replication settings"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Enter one key=value pair per line for Apache Kafka server.properties."
            >
              Configuration properties (server.properties)
            </Header>
          }
        >
          <div className="code-editor">
            <Textarea
              value={propsText}
              rows={14}
              onChange={e => setPropsText(e.detail.value)}
            />
          </div>
        </Container>

        <ErrorAlert error={error} />

        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => nav(-1)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!name.trim() || !propsText.trim()}
              onClick={submit}
            >
              Create configuration
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
