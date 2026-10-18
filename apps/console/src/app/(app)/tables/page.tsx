'use client';

import { useMemo, useState } from 'react';
import type { TableDto } from '@tableos/schemas';
import { Badge, Button, EmptyState, Icon, IconButton, Input, Segmented, Sheet, Skeleton, Switch, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { ApiError, api, download } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import s from '@/components/console.module.css';

export default function TablesPage() {
  const toast = useToast();
  const tables = useQuery<TableDto[]>('/tables');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TableDto | null>(null);
  const [downloading, setDownloading] = useState(false);
  const sections = useMemo(() => {
    const g = new Map<string, TableDto[]>();
    for (const t of tables.data ?? []) {
      const k = t.section ?? 'No section';
      g.set(k, [...(g.get(k) ?? []), t]);
    }
    return [...g.entries()];
  }, [tables.data]);

  const pdf = async (ids?: string[]) => {
    setDownloading(true);
    try {
      await download(`/tables/qr.pdf${ids ? `?ids=${ids.join(',')}` : ''}`, 'table-qr-codes.pdf');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const rotate = async (t: TableDto) => {
    if (!window.confirm(`Regenerate the QR for ${t.label}? The old printed code will stop working.`)) return;
    try {
      tables.setData(await api<TableDto[]>(`/tables/${t.id}/rotate-qr`, { method: 'POST' }));
      toast.success(`New QR for ${t.label}. Print it to replace the old card.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not regenerate');
    }
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Tables & QR codes"
        subtitle={`${(tables.data ?? []).length} tables`}
        actions={
          <>
            <Button variant="outline" icon="download" loading={downloading} disabled={!tables.data?.length} onClick={() => void pdf()}>
              Download all QR cards
            </Button>
            <Button icon="plus" onClick={() => setAdding(true)}>
              Add tables
            </Button>
          </>
        }
      />
      {tables.loading && !tables.data ? (
        <Skeleton height={240} radius={16} />
      ) : (tables.data ?? []).length === 0 ? (
        <section className={s.card}>
          <EmptyState icon="table" title="Add your tables" description="Each table gets its own QR code so orders arrive with the table already selected." action={<Button icon="plus" onClick={() => setAdding(true)}>Add tables</Button>} />
        </section>
      ) : (
        <div className={s.stack}>
          {sections.map(([section, list]) => (
            <section key={section} className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.cardTitle}>{section}</h2>
                <Button size="sm" variant="ghost" icon="printer" onClick={() => void pdf(list.map((t) => t.id))}>
                  Print section
                </Button>
              </div>
              <div className={s.tableWrap}>
                <table className={s.dataTable}>
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Status</th>
                      <th>QR version</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.id} style={{ opacity: t.active ? 1 : 0.5 }}>
                        <td style={{ font: 'var(--text-title)' }}>{t.label}</td>
                        <td>{!t.active ? <Badge>Inactive</Badge> : t.openSession ? <Badge tone="brand">In use</Badge> : <Badge tone="success">Free</Badge>}</td>
                        <td className={s.small}>v{t.qrVersion}</td>
                        <td>
                          <div className={s.row} style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <a href={t.qrUrl} target="_blank" rel="noreferrer" title="Open this table's menu (test order)">
                              <IconButton small icon="external" label="Open table link" />
                            </a>
                            <IconButton small icon="copy" label="Copy link" onClick={() => void navigator.clipboard.writeText(t.qrUrl).then(() => toast.success('Link copied'))} />
                            <IconButton small icon="printer" label="Print QR" onClick={() => void pdf([t.id])} />
                            <IconButton small icon="refresh" label="Regenerate QR" onClick={() => void rotate(t)} />
                            <IconButton small icon="edit" label="Edit" onClick={() => setEditing(t)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className={s.small}>
            <Icon name="info" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tip: open a table link on your phone to place a test order.
          </p>
        </div>
      )}
      <AddTables open={adding} onClose={() => setAdding(false)} onDone={(list) => tables.setData(list)} />
      <EditTable table={editing} onClose={() => setEditing(null)} onDone={(list) => tables.setData(list)} />
    </div>
  );
}

function AddTables({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (t: TableDto[]) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'range' | 'single'>('range');
  const [prefix, setPrefix] = useState('T');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [label, setLabel] = useState('');
  const [section, setSection] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const list =
        mode === 'range'
          ? await api<TableDto[]>('/tables/bulk', { method: 'POST', body: { prefix, from: Number(from), to: Number(to), section: section || null } })
          : await api<TableDto[]>('/tables', { method: 'POST', body: { label, section: section || null } });
      onDone(list);
      toast.success('Tables added');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not add tables');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} placement="center" size="sm" title="Add tables" footer={<Button block loading={busy} onClick={() => void submit()}>Add</Button>}>
      <div className={s.stack}>
        <Segmented value={mode} onChange={setMode} items={[{ value: 'range', label: 'Several' }, { value: 'single', label: 'One' }]} />
        {mode === 'range' ? (
          <div className={s.formGrid} style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 0 }}>
            <Input label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={10} />
            <Input label="From" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
            <Input label="To" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
          </div>
        ) : (
          <Input label="Table name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. T12 or Patio 3" maxLength={20} />
        )}
        <Input label="Section" optional value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. AC, Rooftop" />
        {mode === 'range' && <p className={s.small}>Creates {prefix}{from} to {prefix}{to}. Existing names are skipped.</p>}
      </div>
    </Sheet>
  );
}

function EditTable({ table, onClose, onDone }: { table: TableDto | null; onClose: () => void; onDone: (t: TableDto[]) => void }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [section, setSection] = useState('');
  const [active, setActive] = useState(true);
  const [last, setLast] = useState<string | null>(null);
  if (table && table.id !== last) {
    setLast(table.id);
    setLabel(table.label);
    setSection(table.section ?? '');
    setActive(table.active);
  }
  const save = async () => {
    if (!table) return;
    try {
      onDone(await api<TableDto[]>(`/tables/${table.id}`, { method: 'PATCH', body: { label, section: section || null, active } }));
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    }
  };
  return (
    <Sheet open={Boolean(table)} onClose={() => { setLast(null); onClose(); }} placement="center" size="sm" title="Edit table" footer={<Button block onClick={() => void save()}>Save</Button>}>
      <div className={s.stack}>
        <Input label="Name" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input label="Section" optional value={section} onChange={(e) => setSection(e.target.value)} />
        <Switch checked={active} onChange={setActive} label="Active" description="Inactive tables cannot start new orders." />
      </div>
    </Sheet>
  );
}
