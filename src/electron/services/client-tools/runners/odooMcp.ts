import { getVeraCoworkApiClient } from "../../../api/index.js";

import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from "../types.js";

type MountedOdooTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const searchParameters = {
  type: "object",
  properties: {
    model: { type: "string", description: "Odoo model name, e.g. res.partner, sale.order, mail.activity." },
    domain: {
      type: "array",
      items: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { anyOf: [{ type: "string" }, { type: "number" }] },
      },
      description: "AND-only Odoo condition triples, e.g. [[\"name\",\"ilike\",\"Acme\"]]. This deployment rejects prefix |/&/!, list-valued in/not-in, and boolean values. Use separate bounded searches when OR is required.",
    },
    fields: { type: "array", items: { type: "string" }, description: "Fields to return." },
    limit: { type: "integer", minimum: 1, maximum: 200, description: "Maximum records to return. Default/safe values should be small." },
    offset: { type: "integer", minimum: 0 },
    order: { type: "string", description: "Odoo order string, e.g. write_date desc." },
  },
  required: ["model"],
  additionalProperties: true,
} as const;

const modelParameters = {
  type: "object",
  properties: {
    model_filter: { type: "string", description: "Optional model name filter." },
    limit: { type: "integer", minimum: 1, maximum: 200 },
  },
  additionalProperties: true,
} as const;

const fieldsParameters = {
  type: "object",
  properties: {
    model: { type: "string", description: "Odoo model name." },
    all_fields: { type: "boolean", description: "Whether to include all fields." },
  },
  required: ["model"],
  additionalProperties: true,
} as const;

const createParameters = {
  type: "object",
  properties: {
    model: { type: "string", description: "Odoo model name to create in, e.g. project.task or mail.activity." },
    values: { type: "object", description: "Field values for the new Odoo record." },
  },
  required: ["model", "values"],
  additionalProperties: false,
} as const;

const updateParameters = {
  type: "object",
  properties: {
    model: { type: "string", description: "Odoo model name to update." },
    ids: { type: "array", items: { type: "integer" }, description: "Record ids to update." },
    values: { type: "object", description: "Field values to write." },
  },
  required: ["model", "ids", "values"],
  additionalProperties: false,
} as const;

const deleteParameters = {
  type: "object",
  properties: {
    model: { type: "string", description: "Odoo model name to delete from." },
    ids: { type: "array", items: { type: "integer" }, description: "Record ids to delete." },
  },
  required: ["model", "ids"],
  additionalProperties: false,
} as const;

const callMethodParameters = {
  type: "object",
  properties: {
    model: { type: "string", description: "Odoo model name." },
    method: { type: "string", description: "Odoo model method to call." },
    args: { type: "string", description: "JSON-encoded positional args string for this deployment, e.g. \"[[3367]]\"." },
    kwargs: { type: "string", description: "JSON-encoded keyword args string for this deployment, usually \"{}\"." },
  },
  required: ["model", "method"],
  additionalProperties: true,
} as const;

const mountedTools: MountedOdooTool[] = [
  {
    name: "odoo_search",
    description: "Direct mounted Odoo MCP search/read. Plan once and reuse successful results. Start with exact IDs/references/default-code fragments, only decision-relevant fields, and limit <=10. Never enumerate a configured product family at high limits. Use AND-only scalar condition triples; this deployment rejects prefix OR, list, and boolean domain values.",
    parameters: searchParameters,
  },
  {
    name: "odoo_count",
    description: "Direct mounted Odoo MCP tool: count Odoo records matching a domain. Always use this instead of Bash, Python skill scripts, Skill, or Task.",
    parameters: { ...searchParameters, properties: { model: searchParameters.properties.model, domain: searchParameters.properties.domain }, required: ["model"] },
  },
  {
    name: "odoo_group",
    description: "Direct mounted Odoo MCP tool: grouped Odoo aggregation/reporting. Use for totals by customer, state, owner, etc. Prefer this direct tool over Bash, Python skill scripts, Skill, or Task.",
    parameters: {
      type: "object",
      properties: {
        model: searchParameters.properties.model,
        domain: searchParameters.properties.domain,
        fields: searchParameters.properties.fields,
        groupby: { type: "array", items: { type: "string" }, description: "Fields to group by." },
        limit: searchParameters.properties.limit,
        offset: searchParameters.properties.offset,
        orderby: { type: "string", description: "Group ordering string." },
      },
      required: ["model", "fields", "groupby"],
      additionalProperties: true,
    },
  },
  {
    name: "odoo_get_models",
    description: "Direct mounted Odoo MCP tool: list/discover available Odoo models. Use when model choice is unclear. Prefer this direct tool over legacy Odoo skills/scripts.",
    parameters: modelParameters,
  },
  {
    name: "odoo_get_fields",
    description: "Direct mounted Odoo MCP tool: inspect fields only when the model/field choice is genuinely unknown. Do not call it for standard known sale.order, sale.order.line, res.partner, or product.product workflows.",
    parameters: fieldsParameters,
  },
  {
    name: "odoo_create",
    description: "Direct mounted Odoo MCP tool: create an Odoo record. Only use when the user clearly asks for a write. Search/inspect first when uncertain. Do not use Task/Bash/Skill for Odoo creates.",
    parameters: createParameters,
  },
  {
    name: "odoo_update",
    description: "Direct mounted Odoo MCP tool: update Odoo records. Only use when the user clearly asks for a write and target ids are known/verified.",
    parameters: updateParameters,
  },
  {
    name: "odoo_delete",
    description: "Direct mounted Odoo MCP tool: delete Odoo records. Destructive: only use with explicit user instruction and verified ids.",
    parameters: deleteParameters,
  },
  {
    name: "odoo_call_method",
    description: "Direct mounted Odoo MCP workflow call. Only use with explicit user instruction and verified records. Pass args and kwargs as JSON-encoded strings (for example args=\"[[3367]]\", kwargs=\"{}\"); do not retry object/array variants.",
    parameters: callMethodParameters,
  },
  {
    name: "odoo_health_check_health_odoo_get",
    description: "Direct mounted Odoo MCP health check for Odoo connectivity. Use when diagnosing Odoo MCP availability.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

function jsonBody(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function isOdooFailureResult(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok?: unknown }).ok === false);
}

async function runMountedOdooTool(toolName: string, args: Record<string, unknown>, ctx: ToolRunContext): Promise<ToolRunResult> {
  const api = getVeraCoworkApiClient();
  if (!api.isAuthenticated()) {
    return {
      isError: true,
      output: `Missing Vera Cowork auth context for ${toolName}. Log in to Vera Cowork so the desktop app can call /odoo/run-tool.`,
    };
  }

  const startedAt = Date.now();
  try {
    const result = await api.request<unknown>("/odoo/run-tool", {
      method: "POST",
      body: { toolName, args },
      requireAuth: true,
    });

    const isError = isOdooFailureResult(result);
    return {
      isError,
      output: `${toolName} ${isError ? "returned a failure" : "completed"} in ${Date.now() - startedAt}ms via mounted Odoo MCP.\n${jsonBody(result)}`,
    };
  } catch (error) {
    if (ctx.signal.aborted) {
      return { isError: true, output: `${toolName} was cancelled.` };
    }
    return {
      isError: true,
      output: `${toolName} failed after ${Date.now() - startedAt}ms via mounted Odoo MCP:\n${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const odooMcpTools: ClientToolDefinition[] = mountedTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
  run: (args, ctx) => runMountedOdooTool(tool.name, args, ctx),
}));
