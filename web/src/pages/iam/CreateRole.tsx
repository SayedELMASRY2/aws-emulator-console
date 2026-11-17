import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Tiles from "@cloudscape-design/components/tiles";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { iam, crumbs, TRUST_SERVICES, buildTrustDoc, enc } from "./lib";

export default function CreateRole() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Roles", href: "#/iam/roles" },
      { text: "Create role" }
    )
  );

  const [selectedService, setSelectedService] = useState(TRUST_SERVICES[0].value);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [trustDoc, setTrustDoc] = useState(buildTrustDoc(TRUST_SERVICES[0].value));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleServiceChange = (svc: string) => {
    setSelectedService(svc);
    setTrustDoc(buildTrustDoc(svc));
  };

  const submit = async () => {
    if (!roleName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      try {
        JSON.parse(trustDoc);
      } catch {
        throw new Error("Invalid JSON in trust policy document.");
      }

      const res = await iam("CreateRole", {
        RoleName: roleName.trim(),
        AssumeRolePolicyDocument: trustDoc.trim(),
        Description: description.trim() || undefined,
      });

      flash.notify({
        type: "success",
        content: `Created role ${roleName}.`,
      });
      nav(`/iam/roles/${enc(res.Role.RoleName)}`);
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
          description="An IAM role provides temporary credentials to AWS services and workloads."
        >
          Create role
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Select trusted entity</Header>}>
          <SpaceBetween size="m">
            <FormField label="AWS service">
              <Tiles
                value={selectedService}
                onChange={e => handleServiceChange(e.detail.value)}
                items={TRUST_SERVICES.map(s => ({
                  value: s.value,
                  label: s.label,
                  description: s.desc,
                }))}
              />
            </FormField>

            <FormField label="Trust policy document (JSON)">
              <div className="code-editor">
                <Textarea
                  value={trustDoc}
                  rows={9}
                  onChange={e => setTrustDoc(e.detail.value)}
                />
              </div>
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Role details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Role name"
              description="A unique name for your role."
              constraintText="Required"
            >
              <Input
                value={roleName}
                placeholder="my-execution-role"
                onChange={e => setRoleName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description (optional)">
              <Input
                value={description}
                placeholder="Allows execution and data access"
                onChange={e => setDescription(e.detail.value)}
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
              disabled={!roleName.trim()}
              onClick={submit}
            >
              Create role
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
