/**
 * pi-en-trainer
 *
 * After each Chinese prompt, shows the English translation as an inline
 * annotation in the conversation view. The original prompt is sent to the
 * agent unchanged, and the translation is never injected into the LLM context.
 *
 * Configuration via /extension-settings:
 *   en-trainer / translation-model  (default: github-copilot/claude-haiku-4.5)
 *   en-trainer / enabled            (on | off)
 *
 * Commands:
 *   /en-trainer   toggle on/off
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { getSetting, setSetting } from "@juanibiapina/pi-extension-settings";
import type { SettingDefinition } from "@juanibiapina/pi-extension-settings";

import { detectChinese } from "./detector.js";
import { translateToEnglish } from "./translator.js";

const EXT_NAME = "en-trainer";
const CUSTOM_TYPE = "en-trainer-translation";
const DEFAULT_MODEL = "github-copilot/claude-haiku-4.5";

export default function enTrainer(pi: ExtensionAPI) {
	// ── State ─────────────────────────────────────────────────────────────────
	// Holds the translation computed during the `input` event so that
	// `before_agent_start` can inject it as a display-only message.
	let pendingTranslation: string | null = null;

	// ── Settings registration ─────────────────────────────────────────────────
	// Emitting this event makes the settings appear in /extension-settings UI.
	// Safe to emit even if pi-extension-settings isn't loaded (silently ignored).
	pi.events.emit("pi-extension-settings:register", {
		name: EXT_NAME,
		settings: [
			{
				id: "enabled",
				label: "Enabled",
				description: "Show English translation after Chinese prompts",
				defaultValue: "on",
				values: ["on", "off"],
			},
			{
				id: "translation-model",
				label: "Translation Model",
				description: 'Model used for translation (format: "provider/model-id"). Use a cheap/fast model.',
				defaultValue: DEFAULT_MODEL,
				// No `values` = free-form string input in /extension-settings UI
			},
		] satisfies SettingDefinition[],
	});

	// ── Custom message renderer ───────────────────────────────────────────────
	// Renders the translation annotation with a distinctive style.
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, _opts, theme) => {
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		const label = theme.fg("muted", "🇬🇧 EN  ");
		const content = theme.fg("accent", message.content as string);
		box.addChild(new Text(label + content, 0, 0));
		return box;
	});

	// ── /en-trainer command ───────────────────────────────────────────────────
	pi.registerCommand("en-trainer", {
		description: "Toggle EN Trainer on/off",
		handler: async (_args, ctx) => {
			const current = getSetting(EXT_NAME, "enabled", "on");
			const next = current === "on" ? "off" : "on";
			setSetting(EXT_NAME, "enabled", next);
			ctx.ui.notify(
				`EN Trainer: ${next === "on" ? "✓ on" : "✗ off"}`,
				next === "on" ? "info" : "warning",
			);
		},
	});

	// ── input event ──────────────────────────────────────────────────────────
	// Intercept the user's prompt, detect Chinese, and await translation.
	// Blocking here (~300-600ms) ensures the translation is ready before
	// before_agent_start fires. The original text is passed through unchanged.
	pi.on("input", async (event, ctx) => {
		pendingTranslation = null;

		// Skip extension-injected messages to avoid recursion
		if (event.source === "extension") return { action: "continue" };

		// Check enabled setting
		if (getSetting(EXT_NAME, "enabled", "on") !== "on") {
			return { action: "continue" };
		}

		// Detect Chinese
		const detection = detectChinese(event.text);
		if (!detection.isChinese) return { action: "continue" };

		const modelSetting = getSetting(EXT_NAME, "translation-model", DEFAULT_MODEL);

		// Show brief status while translating
		ctx.ui.setStatus(EXT_NAME, "🇬🇧 translating...");

		try {
			pendingTranslation = await translateToEnglish(event.text, ctx, modelSetting);
		} catch (err) {
			// Translation failure is non-fatal: original prompt still goes through
			const msg = err instanceof Error ? err.message : String(err);
			ctx.ui.notify(`EN Trainer: ${msg}`, "warning");
		} finally {
			ctx.ui.setStatus(EXT_NAME, undefined);
		}

		// Always pass the original prompt through, unchanged
		return { action: "continue" };
	});

	// ── before_agent_start event ──────────────────────────────────────────────
	// If we have a pending translation, inject it as a display-only custom
	// message in the conversation. It will be filtered out by the context
	// event before the LLM ever sees it.
	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!pendingTranslation) return undefined;

		const translation = pendingTranslation;
		pendingTranslation = null;

		return {
			message: {
				customType: CUSTOM_TYPE,
				content: translation,
				display: true,
			},
		};
	});

	// ── context event ─────────────────────────────────────────────────────────
	// Strip translation messages from the context sent to the LLM on every
	// turn. This is the key guard that keeps translations out of LLM context.
	pi.on("context", async (event, _ctx) => {
		const filtered = event.messages.filter(
			(m) => !(m.type === "custom" && m.customType === CUSTOM_TYPE),
		);
		return { messages: filtered };
	});
}
