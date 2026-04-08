import { useEffect, useState } from "react";
import { useCoworkSettings } from "../../../../hooks/useCoworkSettings";
import { ChannelsManager } from "../../../channels/components/ChannelsManager";

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
  onAuthError?: (error: Error) => void;
}

type TabId = 'channels' | 'features';

export function CoworkSettingsDialog({ open, onOpenChange, onAuthError }: CoworkSettingsDialogProps) {
  const { coworkSettings: coworkSettingsStore, updateCoworkSettings } = useCoworkSettings();
  const [settings, setSettings] = useState<CoworkSettings>(coworkSettingsStore);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('channels');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadSettings();
  }, [open]);

  // Only sync from store when values actually change
  useEffect(() => {
    // Deep compare to avoid unnecessary updates
    const isSame = Object.keys(coworkSettingsStore).every(
      key => settings[key as keyof CoworkSettings] === coworkSettingsStore[key as keyof typeof coworkSettingsStore]
    );
    if (!isSame) {
      setSettings(coworkSettingsStore);
    }
  }, [coworkSettingsStore]);

  const loadSettings = async () => {
    try {
      const storedSettings = await window.electron.getCoworkSettings();
      setSettings(storedSettings);
      updateCoworkSettings(storedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof CoworkSettings) => {
    const previousValue = settings[key];
    const nextValue = !previousValue;

    setSettings((prev) => ({ ...prev, [key]: nextValue }));
    updateCoworkSettings({ [key]: nextValue } as Partial<CoworkSettings>);

    try {
      await window.electron.updateCoworkSettings({ [key]: nextValue });
    } catch (error) {
      console.error("Failed to update settings:", error);
      setSettings((prev) => ({ ...prev, [key]: previousValue }));
      updateCoworkSettings({ [key]: previousValue } as Partial<CoworkSettings>);
    }
  };

  const handleReset = async () => {
    try {
      const defaultSettings = await window.electron.resetCoworkSettings();
      setSettings(defaultSettings);
      updateCoworkSettings(defaultSettings);
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
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
            
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setActiveTab('channels')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'channels'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Channels
              </button>
              <button
                onClick={() => setActiveTab('features')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'features'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Features
              </button>
            </div>
          </div>
          
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'channels' ? (
            <ChannelsManager onAuthError={onAuthError} />
          ) : (
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Enable or disable features. Changes take effect immediately.
                  </p>

                  {/* Other Settings */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                      Features
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
          )}
        </div>
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
          enabled ? 'bg-blue-500' : 'bg-gray-200'
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
