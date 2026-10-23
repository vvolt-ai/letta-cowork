import type { ClientToolDefinition } from '../types.js';
import {
  AGENT_MEMORY_DESCRIPTION,
  AGENT_MEMORY_PARAMETERS,
  executeAgentMemory,
} from '../../memfs/agent-memory-access.js';
export const agentMemoryTool: ClientToolDefinition = {
  name: 'AgentMemory',
  description: AGENT_MEMORY_DESCRIPTION,
  parameters: AGENT_MEMORY_PARAMETERS,
  async run(args, ctx) {
    try {
      return {
        output: JSON.stringify(await executeAgentMemory(args, ctx.agentMemory, ctx.agentId)),
        isError: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = (error as NodeJS.ErrnoException).code;
      return {
        output: JSON.stringify({
          error: /^[A-Z_]+$/.test(message)
            ? message
            : code === 'ENOENT'
              ? 'MEMORY_PATH_NOT_FOUND'
              : 'AGENT_MEMORY_FAILED',
          note: 'No other agent, path, identity or write fallback was used.',
        }),
        isError: true,
      };
    }
  },
};
