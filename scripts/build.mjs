import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

const common = { entryPoints: ["src/index.js"], bundle: true, target: "es2020", legalComments: "none", charset: "utf8" };

mkdirSync("dist", { recursive: true });
await build({ ...common, format: "iife", globalName: "FaqChatWidget", outfile: "dist/faq-chat-widget.js" });
await build({ ...common, format: "iife", globalName: "FaqChatWidget", minify: true, outfile: "dist/faq-chat-widget.min.js" });
await build({ ...common, format: "esm", outfile: "dist/faq-chat-widget.esm.js" });

// The demo page loads the widget from its own folder (also what GitHub Pages serves).
copyFileSync("dist/faq-chat-widget.min.js", "demo/faq-chat-widget.min.js");
console.log("built dist/ and demo/faq-chat-widget.min.js");
