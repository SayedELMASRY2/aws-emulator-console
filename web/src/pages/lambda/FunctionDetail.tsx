import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs from "@cloudscape-design/components/tabs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import FormField from "@cloudscape-design/components/form-field";
import Textarea from "@cloudscape-design/components/textarea";
import Modal from "@cloudscape-design/components/modal";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Select from "@cloudscape-design/components/select";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import { useCrumbs } from "../../App";
import { useAsync, useFlash, ErrorAlert, ValueWithLabel, Copyable } from "../../common";
import {
  lam,
  crumbs,
  St,
  fmt,
  fmtBytes,
  langForRuntime,
  LAMBDA_SAMPLES,
  decodeLogs,
  deployLambdaCode,
} from "./lib";

const EVENT_PRESETS = [
  {
    value: "hello",
    label: "Hello World",
    data: { name: "AWS Emulator" },
  },
  {
    value: "apigw",
    label: "API Gateway Proxy",
    data: {
      httpMethod: "GET",
      path: "/test",
      headers: { Accept: "application/json" },
      queryStringParameters: { foo: "bar" },
      body: null,
    },
  },
  {
    value: "sqs",
    label: "SQS Message Payload",
    data: {
      Records: [
        {
          messageId: "msg-001",
          receiptHandle: "handle-001",
          body: "Hello from local queue",
          attributes: { ApproximateReceiveCount: "1" },
        },
      ],
    },
  },
];

