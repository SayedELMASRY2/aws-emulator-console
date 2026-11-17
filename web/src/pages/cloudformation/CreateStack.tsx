import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { cfn, crumbs, SAMPLE_TEMPLATES, enc } from "./lib";

const TEMPLATE_OPTIONS = [
  { value: "s3_sqs", label: SAMPLE_TEMPLATES.s3_sqs.label },
  { value: "dynamodb", label: SAMPLE_TEMPLATES.dynamodb.label },
  { value: "custom", label: "Custom template (empty)" },
];

export default function CreateStack() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Stacks", href: "#/cloudformation/stacks" },
      { text: "Create stack" }
    )
  );

  const [stackName, setStackName] = useState("");
  const [selectedOption, setSelectedOption] = useState(TEMPLATE_OPTIONS[0]);
  const [templateText, setTemplateText] = useState(SAMPLE_TEMPLATES.s3_sqs.template);
  const [capIam, setCapIam] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleTemplateSelect = (opt: any) => {
    setSelectedOption(opt);
    if (opt.value === "custom") {
      setTemplateText('AWSTemplateFormatVersion: "2010-09-09"\nDescription: Custom application stack\n\nResources:\n  MyResource:\n    Type: AWS::SQS::Queue\n');
    } else if (SAMPLE_TEMPLATES[opt.value]) {
      setTemplateText(SAMPLE_TEMPLATES[opt.value].template);
    }
  };

  const submit = async () => {
    if (!stackName.trim() || !templateText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const caps = capIam
        ? ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"]
        : [];

      const res = await cfn("CreateStack", {
        StackName: stackName.trim(),
        TemplateBody: templateText.trim(),
        Capabilities: caps.length ? caps : undefined,
      });

      flash.notify({
        type: "success",
        content: `Created stack ${stackName}. Resources are provisioning.`,
      });
      nav(`/cloudformation/stacks/${enc(stackName.trim())}`);
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
          description="Create a stack to provision and configure cloud infrastructure as code."
        >
          Create stack
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Stack details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Stack name"
              description="A unique name for your stack. Must contain only letters, numbers, and hyphens."
              constraintText="Required"
            >
              <Input
                value={stackName}
                placeholder="my-application-stack"
                onChange={e => setStackName(e.detail.value)}
              />
            </FormField>

            <FormField label="Starter template">
              <Select
                selectedOption={selectedOption}
                onChange={e => handleTemplateSelect(e.detail.selectedOption)}
                options={TEMPLATE_OPTIONS}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="CloudFormation template in YAML or JSON format."
            >
              Template specification
            </Header>
          }
        >
          <div className="code-editor">
            <Textarea
              value={templateText}
              rows={18}
              onChange={e => setTemplateText(e.detail.value)}
            />
          </div>
        </Container>

        <Container header={<Header variant="h2">Capabilities</Header>}>
          <Checkbox
            checked={capIam}
            onChange={e => setCapIam(e.detail.checked)}
          >
            I acknowledge that AWS CloudFormation might create IAM resources with custom names (CAPABILITY_IAM).
          </Checkbox>
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
              disabled={!stackName.trim() || !templateText.trim()}
              onClick={submit}
            >
              Create stack
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
