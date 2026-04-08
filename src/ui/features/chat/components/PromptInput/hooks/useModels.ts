/**
 * Hook for managing model selection in the PromptInput component.
 */

import { useEffect, useState } from "react";

export interface ModelOption {
  name: string;
  display_name?: string | null;
  provider_type: string;
}

const MODEL_KEY_REGEX = /model/i;

function collectModelStrings(value: unknown, set: Set<string>, force = false): void {
  if (!value) return;

  if (typeof value === "string") {
    if (force) {
      const trimmed = value.trim();
      if (trimmed) set.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectModelStrings(entry, set, force);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextForce = force || MODEL_KEY_REGEX.test(key);
      collectModelStrings(nested, set, nextForce);
    }
  }
}

function extractAgentModelNames(agent: any): string[] {
  if (!agent) return [];
  const set = new Set<string>();

  collectModelStrings(agent?.model, set, true);
  collectModelStrings(agent?.models, set, true);
  collectModelStrings(agent?.availableModels, set, true);
  collectModelStrings(agent?.available_models, set, true);
  collectModelStrings(agent?.inferenceConfig?.models, set, true);
  collectModelStrings(agent?.inference_config?.models, set, true);
  collectModelStrings(agent?.metadata, set, false);

  return Array.from(set);
}

function guessProviderType(modelName: string): string {
  if (!modelName) return "custom";
  if (modelName.includes("/")) {
    return modelName.split("/")[0] ?? "custom";
  }
  if (modelName.includes(":")) {
    return modelName.split(":")[0] ?? "custom";
  }
  return "custom";
}

function mapModelNamesToOptions(names: string[], catalog: ModelOption[]): ModelOption[] {
  if (!names.length) return catalog;
  const catalogMap = new Map(catalog.map((model) => [model.name, model]));
  const unique = Array.from(new Set(names));
  return unique.map((name) => {
    const match = catalogMap.get(name);
    if (match) return match;
    return {
      name,
      display_name: name,
      provider_type: guessProviderType(name),
    } satisfies ModelOption;
  });
}

function mergeModelOptions(primary: ModelOption[], secondary: ModelOption[]): ModelOption[] {
  const merged: ModelOption[] = [];
  const seen = new Set<string>();
  for (const model of [...primary, ...secondary]) {
    if (!seen.has(model.name)) {
      merged.push(model);
      seen.add(model.name);
    }
  }
  return merged;
}

export interface UseModelsOptions {
  agentId?: string;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

export interface UseModelsResult {
  models: ModelOption[];
  allModels: ModelOption[];
  modelsLoading: boolean;
  hasSelectedModelOption: boolean;
  setModelTouched: (touched: boolean) => void;
}

export function useModels(options: UseModelsOptions): UseModelsResult {
  const { agentId, selectedModel, setSelectedModel } = options;

  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelTouched, setModelTouched] = useState(false);

  // Fetch catalog
  useEffect(() => {
    let cancelled = false;

    const fetchCatalog = async () => {
      try {
        const fetched = await window.electron.listLettaModels();
        if (cancelled) return;
        if (Array.isArray(fetched)) {
          setAllModels(fetched);
          setModels((current) => (current.length > 0 ? current : fetched));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load models:", error);
        }
      }
    };

    fetchCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  // Reset touched on agent change
  useEffect(() => {
    setModelTouched(false);
  }, [agentId]);

  // Apply agent models
  useEffect(() => {
    let cancelled = false;

    const applyModels = async () => {
      if (!agentId) {
        setModels(allModels);
        setModelsLoading(false);
        return;
      }

      if (!window.electron.getLettaAgent) {
        setModels(allModels);
        setModelsLoading(false);
        return;
      }

      setModelsLoading(true);
      try {
        const agent = await window.electron.getLettaAgent(agentId);
        if (cancelled) return;
        const names = extractAgentModelNames(agent);
        const derived = mapModelNamesToOptions(names, allModels);
        const nextModels = mergeModelOptions(derived, allModels);
        setModels(nextModels);

        const preferred =
          typeof agent?.model === "string" && agent.model?.trim()
            ? agent.model.trim()
            : names[0];

        if (!modelTouched) {
          if (preferred && preferred !== selectedModel) {
            setSelectedModel(preferred);
          } else if (!preferred && !selectedModel && nextModels[0]) {
            setSelectedModel(nextModels[0].name);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load agent models:", error);
          setModels(allModels);
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    };

    applyModels();

    return () => {
      cancelled = true;
    };
  }, [agentId, allModels, modelTouched, selectedModel, setSelectedModel]);

  // Default model selection
  useEffect(() => {
    if (modelTouched) return;
    if (selectedModel) return;
    if (models.length === 0) return;
    setSelectedModel(models[0].name);
  }, [modelTouched, models, selectedModel, setSelectedModel]);

  const hasSelectedModelOption = selectedModel
    ? !models.some((model) => model.name === selectedModel)
    : false;

  return {
    models,
    allModels,
    modelsLoading,
    hasSelectedModelOption,
    setModelTouched,
  };
}
