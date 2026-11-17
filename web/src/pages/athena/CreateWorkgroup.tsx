import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { athena, crumbs, ATHENA_BUCKET } from "./lib";

export default function CreateWorkgroup() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Workgroups", href: "#/athena/workgroups" },
      { text: "Create workgroup" }
    )
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [outputLocation, setOutputLocation] = useState(`s3://${ATHENA_BUCKET}/`);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        Name: name.trim(),
        Description: description.trim() || undefined,
        Configuration: {
          ResultConfiguration: {
            OutputLocation: outputLocation.trim(),
          },
        },
      };

      await athena("CreateWorkGroup", p);
      flash.notify({
        type: "success",
        content: `Created workgroup ${name}.`,
      });
      nav("/athena/workgroups");
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
          description="A workgroup separates query execution environments and controls query results storage."
        >
          Create workgroup
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Workgroup details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Workgroup name"
              description="A unique name for your workgroup."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="analytics-team"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description">
              <Input
                value={description}
                placeholder="Workgroup for analytics and reporting"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Query result configuration</Header>}>
          <FormField
            label="S3 query result location"
            description="The location in Amazon S3 where query results and execution logs are stored."
            constraintText="Must start with s3://"
          >
            <Input
              value={outputLocation}
              placeholder="s3://my-bucket/athena-results/"
              onChange={e => setOutputLocation(e.detail.value)}
            />
          </FormField>
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
              Create workgroup
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
