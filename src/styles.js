// All CSS lives inside the shadow root. Theme through CSS variables:
// set them on #faq-chat-widget-root (or any ancestor) from your site CSS.
export const CSS = `
:host {
  all: initial;
  --fcw-primary: #0b7a5b;
  --fcw-on-primary: #ffffff;
  --fcw-bg: #ffffff;
  --fcw-surface: #f1f4f6;
  --fcw-text: #14212b;
  --fcw-muted: #566673;
  --fcw-border: #d5dce2;
  --fcw-user-bg: var(--fcw-primary);
  --fcw-user-text: var(--fcw-on-primary);
  --fcw-radius: 16px;
  --fcw-font: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", "Hind Siliguri", sans-serif;
  --fcw-z: 2147483000;
  --fcw-offset: 20px;
  --fcw-width: 370px;
  --fcw-height: 560px;
  font-family: var(--fcw-font);
  color: var(--fcw-text);
}
:host([data-theme="dark"]) {
  --fcw-bg: #161c22; --fcw-surface: #222b33; --fcw-text: #eaf0f4; --fcw-muted: #a3b2be; --fcw-border: #34414b;
  --fcw-on-primary: #04130e;
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) {
    --fcw-bg: #161c22; --fcw-surface: #222b33; --fcw-text: #eaf0f4; --fcw-muted: #a3b2be; --fcw-border: #34414b;
    --fcw-on-primary: #04130e;
  }
}
*, *::before, *::after { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }
.root { position: fixed; inset-block-end: var(--fcw-offset); z-index: var(--fcw-z); font-size: 15px; line-height: 1.45; }
.root[data-position="end"] { inset-inline-end: var(--fcw-offset); }
.root[data-position="start"] { inset-inline-start: var(--fcw-offset); }

.launcher {
  display: grid; place-items: center; width: 58px; height: 58px; border: 0; border-radius: 50%;
  background: var(--fcw-primary); color: var(--fcw-on-primary); cursor: pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,.28); transition: transform .15s ease;
}
.launcher:hover { transform: scale(1.06); }
.launcher svg { width: 28px; height: 28px; fill: currentColor; }
.root[data-open="true"] .launcher { display: none; }

.panel {
  display: none; flex-direction: column; width: min(var(--fcw-width), calc(100vw - 2 * var(--fcw-offset)));
  height: min(var(--fcw-height), calc(100dvh - 2 * var(--fcw-offset)));
  background: var(--fcw-bg); border: 1px solid var(--fcw-border); border-radius: var(--fcw-radius);
  box-shadow: 0 12px 40px rgba(0,0,0,.28); overflow: hidden;
}
.root[data-open="true"] .panel { display: flex; }

.header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: var(--fcw-primary); color: var(--fcw-on-primary); }
.header h2 { margin: 0; font-size: 16px; font-weight: 650; }
.header p { margin: 2px 0 0; font-size: 12.5px; opacity: .92; }
.header .grow { flex: 1; min-width: 0; }
.icon-btn { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 6px; border-radius: 8px; line-height: 0; }
.icon-btn:hover { background: rgba(255,255,255,.18); }
.icon-btn svg { width: 20px; height: 20px; fill: currentColor; }

.log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--fcw-bg); scroll-behavior: smooth; }
.msg { max-width: 86%; padding: 9px 12px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.bot { align-self: flex-start; background: var(--fcw-surface); border-end-start-radius: 4px; }
.msg.user { align-self: flex-end; background: var(--fcw-user-bg); color: var(--fcw-user-text); border-end-end-radius: 4px; }
.msg a { color: inherit; font-weight: 600; text-decoration: underline; }
.links { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.chips-label { font-size: 12.5px; color: var(--fcw-muted); margin: 2px 2px -4px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  border: 1px solid var(--fcw-primary); background: transparent; color: var(--fcw-primary);
  padding: 6px 12px; border-radius: 999px; cursor: pointer; font-size: 13.5px; text-align: start;
}
.chip:hover { background: var(--fcw-primary); color: var(--fcw-on-primary); }
.chip.human { border-color: var(--fcw-border); color: var(--fcw-text); }
.chip.human:hover { background: var(--fcw-surface); color: var(--fcw-text); }

.typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--fcw-muted); animation: fcw-blink 1s infinite ease-in-out; }
.typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
@keyframes fcw-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }

.form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--fcw-border); background: var(--fcw-bg); }
.form input[type="text"], .contact input {
  flex: 1; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--fcw-border); background: var(--fcw-bg);
}
.send, .submit { border: 0; border-radius: 10px; padding: 0 14px; background: var(--fcw-primary); color: var(--fcw-on-primary); cursor: pointer; font-weight: 600; }
.contact { display: grid; gap: 8px; }
.contact label { font-size: 13px; color: var(--fcw-muted); }
.contact .row { display: flex; gap: 8px; }
.contact .submit { padding: 8px 14px; }

button:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
button[disabled] { opacity: .6; cursor: default; }

@media (max-width: 480px) {
  .root { --fcw-offset: 12px; }
  .panel { width: calc(100vw - 24px); }
}
@media (prefers-reduced-motion: reduce) {
  .launcher, .typing i { transition: none; animation: none; }
  .log { scroll-behavior: auto; }
}
`;