export default function FunctionDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Functions", href: "#/lambda/functions" },
      { text: name }
    )
  );

  const functionData = useAsync(async () => {
    const res = await lam("GetFunction", { FunctionName: name });
    return res;
  }, [name]);

  const f = functionData.data;
  const cfg = f?.Configuration;

  const lang = langForRuntime(cfg?.Runtime);
  const sample = LAMBDA_SAMPLES[lang];
  const filename = cfg?.Handler ? cfg.Handler.split(".")[0] + (lang === "nodejs" ? ".mjs" : ".py") : sample.file;

  // Code editor state
  const [code, setCode] = useState("");
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    // Check if code was previously saved in localStorage or use sample
    const saved = localStorage.getItem(`lambda_code_${name}`);
    if (saved) {
      setCode(saved);
    } else if (sample?.code) {
      setCode(sample.code);
    }
  }, [name, sample]);

  // Test execution state
  const [testPayload, setTestPayload] = useState(JSON.stringify({ name: "AWS Emulator" }, null, 2));
  const [testPreset, setTestPreset] = useState(EVENT_PRESETS[0]);
  const [invoking, setInvoking] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Deploy code
  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    try {
      await deployLambdaCode({
        name,
        code,
        update: true,
        filename,
      });
      localStorage.setItem(`lambda_code_${name}`, code);
      flash.notify({ type: "success", content: `Successfully deployed code to ${name}.` });
      functionData.reload();
    } catch (e) {
      setError(e);
      flash.error(e, "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  // Invoke test
  const handleInvoke = async () => {
    setInvoking(true);
    setTestResult(null);
    setError(null);
    const start = performance.now();
    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(testPayload);
      } catch {
        throw new Error("Invalid JSON in test event payload.");
      }

      const res = await lam("Invoke", {
        FunctionName: name,
        Payload: JSON.stringify(parsedPayload),
        LogType: "Tail",
      });

      const durationMs = Math.round(performance.now() - start);

      let parsedBody: any = res.Payload;
      if (typeof res.Payload === "string") {
        try {
          parsedBody = JSON.parse(res.Payload);
        } catch {
          parsedBody = res.Payload;
        }
      }

      const logs = decodeLogs(res.LogResult);

      setTestResult({
        statusCode: res.StatusCode,
        functionError: res.FunctionError,
        payload: parsedBody,
        logs,
        durationMs,
        executedVersion: res.ExecutedVersion,
      });
    } catch (e) {
      setError(e);
    } finally {
      setInvoking(false);
    }
  };

  // Delete function
  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await lam("DeleteFunction", { FunctionName: name });
      localStorage.removeItem(`lambda_code_${name}`);
      flash.notify({ type: "success", content: `Deleted function ${name}.` });
      nav("/lambda/functions");
    } catch (e) {
      setError(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <ButtonDropdown
                items={[{ id: "delete", text: "Delete function" }]}
                onItemClick={e => {
                  if (e.detail.id === "delete") setDeleteOpen(true);
                }}
              >
                Actions
              </ButtonDropdown>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Function overview</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            <ValueWithLabel label="State">
              <St s={cfg?.State || "Active"} />
            </ValueWithLabel>
            <ValueWithLabel label="Runtime">{cfg?.Runtime || "-"}</ValueWithLabel>
            <ValueWithLabel label="Handler">{cfg?.Handler || "-"}</ValueWithLabel>
            <ValueWithLabel label="Memory">{cfg?.MemorySize ? `${cfg.MemorySize} MB` : "-"}</ValueWithLabel>
            <ValueWithLabel label="Timeout">{cfg?.Timeout ? `${cfg.Timeout} s` : "-"}</ValueWithLabel>
            <ValueWithLabel label="Code size">{fmtBytes(cfg?.CodeSize)}</ValueWithLabel>
            <ValueWithLabel label="Last modified">{fmt(cfg?.LastModified)}</ValueWithLabel>
            <ValueWithLabel label="Function ARN">
              {cfg?.FunctionArn ? <Copyable text={cfg.FunctionArn} /> : "-"}
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Tabs
          tabs={[
            {
              id: "code",
              label: "Code",
              content: (
                <SpaceBetween size="m">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        description={`Editing ${filename}. Deploying replaces the function code in the local runtime.`}
                        actions={
                          <Button
                            variant="primary"
                            loading={deploying}
                            onClick={handleDeploy}
                          >
                            Deploy
                          </Button>
                        }
                      >
                        Code source
                      </Header>
                    }
                  >
                    <div className="code-editor">
                      <Textarea
                        value={code}
                        rows={20}
                        onChange={e => setCode(e.detail.value)}
                      />
                    </div>
                  </Container>
                </SpaceBetween>
              ),
            },
            {
              id: "test",
              label: "Test",
              content: (
                <SpaceBetween size="m">
                  <Container
                    header={
                      <Header
                        variant="h2"
                        actions={
                          <Button
                            variant="primary"
                            loading={invoking}
                            iconName="play"
                            onClick={handleInvoke}
                          >
                            Test
                          </Button>
                        }
                      >
                        Test event
                      </Header>
                    }
                  >
                    <SpaceBetween size="m">
                      <FormField label="Event template">
                        <Select
                          selectedOption={testPreset}
                          onChange={e => {
                            const opt = e.detail.selectedOption as any;
                            setTestPreset(opt);
                            setTestPayload(JSON.stringify(opt.data, null, 2));
                          }}
                          options={EVENT_PRESETS}
                        />
                      </FormField>

                      <FormField label="Event JSON">
                        <div className="code-editor">
                          <Textarea
                            value={testPayload}
                            rows={8}
                            onChange={e => setTestPayload(e.detail.value)}
                          />
                        </div>
                      </FormField>
                    </SpaceBetween>
                  </Container>

                  {testResult && (
                    <Container
                      header={
                        <Header
                          variant="h2"
                          actions={
                            <StatusIndicator type={testResult.functionError ? "error" : "success"}>
                              {testResult.functionError ? `Failed: ${testResult.functionError}` : "Execution succeeded"}
                            </StatusIndicator>
                          }
                        >
                          Execution result
                        </Header>
                      }
                    >
                      <SpaceBetween size="m">
                        <ColumnLayout columns={3} variant="text-grid">
                          <ValueWithLabel label="Response status">
                            {testResult.statusCode || 200}
                          </ValueWithLabel>
                          <ValueWithLabel label="Execution duration">
                            {testResult.durationMs} ms
                          </ValueWithLabel>
                          <ValueWithLabel label="Version">
                            {testResult.executedVersion || "$LATEST"}
                          </ValueWithLabel>
                        </ColumnLayout>

                        <FormField label="Response payload">
                          <div
                            style={{
                              background: "#f2f3f3",
                              padding: "12px",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {typeof testResult.payload === "object"
                              ? JSON.stringify(testResult.payload, null, 2)
                              : String(testResult.payload)}
                          </div>
                        </FormField>

                        {testResult.logs && (
                          <FormField label="Function logs">
                            <div
                              style={{
                                background: "#161d26",
                                color: "#d5dbdb",
                                padding: "12px",
                                borderRadius: "4px",
                                fontFamily: "monospace",
                                fontSize: "12px",
                                whiteSpace: "pre-wrap",
                                maxHeight: "250px",
                                overflowY: "auto",
                              }}
                            >
                              {testResult.logs}
                            </div>
                          </FormField>
                        )}
                      </SpaceBetween>
                    </Container>
                  )}
                </SpaceBetween>
              ),
            },
            {
              id: "configuration",
              label: "Configuration",
              content: (
                <SpaceBetween size="l">
                  <Container header={<Header variant="h2">General configuration</Header>}>
                    <ColumnLayout columns={3} variant="text-grid">
                      <ValueWithLabel label="Memory">{cfg?.MemorySize ? `${cfg.MemorySize} MB` : "-"}</ValueWithLabel>
                      <ValueWithLabel label="Timeout">{cfg?.Timeout ? `${cfg.Timeout} s` : "-"}</ValueWithLabel>
                      <ValueWithLabel label="Handler">{cfg?.Handler || "-"}</ValueWithLabel>
                      <ValueWithLabel label="Ephemeral storage">
                        {cfg?.EphemeralStorage?.Size ? `${cfg.EphemeralStorage.Size} MB` : "512 MB"}
                      </ValueWithLabel>
                      <ValueWithLabel label="Role">{cfg?.Role || "-"}</ValueWithLabel>
                    </ColumnLayout>
                  </Container>

                  <Container
                    header={
                      <Header
                        variant="h2"
                        counter={`(${Object.keys(cfg?.Environment?.Variables || {}).length})`}
                      >
                        Environment variables
                      </Header>
                    }
                  >
                    <Table
                      items={Object.entries(cfg?.Environment?.Variables || {}).map(([k, v]) => ({
                        key: k,
                        value: v,
                      }))}
                      columnDefinitions={[
                        { id: "key", header: "Key", cell: (x: any) => <b>{x.key}</b> },
                        { id: "value", header: "Value", cell: (x: any) => <code>{x.value}</code> },
                      ]}
                      empty="No environment variables configured."
                    />
                  </Container>
                </SpaceBetween>
              ),
            },
          ]}
        />

        <ErrorAlert error={error} />

        {/* Delete Modal */}
        {deleteOpen && (
          <Modal
            visible={true}
            onDismiss={() => setDeleteOpen(false)}
            header={`Delete function: ${name}`}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={deleting} onClick={handleDelete}>
                    Delete
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            <SpaceBetween size="m">
              <Box>
                Are you sure you want to delete function <b>{name}</b>?
                You cannot undo this action.
              </Box>
              <ErrorAlert error={error} />
            </SpaceBetween>
          </Modal>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
