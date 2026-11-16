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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { api } from "../../api";
import { useFlash, ErrorAlert, useAsync } from "../../common";
import {
  crumbs,
  LAMBDA_RUNTIMES,
  LAMBDA_SAMPLES,
  langForRuntime,
  deployLambdaCode,
} from "./lib";

export default function CreateFunction() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Functions", href: "#/lambda/functions" },
      { text: "Create function" }
    )
  );

  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState(LAMBDA_RUNTIMES[0]);
  const [architecture, setArchitecture] = useState("x86_64");

  const lang = langForRuntime(runtime.value);
  const sample = LAMBDA_SAMPLES[lang];

  const [code, setCode] = useState(sample.code);
  const [memory, setMemory] = useState("128");
  const [timeout, setTimeoutVal] = useState("30");
  const [envVars, setEnvVars] = useState("");

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

  // Update sample code when runtime language changes
  const handleRuntimeChange = (opt: any) => {
    setRuntime(opt);
    const newLang = langForRuntime(opt.value);
    setCode(LAMBDA_SAMPLES[newLang].code);
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const curLang = langForRuntime(runtime.value);
      const s = LAMBDA_SAMPLES[curLang];

      const env: Record<string, string> = {};
      envVars
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .forEach(l => {
          const idx = l.indexOf("=");
          if (idx > 0) env[l.slice(0, idx)] = l.slice(idx + 1);
        });

      await deployLambdaCode({
        name: name.trim(),
        runtime: runtime.value,
        handler: s.handler,
        filename: s.file,
        code: code || s.code,
        memory: parseInt(memory, 10) || 128,
        timeout: parseInt(timeout, 10) || 30,
        env: Object.keys(env).length ? env : undefined,
        role: selectedRole?.value || "arn:aws:iam::000000000000:role/lambda-role",
      });

      flash.notify({
        type: "success",
        content: `Successfully created function ${name}.`,
      });
      nav(`/lambda/functions/${encodeURIComponent(name.trim())}`);
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
          description="Create a function to execute code without provisioning or managing servers."
        >
          Create function
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Basic information</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Function name"
              description="Enter a name that describes the purpose of your function."
              constraintText="Required. Use only letters, numbers, hyphens, or underscores."
            >
              <Input
                value={name}
                placeholder="my-function"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField
              label="Runtime"
              description="Choose the language to use to write your function."
            >
              <Select
                selectedOption={runtime}
                onChange={e => handleRuntimeChange(e.detail.selectedOption)}
                options={LAMBDA_RUNTIMES}
              />
            </FormField>

            <FormField
              label="Architecture"
              description="The instruction set architecture that the function runs on."
            >
              <RadioGroup
                value={architecture}
                onChange={e => setArchitecture(e.detail.value)}
                items={[
                  { value: "x86_64", label: "x86_64" },
                  { value: "arm64", label: "arm64" },
                ]}
              />
            </FormField>

            <FormField
              label="Execution role"
              description="An execution role is an AWS Identity and Access Management (IAM) role that grants the function permission to access AWS services and resources."
            >
              <Select
                selectedOption={selectedRole}
                onChange={e => setSelectedRole(e.detail.selectedOption)}
                options={roles.data || []}
                placeholder="Choose or create an execution role"
                empty="Default emulator role will be used"
                loadingText="Loading IAM roles..."
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header variant="h2" description="Starter code deployed with your function.">
              Code editor ({sample.file})
            </Header>
          }
        >
          <div className="code-editor">
            <Textarea
              value={code}
              rows={12}
              onChange={e => setCode(e.detail.value)}
            />
          </div>
        </Container>

        <Container header={<Header variant="h2">Configuration</Header>}>
          <SpaceBetween size="m">
            <ColumnLayout columns={2}>
              <FormField label="Memory (MB)">
                <Input
                  type="number"
                  value={memory}
                  onChange={e => setMemory(e.detail.value)}
                />
              </FormField>
              <FormField label="Timeout (seconds)">
                <Input
                  type="number"
                  value={timeout}
                  onChange={e => setTimeoutVal(e.detail.value)}
                />
              </FormField>
            </ColumnLayout>

            <FormField
              label="Environment variables"
              description="Optional. Enter one KEY=value pair per line."
            >
              <Textarea
                value={envVars}
                rows={3}
                placeholder="DATABASE_URL=127.0.0.1\nLOG_LEVEL=debug"
                onChange={e => setEnvVars(e.detail.value)}
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
              Create function
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
