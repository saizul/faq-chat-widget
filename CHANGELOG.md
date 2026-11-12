# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Opt-in analytics hook: an `onEvent` callback and a bubbling `faq-chat-widget:event`
  CustomEvent for `open`, `close`, `question` and `handoff`.
- Opt-in conversation persistence across page loads (`persist: "session" | "local"`,
  `data-persist`, `persistTtl` / `data-persist-ttl`, `persistKey`): restores messages, UI
  language and open state, with expiry, size caps and validation of stored data; links are
  re-resolved from the FAQ by id. Adds a "Start a new conversation" header button (when
  enabled) and `widget.clearHistory()`. Falls back silently when storage is blocked.

## [0.1.0] - 2026-11-08

### Added
- Local FAQ matcher: normalisation (Bangla/Arabic/Persian digits to ASCII, danda, accents),
  light stemming, stopwords, cross-language synonym groups, IDF-weighted token scoring,
  trigram (Dice) and edit-distance typo tolerance.
- Chat widget in Shadow DOM: suggested questions, quick-reply chips, "did you mean",
  ARIA live log, keyboard support, focus trap, Escape to close, RTL-safe logical CSS.
- Human handoff via WhatsApp (wa.me) or a public webhook endpoint; example signing proxy.
- English and Bangla UI strings with per-key overrides and extra languages.
- One-tag install with `data-*` attributes, WordPress snippet, demo page, GitHub Pages deploy.
