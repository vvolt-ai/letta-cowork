import { useMemo, useState } from 'react';
import {
  Channel,
  ConfigDataState,
  CredentialField,
  DiscordConfig,
  LettaAgent,
  PROVIDERS,
  TelegramConfig,
  WhatsAppConfig,
} from './types';
import { DiscordConfigFields, TelegramConfigFields, WhatsAppConfigFields } from './ProviderConfigFields';

const getApi = () => (window as any).electron;

type StepId = 'details' | 'credentials' | 'behavior';

const STEPS: { id: StepId; label: string; description: string }[] = [
  { id: 'details', label: 'Details', description: 'Choose provider and agent' },
  { id: 'credentials', label: 'Credentials', description: 'Connect the provider' },
  { id: 'behavior', label: 'Behavior', description: 'Message routing rules' },
];

interface CreateChannelModalProps {
  agents: LettaAgent[];
  onClose: () => void;
  onComplete: (channel: Channel) => void | Promise<void>;
}

function getCredentialFields(provider: string): CredentialField[] {
  switch (provider) {
    case 'telegram':
      return [
        { key: 'botToken', label: 'Bot token', placeholder: '123456:ABC-DEF...', type: 'password', required: true },
      ];
    case 'discord':
      return [
        { key: 'botToken', label: 'Bot token', placeholder: 'MTk4NjIyNDgzNDc...', type: 'password', required: true },
      ];
    case 'slack':
      return [
        { key: 'botToken', label: 'Bot token (xoxb-...)', placeholder: 'xoxb-123456789012-...', type: 'password', required: true },
        { key: 'appToken', label: 'App token (xapp-...)', placeholder: 'xapp-1-A01BC...', type: 'password', required: true },
      ];
    case 'whatsapp':
      return [
        { key: 'sessionPath', label: 'Session path (optional)', placeholder: './data/whatsapp-session', type: 'text', required: false },
      ];
    default:
      return [];
  }
}

function getCredentialsHelp(provider: string): string {
  switch (provider) {
    case 'whatsapp':
      return 'WhatsApp uses QR authentication. You can optionally set a session path now, then start the channel and scan the QR code.';
    case 'telegram':
      return 'Create a bot with @BotFather in Telegram and paste the token here.';
    case 'discord':
      return 'Create a bot in the Discord Developer Portal and paste its bot token here.';
    case 'slack':
      return 'Create a Slack app, enable Socket Mode, then paste both the bot token and app token.';
    default:
      return 'Paste the provider credentials required to connect this channel.';
  }
}

