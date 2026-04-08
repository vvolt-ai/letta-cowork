import * as Dialog from "@radix-ui/react-dialog";
import type { ChannelType } from "../ChannelSettings";
import { useChannelSetup } from "./hooks/useChannelSetup";
import { ProviderSelection } from "./ProviderSelection";
import { ChannelConfigForm } from "./ChannelConfigForm";
import { SetupStepIndicator } from "./SetupStepIndicator";
import { SetupConfirmation } from "./SetupConfirmation";

interface ChannelSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChannel: ChannelType;
  availableChannels: ChannelType[];
}

export function ChannelSetupDialog({
  open,
  onOpenChange,
  initialChannel,
  availableChannels,
}: ChannelSetupDialogProps) {
  const {
    activeChannel,
    currentConfig,
    whatsappConfig,
    whatsappStatus,
    setWhatsAppConfig,
    telegramConfig,
    telegramStatus,
    setTelegramConfig,
    slackConfig,
    slackStatus,
    setSlackConfig,
    discordConfig,
    discordStatus,
    setDiscordConfig,
    saveMessage,
    loading,
    isStarting,
    isStopping,
    hasAvailableChannels,
    setActiveChannel,
    updateField,
    saveCurrentChannel,
    openDocs,
    startWhatsAppBridge,
    stopWhatsAppBridge,
    startTelegramBridge,
    stopTelegramBridge,
    startSlackBridge,
    stopSlackBridge,
    startDiscordBridge,
    stopDiscordBridge,
  } = useChannelSetup({
    open,
    initialChannel,
    availableChannels,
  });

  if (!hasAvailableChannels) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Channel Setup</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-6 rounded-xl border border-ink-900/10 bg-white/80 p-4 text-sm text-ink-700">
              No channels available. Enable channels in Cowork Settings to configure integrations.
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-ink-800">Channel Setup</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <ProviderSelection
            availableChannels={availableChannels}
            activeChannel={activeChannel}
            onChannelSelect={setActiveChannel}
          />

          <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <ChannelConfigForm
              activeChannel={activeChannel}
              currentConfig={currentConfig}
              whatsappConfig={whatsappConfig}
              whatsappStatus={whatsappStatus}
              setWhatsAppConfig={setWhatsAppConfig}
              onStartWhatsApp={startWhatsAppBridge}
              onStopWhatsApp={stopWhatsAppBridge}
              telegramConfig={telegramConfig}
              telegramStatus={telegramStatus}
              setTelegramConfig={setTelegramConfig}
              onStartTelegram={startTelegramBridge}
              onStopTelegram={stopTelegramBridge}
              slackConfig={slackConfig}
              slackStatus={slackStatus}
              setSlackConfig={setSlackConfig}
              onStartSlack={startSlackBridge}
              onStopSlack={stopSlackBridge}
              discordConfig={discordConfig}
              discordStatus={discordStatus}
              setDiscordConfig={setDiscordConfig}
              onStartDiscord={startDiscordBridge}
              onStopDiscord={stopDiscordBridge}
              isStarting={isStarting}
              isStopping={isStopping}
              loading={loading}
              onUpdateField={updateField}
            />

            <SetupStepIndicator activeChannel={activeChannel} onOpenDocs={openDocs} />
          </div>

          <SetupConfirmation saveMessage={saveMessage} loading={loading} onSave={saveCurrentChannel} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ChannelSetupDialog;
