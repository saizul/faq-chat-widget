import { readScriptConfig } from "./config.js";
import { buildHandoffPayload, buildTranscript, buildWhatsAppUrl } from "./handoff.js";
import { STRINGS, t } from "./i18n.js";
import { createMatcher } from "./matcher.js";
import { detectLanguage, normalize, tokenize } from "./normalize.js";
import { getInstance, init, initFromScript } from "./widget.js";

export { init, initFromScript, getInstance, createMatcher, normalize, tokenize, detectLanguage, STRINGS, t };
export { buildHandoffPayload, buildTranscript, buildWhatsAppUrl, readScriptConfig };

// One-tag install: <script src="faq-chat-widget.min.js" data-faq-url="faq.json" defer></script>
if (typeof document !== "undefined" && document.currentScript) {
  const script = document.currentScript;
  if (script.dataset.faqUrl && !script.hasAttribute("data-manual")) {
    const start = () => {
      initFromScript(script).catch((err) => console.error("[faq-chat-widget]", err.message));
    };
    // `defer`/`async` scripts lose currentScript later, so it is captured synchronously above.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
}
