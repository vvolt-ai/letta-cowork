import { Letta } from "@letta-ai/letta-client";

export interface LettaAgent {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[];
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
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        createdAt: agent.created_at,
        metadata: agent.metadata,
        tags: agent.tags,
      }));
  } catch (error) {
    console.error("Failed to list agents:", error);
    throw new Error("Failed to fetch agents from Letta");
  }
}
