# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

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
