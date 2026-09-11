import test from "node:test";
import assert from "node:assert/strict";

import { buildModelStatusSnapshotFromRecords, isProClassModelSpec } from "../src/model/catalog.js";

test("buildModelStatusSnapshotFromRecords returns empty guidance when model is set and valid", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[{ provider: "anthropic", id: "claude-opus-4-6" }],
		[{ provider: "anthropic", id: "claude-opus-4-6" }],
		"anthropic/claude-opus-4-6",
	);

	assert.equal(snapshot.currentValid, true);
	assert.equal(snapshot.current, "anthropic/claude-opus-4-6");
	assert.equal(snapshot.guidance.length, 0);
});

test("buildModelStatusSnapshotFromRecords emits guidance when no models are available", () => {
	const snapshot = buildModelStatusSnapshotFromRecords([], [], undefined);

	assert.equal(snapshot.currentValid, false);
	assert.equal(snapshot.current, undefined);
	assert.equal(snapshot.recommended, undefined);
	assert.ok(snapshot.guidance.some((line) => line.includes("No authenticated Pi models")));
	assert.ok(snapshot.guidance.some((line) => line.includes("feynman model login <provider>")));
	assert.ok(snapshot.guidance.some((line) => line.includes("feynman model list")));
	assert.ok(snapshot.guidance.every((line) => !line.includes("feynman setup model")));
});

test("buildModelStatusSnapshotFromRecords emits guidance when no default model is set", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[{ provider: "openai", id: "gpt-5.5" }],
		[{ provider: "openai", id: "gpt-5.5" }],
		undefined,
	);

	assert.equal(snapshot.currentValid, false);
	assert.equal(snapshot.current, undefined);
	assert.ok(snapshot.guidance.some((line) => line.includes("No default research model")));
	assert.ok(snapshot.guidance.some((line) => line.includes("feynman model set <provider/model>")));
	assert.ok(snapshot.guidance.some((line) => line.includes("feynman model list")));
	assert.ok(snapshot.guidance.every((line) => !line.includes("feynman setup model")));
});

test("buildModelStatusSnapshotFromRecords does not suggest setup model for Pro-only auth", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[{ provider: "test-provider", id: "sample-pro-model" }],
		[{ provider: "test-provider", id: "sample-pro-model" }],
		undefined,
	);

	assert.equal(snapshot.currentValid, false);
	assert.ok(snapshot.guidance.some((line) => line.includes("Pro-class models are disabled")));
	assert.ok(snapshot.guidance.some((line) => line.includes("feynman model list")));
	assert.ok(snapshot.guidance.every((line) => !line.includes("feynman setup model")));
});

test("buildModelStatusSnapshotFromRecords excludes Pro-class provider and model strings from recommendations", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "test-pro-provider", id: "sample-model" },
			{ provider: "test-provider", id: "sample-pro-model" },
			{ provider: "openai", id: "gpt-5.5" },
		],
		[
			{ provider: "test-pro-provider", id: "sample-model" },
			{ provider: "test-provider", id: "sample-pro-model" },
			{ provider: "openai", id: "gpt-5.5" },
		],
		undefined,
	);

	assert.deepEqual(snapshot.availableModels, ["openai/gpt-5.5"]);
	assert.equal(snapshot.recommended, "openai/gpt-5.5");
});

