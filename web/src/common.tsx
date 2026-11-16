// Shared hooks and small components.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import FormField from "@cloudscape-design/components/form-field";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { ApiError, isNotImplemented } from "./api";

// ---------------- notifications (Flashbar) ----------------
type Flash = FlashbarProps.MessageDefinition;
const FlashCtx = createContext<{ items: Flash[]; notify: (f: Omit<Flash, "id" | "dismissible" | "onDismiss">) => void; error: (e: unknown, header?: string) => void }>(null as any);

export function FlashProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Flash[]>([]);
  const notify = useCallback((f: Omit<Flash, "id" | "dismissible" | "onDismiss">) => {
    const id = Math.random().toString(36).slice(2);
    const dismiss = () => setItems(xs => xs.filter(x => x.id !== id));
    setItems(xs => [{ ...f, id, dismissible: true, onDismiss: dismiss }, ...xs].slice(0, 4));
    if (f.type === "success") setTimeout(dismiss, 8000);
  }, []);
  const error = useCallback((e: unknown, header?: string) => {
    notify({ type: "error", header: header || errHeader(e), content: errText(e) });
  }, [notify]);
  return <FlashCtx.Provider value={{ items, notify, error }}>{children}</FlashCtx.Provider>;
}
export const useFlash = () => useContext(FlashCtx);

export function errHeader(e: unknown) {
  if (isNotImplemented(e)) return "Not supported by the emulator";
  return e instanceof ApiError ? e.code : "Error";
}
export function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function ErrorAlert({ error, header }: { error: unknown; header?: string }) {
  if (!error) return null;
  return (
    <Alert type={isNotImplemented(error) ? "warning" : "error"} header={header || errHeader(error)}>
      {errText(error)}
      {isNotImplemented(error) && <Box variant="small" display="block">This operation isn't implemented in AWS Emulator yet.</Box>}
    </Alert>
  );
}

export function EmulatorNote({ children }: { children: ReactNode }) {
  return <Alert type="info" header="Emulator note">{children}</Alert>;
}

// ---------------- data loading ----------------
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await fnRef.current();
      if (alive.current) setState({ data, loading: false });
    } catch (error) {
      if (alive.current) setState({ error, loading: false });
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload, setData: (data: T) => setState({ data, loading: false }) };
}

// ---------------- formatting ----------------
export function fmtBytes(n?: number | null) {
  if (n == null) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${i ? v.toFixed(1) : v} ${u[i]}`;
}
export function fmtDate(s?: string | number | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(+d)) return String(s);
  return d.toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
}
export function dash(v: unknown) {
  return v === undefined || v === null || v === "" ? "-" : String(v);
}

export function Copyable({ text, label, iconOnly }: { text: string; label?: string; iconOnly?: boolean }) {
  return <CopyToClipboard variant={iconOnly ? "icon" : "inline"} textToCopy={text} copyButtonAriaLabel={`Copy ${label || "value"}`} copySuccessText="Copied" copyErrorText="Copy failed" />;
}

export function ValueWithLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children ?? "-"}</div>
    </div>
  );
}

// ---------------- delete confirmation (type to confirm) ----------------
export function ConfirmModal({
  visible, onDismiss, onConfirm, header, children, confirmText, confirmLabel = "Delete", busy,
}: {
  visible: boolean; onDismiss: () => void; onConfirm: () => void; header: string; children?: ReactNode;
  confirmText?: string; confirmLabel?: string; busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (visible) setTyped(""); }, [visible]);
  const ok = !confirmText || typed === confirmText;
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={header}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" disabled={!ok} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {children}
        {confirmText && (
          <FormField label={<span>To confirm, type <i>{confirmText}</i> in the text input field.</span>}>
            <Input value={typed} placeholder={confirmText} onChange={e => setTyped(e.detail.value)} />
          </FormField>
        )}
      </SpaceBetween>
    </Modal>
  );
}

export function tagsToList(tags?: { Key: string; Value: string }[]) {
  return (tags || []).map(t => ({ key: t.Key, value: t.Value, existing: true }));
}

export const REGION = "us-east-1";
export const ACCOUNT = "000000000000";
