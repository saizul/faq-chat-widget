# faq-chat-widget

A lightweight, zero-dependency chat bubble for your website that answers visitors from a **FAQ JSON file**, entirely in the browser. English and Bangla (বাংলা) are first-class, including Bangla digits and typo tolerance. When the bot cannot help, visitors can hand off to a human via **WhatsApp** or a **webhook** (for example n8n).

**Live demo:** https://saizul.github.io/faq-chat-widget/ (after enabling GitHub Pages, source: GitHub Actions)

- No dependencies, no tracking, no network calls except loading your FAQ and (optionally) the handoff endpoint.
- Shadow DOM: your site CSS cannot break it, and it cannot break your site.
- Accessible: `role="log"` live region, keyboard use, focus trap, Escape to close, visible focus, reduced-motion support.
- RTL-safe (logical CSS properties, per-language `dir`), light/dark/auto theme, themeable with CSS variables.

## Install (one tag)

```html
<script src="https://your-site.example/faq-chat-widget.min.js" defer
  data-faq-url="/faq.json"
  data-lang="auto"
  data-theme="auto"
  data-primary="#0b7a5b"
  data-whatsapp="8801XXXXXXXXX"></script>
```

Build the file yourself with `npm install && npm run build` (outputs `dist/faq-chat-widget.min.js`).

| Attribute | Values | Notes |
| --- | --- | --- |
| `data-faq-url` | URL | Required for auto-init. JSON array, or `{ "faq": [...] }`. |
| `data-lang` | `auto`, `en`, `bn` | `auto` follows `<html lang>` / browser and switches to Bangla when the visitor types Bangla. |
| `data-theme` | `light`, `dark`, `auto` | `auto` follows `prefers-color-scheme`. |
| `data-primary` | colour | Hex, `rgb()`, `hsl()` or a colour name. |
| `data-position` | `end`, `start` | Bottom corner (logical, flips in RTL). |
| `data-whatsapp` | digits | Number in international format; enables the WhatsApp handoff. |
| `data-webhook` | https URL | Public endpoint for the "send to team" handoff (see below). |
| `data-title`, `data-greeting` | text | Override header title / first message. |
| `data-open` | `true` | Start opened. |
| `data-suggestions` | 0-10 | Number of suggested question chips. |
| `data-persist` | `session`, `local`, `off` | Keep the conversation across page loads (off by default, see below). |
| `data-persist-ttl` | minutes | How long a saved conversation lives after the last message (default 30). |

### Programmatic use

```js
import { init } from "faq-chat-widget";
const widget = await init({ faq: [...], lang: "bn", whatsapp: "8801XXXXXXXXX",
  strings: { en: { title: "Help desk" } }, synonyms: [["invoice", "bill", "receipt"]] });
widget.open(); widget.setLang("en"); widget.clearHistory(); widget.destroy();
```

### Keeping the conversation across pages

By default every page load starts a fresh chat. On multi-page sites, turn on persistence so a visitor who asks a question, clicks an answer link and lands on another page still sees the conversation (and the panel stays open, without stealing focus):

```html
<script src="faq-chat-widget.min.js" defer data-faq-url="/faq.json" data-persist="session"></script>
```

```js
init({ faq, persist: "session", persistTtl: 30, persistKey: "faq-chat-widget:v1" });
```

- `session` uses `sessionStorage` (cleared when the tab closes); `local` uses `localStorage` (survives restarts, still subject to `persistTtl`).
- The saved conversation expires `persistTtl` minutes (default 30, max 30 days) after the last change. Up to 50 messages are kept, each cut to 1,000 characters.
- With persistence on, a "Start a new conversation" button appears in the header; `widget.clearHistory()` does the same from code. Earlier messages are included in a later WhatsApp or webhook handoff.
- Stored data is validated before it is shown: unknown roles, bad timestamps and other versions are dropped, text is rendered as plain text, and answer links are looked up again from the current FAQ by id, never read from storage.
- If storage is blocked (private mode, sandboxed iframe, full quota) the widget silently works without persistence.
- `persistKey` lets two widgets on the same origin (for example a shop and a blog with different FAQs) keep separate histories.

The conversation stays on the visitor's device, but it is personal data: mention it in your privacy policy, and prefer `session` on shared computers.

### Analytics events

The widget does not track anything on its own. To measure usage, pass an `onEvent` callback, or listen for a DOM event; both receive the same object, `{ type, at, ...data }`:

| `type` | When | Extra fields |
| --- | --- | --- |
| `open` / `close` | Panel opened or closed | none |
| `question` | The visitor asked something (typed or via a chip) | `text`, `lang`, `matched` (boolean), `id` (FAQ id or `null`) |
| `handoff` | A WhatsApp or webhook handoff was attempted | `method` (`whatsapp` or `webhook`), `ok` (boolean) |

```js
init({ faq, onEvent: (e) => gtag("event", `faq_${e.type}`, { matched: e.matched }) });
```

With the one-tag install, listen on the document instead (the event bubbles out of the Shadow DOM):

```js
document.addEventListener("faq-chat-widget:event", (e) => console.log(e.detail));
```

`question.text` is what the visitor typed, so treat it as personal data and mention it in your privacy policy if you store it. Errors thrown by your handler are caught and logged; they never break the widget.

### WordPress

