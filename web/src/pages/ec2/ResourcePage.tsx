// Generic list page used by most EC2 resource types: table + filter + actions + details panel for the selection.
import { useEffect, useState, type ReactNode } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown, { type ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Tabs from "@cloudscape-design/components/tabs";
import Modal from "@cloudscape-design/components/modal";
import ContentLayout from "@cloudscape-design/components/content-layout";
import { ErrorAlert, useAsync, useFlash, errText } from "../../common";

export type Col<T> = TableProps.ColumnDefinition<T> & { id: string; header: string; hidden?: boolean };
export type Action<T> = { id: string; text: string; disabled?: (sel: T[]) => boolean; disabledReason?: string; run: (sel: T[], reload: () => void) => void | Promise<void> };

function flatText(o: any, depth = 0): string {
  if (o == null || depth > 3) return "";
  if (typeof o !== "object") return String(o);
  return Object.values(o).map(v => flatText(v, depth + 1)).join(" ");
}

export function ResourcePage<T>({
  title, description, load, columns, trackBy, actions = [], primaryActions = [], create, detail, multi = true, poll, empty, deps = [], banner,
}: {
  title: string; description?: ReactNode; load: () => Promise<T[]>; columns: Col<T>[]; trackBy: string | ((t: T) => string);
  actions?: (Action<T> | { group: string; items: Action<T>[] })[]; primaryActions?: Action<T>[];
  create?: { text: string; href?: string; onClick?: (reload: () => void) => void };
  detail?: (t: T, reload: () => void) => { id: string; label: string; content: ReactNode }[];
  multi?: boolean; poll?: (t: T) => boolean; empty?: ReactNode; deps?: unknown[]; banner?: ReactNode;
}) {
  const flash = useFlash();
  const data = useAsync(load, deps);
  const [sel, setSel] = useState<T[]>([]);
  const [prefs, setPrefs] = useState({ pageSize: 25, visibleContent: columns.filter(c => !c.hidden).map(c => c.id) });
  const reload = () => data.reload();
  const busy = !!poll && (data.data || []).some(poll);
  useEffect(() => { if (!busy) return; const t = setTimeout(reload, 2500); return () => clearTimeout(t); }, [busy, data.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the selection in sync with reloaded rows.
  const key = (x: T) => typeof trackBy === "function" ? trackBy(x) : (x as any)[trackBy];
  useEffect(() => { if (data.data) setSel(s => data.data!.filter(r => s.some(x => key(x) === key(r)))); }, [data.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const { items, filterProps, paginationProps, collectionProps, filteredItemsCount } = useCollection(data.data || [], {
    filtering: { filteringFunction: (r, text) => flatText(r).toLowerCase().includes(text.toLowerCase()) },
    pagination: { pageSize: prefs.pageSize },
    sorting: {},
  });
  const runAction = async (a: Action<T>) => {
    try { await a.run(sel, reload); } catch (e) { flash.error(e, `${a.text} failed`); }
  };
  const flatActions: Action<T>[] = actions.flatMap(a => "group" in a ? a.items : [a]);
  const toItem = (a: Action<T>): ButtonDropdownProps.Item => ({ id: a.id, text: a.text, disabled: a.disabled ? a.disabled(sel) : !sel.length, disabledReason: a.disabledReason });

  return (
    <ContentLayout>
      <SpaceBetween size="l">
        {banner}
        {data.error ? <ErrorAlert error={data.error} /> : null}
        <Table
          {...collectionProps}
          variant="full-page"
          stickyHeader
          resizableColumns
          items={items}
          loading={data.loading && !data.data}
          loadingText={`Loading ${title.toLowerCase()}`}
          trackBy={trackBy as any}
          selectionType={multi ? "multi" : "single"}
          selectedItems={sel}
          onSelectionChange={e => setSel(e.detail.selectedItems)}
          columnDefinitions={columns}
          columnDisplay={columns.map(c => ({ id: c.id, visible: prefs.visibleContent.includes(c.id) }))}
          header={
            <Header variant="awsui-h1-sticky" counter={data.data ? (sel.length ? `(${sel.length}/${data.data.length})` : `(${data.data.length})`) : undefined} description={description}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button iconName="refresh" ariaLabel="Refresh" loading={data.loading && !!data.data} onClick={reload} />
                  {primaryActions.map(a => <Button key={a.id} disabled={a.disabled ? a.disabled(sel) : !sel.length} onClick={() => runAction(a)}>{a.text}</Button>)}
                  {actions.length > 0 && (
                    <ButtonDropdown
                      onItemClick={e => { const a = flatActions.find(x => x.id === e.detail.id); if (a) runAction(a); }}
                      items={actions.map(a => "group" in a ? { id: a.group, text: a.group, items: a.items.map(toItem) } : toItem(a))}
                    >Actions</ButtonDropdown>
                  )}
                  {create && <Button variant="primary" href={create.href} onClick={create.onClick ? () => create.onClick!(reload) : undefined}>{create.text}</Button>}
                </SpaceBetween>
              }
            >{title}</Header>
          }
          filter={<TextFilter {...filterProps} filteringPlaceholder={`Find ${title.toLowerCase()}`} countText={`${filteredItemsCount} match${filteredItemsCount === 1 ? "" : "es"}`} />}
          pagination={<Pagination {...paginationProps} />}
          preferences={
            <CollectionPreferences title="Preferences" confirmLabel="Confirm" cancelLabel="Cancel" preferences={prefs} onConfirm={e => setPrefs(e.detail as any)}
              pageSizePreference={{ title: "Page size", options: [10, 25, 50, 100].map(n => ({ value: n, label: `${n} resources` })) }}
              visibleContentPreference={{ title: "Select visible columns", options: [{ label: "Columns", options: columns.map(c => ({ id: c.id, label: c.header })) }] }} />
          }
          empty={empty || <Box textAlign="center" color="inherit"><b>No {title.toLowerCase()}</b><Box variant="p" color="inherit">You don't have any {title.toLowerCase()} in this Region.</Box>{create && <Button href={create.href} onClick={create.onClick ? () => create.onClick!(reload) : undefined}>{create.text}</Button>}</Box>}
        />
        {detail && sel.length === 1 && (
          <Container header={<Header variant="h2">{String(key(sel[0]))}</Header>}>
            <Tabs tabs={detail(sel[0], reload)} />
          </Container>
        )}
        {detail && sel.length > 1 && <Container><Box color="text-body-secondary">{sel.length} resources selected. Select one to see its details.</Box></Container>}
      </SpaceBetween>
    </ContentLayout>
  );
}

/** Modal with async confirm, busy state and inline errors. */
export function ActionModal({ visible, onDismiss, header, children, ok = "Confirm", onOk, size, disabled, danger }: {
  visible: boolean; onDismiss: () => void; header: string; children: ReactNode; ok?: string; onOk: () => Promise<void | false>; size?: "small" | "medium" | "large" | "max"; disabled?: boolean; danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (visible) setErr(null); }, [visible]);
  const go = async () => {
    setBusy(true); setErr(null);
    try { const r = await onOk(); if (r !== false) onDismiss(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} onDismiss={onDismiss} header={header} size={size}
      footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={onDismiss}>Cancel</Button><Button variant={danger ? "normal" : "primary"} loading={busy} disabled={disabled} onClick={go}>{ok}</Button></SpaceBetween></Box>}>
      <SpaceBetween size="m">{err ? <ErrorAlert error={err} /> : null}{children}</SpaceBetween>
    </Modal>
  );
}

/** Small hook for "which modal is open, for which rows". */
export function useModal<T = any>() {
  const [state, setState] = useState<{ id: string; rows: T[]; reload?: () => void } | null>(null);
  return {
    open: (id: string, rows: T[] = [], reload?: () => void) => setState({ id, rows, reload }),
    close: () => setState(null),
    is: (id: string) => state?.id === id,
    rows: state?.rows || [],
    reload: () => state?.reload?.(),
  };
}

export async function forEachReport<T>(rows: T[], label: (t: T) => string, fn: (t: T) => Promise<unknown>, flash: ReturnType<typeof useFlash>, okText: string) {
  const fails: string[] = [];
  for (const r of rows) { try { await fn(r); } catch (e) { fails.push(`${label(r)}: ${errText(e)}`); } }
  if (fails.length) flash.notify({ type: "error", header: `${fails.length} of ${rows.length} failed`, content: fails.join("; ") });
  else flash.notify({ type: "success", content: okText });
}
