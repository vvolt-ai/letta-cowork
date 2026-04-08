// WhatsApp Channel Configuration

export interface WhatsAppConfig {
  enabled: boolean;
  selfChatMode: boolean;
  autoStart: boolean;
  respondToGroups: boolean;
  respondOnlyWhenMentioned: boolean;
  sessionPath: string;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
}

export interface WhatsAppBridgeStatus {
  state: "stopped" | "starting" | "qr" | "connected" | "reconnecting" | "error";
  connected: boolean;
  selfJid: string;
  deviceName?: string;
  qrAvailable: boolean;
  qrDataUrl: string;
  message: string;
  lastError: string;
  updatedAt: number;
}

export const defaultWhatsAppConfig = (): WhatsAppConfig => ({
  enabled: false,
  selfChatMode: false,
  autoStart: false,
  respondToGroups: true,
  respondOnlyWhenMentioned: false,
  sessionPath: "",
  allowedUsers: [],
  defaultAgentId: "",
  typingIndicator: true,
});

export const WHATSAPP_STEPS = [
  "Download WhatsApp on your phone",
  "Open WhatsApp and go to Settings → Linked Devices",
  "Tap 'Link a Device' and scan the QR code",
  "Make sure to authorize the device",
  "Enter session path (or leave empty to use default)",
  "Save and start the bridge",
];

export const WHATSAPP_DOCS_URL = "https://docs.letta.com/channels/whatsapp";
