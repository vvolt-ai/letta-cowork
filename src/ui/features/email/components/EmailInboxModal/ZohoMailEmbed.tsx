import { useEffect, useRef } from "react";

interface ZohoMailEmbedProps {
  initialMessageId?: string;
  onMailIdChange?: (mailId: string | null, url: string) => void;
}

function extractZohoMailId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hash = parsed.hash || "";

    const tabMatch = hash.match(/#mail\/tab\/(\d+)/);
    if (tabMatch?.[1]) return tabMatch[1];

    const previewMatch = hash.match(/#mail\/folder\/[^/]+\/p\/(\d+)/);
    if (previewMatch?.[1]) return previewMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Always-mounted Zoho Mail webview.
 * Webview src is fixed at mount so that user navigation inside Zoho is preserved.
 */
export function ZohoMailEmbed({ initialMessageId, onMailIdChange }: ZohoMailEmbedProps) {
  const webviewRef = useRef<any>(null);
  const initialSrc = initialMessageId
    ? `https://mail.zoho.com/zm/#mail/tab/${initialMessageId}`
    : "https://mail.zoho.com/zm/#mail";

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleNavigate = (event: any) => {
      const nextUrl = event?.url || webview.getURL?.() || initialSrc;
      const mailId = extractZohoMailId(nextUrl);
      onMailIdChange?.(mailId, nextUrl);
    };

    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);

    return () => {
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, [onMailIdChange, initialSrc]);

  return (
    <webview
      ref={webviewRef}
      src={initialSrc}
      className="flex-1 w-full h-full min-h-0"
      style={{ display: "inline-flex", width: "100%", height: "100%" }}
      allowpopups={true}
      webpreferences="contextIsolation=yes"
    />
  );
}
