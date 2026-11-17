import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { logs, crumbs, RETENTION_OPTIONS, enc } from "./lib";

export default function CreateLogGroup() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Log groups", href: "#/logs/log-groups" },
      { text: "Create log group" }
    )
  );

  const [name, setName] = useState("");
  const [retention, setRetention] = useState(RETENTION_OPTIONS[0]);
  const [kmsKeyId, setKmsKeyId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        logGroupName: name.trim(),
      };
      if (kmsKeyId.trim()) p.kmsKeyId = kmsKeyId.trim();

      await logs("CreateLogGroup", p);

      const days = Number(retention.value);
      if (days > 0) {
        await logs("PutRetentionPolicy", { logGroupName: name.trim(), retentionInDays: days });
      }

      flash.notify({
        type: "success",
        content: `Created log group ${name}.`,
      });
      nav(`/logs/log-groups/${enc(name.trim())}`);
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
          description="Create a log group to store and manage log streams."
        >
          Create log group
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Log group details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Log group name"
              description="A unique name for your log group (e.g. /aws/lambda/my-function or /app/production)."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="/aws/lambda/order-processing"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField
              label="Retention setting"
              description="Choose how long to retain log events."
            >
              <Select
                selectedOption={retention}
                onChange={e => setRetention(e.detail.selectedOption as any)}
                options={RETENTION_OPTIONS}
              />
            </FormField>

            <FormField
              label="KMS key ID (optional)"
              description="The Amazon Resource Name (ARN) of the KMS key to use when encrypting log data."
            >
              <Input
                value={kmsKeyId}
                placeholder="arn:aws:kms:us-east-1:000000000000:key/..."
                onChange={e => setKmsKeyId(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
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
              disabled={!name.trim()}
              onClick={submit}
            >
              Create log group
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
