import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert } from "../../common";
import { ssm, crumbs, PARAM_TIERS, enc } from "./lib";

export default function EditParameter() {
  const { paramName = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Parameters", href: "#/ssm/parameters" },
      { text: paramName, href: `#/ssm/parameters/${enc(paramName)}` },
      { text: "Edit parameter" }
    )
  );

  const initialData = useAsync(async () => {
    const [paramRes, metaRes] = await Promise.all([
      ssm("GetParameter", { Name: paramName, WithDecryption: true }),
      ssm("DescribeParameters", { Filters: [{ Key: "Name", Values: [paramName] }] }),
    ]);
    return {
      param: paramRes.Parameter,
      meta: (metaRes.Parameters || [])[0],
    };
  }, [paramName]);

  const [description, setDescription] = useState("");
  const [tier, setTier] = useState("Standard");
  const [value, setValue] = useState("");
  const [type, setType] = useState("String");

  useEffect(() => {
    if (initialData.data) {
      const p = initialData.data.param;
      const m = initialData.data.meta;
      setValue(p?.Value || "");
      setType(p?.Type || "String");
      setDescription(m?.Description || "");
      setTier(m?.Tier || "Standard");
    }
  }, [initialData.data]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p: Record<string, any> = {
        Name: paramName,
        Value: value.trim(),
        Type: type,
        Tier: tier,
        Description: description.trim() || undefined,
        Overwrite: true,
      };

      const res = await ssm("PutParameter", p);
      flash.notify({
        type: "success",
        content: `Updated parameter ${paramName} (Version ${res.Version}).`,
      });
      nav(`/ssm/parameters/${enc(paramName)}`);
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
          description={`Update value or metadata for parameter ${paramName}. A new version will be created.`}
        >
          Edit parameter
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Parameter configuration</Header>}>
          <SpaceBetween size="m">
            <FormField label="Name">
              <Input value={paramName} disabled />
            </FormField>

            <FormField label="Type">
              <Input value={type} disabled />
            </FormField>

            <FormField label="Tier">
              <RadioGroup
                value={tier}
                onChange={e => setTier(e.detail.value)}
                items={PARAM_TIERS}
              />
            </FormField>

            <FormField label="Description">
              <Input
                value={description}
                placeholder="Description of the parameter"
                onChange={e => setDescription(e.detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Value</Header>}>
          <FormField
            label="Value"
            description="Enter the updated value. Saving will create a new parameter version in history."
            constraintText="Required"
          >
            <div className="code-editor">
              <Textarea
                value={value}
                rows={10}
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
              disabled={!value.trim()}
              onClick={submit}
            >
              Save changes
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
