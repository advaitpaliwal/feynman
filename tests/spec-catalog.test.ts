import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { KNOWN_MODEL_SPECS, lookupKnownModelSpec, parseTokenCountInput, UNKNOWN_MODEL_FALLBACK, specReasoningLevels, buildThinkingLevelMap } from "../src/model/spec-catalog.js";
import { promptModelSpecDefinitions } from "../src/model/commands.js";
import { upsertProviderConfig } from "../src/model/models-json.js";

test("lookupKnownModelSpec resolves every open-weight family the catalog documents", () => {
	const expected = [
		// open-weight families the catalog carries
		"deepseek-v4-pro",
		"kimi-k2.6",
		"glm-5.3",
		"qwen3.8-max",
		"qwen3.8-flash",
		"qwen3.8-flash-next",
		"mimo-v2.5",
		"hy3",
		"hy4-preview",
		"MiniMax-M3",
		"nvidia/nemotron-3-super-120b-a12b",
	];
	for (const id of expected) {
		assert.ok(lookupKnownModelSpec(id), `expected catalog hit for ${id}`);
	}
});

test("closed-weight model ids are absent from the catalog and prompt at setup", () => {
	// Closed-weight families never appear in the catalog: their providers
	// ship their own runtime registries, so their ids must miss here and be
	// handled as unknown (safe fallback prompts) rather than pre-filled.
	for (const id of ["gpt-5.6", "gpt-6-astra", "claude-opus-5", "claude-fable-5-1", "gemini-3.8-flash", "grok-5"]) {
		assert.equal(lookupKnownModelSpec(id), undefined, `${id} must not be cataloged`);
	}
	assert.ok(!KNOWN_MODEL_SPECS.some((spec) => /^(gpt-|claude-|gemini-|grok-)/i.test(spec.id)), "no closed-weight rows in the catalog");
});

test("lookupKnownModelSpec matches aliases and dated model ids case-insensitively", () => {
	assert.equal(lookupKnownModelSpec("KIMI-K3")?.id, "kimi-k3");
	assert.equal(lookupKnownModelSpec("k3")?.id, "kimi-k3");
	assert.equal(lookupKnownModelSpec("MiniMax-M2.7-highspeed")?.id, "MiniMax-M2.7");
	assert.equal(lookupKnownModelSpec("hy3-preview")?.label, "Hunyuan 3 (Tencent)");
	assert.equal(lookupKnownModelSpec("hy4-preview-fp8")?.label, "Hunyuan 4 (Tencent)");
	assert.equal(lookupKnownModelSpec("hunyuan-t3")?.id, "hy3");
	assert.equal(lookupKnownModelSpec("hunyuan-t4")?.id, "hy4-preview");
});

test("unknown model ids miss the catalog and fall back to safe defaults", () => {
	assert.equal(lookupKnownModelSpec("totally-made-up-model"), undefined);
	assert.equal(UNKNOWN_MODEL_FALLBACK.contextWindow, 128000);
	assert.equal(UNKNOWN_MODEL_FALLBACK.maxTokens, 16384);
	assert.equal(UNKNOWN_MODEL_FALLBACK.reasoning, false);
	assert.deepEqual(specReasoningLevels(undefined), []);
});

test("every catalog row documents its official source and positive limits", () => {
	for (const spec of KNOWN_MODEL_SPECS) {
		assert.ok(spec.sources.length > 0, `${spec.id} documents its source`);
		assert.ok((spec.contextWindow ?? Infinity) > 0, `${spec.id} context window is positive when documented`);
		assert.ok((spec.maxTokens ?? Infinity) > 0, `${spec.id} max tokens is positive when documented`);
	}
});

test("Hunyuan rows carry official context and efforts; Hy3 from the hosted catalog, Hy4 cap 64000", () => {
	const hy3 = lookupKnownModelSpec("hy3")!;
	assert.equal(hy3.contextWindow, 262144);
	// DeepInfra hosts tencent/Hy3 at 262144/262144 (cited source).
	assert.equal(hy3.maxTokens, 262144);
	assert.equal(hy3.reasoning, true);
	assert.equal(hy3.thinkingLevelMap?.off, "no_think");
	assert.equal(hy3.thinkingLevelMap?.high, "high");
	assert.equal(hy3.compat?.thinkingFormat, "chat-template");
	const hy4 = lookupKnownModelSpec("hy4-preview")!;
	assert.equal(hy4.contextWindow, 1048576);
	// Output cap per the captain's spec-catalog.ts update.
	assert.equal(hy4.maxTokens, 64000);
});

