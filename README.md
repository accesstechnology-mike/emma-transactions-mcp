# Emma Transactions MCP Server

A reusable [Model Context Protocol](https://modelcontextprotocol.io/) server for querying Emma-app transaction exports stored in Google Sheets.

The server is generic: you provide your own Google Sheet URL, published CSV URL, or Sheet ID at runtime. This repository contains no personal transaction data and no hard-coded Sheet IDs.

## Features

- `list_transactions` — list normalized transactions, with filters for category, account, search text, and date range.
- `get_spending_summary` — totals for income, expenses, net movement, category, account, and month.
- `get_metadata` — available accounts, categories, currencies, row count, and date range.
- `validate_sheet` — confirms the sheet can be parsed without returning transaction rows.
- Google Sheets URL helper — accepts a Sheet ID, a normal `/edit` URL, a `/pub?output=csv` URL, or an `/export?format=csv` URL.
- Robust CSV parsing — recognizes common column variants such as `Date`, `Transaction Date`, `Description`, `Name`, `Amount`, `Value`, `Category`, `Account`, and `Merchant`.

## Privacy model

This server does **not** store transaction data. It fetches the configured CSV when a tool is called and returns the requested result to the MCP client.

You still need to treat your Google Sheet URL as sensitive. If you publish a Google Sheet to the web as CSV, anyone with that URL may be able to access the data. Use a private runtime environment and do not commit your real Sheet URL to version control.

## Requirements

- Node.js 20+
- An Emma transaction export in Google Sheets, accessible to the process running the MCP server

Current implementation supports unauthenticated CSV access: published-to-web CSV links and Google Sheet export URLs that the runtime can fetch. OAuth/service-account support is intentionally not bundled yet, because credentials for personal finance data need a sharper knife than a README example.

## Install

From a checkout:

```bash
git clone https://github.com/accesstechnology-mike/emma-transactions-mcp.git
cd emma-transactions-mcp
npm install
npm run build
```

## MCP client configuration

Use an environment variable:

```json
{
  "mcpServers": {
    "emma-transactions": {
      "command": "node",
      "args": ["/absolute/path/to/emma-transactions-mcp/dist/index.js"],
      "env": {
        "EMMA_SHEET_URL": "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/pub?output=csv",
        "EMMA_SHEET_GID": "0"
      }
    }
  }
}
```

Or pass `sheet_url` in each tool call.

Optional `gid` selects a specific tab. It defaults to `EMMA_SHEET_GID`, then `0`.

## Expected columns

At minimum, the CSV needs:

- date: `Date`, `Transaction Date`, `Timestamp`, or `Time`
- description: `Description`, `Name`, `Transaction`, `Transaction Name`, or `Title`
- amount: `Amount`, `Value`, `Transaction Amount`, `Money Out`, or `Money In`

Optional columns include `Currency`, `Category`, `Account`, `Merchant`, `Notes`, and `Type`.

## Development

```bash
npm install
npm test
npm run build
```

The test suite uses synthetic fixture rows only. Do not add real transaction exports to tests, issues, screenshots, or docs.

## License

MIT
