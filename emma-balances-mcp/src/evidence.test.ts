import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getAccount,
  getBalances,
  getLatestDate,
  listSnapshotDates,
  listSnapshots,
  resolveEvidenceDir,
} from './evidence.js';

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, '..', 'fixtures', 'evidence');
const INVALID_DIR = join(here, '..', 'fixtures', 'invalid');

describe('evidence directory resolution', () => {
  it('prefers an explicit argument over the environment variable', () => {
    expect(resolveEvidenceDir('/tmp/example')).toBe('/tmp/example');
  });

  it('throws when no directory is configured', () => {
    const previous = process.env.EMMA_EVIDENCE_DIR;
    delete process.env.EMMA_EVIDENCE_DIR;
    try {
      expect(() => resolveEvidenceDir()).toThrow(/EMMA_EVIDENCE_DIR/);
    } finally {
      if (previous !== undefined) process.env.EMMA_EVIDENCE_DIR = previous;
    }
  });
});

describe('listing snapshots', () => {
  it('discovers YYYY-MM-DD.json files in ascending date order', () => {
    expect(listSnapshotDates(EVIDENCE_DIR)).toEqual(['2026-09-01', '2026-09-03', '2026-09-05']);
  });

  it('returns the most recent snapshot date', () => {
    expect(getLatestDate(EVIDENCE_DIR)).toBe('2026-09-05');
  });

  it('summarizes each snapshot without exposing balances', () => {
    const summaries = listSnapshots(EVIDENCE_DIR);
    expect(summaries).toHaveLength(3);
    expect(summaries[0]).toMatchObject({
      date: '2026-09-01',
      file: '2026-09-01.json',
      schema_version: 2,
      base_currency: 'GBP',
      account_count: 4,
    });
    expect(JSON.stringify(summaries)).not.toContain('balance');
  });
});

describe('get_balances', () => {
  it('defaults to the latest snapshot and totals per currency', () => {
    const result = getBalances(EVIDENCE_DIR);
    expect(result.date).toBe('2026-09-05');
    expect(result.account_count).toBe(4);
    expect(result.totals_by_currency).toEqual({
      GBP: Number((1543.67 + 5250.0 - 95.3).toFixed(2)),
      EUR: 142.5,
    });
    expect(result.accounts).toHaveLength(4);
  });

  it('returns a specific snapshot when a date is supplied', () => {
    const result = getBalances(EVIDENCE_DIR, { date: '2026-09-01' });
    expect(result.date).toBe('2026-09-01');
    expect(result.totals_by_currency.GBP).toBe(Number((1200 + 5000 - 320.45).toFixed(2)));
  });

  it('filters by account type', () => {
    const result = getBalances(EVIDENCE_DIR, { type: 'credit' });
    expect(result.account_count).toBe(1);
    expect(result.accounts?.[0].id).toBe('acc_credit_001');
  });

  it('can omit account rows', () => {
    const result = getBalances(EVIDENCE_DIR, { include_accounts: false });
    expect(result.accounts).toBeUndefined();
    expect(result.account_count).toBe(4);
  });

  it('rejects unknown dates with a helpful error', () => {
    expect(() => getBalances(EVIDENCE_DIR, { date: '1999-01-01' })).toThrow(/No snapshot for date/);
  });

  it('rejects snapshots that are not schema version 2', () => {
    expect(() => getBalances(INVALID_DIR, { date: '2020-01-01' })).toThrow(/unsupported schema_version/);
  });
});

describe('get_account', () => {
  it('finds an account by id in the latest snapshot', () => {
    const result = getAccount(EVIDENCE_DIR, { account: 'acc_current_001' });
    expect(result.date).toBe('2026-09-05');
    expect(result.account.balance).toBe(1543.67);
  });

  it('finds an account by name (case-insensitive)', () => {
    const result = getAccount(EVIDENCE_DIR, { account: 'rainy day savings' });
    expect(result.account.id).toBe('acc_savings_001');
  });

  it('returns balance history across snapshots', () => {
    const result = getAccount(EVIDENCE_DIR, { account: 'acc_credit_001', history: true });
    expect(result.history).toEqual([
      { date: '2026-09-01', balance: -320.45, available: 4679.55, currency: 'GBP' },
      { date: '2026-09-03', balance: -412.1, available: 4587.9, currency: 'GBP' },
      { date: '2026-09-05', balance: -95.3, available: 4904.7, currency: 'GBP' },
    ]);
  });

  it('throws when no account matches', () => {
    expect(() => getAccount(EVIDENCE_DIR, { account: 'nope' })).toThrow(/No account matching/);
  });
});
