/**
 * pi-en-trainer
 *
 * After each Chinese prompt is submitted, shows the English translation
 * in a widget BELOW the editor — without blocking prompt delivery and
 * without touching the LLM context at all.
 *
 * Flow:
 *   1. User submits Chinese prompt
 *   2. Prompt goes to agent immediately (no delay)
 *   3. Translation runs in background via cheap model
 *   4. Widget below editor updates: "🇬🇧  <English translation>"
 *
 * Configuration via /extension-settings:
 *   en-trainer / translation-model  (default: github-copilot/claude-haiku-4.5)
 *   en-trainer / enabled            (on | off)
 *
 * Commands:
 *   /en-trainer   toggle on/off
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { getSetting, setSetting } from "@juanibiapina/pi-extension-settings";
import type { SettingDefinition } from "@juanibiapina/pi-extension-settings";

import { detectChinese } from "./detector.js";
import { translateToEnglish } from "./translator.js";

const EXT_NAME = "en-trainer";
const WIDGET_KEY = "en-trainer-translation";
const DEFAULT_MODEL = "github-copilot/claude-haiku-4.5";

export default function enTrainer(pi: ExtensionAPI) {
	// Cancel any in-progress translation when a new prompt arrives
	let translationController: AbortController | null = null;

	// ── Settings registration ─────────────────────────────────────────────────
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
			},
		] satisfies SettingDefinition[],
	});

	// ── /en-trainer command ───────────────────────────────────────────────────
	pi.registerCommand("en-trainer", {
		description: "Toggle EN Trainer on/off",
		handler: async (_args, ctx) => {
			const current = getSetting(EXT_NAME, "enabled", "on");
			const next = current === "on" ? "off" : "on";
			setSetting(EXT_NAME, "enabled", next);
			if (next === "off") ctx.ui.setWidget(WIDGET_KEY, undefined);
			ctx.ui.notify(
				`EN Trainer: ${next === "on" ? "✓ on" : "✗ off"}`,
				next === "on" ? "info" : "warning",
			);
		},
	});

	// ── input event ──────────────────────────────────────────────────────────
	// Returns immediately — prompt is never delayed.
	// Translation runs in the background; widget updates when it completes.
	pi.on("input", async (event, ctx) => {
		// Abort any previous in-flight translation
		translationController?.abort();
		translationController = null;

		if (event.source === "extension") return { action: "continue" };

		if (getSetting(EXT_NAME, "enabled", "on") !== "on") {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return { action: "continue" };
		}

		if (!detectChinese(event.text).isChinese) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return { action: "continue" };
		}

		const modelSetting = getSetting(EXT_NAME, "translation-model", DEFAULT_MODEL);
		const textToTranslate = event.text;

		// Show "translating…" immediately (above editor, default placement)
		ctx.ui.setWidget(
			WIDGET_KEY,
			(_tui, theme) => new Text(
				theme.fg("dim", "─── 🇬🇧  ") + theme.fg("muted", "translating…"),
				0, 0,
			),
		);

		// Start translation — fire and forget
		const controller = new AbortController();
		translationController = controller;

		translateToEnglish(
			textToTranslate,
			{ modelRegistry: ctx.modelRegistry, signal: controller.signal },
			modelSetting,
		)
			.then((translation) => {
				if (controller.signal.aborted) return; // stale result, discard
				ctx.ui.setWidget(
					WIDGET_KEY,
					(_tui, theme) => new Text(
						theme.fg("dim", "─── 🇬🇧  ") + theme.fg("accent", translation),
						0, 0,
					),
				);
			})
			.catch((err) => {
				if (controller.signal.aborted) return;
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.setWidget(
					WIDGET_KEY,
					(_tui, theme) => new Text(
						theme.fg("dim", "─── 🇬🇧  ") + theme.fg("warning", `⚠  ${msg}`),
						0, 0,
					),
				);
			});

		// Return immediately — no waiting for translation
		return { action: "continue" };
	});
}