export function CreateChannelModal({ agents, onClose, onComplete }: CreateChannelModalProps) {
  const [step, setStep] = useState<StepId>('details');
  const [provider, setProvider] = useState('telegram');
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [configData, setConfigData] = useState<ConfigDataState>({ typingIndicator: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStepIndex = STEPS.findIndex((candidate) => candidate.id === step);
  const credentialFields = useMemo(() => getCredentialFields(provider), [provider]);
  const missingCredentials = credentialFields.filter((field) => field.required && !credentials[field.key]?.trim());
  const canContinueDetails = name.trim().length > 0;
  const canContinueCredentials = missingCredentials.length === 0;

  const updateConfig = (nextConfig: Record<string, unknown>) => {
    setConfigData(nextConfig as ConfigDataState);
  };

  const goNext = () => {
    setError(null);
    if (step === 'details') {
      if (!canContinueDetails) {
        setError('Channel name is required.');
        return;
      }
      setStep('credentials');
      return;
    }
    if (step === 'credentials') {
      if (!canContinueCredentials) {
        setError(`Missing required credentials: ${missingCredentials.map((field) => field.label).join(', ')}`);
        return;
      }
      setStep('behavior');
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 'credentials') setStep('details');
    if (step === 'behavior') setStep('credentials');
  };

  const handleFinish = async () => {
    if (!canContinueDetails || !canContinueCredentials) {
      setError('Complete the required fields before creating the channel.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const api = getApi();
      const cleanedConfig = Object.fromEntries(
        Object.entries(configData).filter(([, value]) => value !== '' && value !== undefined)
      );

      const createResult = await api.apiCreateChannel({
        provider,
        name: name.trim(),
        config: Object.keys(cleanedConfig).length > 0 ? cleanedConfig : undefined,
      });

      if (!createResult.success || !createResult.channel) {
        throw new Error(createResult.error || 'Failed to create channel');
      }

      const channel = createResult.channel as Channel;
      const nonEmptyCredentials = Object.fromEntries(
        Object.entries(credentials).filter(([, value]) => value.trim().length > 0)
      );

      if (Object.keys(nonEmptyCredentials).length > 0) {
        const credentialsResult = await api.apiSetChannelCredentials(channel.id, { credentials: nonEmptyCredentials });
        if (!credentialsResult.success) {
          throw new Error(credentialsResult.error || 'Channel created, but credentials failed to save');
        }
      }

      const configResult = await api.apiUpdateChannelConfig(channel.id, cleanedConfig);
      if (!configResult.success) {
        throw new Error(configResult.error || 'Channel created, but configuration failed to save');
      }

      await onComplete(channel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Add channel</h3>
              <p className="mt-1 text-sm text-slate-500">Follow each step to create, connect, and configure the channel.</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {STEPS.map((item, index) => {
              const active = item.id === step;
              const complete = index < currentStepIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => index <= currentStepIndex && setStep(item.id)}
                  disabled={index > currentStepIndex}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : complete
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide">Step {index + 1}</div>
                  <div className="mt-1 text-sm font-medium">{item.label}</div>
                  <div className="mt-0.5 text-xs opacity-80">{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          {step === 'details' ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Provider</label>
                <select
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value);
                    setCredentials({});
                    setConfigData({ typingIndicator: true });
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Channel name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Customer support bot"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">Use a name your team will recognize in the channel list.</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Default agent</label>
                <select
                  value={configData.defaultAgentId || ''}
                  onChange={(event) => setConfigData({ ...configData, defaultAgentId: event.target.value || undefined })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select an agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name} ({agent.id.slice(0, 8)}...)</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">The Letta agent that will respond to incoming messages.</p>
              </div>
            </div>
          ) : null}

          {step === 'credentials' ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{getCredentialsHelp(provider)}</div>
              {credentialFields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {field.label} {field.required ? <span className="text-red-500">*</span> : null}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(event) => setCredentials({ ...credentials, [field.key]: event.target.value })}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {step === 'behavior' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                These settings control when the channel starts, who can talk to it, and how it behaves in groups.
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(configData.autoStart)}
                  onChange={(event) => setConfigData({ ...configData, autoStart: event.target.checked })}
                  className="rounded border-slate-300"
                />
                Auto-start when server starts
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={configData.typingIndicator !== false}
                  onChange={(event) => setConfigData({ ...configData, typingIndicator: event.target.checked })}
                  className="rounded border-slate-300"
                />
                Show typing indicator while processing
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Allowed users</label>
                <input
                  type="text"
                  value={(configData.allowedUsers || []).join(', ')}
                  onChange={(event) => setConfigData({
                    ...configData,
                    allowedUsers: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                  })}
                  placeholder={provider === 'whatsapp' ? '1234567890, 0987654321' : 'user_id_1, user_id_2'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {provider === 'whatsapp' ? 'Phone numbers with country code, without + sign.' : 'Leave empty to allow all users.'}
                </p>
              </div>

              {provider === 'whatsapp' ? (
                <WhatsAppConfigFields configData={configData as WhatsAppConfig} setConfigData={updateConfig} />
              ) : null}
              {provider === 'telegram' ? (
                <TelegramConfigFields configData={configData as TelegramConfig} setConfigData={updateConfig} />
              ) : null}
              {provider === 'discord' ? (
                <DiscordConfigFields configData={configData as DiscordConfig} setConfigData={updateConfig} />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-6">
          <button
            onClick={step === 'details' ? onClose : goBack}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {step === 'details' ? 'Cancel' : 'Back'}
          </button>

          {step === 'behavior' ? (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'Creating channel...' : 'Create channel'}
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={step === 'details' ? !canContinueDetails : !canContinueCredentials}
              className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
