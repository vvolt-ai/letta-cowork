import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Channel,
  ConfigDataState,
  CredentialField,
  DiscordConfig,
  LettaAgent,
  OrganizationUser,
  PROVIDERS,
  TelegramConfig,
  WeChatConfig,
  WhatsAppConfig,
} from './types';
import { DiscordConfigFields, TelegramConfigFields, WhatsAppConfigFields } from './ProviderConfigFields';

const getApi = () => (window as any).electron;

type StepId = 'details' | 'credentials' | 'behavior';

const STEPS: { id: StepId; label: string; description: string }[] = [
  { id: 'details', label: 'Details', description: 'Choose provider and agent' },
  { id: 'credentials', label: 'Connect', description: 'Authenticate provider' },
  { id: 'behavior', label: 'Behavior', description: 'Message routing rules' },
];

function resolveWeChatQrScanContent(result: {
  qrcode: string;
  qrcodeImageUrl?: string | null;
  qrcodeImageContent?: string | null;
}): { scanContent: string; imageDataUrl?: string } {
  const content = result.qrcodeImageContent?.trim() || '';
  const imageUrl = result.qrcodeImageUrl?.trim() || '';

  if (content.startsWith('data:image/') && !content.includes('base64,http')) {
    return { scanContent: imageUrl || result.qrcode, imageDataUrl: content };
  }

  const legacyDataUrlPayload = content.match(/^data:image\/[^,]+,(https?:\/\/.*)$/)?.[1];
  const scanContent = imageUrl || legacyDataUrlPayload || (content.startsWith('http') ? content : result.qrcode);
  return { scanContent };
}

interface CreateChannelModalProps {
  agents: LettaAgent[];
  channels: Channel[];
  organizationChannels?: Channel[];
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
    case 'wechat':
      return [
        { key: 'accountId', label: 'Account ID', placeholder: 'ilink_bot_id...', type: 'text', required: true },
        { key: 'botToken', label: 'Bot token', placeholder: 'WeChat iLink bot token', type: 'password', required: true },
        { key: 'baseUrl', label: 'Base URL (optional)', placeholder: 'https://ilinkai.weixin.qq.com', type: 'text', required: false },
      ];
    case 'whatsapp':
      return [
        { key: 'sessionPath', label: 'Session path (optional)', placeholder: './data/whatsapp-session', type: 'text', required: false },
      ];
    case 'gmail':
      return [];
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
    case 'wechat':
      return 'Generate a WeChat iLink QR code, scan it in WeChat, then Vera will fill the Account ID and Bot token automatically. You can also paste existing iLink credentials manually.';
    case 'gmail':
      return 'Gmail connector records can be created for testing now. OAuth/runtime connection will be added next; do not start this connector yet.';
    default:
      return 'Paste the provider credentials required to connect this channel.';
  }
}

function WeChatCredentialsGuide() {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <div className="font-semibold">How to get WeChat iLink credentials</div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-emerald-800">
        <li>Click <span className="font-medium">Generate QR code</span>.</li>
        <li>Scan the QR code with WeChat and confirm authorization on your phone.</li>
        <li>Vera checks the login status automatically every 20 seconds. You can also click <span className="font-medium">Check now</span>.</li>
        <li>Vera stores the returned <span className="font-medium">Account ID</span> and <span className="font-medium">Bot token</span> as channel credentials.</li>
        <li>Leave <span className="font-medium">Base URL</span> empty unless iLink gives you a custom API host. The default is <code className="rounded bg-white/70 px-1">https://ilinkai.weixin.qq.com</code>.</li>
        <li>After creating the channel, start it and send a test message to the iLink bot.</li>
      </ol>
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
        Do not paste a WeChat Official Account app secret or personal WeChat password here. The QR login only exchanges authorization for iLink Bot API credentials.
      </div>
    </div>
  );
}

function isWhatsAppAccountChannel(channel: Channel): boolean {
  if (channel.provider !== 'whatsapp') return false;
  const config = channel.config as WhatsAppConfig | undefined;
  return !config?.whatsappMode || config.whatsappMode === 'account';
}

