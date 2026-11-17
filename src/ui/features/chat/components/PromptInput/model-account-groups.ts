import type { ModelOption } from './hooks/useModels';

export interface ModelAccountGroup {
  key: string;
  label: string;
  models: ModelOption[];
}

/** Provider-instance metadata/handle namespace, never a different Letta connection.
 * Include both identities when present so generic provider types cannot merge
 * separately configured accounts that expose the same model names.
 */
export function modelAccountIdentity(model: ModelOption): {key: string; label: string} {
  const provider = model.provider_name?.trim();
  const slash = model.name.indexOf('/');
  const namespace = slash > 0 ? model.name.slice(0, slash).trim() : '';
  const type = model.provider_type?.trim() || 'Other';
  return {
    key: JSON.stringify([model.provider_category ?? 'other', namespace || provider || type, provider || '']),
    label: provider && provider.toLowerCase() !== type.toLowerCase() ? provider : namespace || provider || type,
  };
}

export function groupModelsByAccount(models: readonly ModelOption[]): ModelAccountGroup[] {
  const groups = new Map<string, ModelAccountGroup>();
  for (const model of models) {
    const identity = modelAccountIdentity(model);
    let group = groups.get(identity.key);
    if (!group) {
      group = {...identity, models: []};
      groups.set(identity.key, group);
    }
    group.models.push(model);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}
