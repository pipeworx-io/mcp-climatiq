# @pipeworx/climatiq

Climatiq MCP — emission-factor database + carbon estimate API.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_factors(query?, category?, source?, region?, year?, unit_type?, results_per_page?, page?)`
- `estimate_emissions(emission_factor, parameters)`
- `list_unit_types()`

## Auth

- **Platform key:** gateway env `PLATFORM_CLIMATIQ_KEY`.
- **BYO:** `?_apiKey=<key>` after registering at https://www.climatiq.io (free 200 req/mo).

## Data source

`https://api.climatiq.io/data/v1/` — Bearer token.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "climatiq": {
      "url": "https://gateway.pipeworx.io/climatiq/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Climatiq data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
