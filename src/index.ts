interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Climatiq MCP — carbon footprint calculator with emission factors
 *
 * Climatiq exposes a database of 60,000+ peer-reviewed emission factors
 * (kgCO₂e per unit activity) and an estimate endpoint that turns an
 * activity (e.g., "200 kWh of US grid electricity") into a kgCO₂e number.
 * Pairs with `carbon` / `carbon-interface` for redundancy.
 *
 * API: https://www.climatiq.io/docs
 * Auth: Bearer token. Free tier 200 requests/month.
 *
 * Tools:
 * - search_factors:     find emission factors by query / source / region / year
 * - estimate_emissions: compute kgCO₂e for an activity using a factor + parameters
 * - list_unit_types:    supported unit families for estimate calls
 */


const BASE_URL = 'https://api.climatiq.io/data/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_factors',
    description:
      'Search Climatiq\'s emission-factor database. Use to discover factor IDs and required parameters before calling estimate_emissions. Filter by query, category, source (e.g., "EPA", "DEFRA"), region (ISO code), or year.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search (e.g., "electricity grid", "concrete production")' },
        category: { type: 'string', description: 'Climatiq category (e.g., "electricity", "fuel", "freight", "computing")' },
        source: { type: 'string', description: 'Source dataset (e.g., "EPA", "DEFRA", "BEIS", "ecoinvent")' },
        region: { type: 'string', description: 'ISO-3166 region code (e.g., "US", "GB", "DE")' },
        year: { type: 'number', description: 'Publication year' },
        unit_type: { type: 'string', description: 'Activity unit type (Energy, Volume, Distance, Mass, etc.)' },
        results_per_page: { type: 'number', description: '1-100 (default 25)' },
        page: { type: 'number', description: '1-based page (default 1)' },
      },
      required: [],
    },
  },
  {
    name: 'estimate_emissions',
    description:
      'Calculate kgCO₂e for an activity. Pass an emission_factor with at minimum `activity_id` (from search_factors) or `id`, plus the required `parameters` (e.g., `{ energy: 200, energy_unit: "kWh" }`). Returns CO₂e + breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        emission_factor: {
          type: 'object',
          description:
            'Selector object — at minimum {activity_id: "..."} or {id: "..."}. May add region, year, source for disambiguation.',
        },
        parameters: {
          type: 'object',
          description: 'Activity quantities matching the factor\'s required unit type (e.g., {energy:200, energy_unit:"kWh"}).',
        },
      },
      required: ['emission_factor', 'parameters'],
    },
  },
  {
    name: 'list_unit_types',
    description: 'List supported unit-type families (Energy / Volume / Distance / Mass / etc.) and their valid units.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      'Climatiq requires an API key. Contact the operator about platform credentials, or BYO via ?_apiKey=<key> after registering at https://www.climatiq.io.',
    );
  }
  switch (name) {
    case 'search_factors':
      return searchFactors(apiKey, args);
    case 'estimate_emissions':
      return estimateEmissions(apiKey, args);
    case 'list_unit_types':
      return listUnitTypes(apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function climatiqFetch<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) throw new Error('Climatiq: unauthorized — check the API key');
  if (res.status === 429) throw new Error('Climatiq: rate-limit (HTTP 429) — free tier is 200 req/month');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Climatiq error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function searchFactors(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    results_per_page: String(Math.min(100, Math.max(1, (args.results_per_page as number) ?? 25))),
    page: String(Math.max(1, (args.page as number) ?? 1)),
  });
  if (args.query) params.set('query', String(args.query));
  if (args.category) params.set('category', String(args.category));
  if (args.source) params.set('source', String(args.source));
  if (args.region) params.set('region', String(args.region));
  if (args.year) params.set('year', String(args.year));
  if (args.unit_type) params.set('unit_type', String(args.unit_type));

  const data = await climatiqFetch<{
    results?: {
      activity_id?: string;
      id?: string;
      name?: string;
      category?: string;
      sector?: string;
      source?: string;
      source_dataset?: string;
      year?: number;
      region?: string;
      region_name?: string;
      unit_type?: string;
      source_lca_activity?: string;
      access_type?: string;
    }[];
    current_page?: number;
    total_pages?: number;
    total_results?: number;
  }>(apiKey, `/search?${params}`);

  return {
    page: data.current_page ?? null,
    total_pages: data.total_pages ?? null,
    total_results: data.total_results ?? null,
    returned: data.results?.length ?? 0,
    results: (data.results ?? []).map((r) => ({
      activity_id: r.activity_id ?? null,
      id: r.id ?? null,
      name: r.name ?? null,
      category: r.category ?? null,
      sector: r.sector ?? null,
      source: r.source ?? null,
      year: r.year ?? null,
      region: r.region ?? null,
      region_name: r.region_name ?? null,
      unit_type: r.unit_type ?? null,
      lca_activity: r.source_lca_activity ?? null,
      access_type: r.access_type ?? null,
    })),
  };
}

async function estimateEmissions(apiKey: string, args: Record<string, unknown>) {
  const body = {
    emission_factor: args.emission_factor,
    parameters: args.parameters,
  };
  const data = await climatiqFetch<{
    co2e?: number;
    co2e_unit?: string;
    co2e_calculation_method?: string;
    co2e_calculation_origin?: string;
    emission_factor?: Record<string, unknown>;
    constituent_gases?: Record<string, number | null>;
    activity_data?: Record<string, unknown>;
    audit_trail?: string;
  }>(apiKey, '/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    co2e: data.co2e ?? null,
    co2e_unit: data.co2e_unit ?? 'kg',
    calculation_method: data.co2e_calculation_method ?? null,
    calculation_origin: data.co2e_calculation_origin ?? null,
    emission_factor: data.emission_factor ?? null,
    constituent_gases: data.constituent_gases ?? null,
    activity_data: data.activity_data ?? null,
    audit_trail: data.audit_trail ?? null,
  };
}

async function listUnitTypes(apiKey: string) {
  const data = await climatiqFetch<{ unit_types?: { unit_type?: string; units?: string[] }[] }>(
    apiKey,
    '/unit-types',
  );
  return {
    count: data.unit_types?.length ?? 0,
    unit_types: (data.unit_types ?? []).map((u) => ({
      unit_type: u.unit_type ?? null,
      units: u.units ?? [],
    })),
  };
}

export default { tools, callTool, meter: { credits: 3 } } satisfies McpToolExport;
