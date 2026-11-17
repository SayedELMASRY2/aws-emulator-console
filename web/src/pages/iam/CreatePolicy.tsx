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
import { iam, crumbs, enc } from "./lib";

const SAMPLE_POLICY = JSON.stringify(
  {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        Resource: ["arn:aws:s3:::*", "arn:aws:s3:::*/*"],
      },
    ],
  },
  null,
  2
);

export default function CreatePolicy() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Policies", href: "#/iam/policies" },
      { text: "Create policy" }
    )
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [policyDoc, setPolicyDoc] = useState(SAMPLE_POLICY);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const setPreset = (type: string) => {
    if (type === "admin") {
      setPolicyDoc(
        JSON.stringify(
          {
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
          },
          null,
          2
        )
      );
    } else if (type === "s3") {
      setPolicyDoc(SAMPLE_POLICY);
    } else if (type === "dynamo") {
      setPolicyDoc(
        JSON.stringify(
          {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: ["dynamodb:*"],
                Resource: "*",
              },
            ],
          },
          null,
          2
        )
      );
    }
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      try {
        JSON.parse(policyDoc);
      } catch {
        throw new Error("Invalid JSON in policy document.");
      }

      const res = await iam("CreatePolicy", {
        PolicyName: name.trim(),
        Description: description.trim() || undefined,
        PolicyDocument: policyDoc.trim(),
      });

      flash.notify({
        type: "success",
        content: `Created policy ${name}.`,
      });
      nav(`/iam/policies/${enc(res.Policy.Arn)}`);
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
          description="Create a custom IAM policy with fine-grained permissions."
        >
          Create policy
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Policy details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Policy name"
              description="A unique name for your policy."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="MyCustomStoragePolicy"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description (optional)">
              <Input
                value={description}
                placeholder="Grants read and write access to S3 storage"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="JSON policy document declaring statements, actions, and resources."
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => setPreset("s3")}>S3 template</Button>
                  <Button onClick={() => setPreset("dynamo")}>DynamoDB template</Button>
                  <Button onClick={() => setPreset("admin")}>Full admin</Button>
                </SpaceBetween>
              }
            >
              Policy document
            </Header>
          }
        >
          <div className="code-editor">
            <Textarea
              value={policyDoc}
              rows={16}
              onChange={e => setPolicyDoc(e.detail.value)}
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
              disabled={!name.trim()}
              onClick={submit}
            >
              Create policy
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
