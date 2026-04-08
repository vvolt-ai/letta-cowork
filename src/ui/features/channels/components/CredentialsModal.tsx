import { Channel, CredentialField } from './types';
import { getProviderIcon } from './ChannelCard';

// Helper functions for credential fields
function getCredentialFields(provider: string): CredentialField[] {
  switch (provider) {
    case 'telegram':
      return [
        {
          key: 'botToken',
          label: 'Bot Token',
          placeholder: '123456:ABC-DEF...',
          type: 'text',
          required: true,
        },
      ];
    case 'discord':
      return [
        {
          key: 'botToken',
          label: 'Bot Token',
          placeholder: 'MTk4NjIyNDgzNDc...',
          type: 'text',
          required: true,
        },
      ];
    case 'slack':
      return [
        {
          key: 'botToken',
          label: 'Bot Token (xoxb-...)',
          placeholder: 'xoxb-123456789012-...',
          type: 'text',
          required: true,
        },
        {
          key: 'appToken',
          label: 'App Token (xapp-...)',
          placeholder: 'xapp-1-A01BC...',
          type: 'text',
          required: true,
        },
      ];
    case 'whatsapp':
      return [
        {
          key: 'sessionPath',
          label: 'Session Path (optional)',
          placeholder: './data/whatsapp-session',
          type: 'text',
          required: false,
        },
      ];
    default:
      return [];
  }
}

function getCredentialsHelp(provider: string): string | null {
  switch (provider) {
    case 'whatsapp':
      return 'WhatsApp uses QR code authentication. Click "Start" to generate a QR code, then scan it with your WhatsApp app.';
    case 'telegram':
      return 'Get your bot token from @BotFather on Telegram.';
    case 'discord':
      return 'Get your bot token from the Discord Developer Portal.';
    case 'slack':
      return 'Get your bot token and app token from your Slack App settings.';
    default:
      return null;
  }
}

interface CredentialsModalProps {
  channel: Channel;
  credentials: Record<string, string>;
  setCredentials: (v: Record<string, string>) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function CredentialsModal({
  channel,
  credentials,
  setCredentials,
  saving,
  onClose,
  onSave,
}: CredentialsModalProps) {
  const helpText = getCredentialsHelp(channel.provider);
  const fields = getCredentialFields(channel.provider);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">
          {getProviderIcon(channel.provider)} Configure{' '}
          {channel.provider.charAt(0).toUpperCase() + channel.provider.slice(1)}
        </h3>

        {helpText && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            {helpText}
          </div>
        )}

        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {field.label}{' '}
                {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={field.type}
                value={credentials[field.key] || ''}
                onChange={(e) =>
                  setCredentials({ ...credentials, [field.key]: e.target.value })
                }
                placeholder={field.placeholder}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </div>
      </div>
    </div>
  );
}
