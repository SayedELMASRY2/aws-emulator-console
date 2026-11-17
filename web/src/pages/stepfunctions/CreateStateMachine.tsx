import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Textarea from "@cloudscape-design/components/textarea";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { useFlash, ErrorAlert, useAsync } from "../../common";
import { sfn, crumbs, SAMPLE_ASL, enc } from "./lib";

export default function CreateStateMachine() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "State machines", href: "#/stepfunctions/state-machines" },
      { text: "Create state machine" }
    )
  );

  const [name, setName] = useState("");
  const [type, setType] = useState("STANDARD");
  const [definition, setDefinition] = useState(JSON.stringify(SAMPLE_ASL, null, 2));

  // Roles
  const roles = useAsync(async () => {
    const r = await api.call("iam", "ListRoles");
    return (r.Roles || []).map((role: any) => ({
      value: role.Arn,
      label: `${role.RoleName} (${role.Arn})`,
    }));
  });
  const [selectedRole, setSelectedRole] = useState<any | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      try {
        JSON.parse(definition);
      } catch {
        throw new Error("Invalid JSON in state machine definition.");
      }

      const roleArn = selectedRole?.value || "arn:aws:iam::000000000000:role/stepfunctions-role";

      const res = await sfn("CreateStateMachine", {
        name: name.trim(),
        definition: definition.trim(),
        roleArn,
        type,
      });

      flash.notify({
        type: "success",
        content: `Created state machine ${name}.`,
      });
      nav(`/stepfunctions/state-machines/${enc(res.stateMachineArn)}`);
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
          description="Build resilient workflows using Amazon States Language (ASL)."
        >
          Create state machine
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">State machine details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="State machine name"
              description="A unique name for your state machine."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="my-state-machine"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Type">
              <RadioGroup
                value={type}
                onChange={e => setType(e.detail.value)}
                items={[
                  {
                    value: "STANDARD",
                    label: "Standard",
                    description: "Ideal for long-running, durable, and auditable workflows (up to 1 year).",
                  },
                  {
                    value: "EXPRESS",
                    label: "Express",
                    description: "Ideal for high-volume, event-processing workloads (up to 5 minutes).",
                  },
                ]}
              />
            </FormField>

            <FormField label="Execution role">
              <Select
                selectedOption={selectedRole}
                onChange={e => setSelectedRole(e.detail.selectedOption)}
                options={roles.data || []}
                placeholder="Select an IAM role (or default)"
                loadingText="Loading IAM roles..."
                empty="Default emulator role will be used"
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Amazon States Language (ASL) JSON specification of tasks, states, and transitions."
            >
              Definition
            </Header>
          }
        >
          <div className="code-editor">
            <Textarea
              value={definition}
              rows={16}
              onChange={e => setDefinition(e.detail.value)}
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
              Create state machine
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
