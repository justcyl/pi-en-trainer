/**
 * pi-en-trainer
 *
 * After each Chinese prompt, shows a polished English translation as a
 * custom message in the conversation — appearing BEFORE the agent's response,
 * but never sent to the LLM context.
 *
 * Async design (no perceived delay at prompt submission):
 *   1. `input` event:            detect Chinese → start translation in background
 *                                → return immediately (prompt appears right away)
 *   2. `before_agent_start`:     await the already-running translation promise
 *                                → inject it as a display-only custom message
 *   3. `context` event:          filter the translation message out before LLM call
 *
 * Configuration via /extension-settings:
 *   en-trainer / translation-model  (default: github-copilot/claude-haiku-4.5)
 *   en-trainer / enabled            (on | off)
 *
 * Commands:
 *   /en-trainer   toggle on/off
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { getSetting, setSetting } from "@juanibiapina/pi-extension-settings";
import type { SettingDefinition } from "@juanibiapina/pi-extension-settings";

import { detectChinese } from "./detector.js";
import { translateToEnglish } from "./translator.js";

const EXT_NAME = "en-trainer";
const CUSTOM_TYPE = "en-trainer-translation";
const DEFAULT_MODEL = "github-copilot/claude-haiku-4.5";

export default function enTrainer(pi: ExtensionAPI) {
	// Holds the in-flight translation promise started in `input`.
	// before_agent_start awaits this to inject the result before the agent runs.
	let translationPromise: Promise<string> | null = null;

	// ── Settings registration ─────────────────────────────────────────────────
	pi.events.emit("pi-extension-settings:register", {
		name: EXT_NAME,
		settings: [
			{
				id: "enabled",
				label: "Enabled",
				description: "Show English translation before agent responses",
				defaultValue: "on",
				values: ["on", "off"],
			},
			{
				id: "translation-model",
				label: "Translation Model",
				description: 'Model used for translation (format: "provider/model-id"). Use a cheap/fast model.',
				defaultValue: DEFAULT_MODEL,
			},
			{
				id: "max-length",
				label: "Max Prompt Length",
				description: "Skip translation when prompt exceeds this character count (0 = no limit)",
				defaultValue: "300",
			},
		] satisfies SettingDefinition[],
	});

	// ── Custom message renderer ───────────────────────────────────────────────
	// Renders the translation annotation with DynamicBorder + Container.
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, _opts, theme) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));
		container.addChild(
			new Text(theme.fg("muted", "🇬🇧  ") + theme.fg("accent", message.content as string), 1, 0),
		);
		return container;
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
	// Returns immediately so the prompt appears in the conversation without
	// delay. Translation is kicked off in the background; before_agent_start
	// will await it.
	pi.on("input", async (event, ctx) => {
		translationPromise = null;

		if (event.source === "extension") return { action: "continue" };
		if (getSetting(EXT_NAME, "enabled", "on") !== "on") return { action: "continue" };
		const maxLen = Number(getSetting(EXT_NAME, "max-length", "300"));
		if (maxLen > 0 && event.text.length > maxLen) return { action: "continue" };
		if (!detectChinese(event.text).isChinese) return { action: "continue" };

		const modelSetting = getSetting(EXT_NAME, "translation-model", DEFAULT_MODEL);

		// Fire translation — do NOT await. The promise runs while the rest of
		// the pipeline (input handling, before_agent_start) proceeds.
		translationPromise = translateToEnglish(event.text, ctx, modelSetting);

		return { action: "continue" }; // prompt sends immediately
	});

	// ── before_agent_start event ──────────────────────────────────────────────
	// The translation has been running since `input` fired. By the time this
	// event fires, a portion of the wait is already done. Await the remaining
	// time here and inject the result as a display-only message that appears
	// before the agent's response.
	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!translationPromise) return undefined;

		const promise = translationPromise;
		translationPromise = null;

		try {
			const translation = await promise;
			return {
				message: {
					customType: CUSTOM_TYPE,
					content: translation,
					display: true, // show in TUI, but filtered from LLM context below
				},
			};
		} catch {
			return undefined; // translation failed silently, agent runs normally
		}
	});

	// ── context event ─────────────────────────────────────────────────────────
	// Strip translation messages before every LLM call so the LLM never sees them.
	pi.on("context", async (event, _ctx) => {
		return {
			messages: event.messages.filter(
				(m) => !(m.type === "custom" && m.customType === CUSTOM_TYPE),
			),
		};
	});
}
