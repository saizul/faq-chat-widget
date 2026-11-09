// Opt-in analytics hook. The widget never sends anything itself: it only calls
// the `onEvent` callback you pass and dispatches a DOM CustomEvent, so you decide
// where (if anywhere) the data goes.

export const EVENT_NAME = "faq-chat-widget:event";

/**
 * Create an `emit(type, data)` function.
 *  - `onEvent(event)` is called with `{ type, at, ...data }`.
 *  - the same object is dispatched as the `detail` of a bubbling, composed
 *    CustomEvent named "faq-chat-widget:event" on `target` (when given).
 * Errors thrown by a listener are caught so analytics can never break the widget.
 */
export function createEmitter({ onEvent, target } = {}) {
  return function emit(type, data = {}) {
    const event = { type, at: new Date().toISOString(), ...data };
    if (typeof onEvent === "function") {
      try {
        onEvent(event);
      } catch (err) {
        console.error("[faq-chat-widget] onEvent handler failed:", err);
      }
    }
    if (target && typeof CustomEvent === "function") {
      try {
        target.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event, bubbles: true, composed: true }));
      } catch (err) {
        console.error("[faq-chat-widget] event dispatch failed:", err);
      }
    }
    return event;
  };
}
