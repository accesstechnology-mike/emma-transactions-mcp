# Emma Balances MCP Server

A thin, **read-only** [Model Context Protocol](https://modelcontextprotocol.io/) server for querying Emma-app balance snapshots stored as local evidence JSON.

This server does not talk to Google Sheets, does not scrape, and does not fetch anything over the network. It reads snapshot files from a directory you control and returns the requested balances to the MCP client. This repository contains **no real balances** — only synthetic fixtures.

It is a companion to [`emma-transactions-mcp`](https://github.com/accesstechnology-mike/emma-transactions-mcp) and follows the same Node/TypeScript layout.

## Tools

- `list_snapshots` — list the available snapshot dates in the evidence directory, with per-snapshot metadata (schema version, capture time, account count).
- `get_balances` — return account balances for a snapshot (defaults to the most recent), with totals by currency. Supports `type` and `account` filters and an `include_accounts` toggle.
- `get_account` — return a single account by id or name for a snapshot (defaults to the most recent), optionally with its balance `history` across all snapshots.

## Evidence directory

Point the server at a directory of snapshot files via the `EMMA_EVIDENCE_DIR` environment variable, or pass `evidence_dir` in an individual tool call.

Each snapshot is a file named `YYYY-MM-DD.json` following **schema version 2**:

```json
{
  "schema_version": 2,
  "date": "2026-09-05",
  "captured_at": "2026-09-05T07:15:00Z",
  "source": "emma",
  "base_currency": "GBP",
  "accounts": [
    {
      "id": "acc_current_001",
      "name": "Everyday Current",
      "institution": "Example Bank",
      "type": "current",
      "currency": "GBP",
      "balance": 1543.67,
      "available": 1493.67,
      "last_updated": "2026-09-05T07:14:00Z"
    }
  ]
}
```

### Schema v2 fields

Snapshot object:

| Field | Required | Notes |
| --- | --- | --- |
| `schema_version` | yes | Must be `2`. Files with any other value are rejected. |
| `accounts` | yes | Array of account objects (see below). |
| `date` | no | `YYYY-MM-DD`. Falls back to the filename when omitted. |
| `captured_at` | no | ISO timestamp for when the snapshot was taken. |
| `source` | no | Free-text provenance, e.g. `"emma"`. |
| `base_currency` | no | Defaults to `GBP`. |

Account object:

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Stable identifier used for lookups and history. |
| `name` | yes | Human-readable name; also matchable in lookups. |
| `balance` | yes | Numeric balance in the account `currency`. |
| `currency` | no | Defaults to `GBP`. |
| `institution` | no | Provider/bank name. |
| `type` | no | e.g. `current`, `savings`, `credit`, `wallet`. |
| `available` | no | Available balance if different from `balance`. |
| `last_updated` | no | ISO timestamp for the account reading. |

The filename is the authoritative date. Invalid JSON, a missing `accounts` array, or a `schema_version` other than `2` produces a clear error rather than silent bad data.

## Privacy model

This server reads local evidence you provide and returns it to the MCP client. It writes nothing and fetches nothing. Treat your real evidence directory as sensitive and keep it out of version control. Do **not** add real balance snapshots to this repository, tests, issues, screenshots, or docs — use synthetic fixtures like the ones in `fixtures/evidence/`.

## Requirements

- Node.js 20+
- A directory of `YYYY-MM-DD.json` schema v2 snapshots accessible to the process running the MCP server

## Install

```bash
git clone https://github.com/accesstechnology-mike/emma-balances-mcp.git
cd emma-balances-mcp
npm install
npm run build
```

## MCP client configuration

```json
{
  "mcpServers": {
    "emma-balances": {
      "command": "node",
      "args": ["/absolute/path/to/emma-balances-mcp/dist/index.js"],
      "env": {
        "EMMA_EVIDENCE_DIR": "/absolute/path/to/your/evidence"
      }
    }
  }
}
```

Or pass `evidence_dir` in each tool call.

## Development

```bash
npm install
npm test
npm run build
```

The test suite uses the synthetic snapshots in `fixtures/evidence/` only. Do not add real balance exports to tests, issues, screenshots, or docs.

## License

MIT
