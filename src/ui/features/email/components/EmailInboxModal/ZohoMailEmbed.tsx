import { useEffect, useRef } from "react";

export type ZohoMailNavigation = {
  kind: "none" | "message" | "thread";
  rawId: string | null;
  messageId?: string | null;
  threadId?: string | null;
  url: string;
};

interface ZohoMailEmbedProps {
  initialMessageId?: string;
  onMailIdChange?: (navigation: ZohoMailNavigation) => void;
}

function parseZohoNavigation(url: string): ZohoMailNavigation {
  try {
    const parsed = new URL(url);
    const hash = parsed.hash || "";

    const directMessageTabMatch = hash.match(/#mail\/tab\/(\d+)(?:[/?#]|$)/);
    if (directMessageTabMatch?.[1]) {
      return {
        kind: "message",
        rawId: directMessageTabMatch[1],
        messageId: directMessageTabMatch[1],
        url,
      };
    }

    const nestedTabMatch = hash.match(/#mail\/tab\/[^/]+\/(\d+)(?:[/?#]|$)/);
    if (nestedTabMatch?.[1]) {
      return {
        kind: "message",
        rawId: nestedTabMatch[1],
        messageId: nestedTabMatch[1],
        url,
      };
    }

    const previewMatch = hash.match(/#mail\/folder\/[^/]+\/p\/(\d+)(?:[/?#]|$)/);
    if (previewMatch?.[1]) {
      return {
        kind: "message",
        rawId: previewMatch[1],
        messageId: previewMatch[1],
        url,
      };
    }

    const threadTabMatch = hash.match(/#mail\/tab\/(t\d+)(?:[/?#]|$)/i);
    if (threadTabMatch?.[1]) {
      return {
        kind: "thread",
        rawId: threadTabMatch[1],
        threadId: threadTabMatch[1],
        url,
      };
    }

    const fallbackTabMatch = hash.match(/#mail\/tab\/([^/?#]+)/);
    if (fallbackTabMatch?.[1]) {
      const rawId = fallbackTabMatch[1];
      return { kind: "thread", rawId, threadId: rawId, url };
    }

    return { kind: "none", rawId: null, url };
  } catch {
    return { kind: "none", rawId: null, url };
  }
}

async function enrichNavigationFromDom(webview: any, navigation: ZohoMailNavigation): Promise<ZohoMailNavigation> {
  if (navigation.kind !== "thread") return navigation;

  try {
    const result = await webview.executeJavaScript(`(() => {
      const textOf = (el) => (el && el.textContent ? el.textContent.trim() : '');

      const subjectEl = document.querySelector('h1, .subject, [data-testid="mail_subject"], .zmMailHeaderSub, .threadTitle');
      const senderEl = document.querySelector('.from, .sender, [data-testid="mail_from"], .zmMailHeaderFrom');

      // Try to find a visible/latest mail item inside the thread DOM.
      const candidates = Array.from(document.querySelectorAll('[data-message-id], [data-msgid], [data-mid], .mailItem, .msgItem, .zmMailMsg, .threadMailItem'));
      let messageId = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];
        const id = el.getAttribute('data-message-id') || el.getAttribute('data-msgid') || el.getAttribute('data-mid');
        if (id) {
          messageId = id;
          break;
        }
      }

      return {
        messageId,
        subject: textOf(subjectEl),
        sender: textOf(senderEl),
      };
    })()`, true);

    if (result?.messageId && /^[0-9]+$/.test(String(result.messageId))) {
      return {
        ...navigation,
        messageId: String(result.messageId),
      };
    }

    return navigation;
  } catch {
    return navigation;
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

    const handleNavigate = async (event: any) => {
      const nextUrl = event?.url || webview.getURL?.() || initialSrc;
      const parsed = parseZohoNavigation(nextUrl);
      const enriched = await enrichNavigationFromDom(webview, parsed);
      onMailIdChange?.(enriched);
    };

    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("dom-ready", handleNavigate);

    return () => {
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("dom-ready", handleNavigate);
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
