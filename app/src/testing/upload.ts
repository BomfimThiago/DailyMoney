// Builders for upload screen tests: complete API objects with only the relevant fields changed.
import type { ImportPreview, ImportSummary, PreviewGroup } from '@/lib/types';

export const group = (o: Partial<PreviewGroup> = {}): PreviewGroup => ({
  currency: 'BRL',
  account: null,
  suggested_name: 'Nubank',
  first_import: true,
  counts: { new: 3, duplicate: 1, skipped: 0 },
  ...o,
});

export const preview = (o: Partial<ImportPreview> = {}): ImportPreview => ({
  id: 'imp-1',
  filename: 'extrato.csv',
  format: 'csv',
  bank: 'Nubank',
  is_card: false,
  status: 'preview',
  period_start: '2026-08-01',
  period_end: '2026-11-10',
  needs_currency: false,
  groups: [group()],
  rows: [],
  errors: [],
  ...o,
});

export const summary = (o: Partial<ImportSummary> = {}): ImportSummary => ({
  id: 's1',
  filename: 'extrato.csv',
  format: 'csv',
  bank: 'Nubank',
  status: 'imported',
  period_start: null,
  period_end: null,
  imported_count: 1,
  duplicate_count: 0,
  skipped_count: 0,
  created_at: '2026-11-10T10:00:00Z',
  finished_at: null,
  ...o,
});
