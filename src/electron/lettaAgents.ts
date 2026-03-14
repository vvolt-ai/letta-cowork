import { Letta } from "@letta-ai/letta-client";

export interface LettaAgent {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[];
  model?: string | null;
  models?: string[] | null;
  availableModels?: string[] | null;
  inferenceConfig?: Record<string, unknown> | null;
}

export interface LettaModel {
  name: string;
  display_name?: string | null;
  provider_type: string;
  model_type?: string;
}

function createLettaClient(): Letta {
  const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
  const apiKey = (process.env.LETTA_API_KEY || "").trim();

  return new Letta({
    baseURL,
    apiKey: apiKey || null,
  });
}

export async function listLettaAgents(): Promise<LettaAgent[]> {
  const client = createLettaClient();
  
  try {
    const response = await client.agents.list({tags: ['user_visible']});
    // Get the data from the paginated response
    const agents = await response;
    // Filter agents to only show those with user_visible: true in metadata
    return agents.items
      .map((agent) => {
        const raw: any = agent;
        const models = Array.isArray(raw.models) ? raw.models : undefined;
        const availableModels = Array.isArray(raw.available_models) ? raw.available_models : undefined;
        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          createdAt: agent.created_at,
          metadata: agent.metadata,
          tags: agent.tags,
          model: raw.model ?? null,
          models: models ?? null,
          availableModels: availableModels ?? null,
          inferenceConfig: (raw.inference_config as Record<string, unknown> | undefined) ?? null,
        } satisfies LettaAgent;
      });
  } catch (error) {
    console.error("Failed to list agents:", error);
    throw new Error("Failed to fetch agents from Letta");
  }
}

export async function getLettaAgent(agentId: string): Promise<LettaAgent | null> {
  console.log("[lettaAgents] getLettaAgent called with agentId:", agentId);
  const client = createLettaClient();
  
  try {
    const agent = await client.agents.retrieve(agentId);
    console.log("[lettaAgents] retrieved agent:", agent);
    const raw: any = agent;
    const models = Array.isArray(raw.models) ? raw.models : undefined;
    const availableModels = Array.isArray(raw.available_models) ? raw.available_models : undefined;
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      createdAt: agent.created_at,
      metadata: agent.metadata,
      tags: agent.tags,
      model: raw.model ?? null,
      models: models ?? null,
      availableModels: availableModels ?? null,
      inferenceConfig: (raw.inference_config as Record<string, unknown> | undefined) ?? null,
    } satisfies LettaAgent;
  } catch (error) {
    console.error("Failed to get agent:", error);
    return null;
  }
}

export async function listLettaModels(): Promise<LettaModel[]> {
  const client = createLettaClient();
  
  try {
    const response = await client.models.list();
    const models: Letta.Model[] = await response;
    // Filter to only show LLM models (not embedding models)
    return models
      .filter((model) => model.model_type === 'llm' || !model.model_type)
      .map((model) => ({
        name: model.name,
        display_name: model.display_name,
        provider_type: model.provider_type,
        model_type: model.model_type,
      }));
  } catch (error) {
    console.error("Failed to list models:", error);
    throw new Error("Failed to fetch models from Letta");
  }
}
