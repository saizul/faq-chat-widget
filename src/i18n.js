// UI strings. Add a language by passing `strings: { xx: {...} }` to init().

export const STRINGS = {
  en: {
    title: "Chat with us",
    subtitle: "Ask a question and get an instant answer",
    launcher: "Open chat",
    close: "Close chat",
    placeholder: "Type your question…",
    send: "Send",
    greeting: "Hi! Ask me anything or pick a question below.",
    suggested: "Suggested questions",
    related: "You might also want to know",
    didYouMean: "I am not sure I understood. Did you mean one of these?",
    noMatch: "Sorry, I could not find an answer. You can talk to a person instead.",
    talkHuman: "Talk to a human",
    handoffChoose: "How would you like to reach our team?",
    viaWhatsapp: "Chat on WhatsApp",
    viaForm: "Send this chat to our team",
    contactLabel: "Your phone or email (optional)",
    submit: "Send",
    sending: "Sending…",
    sent: "Thanks! Our team has your conversation and will reply soon.",
    failed: "Could not send. Please try WhatsApp or try again later.",
    whatsappIntro: "Hello! I need help. My conversation from the website chat:",
    you: "You",
    bot: "Assistant",
    links: "Helpful links",
    poweredBy: "Local FAQ chat",
  },
  bn: {
    title: "আমাদের সাথে চ্যাট করুন",
    subtitle: "প্রশ্ন করুন, সঙ্গে সঙ্গে উত্তর পান",
    launcher: "চ্যাট খুলুন",
    close: "চ্যাট বন্ধ করুন",
    placeholder: "আপনার প্রশ্ন লিখুন…",
    send: "পাঠান",
    greeting: "হ্যালো! যেকোনো প্রশ্ন করুন অথবা নিচ থেকে একটি বেছে নিন।",
    suggested: "প্রস্তাবিত প্রশ্ন",
    related: "আপনি এগুলোও জানতে চাইতে পারেন",
    didYouMean: "ঠিক বুঝতে পারিনি। আপনি কি এগুলোর কোনোটি বোঝাতে চেয়েছেন?",
    noMatch: "দুঃখিত, উত্তর খুঁজে পাইনি। আপনি চাইলে একজন মানুষের সাথে কথা বলতে পারেন।",
    talkHuman: "মানুষের সাথে কথা বলুন",
    handoffChoose: "আমাদের টিমের সাথে কীভাবে যোগাযোগ করতে চান?",
    viaWhatsapp: "হোয়াটসঅ্যাপে চ্যাট করুন",
    viaForm: "এই চ্যাট আমাদের টিমকে পাঠান",
    contactLabel: "আপনার ফোন বা ইমেইল (ঐচ্ছিক)",
    submit: "পাঠান",
    sending: "পাঠানো হচ্ছে…",
    sent: "ধন্যবাদ! আমাদের টিম আপনার কথোপকথন পেয়েছে, শীঘ্রই উত্তর দেবে।",
    failed: "পাঠানো যায়নি। অনুগ্রহ করে হোয়াটসঅ্যাপে চেষ্টা করুন বা পরে আবার চেষ্টা করুন।",
    whatsappIntro: "হ্যালো! আমার সাহায্য দরকার। ওয়েবসাইট চ্যাটে আমার কথোপকথন:",
    you: "আপনি",
    bot: "সহকারী",
    links: "দরকারি লিংক",
    poweredBy: "লোকাল FAQ চ্যাট",
  },
};

const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi", "dv", "ku"]);

/** Reduce "bn-BD" / "EN_us" to a primary subtag such as "bn". */
export function primaryLang(code) {
  return String(code ?? "").toLowerCase().split(/[-_]/)[0] || "en";
}

/** Text direction for a language code. */
export function getDir(lang) {
  return RTL_LANGS.has(primaryLang(lang)) ? "rtl" : "ltr";
}

/** Pick a supported language, falling back to `fallback` (default "en"). */
export function resolveLang(code, available = Object.keys(STRINGS), fallback = "en") {
  const p = primaryLang(code);
  return available.includes(p) ? p : fallback;
}

/** Merge user overrides onto the built-in strings (per language, per key). */
export function mergeStrings(overrides = {}) {
  const out = {};
  for (const lang of new Set([...Object.keys(STRINGS), ...Object.keys(overrides)])) {
    out[lang] = { ...(STRINGS[lang] ?? {}), ...(overrides[lang] ?? {}) };
  }
  return out;
}

/** Translate `key`, interpolating `{name}` style variables. Falls back to English, then the key. */
export function t(strings, lang, key, vars = {}) {
  const raw = strings[primaryLang(lang)]?.[key] ?? strings.en?.[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