test("DeepSeek V4 Pro IDs remain available while genuine premium Pro models stay blocked", () => {
	for (const spec of [
		"deepseek/deepseek-v4-pro",
		"baseten/deepseek-ai/DeepSeek-V4-Pro",
		"fireworks/accounts/fireworks/models/deepseek-v4-pro",
		"openrouter/deepseek/deepseek-v4-pro",
		"requesty/deepseek-v4-pro",
	]) {
		assert.equal(isProClassModelSpec(spec), false, spec);
	}
	assert.equal(isProClassModelSpec("google/gemini-3.1-pro"), true);
	assert.equal(isProClassModelSpec("openai/o1-pro"), true);
	assert.equal(isProClassModelSpec("vendor/not-deepseek-v4-pro"), true);
	const previousBypass = process.env.FEYNMAN_ALLOW_PRO_MODELS;
	try {
		process.env.FEYNMAN_ALLOW_PRO_MODELS = "google/gemini-3.1-pro";
		assert.equal(isProClassModelSpec("google/gemini-3.1-pro"), true);
	} finally {
		if (previousBypass === undefined) delete process.env.FEYNMAN_ALLOW_PRO_MODELS;
		else process.env.FEYNMAN_ALLOW_PRO_MODELS = previousBypass;
	}

	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "nebius", id: "deepseek-ai/DeepSeek-V4-Pro" },
			{ provider: "google", id: "gemini-3.1-pro" },
		],
		[
			{ provider: "nebius", id: "deepseek-ai/DeepSeek-V4-Pro" },
			{ provider: "google", id: "gemini-3.1-pro" },
		],
		undefined,
	);

	assert.deepEqual(snapshot.availableModels, ["nebius/deepseek-ai/DeepSeek-V4-Pro"]);
	assert.equal(snapshot.recommended, "nebius/deepseek-ai/DeepSeek-V4-Pro");
});

test("buildModelStatusSnapshotFromRecords marks provider as configured only when it has available models", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "openai", id: "gpt-5.5" },
		],
		[{ provider: "openai", id: "gpt-5.5" }],
		"openai/gpt-5.5",
	);

	const anthropicProvider = snapshot.providers.find((provider) => provider.id === "anthropic");
	const openaiProvider = snapshot.providers.find((provider) => provider.id === "openai");

	assert.ok(anthropicProvider);
	assert.equal(anthropicProvider!.configured, false);
	assert.equal(anthropicProvider!.supportedModels, 1);
	assert.equal(anthropicProvider!.availableModels, 0);

	assert.ok(openaiProvider);
	assert.equal(openaiProvider!.configured, true);
	assert.equal(openaiProvider!.supportedModels, 1);
	assert.equal(openaiProvider!.availableModels, 1);
});

test("buildModelStatusSnapshotFromRecords marks provider as current when selected model belongs to it", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "openai", id: "gpt-5.5" },
		],
		[
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "openai", id: "gpt-5.5" },
		],
		"anthropic/claude-opus-4-6",
	);

	const anthropicProvider = snapshot.providers.find((provider) => provider.id === "anthropic");
	const openaiProvider = snapshot.providers.find((provider) => provider.id === "openai");

	assert.equal(anthropicProvider!.current, true);
	assert.equal(openaiProvider!.current, false);
});

test("buildModelStatusSnapshotFromRecords returns available models sorted by research preference", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "openai", id: "gpt-5.5" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-7" },
			{ provider: "anthropic", id: "claude-opus-4-8" },
		],
		[
			{ provider: "openai", id: "gpt-5.5" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-7" },
			{ provider: "anthropic", id: "claude-opus-4-8" },
		],
		undefined,
	);

	assert.equal(snapshot.availableModels[0], "anthropic/claude-opus-4-8");
	assert.equal(snapshot.availableModels[1], "anthropic/claude-opus-4-7");
	assert.equal(snapshot.availableModels[2], "anthropic/claude-opus-4-6");
	assert.equal(snapshot.availableModels[3], "openai/gpt-5.5");
	assert.equal(snapshot.availableModels.length, 4);
	assert.equal(snapshot.recommended, "anthropic/claude-opus-4-8");
});

test("buildModelStatusSnapshotFromRecords prefers current OpenCode Zen models over older Zen fallbacks", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "opencode", id: "gpt-5.5" },
			{ provider: "opencode", id: "claude-opus-4-6" },
			{ provider: "opencode", id: "claude-opus-4-8" },
			{ provider: "opencode", id: "kimi-k2.6" },
		],
		[
			{ provider: "opencode", id: "gpt-5.5" },
			{ provider: "opencode", id: "claude-opus-4-6" },
			{ provider: "opencode", id: "claude-opus-4-8" },
			{ provider: "opencode", id: "kimi-k2.6" },
		],
		undefined,
	);

	assert.equal(snapshot.availableModels[0], "opencode/claude-opus-4-8");
	assert.equal(snapshot.availableModels[1], "opencode/claude-opus-4-6");
	assert.equal(snapshot.availableModels[2], "opencode/gpt-5.5");
	assert.equal(snapshot.availableModels[3], "opencode/kimi-k2.6");
	assert.equal(snapshot.recommended, "opencode/claude-opus-4-8");
});

