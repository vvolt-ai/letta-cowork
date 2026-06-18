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
    domain: { type: "array", description: "Odoo domain array, e.g. [[\"name\",\"ilike\",\"Acme\"]]. Use [] for all records only when appropriate." },
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
    args: { description: "Method positional args. MCP accepts this as JSON/string depending on deployment." },
    kwargs: { description: "Method keyword args. MCP accepts this as JSON/string depending on deployment." },
  },
  required: ["model", "method"],
  additionalProperties: true,
} as const;

const mountedTools: MountedOdooTool[] = [
  {
    name: "odoo_search",
    description: "Direct mounted Odoo MCP tool: search/read Odoo records. Use this instead of Bash, Skill, or Task for normal Odoo lookups.",
    parameters: searchParameters,
  },
  {
    name: "odoo_count",
    description: "Direct mounted Odoo MCP tool: count Odoo records matching a domain. Use this instead of Bash, Skill, or Task.",
    parameters: { ...searchParameters, properties: { model: searchParameters.properties.model, domain: searchParameters.properties.domain }, required: ["model"] },
  },
  {
    name: "odoo_group",
    description: "Direct mounted Odoo MCP tool: grouped Odoo aggregation/reporting. Use for totals by customer, state, owner, etc.",
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
    description: "Direct mounted Odoo MCP tool: list/discover available Odoo models. Use when model choice is unclear.",
    parameters: modelParameters,
  },
  {
    name: "odoo_get_fields",
    description: "Direct mounted Odoo MCP tool: inspect fields for one Odoo model before complex reads/writes.",
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
    description: "Direct mounted Odoo MCP tool: call an Odoo model method, e.g. workflow actions. Only use with explicit user instruction and verified target records.",
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

    return {
      isError: false,
      output: `${toolName} completed in ${Date.now() - startedAt}ms via mounted Odoo MCP.\n${jsonBody(result)}`,
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
