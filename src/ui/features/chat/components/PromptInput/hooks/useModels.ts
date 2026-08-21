/**
 * Hook for managing model selection in the PromptInput component.
 */

import { useEffect, useMemo, useState } from "react";

import { useAppStore } from "../../../../../store/useAppStore";

export interface ModelOption {
  /** Fully qualified model handle used for runtime selection. */
  name: string;
  /** Provider-local name, used only to migrate old bare-name selections. */
  model_name?: string | null;
  display_name?: string | null;
  provider_type: string;
  provider_name?: string | null;
  provider_category?: "base" | "byok" | null;
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
  connectionId?: string;
  /** Conversation identity, used to isolate touched/default state. */
  contextKey?: string;
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
  const { agentId, connectionId, contextKey, selectedModel, setSelectedModel } = options;

  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelTouched, setModelTouched] = useState(false);

  // Models the Letta Code CLI runtime has rejected ("Invalid model" error).
  // Hide them from the picker so users can't re-select a broken handle.
  const rejectedModels = useAppStore((state) => state.rejectedModels);
  const rejectedSet = useMemo(() => new Set(rejectedModels), [rejectedModels]);

  // Fetch catalog
  useEffect(() => {
    let cancelled = false;
    // Never display the previous account's catalog while the selected account
    // is loading. An absent connectionId intentionally means org default.
    setAllModels([]);
    setModels([]);
    setModelsLoading(true);

    const fetchCatalog = async () => {
      try {
        const fetched = await window.electron.listLettaModels(connectionId);
        if (cancelled) return;
        if (Array.isArray(fetched)) {
          setAllModels(fetched);
          setModels(fetched);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load models:", error);
        }
      }
    };

    const handleCatalogChanged = () => {
      void fetchCatalog();
    };

    fetchCatalog();
    window.addEventListener("letta-model-catalog-changed", handleCatalogChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("letta-model-catalog-changed", handleCatalogChanged);
    };
  }, [connectionId]);

  // Migrate selections persisted by older Cowork builds, which incorrectly
  // stored the provider-local model name instead of the qualified handle.
  useEffect(() => {
    if (!selectedModel || allModels.some((model) => model.name === selectedModel)) return;

    const connectedMatches = allModels.filter(
      (model) => model.provider_category === "byok" && model.model_name === selectedModel
    );
    if (connectedMatches.length === 1) {
      setSelectedModel(connectedMatches[0].name);
    }
  }, [allModels, selectedModel, setSelectedModel]);

  // Model choices are conversation-scoped. Switching conversations must not
  // preserve the previous conversation's manually-touched state.
  useEffect(() => {
    setModelTouched(false);
  }, [agentId, connectionId, contextKey]);

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
        const agent = await window.electron.getLettaAgent(agentId, connectionId);
        if (cancelled) return;
        const names = extractAgentModelNames(agent);
        const derived = mapModelNamesToOptions(names, allModels);
        const nextModels = mergeModelOptions(derived, allModels);
        setModels(nextModels);

        // If the conversation's explicit model is unavailable in this account,
        // clear the override and let the agent use its own default model.
        const selectedIsValidForAgent =
          !selectedModel ||
          nextModels.some((m) => m.name === selectedModel);

        if (!selectedIsValidForAgent) {
          console.warn(
            `[useModels] Selected model "${selectedModel}" is not available on agent ${agentId}. Resetting to agent default.`
          );
          setSelectedModel("");
          setModelTouched(false);
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
  }, [agentId, allModels, connectionId, modelTouched, selectedModel, setSelectedModel]);

  const visibleModels = useMemo(
    () => models.filter((m) => !rejectedSet.has(m.name)),
    [models, rejectedSet]
  );
  const visibleAllModels = useMemo(
    () => allModels.filter((m) => !rejectedSet.has(m.name)),
    [allModels, rejectedSet]
  );

  const hasSelectedModelOption = selectedModel
    ? !visibleModels.some((model) => model.name === selectedModel)
    : false;

  return {
    models: visibleModels,
    allModels: visibleAllModels,
    modelsLoading,
    hasSelectedModelOption,
    setModelTouched,
  };
}