test("flagship rows keep officially documented effort levels and context caps", () => {
	// GLM-5.3 official docs: reasoning always on with effort low / high / max.
	const glm = lookupKnownModelSpec("glm-5.3")!;
	assert.equal(glm.contextWindow, 1048576);
	assert.equal(glm.maxTokens, 131072);
	assert.equal(glm.thinkingLevelMap?.max, "max");
	assert.deepEqual(specReasoningLevels(glm), ["low", "high", "max"]);

	// MiniMax-M3 context window per the captain's spec-catalog.ts update.
	assert.equal(lookupKnownModelSpec("MiniMax-M3")?.contextWindow, 1048576);

	// NVIDIA official specifications: 1M / 1M / 262K context windows.
	assert.equal(lookupKnownModelSpec("nvidia/nemotron-3-super-120b-a12b")?.contextWindow, 1048576);
	assert.equal(lookupKnownModelSpec("nvidia/nemotron-3-ultra-550b-a55b")?.contextWindow, 1048576);
	assert.equal(lookupKnownModelSpec("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")?.contextWindow, 262144);
});

test("non-existent highspeed aliases are absent and qwen3.8-flash-next carries its own doc-verified specs", () => {
	// The captain verified these highspeed ids do not exist.
	assert.equal(lookupKnownModelSpec("glm-5.3-highspeed"), undefined);
	assert.equal(lookupKnownModelSpec("glm-5.2-highspeed"), undefined);
	assert.equal(lookupKnownModelSpec("glm-5.3-flash")?.id, "glm-5.3");

	// qwen3.8-flash has its own official specs, distinct from qwen3.8-max.
	const flash = lookupKnownModelSpec("qwen3.8-flash")!;
	assert.equal(flash.contextWindow, 1000000);
	assert.equal(flash.maxTokens, 131072);
	assert.equal(lookupKnownModelSpec("qwen3.8-max")?.matches, undefined);

	// qwen3.8-flash-next is its own entry: 262,144 native context,
	// 131,072 final-response output, xhigh/medium/low efforts.
	const next = lookupKnownModelSpec("qwen3.8-flash-next")!;
	assert.equal(next.contextWindow, 262144);
	assert.equal(next.maxTokens, 131072);
	assert.equal(next.reasoning, true);
	assert.deepEqual(specReasoningLevels(next), ["low", "medium", "xhigh"]);
});