Upload `faq-chat-widget.min.js` and `faq.json` to `wp-content/uploads/faq-chat/`, then either paste the `<script>` tag into a header/footer snippet plugin, or copy [`wordpress/faq-chat-widget.php`](wordpress/faq-chat-widget.php) into `wp-content/mu-plugins/` and edit the WhatsApp number.

## FAQ format

```json
[
  {
    "id": "pricing",
    "suggested": true,
    "question": { "en": "How much does a website cost?", "bn": "একটি ওয়েবসাইট বানাতে কত খরচ হয়?" },
    "answer":   { "en": "From 15,000 BDT.", "bn": "১৫,০০০ টাকা থেকে।" },
    "keywords": ["price", "cost", "দাম", "খরচ"],
    "links": [{ "label": "See services", "url": "https://saizul.com" }]
  }
]
```

`question`, `answer`, `keywords` and link `label` may each be a plain string or an object keyed by language. Keywords are the strongest signal; multi-word keywords count as phrases. Answers are rendered as plain text (never HTML), and only `http(s)`, `mailto` and `tel` links are allowed.

## How matching works

1. **Normalise**: lowercase, Unicode NFKC, Bangla/Arabic-Indic/Persian digits become ASCII (`৩০` = `30`), punctuation and the danda `।` removed, zero-width characters dropped, Latin accents stripped.
2. **Tokenise**: stopword removal (English and Bangla), light stemming (plurals, common Bangla endings such as `গুলো`, `টা`).
3. **Canonicalise synonyms**: built-in groups (price/cost/দাম, contact/ফোন, payment/বিকাশ, ...) plus your own.
4. **Score**: each query token is matched to question, keyword and answer tokens, weighted by IDF. Misspellings match through character-trigram Dice similarity and a small edit-distance rule. A phrase-similarity term and keyword-phrase bonus are added.
5. If the best score reaches `threshold` (0.4) it answers; otherwise it offers "did you mean" chips, then the human handoff.

Everything runs locally; no text leaves the browser unless the visitor chooses a handoff.

## Human handoff and secrets

- **WhatsApp**: opens `https://wa.me/<number>?text=<conversation>` in a new tab. Nothing is sent by the site itself.
- **Webhook**: the widget POSTs a JSON conversation payload to `data-webhook`.

**Never put secrets in the browser.** Anything in the page or script is public, so a signing key placed there would let anyone forge requests. The widget therefore posts to a *public* endpoint without credentials and does no signing. Put a small server in front, which validates the origin, rate-limits, signs the body with HMAC-SHA256 using a secret from its environment, and forwards to n8n or your CRM with an `X-Signature: sha256=<hex>` header. A runnable reference is in [`server-example/signing-proxy.mjs`](server-example/signing-proxy.mjs):

```bash
SIGNING_SECRET=... TARGET_URL=https://n8n.example.com/webhook/faq-handoff \
ALLOWED_ORIGIN=https://example.com node server-example/signing-proxy.mjs
```

Verify on the receiving side by recomputing HMAC-SHA256 over the raw request body with the shared secret and comparing in constant time (n8n: a Crypto node plus an IF node). Treat the payload as untrusted user input; the origin check only stops casual abuse, since any client can fake headers.

Payload shape: `{ version, type: "faq-chat-handoff", createdAt, lang, page: {url, title}, contact, messages: [{role, text, at}] }`.

## Theming

Set CSS variables on the host element from your own stylesheet:

```css
#faq-chat-widget-root {
  --fcw-primary: #7c3aed;
  --fcw-on-primary: #fff;
  --fcw-radius: 12px;
  --fcw-width: 400px;
  --fcw-offset: 24px;
}
```

Other variables: `--fcw-bg`, `--fcw-surface`, `--fcw-text`, `--fcw-muted`, `--fcw-border`, `--fcw-font`, `--fcw-z`.

## Bangla (বাংলা)

এটি একটি হালকা, কোনো ডিপেন্ডেন্সি ছাড়া চ্যাট উইজেট। আপনার ওয়েবসাইটে একটি `<script>` ট্যাগ বসালেই FAQ JSON থেকে দর্শকের প্রশ্নের উত্তর দেয়, বাংলা ও ইংরেজি দুটোতেই, বাংলা সংখ্যা (`৩০`) ও বানান ভুলসহ। উত্তর না পেলে দর্শক হোয়াটসঅ্যাপে (wa.me) অথবা আপনার ওয়েবহুকে (যেমন n8n) কথোপকথন পাঠাতে পারেন। **ব্রাউজারে কোনো সিক্রেট বা API কী রাখবেন না**; HMAC সিগনেচার সার্ভারে (`server-example/`) তৈরি করুন।

## Development

```bash
npm install
npm run check            # lint + tests (node --test) + build
npm run build && npm run serve   # demo at http://localhost:8080
```

## License

MIT (c) Saizul Amin, https://saizul.com

## Install from GitHub Packages

Releases are published to [GitHub Packages](https://github.com/saizul/faq-chat-widget/pkgs/npm/faq-chat-widget) as `@saizul/faq-chat-widget`:

```bash
echo "@saizul:registry=https://npm.pkg.github.com" >> .npmrc
npm install @saizul/faq-chat-widget
```

GitHub Packages needs a personal access token with `read:packages` in your `~/.npmrc` (`//npm.pkg.github.com/:_authToken=YOUR_TOKEN`).