export function CreateChannelModal({ agents, channels, organizationChannels, onClose, onComplete }: CreateChannelModalProps) {
  const [step, setStep] = useState<StepId>('details');
  const [provider, setProvider] = useState('telegram');
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [startAfterCreate, setStartAfterCreate] = useState(true);
  const [whatsappSetupMode, setWhatsappSetupMode] = useState<'account' | 'agent_route'>('account');
  const [configData, setConfigData] = useState<ConfigDataState>({ autoStart: true, typingIndicator: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wechatQr, setWechatQr] = useState<{
    qrcode: string;
    qrcodeImageUrl?: string | null;
    qrcodeImageContent?: string | null;
    renderedImageDataUrl?: string | null;
    baseUrl: string;
  } | null>(null);
  const [wechatQrLoading, setWechatQrLoading] = useState(false);
  const [wechatQrStatus, setWechatQrStatus] = useState<string | null>(null);
  const [wechatQrMessage, setWechatQrMessage] = useState<string | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUser[]>([]);
  const [organizationUsersLoading, setOrganizationUsersLoading] = useState(false);

  const currentStepIndex = STEPS.findIndex((candidate) => candidate.id === step);
  const whatsappAccountChannels = useMemo(
    () => (organizationChannels ?? channels).filter(isWhatsAppAccountChannel),
    [channels, organizationChannels]
  );
  const isWhatsAppRoute = provider === 'whatsapp' && whatsappSetupMode === 'agent_route';
  const whatsappRouteUsers = useMemo(
    () => organizationUsers.filter((user) => user.isActive && Boolean(user.phoneNumber?.trim())),
    [organizationUsers]
  );
  const credentialFields = useMemo(() => isWhatsAppRoute ? [] : getCredentialFields(provider), [isWhatsAppRoute, provider]);
  const missingCredentials = credentialFields.filter((field) => field.required && !credentials[field.key]?.trim());
  const canContinueDetails = name.trim().length > 0 && (!isWhatsAppRoute || Boolean(configData.parentChannelId));
  const canContinueCredentials = missingCredentials.length === 0;

  const updateConfig = (nextConfig: Record<string, unknown>) => {
    setConfigData(nextConfig as ConfigDataState);
  };

  const handleProviderChange = (nextProvider: string) => {
    setProvider(nextProvider);
    setError(null);
    if (nextProvider === 'gmail') {
      setConfigData({ autoStart: false, syncMode: 'unread_only', pollIntervalSeconds: 60 });
      setStartAfterCreate(false);
    } else if (provider === 'gmail') {
      setConfigData({ typingIndicator: true });
      setStartAfterCreate(true);
    }
  };

  const getUserLabel = (user: OrganizationUser) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return `${fullName || user.email}${user.phoneNumber ? ` (${user.phoneNumber})` : ''}`;
  };

  useEffect(() => {
    if (!isWhatsAppRoute) return;
    const api = getApi();
    if (typeof api.apiListOrganizationUsers !== 'function') return;

    let cancelled = false;
    setOrganizationUsersLoading(true);
    api.apiListOrganizationUsers()
      .then((result: { success: boolean; users?: OrganizationUser[]; error?: string }) => {
        if (cancelled) return;
        if (result.success) {
          setOrganizationUsers(result.users || []);
        } else {
          setError(result.error || 'Failed to load organization users');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setOrganizationUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isWhatsAppRoute]);

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

  const generateWeChatQrCode = async () => {
    setWechatQrLoading(true);
    setWechatQrStatus(null);
    setWechatQrMessage(null);
    setError(null);
    try {
      const api = getApi();
      const result = await api.apiGetWeChatIlinkQrCode({ baseUrl: credentials.baseUrl || (configData as WeChatConfig).baseUrl });
      if (!result.success || !result.qrcode || !result.baseUrl) {
        throw new Error(result.error || 'Failed to generate WeChat QR code');
      }
      const { scanContent, imageDataUrl } = resolveWeChatQrScanContent(result);
      const renderedImageDataUrl = imageDataUrl || await QRCode.toDataURL(scanContent, {
          margin: 1,
          width: 320,
        });
      setWechatQr({
        qrcode: result.qrcode,
        qrcodeImageUrl: result.qrcodeImageUrl,
        qrcodeImageContent: result.qrcodeImageContent,
        renderedImageDataUrl,
        baseUrl: result.baseUrl,
      });
      setWechatQrStatus('wait');
      setWechatQrMessage('Scan the QR code in WeChat and confirm on your phone. Vera will check automatically every 20 seconds.');
    } catch (err) {
      setWechatQr(null);
      setWechatQrStatus(null);
      setWechatQrMessage(err instanceof Error ? err.message : 'Failed to generate WeChat QR code');
    } finally {
      setWechatQrLoading(false);
    }
  };

  const checkWeChatQrStatus = useCallback(async (silent = false) => {
    if (!wechatQr?.qrcode) return;
    if (!silent) setWechatQrLoading(true);
    setError(null);
    try {
      const api = getApi();
      const result = await api.apiGetWeChatIlinkQrCodeStatus(wechatQr.qrcode, { baseUrl: wechatQr.baseUrl });
      if (!result.success) {
        throw new Error(result.error || 'Failed to check WeChat login status');
      }

      setWechatQrStatus(result.status || 'unknown');
      if (result.accountId && result.botToken) {
        setCredentials((currentCredentials) => ({
          ...currentCredentials,
          accountId: result.accountId,
          botToken: result.botToken,
          baseUrl: result.baseUrl || wechatQr.baseUrl,
        }));
        setConfigData((currentConfig) => ({ ...currentConfig, baseUrl: result.baseUrl || wechatQr.baseUrl }));
        setWechatQrMessage('WeChat login confirmed. Credentials filled automatically.');
      } else if (result.status === 'scanned') {
        setWechatQrMessage('QR scanned. Confirm authorization on your phone.');
      } else if (result.status === 'expired') {
        setWechatQrMessage('QR code expired. Generate a new QR code.');
      } else {
        setWechatQrMessage('Waiting for scan/confirmation.');
      }
    } catch (err) {
      setWechatQrMessage(err instanceof Error ? err.message : 'Failed to check WeChat login status');
    } finally {
      if (!silent) setWechatQrLoading(false);
    }
  }, [wechatQr]);

  useEffect(() => {
    if (provider !== 'wechat' || step !== 'credentials' || !wechatQr?.qrcode) return;
    if (credentials.accountId?.trim() && credentials.botToken?.trim()) return;
    if (wechatQrStatus === 'expired' || wechatQrStatus === 'confirmed') return;

    const interval = window.setInterval(() => {
      void checkWeChatQrStatus(true);
    }, 20_000);

    return () => window.clearInterval(interval);
  }, [checkWeChatQrStatus, credentials.accountId, credentials.botToken, provider, step, wechatQr, wechatQrStatus]);

  const handleFinish = async () => {
    if (!canContinueDetails || !canContinueCredentials) {
      setError('Complete the required fields before creating the channel.');
      return;
    }

    if (
      isWhatsAppRoute &&
      configData.routeType !== 'mention' &&
      configData.routeType !== 'fallback' &&
      !configData.routeUserId
    ) {
      setError('Select a registered Vera profile for this WhatsApp sender route.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const api = getApi();
      const baseConfig = provider === 'wechat' && credentials.baseUrl?.trim()
        ? { ...configData, baseUrl: credentials.baseUrl.trim() }
        : configData;
      const channelConfig = provider === 'whatsapp'
        ? {
            ...baseConfig,
            whatsappMode: whatsappSetupMode,
            ...(whatsappSetupMode === 'agent_route'
              ? { autoStart: false, typingIndicator: false }
              : {}),
          }
        : baseConfig;
      const cleanedConfig = Object.fromEntries(
        Object.entries(channelConfig).filter(([, value]) => value !== '' && value !== undefined)
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

      if (provider === 'whatsapp' && whatsappSetupMode === 'account' && startAfterCreate) {
        const startResult = await api.apiStartChannel(channel.id);
        if (!startResult.success) {
          throw new Error(startResult.error || 'Channel created, but QR generation failed. Start the channel from the list to retry.');
        }
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
                    const nextProvider = event.target.value;
                    setCredentials({});
                    setWechatQr(null);
                    setWechatQrStatus(null);
                    setWechatQrMessage(null);
                    setWhatsappSetupMode('account');
                    handleProviderChange(nextProvider);
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                  ))}
                </select>
              </div>

              {provider === 'whatsapp' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-800">WhatsApp number</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className={`cursor-pointer rounded-lg border p-3 text-sm ${whatsappSetupMode === 'account' ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                      <input
                        type="radio"
                        name="whatsappSetupMode"
                        value="account"
                        checked={whatsappSetupMode === 'account'}
                        onChange={() => {
                          setWhatsappSetupMode('account');
                          setConfigData({ ...configData, whatsappMode: 'account', parentChannelId: undefined, routeType: undefined, senderJid: undefined, groupJid: undefined, mentionAliases: undefined, replyAllowed: true });
                          setStartAfterCreate(true);
                        }}
                        className="mr-2"
                      />
                      Add new WhatsApp number
                      <div className="mt-1 text-xs opacity-75">Creates a real account/bridge row with QR login.</div>
                    </label>
                    <label className={`cursor-pointer rounded-lg border p-3 text-sm ${whatsappSetupMode === 'agent_route' ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                      <input
                        type="radio"
                        name="whatsappSetupMode"
                        value="agent_route"
                        checked={whatsappSetupMode === 'agent_route'}
                        onChange={() => {
                          setWhatsappSetupMode('agent_route');
                          setConfigData({ ...configData, whatsappMode: 'agent_route', autoStart: false, typingIndicator: false, replyAllowed: true, routeType: 'dm_sender' });
                          setStartAfterCreate(false);
                        }}
                        className="mr-2"
                      />
                      Use existing WhatsApp number
                      <div className="mt-1 text-xs opacity-75">Creates an agent route using an existing account.</div>
                    </label>
                  </div>

                  {whatsappSetupMode === 'agent_route' ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Existing WhatsApp account</label>
                        <select
                          value={configData.parentChannelId || ''}
                          onChange={(event) => setConfigData({ ...configData, parentChannelId: event.target.value || undefined })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <option value="">Select WhatsApp account...</option>
                          {whatsappAccountChannels.map((channel) => (
                            <option key={channel.id} value={channel.id}>{channel.name}</option>
                          ))}
                        </select>
                        {whatsappAccountChannels.length === 0 ? (
                          <p className="mt-1 text-xs text-amber-600">No existing WhatsApp account channels found. Add a new WhatsApp number first.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

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
              {provider === 'wechat' ? <WeChatCredentialsGuide /> : null}
              {provider === 'wechat' ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">WeChat QR login</div>
                      <p className="mt-1 text-sm text-slate-500">Generate a QR code from Tencent iLink and authorize this bot from WeChat. Vera checks status every 20 seconds.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={generateWeChatQrCode}
                        disabled={wechatQrLoading}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {wechatQrLoading && !wechatQr ? 'Generating...' : 'Generate QR code'}
                      </button>
                      {wechatQr ? (
                        <button
                          type="button"
                          onClick={() => void checkWeChatQrStatus(false)}
                          disabled={wechatQrLoading}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          {wechatQrLoading ? 'Checking...' : 'Check now'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {wechatQr ? (
                    <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                      <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2">
                        {wechatQr.renderedImageDataUrl || wechatQr.qrcodeImageContent || wechatQr.qrcodeImageUrl ? (
                          <img
                            src={wechatQr.renderedImageDataUrl || wechatQr.qrcodeImageContent || wechatQr.qrcodeImageUrl || undefined}
                            alt="WeChat iLink login QR code"
                            className="max-h-full max-w-full rounded-lg"
                          />
                        ) : (
                          <div className="break-all text-xs text-slate-500">{wechatQr.qrcode}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
                          <div><span className="font-medium">Status:</span> {wechatQrStatus || 'waiting'}</div>
                          <div className="mt-1"><span className="font-medium">Base URL:</span> {wechatQr.baseUrl}</div>
                        </div>
                        {wechatQrMessage ? (
                          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-700">{wechatQrMessage}</div>
                        ) : null}
                        <p className="mt-3 text-xs text-slate-500">
                          Keep this dialog open after scanning. Vera polls iLink every 20 seconds and fills Account ID + Bot token after confirmation.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {provider === 'whatsapp' ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  {isWhatsAppRoute ? (
                    <div className="text-sm text-green-900">
                      <span className="block font-medium">No QR scan needed</span>
                      <span className="mt-1 block text-green-700">This channel reuses the selected WhatsApp account. Only the account channel owns the bridge/session.</span>
                    </div>
                  ) : (
                  <div className="flex items-start gap-3">
                    <input
                      id="startAfterCreate"
                      type="checkbox"
                      checked={startAfterCreate}
                      onChange={(event) => setStartAfterCreate(event.target.checked)}
                      className="mt-1 rounded border-green-300"
                    />
                    <label htmlFor="startAfterCreate" className="text-sm text-green-900">
                      <span className="block font-medium">Show QR code after creating</span>
                      <span className="mt-1 block text-green-700">
                        We will start the WhatsApp channel immediately after setup. The QR code will appear on the channel card so you can scan it from WhatsApp → Linked devices.
                      </span>
                    </label>
                  </div>
                  )}
                </div>
              ) : null}
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
                {isWhatsAppRoute
                  ? 'This route chooses which agent handles messages from an existing WhatsApp account. Sender routes match registered Vera profiles by their profile phone number.'
                  : 'These settings control when the channel starts, who can talk to it, and how it behaves in groups.'}
              </div>

              {isWhatsAppRoute ? (
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <div className="font-medium text-blue-900">WhatsApp route rule</div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Route type</label>
                    <select
                      value={configData.routeType || 'dm_sender'}
                      onChange={(event) => setConfigData({ ...configData, routeType: event.target.value as ConfigDataState['routeType'] })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <option value="dm_sender">Direct message from sender</option>
                      <option value="group_sender">Group message from sender</option>
                      <option value="mention">Mention alias</option>
                      <option value="fallback">Fallback for this WhatsApp account</option>
                    </select>
                  </div>

                  {configData.routeType !== 'mention' && configData.routeType !== 'fallback' ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Sender Vera profile</label>
                      <select
                        value={configData.routeUserId || ''}
                        onChange={(event) => {
                          const selectedUser = whatsappRouteUsers.find((user) => user.id === event.target.value);
                          setConfigData({
                            ...configData,
                            routeUserId: selectedUser?.id || undefined,
                            senderJid: selectedUser?.phoneNumber || undefined,
                          });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value="">
                          {organizationUsersLoading ? 'Loading profiles...' : 'Select registered Vera profile'}
                        </option>
                        {whatsappRouteUsers.map((user) => (
                          <option key={user.id} value={user.id}>{getUserLabel(user)}</option>
                        ))}
                      </select>
                      {whatsappRouteUsers.length === 0 && !organizationUsersLoading ? (
                        <p className="mt-1 text-xs text-amber-700">
                          No active organization profiles with phone numbers found. Add a phone number to the Vera profile first.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">
                          Incoming WhatsApp sender must match this Vera profile's phone number.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {(configData.routeType === 'group_sender' || configData.routeType === 'fallback') ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Group JID (optional)</label>
                      <input
                        type="text"
                        value={configData.groupJid || ''}
                        onChange={(event) => setConfigData({ ...configData, groupJid: event.target.value || undefined })}
                        placeholder="120363...@g.us"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </div>
                  ) : null}

                  {configData.routeType === 'mention' ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Mention aliases</label>
                      <input
                        type="text"
                        value={(configData.mentionAliases || []).join(', ')}
                        onChange={(event) => setConfigData({
                          ...configData,
                          mentionAliases: event.target.value.split(',').map((value) => value.trim().replace(/^@+/, '')).filter(Boolean),
                        })}
                        placeholder="shelly, bhavy"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={configData.replyAllowed !== false}
                      onChange={(event) => setConfigData({ ...configData, replyAllowed: event.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Allow this route's agent to reply
                  </label>
                </div>
              ) : null}

              {!isWhatsAppRoute ? <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={configData.autoStart !== false}
                  onChange={(event) => setConfigData({ ...configData, autoStart: event.target.checked })}
                  className="rounded border-slate-300"
                />
                Auto-start when server starts
              </label> : null}

              {!isWhatsAppRoute ? <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={configData.typingIndicator !== false}
                  onChange={(event) => setConfigData({ ...configData, typingIndicator: event.target.checked })}
                  className="rounded border-slate-300"
                />
                Show typing indicator while processing
              </label> : null}

              {!isWhatsAppRoute ? <div>
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
              </div> : null}

              {provider === 'whatsapp' && !isWhatsAppRoute ? (
                <WhatsAppConfigFields configData={configData as WhatsAppConfig} setConfigData={updateConfig} />
              ) : null}
              {provider === 'telegram' ? (
                <TelegramConfigFields configData={configData as TelegramConfig} setConfigData={updateConfig} />
              ) : null}
              {provider === 'discord' ? (
                <DiscordConfigFields configData={configData as DiscordConfig} setConfigData={updateConfig} />
              ) : null}
              {provider === 'wechat' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">WeChat API base URL</label>
                  <input
                    type="text"
                    value={(configData as WeChatConfig).baseUrl || ''}
                    onChange={(event) => setConfigData({ ...configData, baseUrl: event.target.value || undefined })}
                    placeholder="https://ilinkai.weixin.qq.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-slate-500">Leave empty unless your WeChat iLink credentials use a different base URL.</p>
                </div>
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
              {saving ? (provider === 'whatsapp' && startAfterCreate ? 'Creating and generating QR...' : 'Creating channel...') : (provider === 'whatsapp' && startAfterCreate ? 'Create and show QR' : 'Create channel')}
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
