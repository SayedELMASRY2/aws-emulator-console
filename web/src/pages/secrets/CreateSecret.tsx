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
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { useCrumbs } from "../../App";
import { useFlash, ErrorAlert } from "../../common";
import { sm, crumbs, enc } from "./lib";

export default function CreateSecret() {
  const nav = useNavigate();
  const flash = useFlash();

  useCrumbs(
    crumbs(
      { text: "Secrets", href: "#/secrets" },
      { text: "Store a new secret" }
    )
  );

  const [secretType, setSecretType] = useState("keyvalue");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Key/value rows
  const [pairs, setPairs] = useState<{ key: string; value: string }[]>([
    { key: "username", value: "db_admin" },
    { key: "password", value: "SecretPass123!" },
  ]);

  // Plaintext mode
  const [plaintext, setPlaintext] = useState('{\n  "api_key": "sk_test_1234567890",\n  "environment": "staging"\n}');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const updatePair = (index: number, field: "key" | "value", val: string) => {
    setPairs(p => {
      const copy = [...p];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const addPair = () => {
    setPairs(p => [...p, { key: "", value: "" }]);
  };

  const removePair = (index: number) => {
    setPairs(p => p.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let finalSecretString = "";
      if (secretType === "keyvalue") {
        const obj: Record<string, string> = {};
        for (const p of pairs) {
          if (p.key.trim()) obj[p.key.trim()] = p.value;
        }
        finalSecretString = JSON.stringify(obj);
      } else {
        finalSecretString = plaintext.trim();
      }

      const res = await sm("CreateSecret", {
        Name: name.trim(),
        Description: description.trim() || undefined,
        SecretString: finalSecretString,
      });

      flash.notify({
        type: "success",
        content: `Stored secret ${name}.`,
      });
      nav(`/secrets/${enc(res.Name)}`);
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
          description="Store credentials, API keys, or arbitrary secrets securely in AWS Secrets Manager."
        >
          Store a new secret
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Secret type</Header>}>
          <Tiles
            value={secretType}
            onChange={e => setSecretType(e.detail.value)}
            items={[
              {
                value: "keyvalue",
                label: "Key/value",
                description: "Structured credential pairs (e.g. database username, password, host, port).",
              },
              {
                value: "plaintext",
                label: "Plaintext",
                description: "Raw text, API keys, certificates, or JSON payloads.",
              },
            ]}
          />
        </Container>

        {secretType === "keyvalue" ? (
          <Container header={<Header variant="h2">Key/value pairs</Header>}>
            <SpaceBetween size="m">
              {pairs.map((p, idx) => (
                <div key={idx} style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <FormField label={idx === 0 ? "Key" : undefined}>
                      <Input
                        value={p.key}
                        placeholder="Key"
                        onChange={e => updatePair(idx, "key", e.detail.value)}
                      />
                    </FormField>
                  </div>
                  <div style={{ flex: 1 }}>
                    <FormField label={idx === 0 ? "Value" : undefined}>
                      <Input
                        value={p.value}
                        placeholder="Value"
                        onChange={e => updatePair(idx, "value", e.detail.value)}
                      />
                    </FormField>
                  </div>
                  <Button
                    variant="icon"
                    iconName="remove"
                    ariaLabel="Remove pair"
                    disabled={pairs.length <= 1}
                    onClick={() => removePair(idx)}
                  />
                </div>
              ))}
              <Button onClick={addPair}>Add row</Button>
            </SpaceBetween>
          </Container>
        ) : (
          <Container header={<Header variant="h2">Plaintext secret</Header>}>
            <FormField label="Secret text" constraintText="Required">
              <div className="code-editor">
                <Textarea
                  value={plaintext}
                  rows={10}
                  onChange={e => setPlaintext(e.detail.value)}
                />
              </div>
            </FormField>
          </Container>
        )}

        <Container header={<Header variant="h2">Secret details</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Secret name"
              description="A unique name for your secret (e.g. prod/app/db)."
              constraintText="Required"
            >
              <Input
                value={name}
                placeholder="production/database/credentials"
                onChange={e => setName(e.detail.value)}
              />
            </FormField>

            <FormField label="Description (optional)">
              <Input
                value={description}
                placeholder="Credentials for backend database"
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
              disabled={!name.trim()}
              onClick={submit}
            >
              Store secret
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </ContentLayout>
  );
}