test("rows without vendor caps carry cited hosted-catalog values", () => {
	// DeepSeek hosted-catalog values: Novita's 393216 output cap applies
	// (captain-verified; deployments differ per source).
	const pro = lookupKnownModelSpec("deepseek-v4-pro")!;
	assert.equal(pro.contextWindow, 1048576);
	assert.equal(pro.maxTokens, 393216);
	assert.equal(lookupKnownModelSpec("deepseek-v4-flash")?.maxTokens, 393216);
	// Kimi rows: both hosted catalogs agree.
	assert.equal(lookupKnownModelSpec("kimi-k3")?.maxTokens, 1048576);
	assert.equal(lookupKnownModelSpec("kimi-k2.6")?.maxTokens, 262144);
	assert.equal(lookupKnownModelSpec("kimi-k2.7-code")?.maxTokens, 262144);
	assert.equal(lookupKnownModelSpec("kimi-k2-0905-preview")?.maxTokens, 100352);
	assert.equal(lookupKnownModelSpec("kimi-k2-0711-preview")?.maxTokens, 100352);
	// GLM 5.2/5.1 filled from hosted catalogs (deployments differ per source).
	assert.equal(lookupKnownModelSpec("glm-5.2")?.contextWindow, 1048576);
	assert.equal(lookupKnownModelSpec("glm-5.2")?.maxTokens, 131072);
	assert.equal(lookupKnownModelSpec("glm-5.1")?.contextWindow, 202752);
	assert.equal(lookupKnownModelSpec("glm-5.1")?.maxTokens, 202752);
	// Qwen 3.8 Max: Novita's values align with the official flash family.
	assert.equal(lookupKnownModelSpec("qwen3.8-max")?.contextWindow, 1000000);
	assert.equal(lookupKnownModelSpec("qwen3.8-max")?.maxTokens, 131072);
	// MiMo output cap from Novita, consistent with the vendor context config.
	assert.equal(lookupKnownModelSpec("mimo-v2.5")?.maxTokens, 131072);
	// MiniMax output caps from Novita, consistent with official contexts.
	assert.equal(lookupKnownModelSpec("MiniMax-M3")?.maxTokens, 131072);
	assert.equal(lookupKnownModelSpec("MiniMax-M2.7")?.maxTokens, 131072);
	// Nemotron output caps from the DeepInfra hosted deployment.
	assert.equal(lookupKnownModelSpec("nvidia/nemotron-3-super-120b-a12b")?.maxTokens, 262144);
	assert.equal(lookupKnownModelSpec("nvidia/nemotron-3-ultra-550b-a55b")?.maxTokens, 262144);
	// Rows without any traceable source keep the prompt fallback.
	assert.equal(lookupKnownModelSpec("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")?.maxTokens, undefined);
});
test("flagship rows carry compat overrides so Pi forwards effort at first-party endpoints", () => {
	// Kimi K3: Moonshot runtime drops reasoning_effort unless told the endpoint
	// supports it; the official thinking guide confirms a top-level effort.
	const kimi = lookupKnownModelSpec("kimi-k3")!;
	assert.deepEqual(kimi.compat, { supportsReasoningEffort: true });

	// GLM 5.3: Z.AI runtime would send an undocumented thinking toggle and
	// swallow the effort; official docs confirm a top-level OpenAI-style effort.
	const glm = lookupKnownModelSpec("glm-5.3")!;
	assert.deepEqual(glm.compat, { supportsReasoningEffort: true, thinkingFormat: "openai" });
});

test("rows with a first-party effort limitation carry a printed note", () => {
	for (const id of ["kimi-k2.6", "kimi-k2.7-code", "glm-5.2", "glm-5.1", "nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"]) {
		const spec = lookupKnownModelSpec(id)!;
		assert.ok(spec.limitations && spec.limitations.length > 0, `${id} documents its effort limitation`);
	}
	// Flagship rows that forward the effort carry no limitation note.
	assert.equal(lookupKnownModelSpec("kimi-k3")?.limitations, undefined);
	assert.equal(lookupKnownModelSpec("glm-5.3")?.limitations, undefined);
	assert.equal(lookupKnownModelSpec("deepseek-v4-pro")?.limitations, undefined);
});

test("compat overrides reach models.json through upsertProviderConfig", () => {
	const dir = mkdtempSync(join(tmpdir(), "feynman-spec-catalog-"));
	const modelsPath = join(dir, "models.json");
	const result = upsertProviderConfig(modelsPath, "proxy", {
		baseUrl: "https://api.moonshot.ai/v1",
		api: "openai-completions",
		apiKey: "local",
		models: [
			{ id: "kimi-k3", contextWindow: 1048576, reasoning: true, compat: { supportsReasoningEffort: true } },
			{ id: "glm-5.3", contextWindow: 1000000, maxTokens: 131072, reasoning: true, compat: { supportsReasoningEffort: true, thinkingFormat: "openai" } },
		],
	});
	assert.deepEqual(result, { ok: true });
	const parsed = JSON.parse(readFileSync(modelsPath, "utf8")) as any;
	assert.deepEqual(parsed.providers.proxy.models[0].compat, { supportsReasoningEffort: true });
	assert.deepEqual(parsed.providers.proxy.models[1].compat, { supportsReasoningEffort: true, thinkingFormat: "openai" });
});

