import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Tiles from "@cloudscape-design/components/tiles";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { ssm, crumbs, PARAM_TYPES, PARAM_TIERS, enc } from "./lib";

export default function CreateParameter() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Parameters", href: "#/ssm/parameters" },
      { text: "Create parameter" }
    )
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("Standard");
  const [type, setType] = useState("String");
  const [kmsKeyId, setKmsKeyId] = useState("");
  const [value, setValue] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim() || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        Name: name.trim(),
        Description: description.trim() || undefined,
        Type: type,
        Value: value.trim(),
        Tier: tier,
        Overwrite: true,
      };

      if (type === "SecureString" && kmsKeyId.trim()) {
        p.KeyId = kmsKeyId.trim();
      }

      await ssm("PutParameter", p);
      flash.notify({
        type: "success",
        content: `Created parameter ${name}.`,
      });
      nav(`/ssm/parameters/${enc(name.trim())}`);
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
          description="Create a parameter to store configuration data or passwords."
        >
          Create parameter
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Parameter details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Name"
              description="A hierarchical path prefix is recommended, such as /application/environment/component/variable."
              constraintText="Required. Alphanumeric, slash, period, hyphen, or underscore."
            >
              <Input
                value={name}
                placeholder="/my-app/production/database/password"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description (optional)">
              <Input
                value={description}
                placeholder="Database master password"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>

            <FormField label="Tier">
              <RadioGroup
                value={tier}
                onChange={e => setTier(e.detail.value)}
                items={PARAM_TIERS}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Type</Header>}>
          <SpaceBetween size="m">
            <FormField label="Parameter type">
              <Tiles
                value={type}
                onChange={e => setType(e.detail.value)}
                items={PARAM_TYPES}
              />
            </FormField>

            {type === "SecureString" && (
              <FormField
                label="KMS key source"
                description="Specify a custom KMS key ID or alias, or leave blank to use the default AWS managed key (alias/aws/ssm)."
              >
                <Input
                  value={kmsKeyId}
                  placeholder="alias/aws/ssm"
                  onChange={e => setKmsKeyId(e.detail.value)}
                />
              </FormField>
            )}
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Value</Header>}>
          <FormField
            label="Value"
            description={
              type === "StringList"
                ? "Enter comma-separated values (e.g. host1,host2,host3)."
                : "Enter the plaintext value for this parameter."
            }
            constraintText="Required"
          >
            <div className="code-editor">
              <Textarea
                value={value}
                rows={8}
                placeholder={type === "StringList" ? "val1,val2,val3" : "my-secret-or-config-value"}
                onChange={e => setValue(e.detail.value)}
              />
            </div>
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
              disabled={!name.trim() || !value.trim()}
              onClick={submit}
            >
              Create parameter
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
