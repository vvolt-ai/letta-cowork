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

type TabId = 'channels' | 'profile' | 'features';

export function CoworkSettingsDialog({ open, onOpenChange, onAuthError }: CoworkSettingsDialogProps) {
  const { coworkSettings: coworkSettingsStore, updateCoworkSettings } = useCoworkSettings();
  const [settings, setSettings] = useState<CoworkSettings>(coworkSettingsStore);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('channels');
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadSettings();
    loadProfile();
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

  const loadProfile = async () => {
    try {
      const currentUser = await window.electron.apiGetCurrentUser();
      if (!currentUser) return;
      setProfile({
        firstName: currentUser.firstName ?? '',
        lastName: currentUser.lastName ?? '',
        phoneNumber: currentUser.phoneNumber ?? '',
        email: currentUser.email ?? '',
      });
    } catch (error) {
      console.error("Failed to load profile:", error);
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const result = await window.electron.apiUpdateCurrentUserProfile({
        firstName: profile.firstName.trim() || undefined,
        lastName: profile.lastName.trim() || null,
        phoneNumber: profile.phoneNumber.trim() || null,
      });

      if (!result.success) {
        setProfileMessage(result.error || 'Failed to save profile');
        return;
      }

      const user = result.user;
      if (user) {
        setProfile({
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          phoneNumber: user.phoneNumber ?? '',
          email: user.email ?? profile.email,
        });
      }
      setProfileMessage('Profile saved');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setProfileSaving(false);
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
                onClick={() => setActiveTab('profile')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Profile
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
          ) : activeTab === 'profile' ? (
            <div className="p-4">
              <div className="space-y-4 max-w-lg">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Profile
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Your phone number is used to match external channel identities, like WhatsApp senders, to your Cowork user.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Email</span>
                    <input
                      value={profile.email}
                      disabled
                      className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">First name</span>
                      <input
                        value={profile.firstName}
                        onChange={(event) => setProfile((prev) => ({ ...prev, firstName: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Last name</span>
                      <input
                        value={profile.lastName}
                        onChange={(event) => setProfile((prev) => ({ ...prev, lastName: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Phone number</span>
                    <input
                      value={profile.phoneNumber}
                      onChange={(event) => setProfile((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                      placeholder="+918849286808"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Include country code. We normalize this before saving.
                    </p>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving || !profile.firstName.trim()}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {profileSaving ? 'Saving...' : 'Save profile'}
                  </button>
                  {profileMessage ? (
                    <span className={`text-sm ${profileMessage === 'Profile saved' ? 'text-green-600' : 'text-red-600'}`}>
                      {profileMessage}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
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
