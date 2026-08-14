import test from 'node:test';
import assert from 'node:assert/strict';

import { mapLettaModel } from '../dist-electron/services/agents/index.js';

test('uses the fully qualified model handle for runtime selection', () => {
  const model = mapLettaModel({
    handle: 'lc-openai-compatible/glm-4.6v',
    name: 'glm-4.6v',
    display_name: 'GLM-4.6V',
    provider_type: 'openai',
    provider_name: 'lc-openai-compatible',
    provider_category: 'byok',
    model_type: 'llm',
  });

  assert.deepEqual(model, {
    name: 'lc-openai-compatible/glm-4.6v',
    model_name: 'glm-4.6v',
    display_name: 'GLM-4.6V',
    provider_type: 'openai',
    provider_name: 'lc-openai-compatible',
    provider_category: 'byok',
    model_type: 'llm',
  });
});

test('falls back to name for older servers without model handles', () => {
  const model = mapLettaModel({
    name: 'legacy-model',
    display_name: 'Legacy Model',
    provider_type: 'custom',
    model_type: 'llm',
  });

  assert.equal(model.name, 'legacy-model');
});
