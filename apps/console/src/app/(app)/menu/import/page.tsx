'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type ExtractedMenu, IMPORT_LIMITS, type MenuImportDto } from '@tableos/schemas/client';
import { Banner, Button, Icon, IconButton, Spinner, cx, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import s from '@/components/console.module.css';

const LOW = IMPORT_LIMITS.lowConfidence;

export default function ImportPage() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [job, setJob] = useState<MenuImportDto | null>(null);
  const [result, setResult] = useState<ExtractedMenu | null>(null);
  const [busy, setBusy] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = [...list].filter((f) => (IMPORT_LIMITS.mimeTypes as readonly string[]).includes(f.type) && f.size <= IMPORT_LIMITS.maxFileBytes);
    if (ok.length < list.length) toast.error('Only JPG, PNG or PDF files up to 10 MB');
    setFiles((cur) => [...cur, ...ok].slice(0, IMPORT_LIMITS.maxFiles));
  };

  const start = async () => {
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of files) paths.push((await uploadFile(f, 'import')).path);
      const j = await api<MenuImportDto>('/menu/imports', { method: 'POST', body: { filePaths: paths } });
      setJob(j);
    } catch (e) {
      toast.error(e instanceof ApiError || e instanceof Error ? e.message : 'Could not start the import');
    } finally {
      setBusy(false);
    }
  };

  // Poll while processing.
  useEffect(() => {
    if (!job || job.status === 'ready' || job.status === 'failed' || job.status === 'published') return;
    const id = window.setInterval(async () => {
      const j = await api<MenuImportDto>(`/menu/imports/${job.id}`).catch(() => null);
      if (j) {
        setJob(j);
        if (j.status === 'ready') setResult(j.result);
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [job]);

  const edit = (ci: number, ii: number | null, patch: Record<string, unknown>) =>
    setResult((r) => {
      if (!r) return r;
      const categories = r.categories.map((c, i) => {
        if (i !== ci) return c;
        if (ii === null) return { ...c, ...patch, confidence: 1 };
        return { ...c, items: c.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) };
      });
      return { categories };
    });

  const publish = async () => {
    if (!job || !result) return;
    setBusy(true);
    try {
      await api(`/menu/imports/${job.id}`, { method: 'PATCH', body: { result } });
      const r = await api<{ categories: number; items: number }>(`/menu/imports/${job.id}/publish`, { method: 'POST' });
      toast.success(`Published ${r.items} dishes. Translations are on the way.`);
      router.push('/menu');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  };

  const lowCount = result?.categories.reduce((a, c) => a + c.items.filter((i) => i.nameConfidence < LOW || i.priceConfidence < LOW || i.pricePaise === null).length, 0) ?? 0;

  return (
    <div className={s.page} style={{ maxWidth: 1000 }}>
      <PageHeader back="/menu" title="Import menu with AI" subtitle="Photos or a PDF of your printed menu. You review everything before it goes live." />

      {!job && (
        <div className={s.stack}>
          <label
            className={cx(s.dropzone, over && s.dropzoneOver)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <span className={s.statIcon} style={{ width: 56, height: 56, borderRadius: 18 }}>
              <Icon name="upload" size={28} />
            </span>
            <strong style={{ font: 'var(--text-h3)' }}>Drop menu photos or a PDF here</strong>
            <span className={s.muted}>Up to 10 files, 10 MB each. Clear, well-lit photos work best.</span>
            <Button variant="outline" onClick={() => input.current?.click()}>
              Choose files
            </Button>
            <input ref={input} type="file" multiple accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => addFiles(e.target.files)} />
          </label>
          {files.length > 0 && (
            <section className={s.card}>
              <div className={s.stack} style={{ gap: 8 }}>
                {files.map((f, i) => (
                  <div key={i} className={s.between}>
                    <span className={s.row} style={{ gap: 8 }}>
                      <Icon name={f.type === 'application/pdf' ? 'receipt' : 'grid'} size={18} /> {f.name}
                      <span className={s.small}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    </span>
                    <IconButton small icon="close" label="Remove" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <Button size="lg" block icon="sparkles" loading={busy} onClick={() => void start()}>
                  Read my menu
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {job && (job.status === 'queued' || job.status === 'processing') && (
        <section className={s.card}>
          <div className={s.stack} style={{ alignItems: 'center', textAlign: 'center', padding: '48px 0' }}>
            <Spinner size={48} />
            <h2 className={s.cardTitle}>Reading your menu…</h2>
            <p className={s.muted}>This usually takes under a minute. You can leave this page; the import keeps running.</p>
          </div>
        </section>
      )}

      {job?.status === 'failed' && (
        <Banner tone="danger" title="We could not read this menu" action={<Button size="sm" variant="danger" onClick={() => void api<MenuImportDto>(`/menu/imports/${job.id}/retry`, { method: 'POST' }).then(setJob)}>Try again</Button>}>
          {job.error ?? 'Try clearer photos, or add dishes yourself.'}
        </Banner>
      )}

      {job?.status === 'ready' && result && (
        <div className={s.stack}>
          {lowCount > 0 && (
            <Banner tone="warning" title={`Check ${lowCount} highlighted fields`}>
              The AI was less sure about these. Fix anything that looks wrong before publishing.
            </Banner>
          )}
          {result.categories.map((c, ci) => (
            <section key={ci} className={s.card}>
              <div className={s.cardHead}>
                <input className={cx(s.cellInput, c.confidence < LOW && s.lowConf)} style={{ font: 'var(--text-h3)', maxWidth: 360 }} value={c.name} onChange={(e) => edit(ci, null, { name: e.target.value })} aria-label="Category name" />
                <span className={s.small}>{c.items.length} dishes</span>
              </div>
              <div className={s.stack} style={{ gap: 8 }}>
                <div className={s.importItem}>
                  <span className={s.small}>Dish</span>
                  <span className={s.small}>Price (₹)</span>
                  <span className={s.small}>Type</span>
                  <span />
                </div>
                {c.items.map((it, ii) => (
                  <div key={ii} className={s.importItem}>
                    <input className={cx(s.cellInput, it.nameConfidence < LOW && s.lowConf)} value={it.name} onChange={(e) => edit(ci, ii, { name: e.target.value, nameConfidence: 1 })} aria-label="Dish name" />
                    <input
                      className={cx(s.cellInput, (it.priceConfidence < LOW || it.pricePaise === null) && !it.variants.length && s.lowConf)}
                      inputMode="decimal"
                      value={it.variants.length ? it.variants.map((v) => v.pricePaise / 100).join(' / ') : it.pricePaise !== null ? String(it.pricePaise / 100) : ''}
                      disabled={it.variants.length > 0}
                      onChange={(e) => edit(ci, ii, { pricePaise: e.target.value ? Math.round(Number(e.target.value.replace(/[^\d.]/g, '')) * 100) : null, priceConfidence: 1 })}
                      aria-label="Price"
                    />
                    <select className={s.cellInput} value={it.diet ?? 'veg'} onChange={(e) => edit(ci, ii, { diet: e.target.value })} aria-label="Food type">
                      <option value="veg">Veg</option>
                      <option value="egg">Egg</option>
                      <option value="nonveg">Non-veg</option>
                    </select>
                    <IconButton small icon="trash" label="Remove dish" onClick={() => setResult((r) => r && { categories: r.categories.map((x, i) => (i === ci ? { ...x, items: x.items.filter((_, j) => j !== ii) } : x)) })} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className={s.row} style={{ justifyContent: 'flex-end', position: 'sticky', bottom: 16 }}>
            <Button size="lg" icon="check" loading={busy} onClick={() => void publish()} style={{ boxShadow: 'var(--shadow-float)' }}>
              Publish to menu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
