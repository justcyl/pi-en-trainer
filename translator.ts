/**
 * translator.ts
 * Translate Chinese text to English using the configured cheap model
 * via pi's built-in complete() helper (reuses existing API credentials).
 */

import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const SYSTEM_PROMPT = `You are a prompt engineer assistant. Given a Chinese instruction intended for an AI coding agent, do two things in one pass:

1. Translate it to English
2. Polish it to be clearer and more actionable:
   - Use imperative mood ("Implement", "Refactor", "Fix", "Add", "Extract")
   - Add specificity where the original is vague (e.g. "写个排序" → "Implement an efficient sorting function")
   - Preserve all technical terms, identifiers, file names, and code snippets as-is
   - Do NOT add requirements not implied by the original

Output ONLY the final polished English prompt. No explanation, no quotes, no preamble.`;

/**
 * Parse a "provider/model-id" string.
 * Handles IDs that themselves contain slashes (e.g. "github-copilot/claude-haiku-4.5").
 */
function parseModelSetting(setting: string): { provider: string; modelId: string } | null {
	const idx = setting.indexOf("/");
	if (idx === -1) return null;
	return {
		provider: setting.slice(0, idx),
		modelId: setting.slice(idx + 1),
	};
}

export async function translateToEnglish(
	text: string,
	ctx: Pick<ExtensionContext, "modelRegistry" | "signal">,
	modelSetting: string,
): Promise<string> {
	const parsed = parseModelSetting(modelSetting);
	if (!parsed) {
		throw new Error(`Invalid translation-model format: "${modelSetting}" (expected "provider/model-id")`);
	}

	const model = ctx.modelRegistry.find(parsed.provider, parsed.modelId);
	if (!model) {
		throw new Error(`Model not found: ${modelSetting}. Check /extension-settings → en-trainer → translation-model`);
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		throw new Error(`No API key available for model: ${modelSetting}`);
	}

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};

	const response = await complete(
		model,
		{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal },
	);

	if (response.stopReason === "aborted") {
		throw new Error("Translation cancelled");
	}

	const result = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("")
		.trim();

	if (!result) {
		throw new Error("Translation returned empty result");
	}

	return result;
}
