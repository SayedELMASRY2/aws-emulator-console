import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Toggle from "@cloudscape-design/components/toggle";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { ecr, crumbs } from "./lib";

export default function CreateRepository() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Repositories", href: "#/ecr/repositories" },
      { text: "Create repository" }
    )
  );

  const [repoName, setRepoName] = useState("");
  const [tagImmutability, setTagImmutability] = useState(false);
  const [scanOnPush, setScanOnPush] = useState(true);
  const [encryptionType, setEncryptionType] = useState<{ value: string; label: string }>({
    value: "AES256",
    label: "AWS managed key (AES-256)",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!repoName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        repositoryName: repoName.trim(),
        imageTagMutability: tagImmutability ? "IMMUTABLE" : "MUTABLE",
        imageScanningConfiguration: { scanOnPush },
        encryptionConfiguration: { encryptionType: encryptionType.value },
      };

      const res = await ecr("CreateRepository", p);
      const r = res.repository;
      flash.notify({
        type: "success",
        content: `Created repository ${r.repositoryName}.`,
      });
      nav(`/ecr/repositories/${encodeURIComponent(r.repositoryName)}`);
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
          description="A repository is where you store your Docker or OCI container images."
        >
          Create repository
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">General settings</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Repository name"
              description="A unique name for your repository (e.g. project/app-backend)."
              constraintText="Required. Alphanumeric, slash, underscore, period, and hyphen."
            >
              <Input
                value={repoName}
                placeholder="my-app"
                onChange={e => setRepoName(e.detail.value)}
              />
            </FormField>

            <FormField
              label="Tag immutability"
              description="Enable to prevent image tags from being overwritten by subsequent pushes with the same tag."
            >
              <Toggle
                checked={tagImmutability}
                onChange={e => setTagImmutability(e.detail.checked)}
              >
                {tagImmutability ? "Immutable tags" : "Mutable tags (tags can be overwritten)"}
              </Toggle>
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Image scan settings</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Scan on push"
              description="Configure image vulnerability scanning for pushed images."
            >
              <Toggle
                checked={scanOnPush}
                onChange={e => setScanOnPush(e.detail.checked)}
              >
                {scanOnPush ? "Scan on push enabled" : "Disabled"}
              </Toggle>
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Encryption settings</Header>}>
          <FormField
            label="Encryption type"
            description="All ECR repositories are encrypted by default."
          >
            <Select
              selectedOption={encryptionType}
              onChange={e => setEncryptionType(e.detail.selectedOption as any)}
              options={[
                { value: "AES256", label: "AWS managed key (AES-256)" },
                { value: "KMS", label: "AWS Key Management Service (AWS KMS)" },
              ]}
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
              disabled={!repoName.trim()}
              onClick={submit}
            >
              Create repository
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