test("specReasoningLevels reads the documented thinking-level map", () => {
	// GLM-5.3 official docs: effort low / high / max, reasoning always on.
	assert.deepEqual(specReasoningLevels(lookupKnownModelSpec("glm-5.3")), ["low", "high", "max"]);
	// No explicit map: reasoning models keep the provider default levels.
	assert.deepEqual(specReasoningLevels(lookupKnownModelSpec("kimi-k2.6")), ["low", "medium", "high"]);
	assert.deepEqual(specReasoningLevels(lookupKnownModelSpec("kimi-k2-0905-preview")), []);
});

test("buildThinkingLevelMap keeps documented effort values and pins unselected levels to null", () => {
	const hy3 = lookupKnownModelSpec("hy3")!;
	const map = buildThinkingLevelMap(["high"], hy3.thinkingLevelMap);
	assert.equal(map.off, "no_think");
	assert.equal(map.low, null);
	assert.equal(map.high, "high");
	assert.equal(map.max, null);

	const synthetic = buildThinkingLevelMap(["low", "xhigh"]);
	assert.deepEqual(synthetic, {
		minimal: null,
		low: "low",
		medium: null,
		high: null,
		xhigh: "xhigh",
		max: null,
	});

	// An empty selection pins every effort off while keeping "off" available.
	const none = buildThinkingLevelMap([]);
	assert.deepEqual(none, {
		minimal: null,
		low: null,
		medium: null,
		high: null,
		xhigh: null,
		max: null,
	});
});

test("parseTokenCountInput accepts plain and suffixed counts and rejects truncated input", () => {
	assert.equal(parseTokenCountInput("128000"), 128000);
	assert.equal(parseTokenCountInput(" 1048576 "), 1048576);
	assert.equal(parseTokenCountInput("128k"), 128000);
	assert.equal(parseTokenCountInput("1m"), 1000000);
	assert.equal(parseTokenCountInput("2M"), 2000000);
	assert.equal(parseTokenCountInput("128k tokens"), undefined);
	assert.equal(parseTokenCountInput(""), undefined);
	assert.equal(parseTokenCountInput("0"), undefined);
	assert.equal(parseTokenCountInput("-5"), undefined);
	assert.equal(parseTokenCountInput("12.5"), undefined);
});

test("promptModelSpecDefinitions non-interactive path returns bare ids for backward compatibility", async () => {
	const definitions = await promptModelSpecDefinitions(["my-model"]);
	assert.deepEqual(definitions, [{ id: "my-model" }]);
});

test("upsertProviderConfig writes catalog-derived per-model limits and preserves legacy provider entries", () => {
	const dir = mkdtempSync(join(tmpdir(), "feynman-spec-catalog-"));
	const modelsPath = join(dir, "models.json");

	// Pre-existing config without the new fields stays untouched by setup re-runs.
	const legacy = upsertProviderConfig(modelsPath, "legacy", {
		baseUrl: "http://localhost:4000/v1",
		api: "openai-completions",
		apiKey: "local",
		models: [{ id: "old-model" }],
	});
	assert.deepEqual(legacy, { ok: true });

	const result = upsertProviderConfig(modelsPath, "proxy", {
		baseUrl: "https://proxy.example/v1",
		api: "openai-completions",
		apiKey: "local",
		models: [
			{ id: "kimi-k3", contextWindow: 1048576, maxTokens: 131072, reasoning: true, thinkingLevelMap: { low: "low", high: "high", max: "max" } },
			{ id: "my-local-model", contextWindow: 128000, maxTokens: 16384, reasoning: false },
		],
	});
	assert.deepEqual(result, { ok: true });

	const parsed = JSON.parse(readFileSync(modelsPath, "utf8")) as any;
	assert.equal(parsed.providers.proxy.models[0].contextWindow, 1048576);
	assert.equal(parsed.providers.proxy.models[0].maxTokens, 131072);
	assert.equal(parsed.providers.proxy.models[0].reasoning, true);
	assert.equal(parsed.providers.proxy.models[0].thinkingLevelMap.max, "max");
	assert.equal(parsed.providers.legacy.models[0].id, "old-model");
	assert.ok(parsed.providers.legacy.models.every((model: any) => model.contextWindow === undefined));
});