test("buildModelStatusSnapshotFromRecords prefers the newest OpenRouter OpenAI GPT fallback", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "openrouter", id: "openai/gpt-5.4" },
			{ provider: "openrouter", id: "openai/gpt-5.5" },
			{ provider: "openrouter", id: "openai/gpt-5.3-codex" },
		],
		[
			{ provider: "openrouter", id: "openai/gpt-5.4" },
			{ provider: "openrouter", id: "openai/gpt-5.5" },
			{ provider: "openrouter", id: "openai/gpt-5.3-codex" },
		],
		undefined,
	);

	assert.equal(snapshot.availableModels[0], "openrouter/openai/gpt-5.5");
	assert.equal(snapshot.availableModels[1], "openrouter/openai/gpt-5.4");
	assert.equal(snapshot.availableModels[2], "openrouter/openai/gpt-5.3-codex");
	assert.equal(snapshot.recommended, "openrouter/openai/gpt-5.5");
	assert.match(snapshot.recommendationReason ?? "", /newest OpenRouter OpenAI GPT fallback/);
});

test("buildModelStatusSnapshotFromRecords prefers the OpenCode Go default lineup", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "opencode-go", id: "glm-5" },
			{ provider: "opencode-go", id: "glm-5.1" },
			{ provider: "opencode-go", id: "kimi-k2.6" },
			{ provider: "opencode-go", id: "minimax-m2.7" },
		],
		[
			{ provider: "opencode-go", id: "glm-5" },
			{ provider: "opencode-go", id: "glm-5.1" },
			{ provider: "opencode-go", id: "kimi-k2.6" },
			{ provider: "opencode-go", id: "minimax-m2.7" },
		],
		undefined,
	);

	assert.equal(snapshot.availableModels[0], "opencode-go/kimi-k2.6");
	assert.equal(snapshot.availableModels[1], "opencode-go/glm-5.1");
	assert.equal(snapshot.availableModels[2], "opencode-go/minimax-m2.7");
	assert.equal(snapshot.availableModels[3], "opencode-go/glm-5");
	assert.equal(snapshot.recommended, "opencode-go/kimi-k2.6");
});

test("buildModelStatusSnapshotFromRecords sorts OpenCode providers with first-class providers", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "xai", id: "grok-4" },
			{ provider: "opencode-go", id: "kimi-k2.6" },
			{ provider: "opencode", id: "gpt-5.5" },
			{ provider: "google", id: "gemini-3-flash" },
		],
		[],
		undefined,
	);

	assert.deepEqual(snapshot.providers.map((provider) => provider.id), [
		"opencode",
		"opencode-go",
		"google",
		"xai",
	]);
});

test("buildModelStatusSnapshotFromRecords prefers MiniMax M3 over M2.7 when both are available", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "minimax", id: "MiniMax-M2.7" },
			{ provider: "minimax", id: "MiniMax-M3" },
		],
		[
			{ provider: "minimax", id: "MiniMax-M2.7" },
			{ provider: "minimax", id: "MiniMax-M3" },
		],
		undefined,
	);

	assert.equal(snapshot.availableModels[0], "minimax/MiniMax-M3");
	assert.equal(snapshot.availableModels[1], "minimax/MiniMax-M2.7");
	assert.equal(snapshot.recommended, "minimax/MiniMax-M3");
});

test("buildModelStatusSnapshotFromRecords sets currentValid false when current model is not in available list", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[{ provider: "anthropic", id: "claude-opus-4-6" }],
		[],
		"anthropic/claude-opus-4-6",
	);

	assert.equal(snapshot.currentValid, false);
	assert.equal(snapshot.current, "anthropic/claude-opus-4-6");
});
