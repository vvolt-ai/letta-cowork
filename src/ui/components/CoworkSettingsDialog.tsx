import { useState, useEffect } from "react";

interface CoworkSettings {
  showWhatsApp: boolean;
  showTelegram: boolean;
  showSlack: boolean;
  showDiscord: boolean;
  showEmailAutomation: boolean;
  showLettaEnv: boolean;
}

interface CoworkSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoworkSettingsDialog({ open, onOpenChange }: CoworkSettingsDialogProps) {
  const [settings, setSettings] = useState<CoworkSettings>({
    showWhatsApp: false,
    showTelegram: false,
    showSlack: false,
    showDiscord: false,
    showEmailAutomation: false,
    showLettaEnv: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      const storedSettings = await window.electron.getCoworkSettings();
      setSettings(storedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof CoworkSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    try {
      await window.electron.updateCoworkSettings({ [key]: !settings[key] });
    } catch (error) {
      console.error("Failed to update settings:", error);
      // Revert on error
      setSettings(settings);
    }
  };

  const handleReset = async () => {
    try {
      const defaultSettings = await window.electron.resetCoworkSettings();
      setSettings(defaultSettings);
    } catch (error) {
      console.error("Failed to reset settings:", error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={() => onOpenChange(false)}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Cowork Settings</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Enable or disable features. Changes take effect immediately.
            </p>

            {/* Channels Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Channels
              </h3>
              
              <SettingToggle
                label="WhatsApp"
                description="Enable WhatsApp messaging"
                enabled={settings.showWhatsApp}
                onToggle={() => handleToggle('showWhatsApp')}
              />
              
              <SettingToggle
                label="Telegram"
                description="Enable Telegram messaging"
                enabled={settings.showTelegram}
                onToggle={() => handleToggle('showTelegram')}
              />
              
              <SettingToggle
                label="Slack"
                description="Enable Slack integration"
                enabled={settings.showSlack}
                onToggle={() => handleToggle('showSlack')}
              />
              
              <SettingToggle
                label="Discord"
                description="Enable Discord integration"
                enabled={settings.showDiscord}
                onToggle={() => handleToggle('showDiscord')}
              />
            </div>

            {/* Other Settings */}
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Other
              </h3>
              
              <SettingToggle
                label="Email Automation"
                description="Enable email automation for unread emails"
                enabled={settings.showEmailAutomation}
                onToggle={() => handleToggle('showEmailAutomation')}
              />
              
              <SettingToggle
                label="Vera Environment"
                description="Show Vera environment settings"
                enabled={settings.showLettaEnv}
                onToggle={() => handleToggle('showLettaEnv')}
              />
            </div>

            {/* Reset Button */}
            <div className="pt-4 border-t flex justify-end">
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SettingToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function SettingToggle({ label, description, enabled, onToggle }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-accent' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
