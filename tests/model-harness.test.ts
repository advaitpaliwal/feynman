import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
	appendWorkflowFlagPositionals,
	buildLocalModelWorkflowNotice,
	formatRankModelSynthesisLine,
	parsePositiveInteger,
	resolveAlphaPassthroughArgs,
	resolveInitialPrompt,
	resolvePiPromptOptions,
	resolveRankSynthesisModelSpec,
	resolveThinkingConfig,
	shouldRunInteractiveSetup,
} from "../src/cli.js";
import { buildModelStatusSnapshotFromRecords, chooseRecommendedModel, getAvailableModelRecords } from "../src/model/catalog.js";
import { isLocalModelProvider, resolveModelProviderForCommand, setDefaultModelSpec } from "../src/model/commands.js";
import { createModelRegistry } from "../src/model/registry.js";
import { supportsNativePackageSources } from "../src/pi/package-presets.js";
import { canonicalizeModelSpec, parseModelSpec } from "../src/pi/settings.js";

function createAuthPath(contents: Record<string, unknown>): string {
	const root = mkdtempSync(join(tmpdir(), "feynman-auth-"));
	const authPath = join(root, "auth.json");
	writeFileSync(authPath, JSON.stringify(contents, null, 2) + "\n", "utf8");
	return authPath;
}

const MODEL_ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"GOOGLE_API_KEY",
	"GEMINI_API_KEY",
	"OPENROUTER_API_KEY",
	"REQUESTY_API_KEY",
	"OPENCODE_API_KEY",
	"OPENCODE_ZEN_API_KEY",
	"MINIMAX_API_KEY",
	"KIMI_API_KEY",
];

async function withoutModelEnv<T>(callback: () => T | Promise<T>): Promise<T> {
	const savedEnv = Object.fromEntries(MODEL_ENV_KEYS.map((key) => [key, process.env[key]]));
	for (const key of MODEL_ENV_KEYS) {
		delete process.env[key];
	}
	try {
		return await callback();
	} finally {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

async function getOpenAiGptModel(authPath: string): Promise<{ provider: string; id: string }> {
	const recommendation = await chooseRecommendedModel(authPath);
	assert.ok(recommendation);
	const [provider, ...idParts] = recommendation.spec.split("/");
	const id = idParts.join("/");
	assert.equal(provider, "openai");
	assert.match(id, /^gpt-\d/);
	return { provider, id };
}

function asModelSpec(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}

test("chooseRecommendedModel prefers the strongest authenticated research model", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
		anthropic: { type: "api_key", key: "anthropic-test-key" },
	});

	const recommendation = await chooseRecommendedModel(authPath);

	assert.equal(recommendation?.spec, "anthropic/claude-opus-5");
});

test("chooseRecommendedModel prefers the newest OpenAI GPT exposed by Pi", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});

	const recommendation = await chooseRecommendedModel(authPath);

	assert.match(recommendation?.spec ?? "", /^openai\/gpt-\d/);
	assert.match(recommendation?.reason ?? "", /newest authenticated OpenAI GPT model/);
});

test("resolveRankSynthesisModelSpec uses the recommended research model instead of a stale default", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});
	const recommendation = await chooseRecommendedModel(authPath);
	const explicitOpenAiModel = await getOpenAiGptModel(authPath);
	const explicitOpenAiSpec = asModelSpec(explicitOpenAiModel);

	assert.equal(await resolveRankSynthesisModelSpec(authPath, undefined), recommendation?.spec);
	assert.equal(await resolveRankSynthesisModelSpec(authPath, explicitOpenAiSpec), explicitOpenAiSpec);
});

test("explicit model selection accepts DeepSeek V4 Pro but rejects premium Pro tiers", async () => {
	const authPath = createAuthPath({});
	const deepSeekSpec = "nebius/deepseek-ai/DeepSeek-V4-Pro";

	assert.equal(await resolveRankSynthesisModelSpec(authPath, deepSeekSpec), deepSeekSpec);
	await assert.rejects(
		resolveRankSynthesisModelSpec(authPath, "google/gemini-3.1-pro"),
		/Pro-class model disabled/,
	);
});

test("model specs preserve colon-bearing custom model ids and canonicalize Pi launch syntax", async () => {
	const authPath = createAuthPath({
		ollama: { type: "api_key", key: "ollama" },
	});
	const modelsPath = join(dirname(authPath), "models.json");
	writeFileSync(
		modelsPath,
		JSON.stringify({
			providers: {
				ollama: {
					baseUrl: "http://localhost:11434/v1",
					api: "openai-completions",
					apiKey: "ollama",
					models: [{ id: "qwen3:0.6b" }],
				},
			},
		}) + "\n",
		"utf8",
	);
	const registry = await createModelRegistry(authPath);

	for (const spec of ["ollama/qwen3:0.6b", "ollama:qwen3:0.6b"]) {
		const model = parseModelSpec(spec, registry);
		assert.equal(model?.provider, "ollama");
		assert.equal(model?.id, "qwen3:0.6b");
		assert.equal(canonicalizeModelSpec(spec, registry), "ollama/qwen3:0.6b");
	}
});

test("parsePositiveInteger rejects partial numeric strings", () => {
	assert.equal(parsePositiveInteger(undefined, 180_000), 180_000);
	assert.equal(parsePositiveInteger("120000", 180_000), 120_000);
	assert.equal(parsePositiveInteger(" 120000 ", 180_000), 120_000);
	assert.equal(parsePositiveInteger("120000ms", 180_000), 180_000);
	assert.equal(parsePositiveInteger("1.5", 180_000), 180_000);
	assert.equal(parsePositiveInteger("0", 180_000), 180_000);
});

test("resolveAlphaPassthroughArgs preserves alpha flags after leading cwd", () => {
	assert.deepEqual(resolveAlphaPassthroughArgs(["alpha", "--help"], "/caller"), {
		args: ["--help"],
		cwd: "/caller",
	});
	assert.deepEqual(resolveAlphaPassthroughArgs(["--cwd", "/tmp/project", "alpha", "--json", "status"], "/caller"), {
		args: ["--json", "status"],
		cwd: "/tmp/project",
	});
	assert.deepEqual(resolveAlphaPassthroughArgs(["--cwd=/tmp/project", "alpha", "search", "--mode", "keyword", "sparse"], "/caller"), {
		args: ["search", "--mode", "keyword", "sparse"],
		cwd: "/tmp/project",
	});
	assert.equal(resolveAlphaPassthroughArgs(["--cwd"], "/caller"), undefined);
	assert.equal(resolveAlphaPassthroughArgs(["--model", "openai/gpt-5", "alpha"], "/caller"), undefined);
});

test("feynman alpha reaches Alpha Hub help when cwd is supplied before alpha", () => {
	const workingDir = mkdtempSync(join(tmpdir(), "feynman-alpha-cwd-"));
	const homeDir = mkdtempSync(join(tmpdir(), "feynman-alpha-home-"));
	const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", "--cwd", workingDir, "alpha", "--help"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: {
			...process.env,
			FEYNMAN_HOME: homeDir,
			FEYNMAN_TELEMETRY: "0",
		},
		maxBuffer: 1024 * 1024,
	});

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Alpha Hub - search papers and annotate what you learn/);
	assert.doesNotMatch(result.stdout, /Research-first agent shell built on Pi/);
});

test("unknown CLI flags point users to Feynman help", () => {
	const workingDir = mkdtempSync(join(tmpdir(), "feynman-unknown-option-cwd-"));
	const homeDir = mkdtempSync(join(tmpdir(), "feynman-unknown-option-home-"));
	const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", "--cwd", workingDir, "update", "--extensions"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: {
			...process.env,
			FEYNMAN_HOME: homeDir,
			FEYNMAN_TELEMETRY: "0",
		},
		maxBuffer: 1024 * 1024,
	});

	assert.equal(result.status, 1);
	assert.match(`${result.stdout}\n${result.stderr}`, /Unknown option '--extensions'/);
	assert.match(`${result.stdout}\n${result.stderr}`, /Run `feynman help` to see available commands and flags/);
});

test("packages CLI hides removed UI and bulk extras", () => {
	const workingDir = mkdtempSync(join(tmpdir(), "feynman-packages-cwd-"));
	const homeDir = mkdtempSync(join(tmpdir(), "feynman-packages-home-"));
	const env = {
		...process.env,
		FEYNMAN_HOME: homeDir,
		FEYNMAN_TELEMETRY: "0",
		NO_COLOR: "1",
	};
	const listResult = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", "--cwd", workingDir, "packages", "list"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env,
		maxBuffer: 1024 * 1024,
	});

	assert.equal(listResult.status, 0, listResult.stderr);
	assert.match(listResult.stdout, /memory/);
	assert.match(listResult.stdout, /hindsight/);
	assert.match(listResult.stdout, /Research-session preference and correction memory/);
	assert.match(listResult.stdout, /Hindsight-backed research continuity memory/);
	if (supportsNativePackageSources()) {
		assert.match(listResult.stdout, /prior research session transcripts/);
	} else {
		assert.doesNotMatch(listResult.stdout, /session-search/);
	}
	assert.doesNotMatch(listResult.stdout, /Preference and correction memory across sessions|long-term memory for Pi|prior session transcripts/);
	assert.doesNotMatch(listResult.stdout, /all-extras|generative-ui|pi-generative-ui/);

	for (const preset of ["all-extras", "generative-ui"]) {
		const installResult = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", "--cwd", workingDir, "packages", "install", preset], {
			cwd: process.cwd(),
			encoding: "utf8",
			env,
			maxBuffer: 1024 * 1024,
		});

		assert.equal(installResult.status, 1, `${preset} install unexpectedly succeeded`);
		assert.match(`${installResult.stdout}\n${installResult.stderr}`, new RegExp(`Unknown package preset: ${preset}`));
	}
});

test("PaperRank synthesis CLI line names the model and selection source", () => {
	const line = formatRankModelSynthesisLine(
		{
			status: "generated",
			model: "openai/gpt-5",
			modelSelection: {
				source: "recommended",
				resolvedModel: "openai/gpt-5",
				reason: "newest authenticated OpenAI GPT model for research synthesis",
			},
		},
		"/tmp/example-model-synthesis.md",
	);

	assert.equal(
		line,
		"Model synthesis: generated by openai/gpt-5 (recommended current research model; resolved openai/gpt-5); /tmp/example-model-synthesis.md",
	);
});

test("PaperRank synthesis CLI line labels explicit models as overrides", () => {
	const line = formatRankModelSynthesisLine({
		status: "generated",
		model: "openai/gpt-5",
		modelSelection: {
			source: "explicit",
			requestedModel: "openai/gpt-5",
			resolvedModel: "openai/gpt-5",
			reason: "explicit CLI override",
		},
	});

	assert.equal(
		line,
		"Model synthesis: generated by openai/gpt-5 (explicit override; resolved openai/gpt-5)",
	);
});

test("chooseRecommendedModel prefers OpenCode Zen Claude when OpenCode is the authenticated provider", async () => {
	await withoutModelEnv(async () => {
		const authPath = createAuthPath({
			opencode: { type: "api_key", key: "opencode-test-key" },
		});

		const recommendation = await chooseRecommendedModel(authPath);

		assert.equal(recommendation?.spec, "opencode/claude-opus-5");
	});
});

test("chooseRecommendedModel prefers OpenCode Go Kimi when OpenCode Go is the authenticated provider", async () => {
	await withoutModelEnv(async () => {
		const authPath = createAuthPath({
			"opencode-go": { type: "api_key", key: "opencode-test-key" },
		});

		const recommendation = await chooseRecommendedModel(authPath);

		assert.equal(recommendation?.spec, "opencode-go/kimi-k2.6");
	});
});

test("getAvailableModelRecords excludes expired OAuth credentials without an env fallback", async () => {
	const authPath = createAuthPath({
		anthropic: {
			type: "oauth",
			access: "expired-access-token",
			refresh: "expired-refresh-token",
			expires: Date.now() - 1000,
		},
	});

	const available = await getAvailableModelRecords(authPath);

	assert.equal(available.some((model) => model.provider === "anthropic"), false);
});

test("getAvailableModelRecords keeps unexpired OAuth credentials available", async () => {
	const authPath = createAuthPath({
		anthropic: {
			type: "oauth",
			access: "current-access-token",
			refresh: "current-refresh-token",
			expires: Date.now() + 60_000,
		},
	});

	const available = await getAvailableModelRecords(authPath);

	assert.equal(available.some((model) => model.provider === "anthropic"), true);
});

test("setDefaultModelSpec accepts a unique bare model id from authenticated models", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});
	const settingsPath = join(mkdtempSync(join(tmpdir(), "feynman-settings-")), "settings.json");
	const openAiModel = await getOpenAiGptModel(authPath);
	const logs: string[] = [];
	const originalLog = console.log;

	console.log = (message?: unknown, ...optionalParams: unknown[]) => {
		logs.push([message, ...optionalParams].map(String).join(" "));
	};
	try {
		await setDefaultModelSpec(settingsPath, authPath, openAiModel.id);
	} finally {
		console.log = originalLog;
	}

	const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
		defaultProvider?: string;
		defaultModel?: string;
	};
	assert.equal(settings.defaultProvider, "openai");
	assert.equal(settings.defaultModel, openAiModel.id);
	assert.match(logs.join("\n"), /Research default model set to openai\//);
});

test("setDefaultModelSpec accepts provider:model syntax for authenticated models", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});
	const settingsPath = join(mkdtempSync(join(tmpdir(), "feynman-settings-")), "settings.json");

	const openAiModel = await getOpenAiGptModel(authPath);

	await setDefaultModelSpec(settingsPath, authPath, `openai:${openAiModel.id}`);

	const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
		defaultProvider?: string;
		defaultModel?: string;
	};
	assert.equal(settings.defaultProvider, "openai");
	assert.equal(settings.defaultModel, openAiModel.id);
});

test("setDefaultModelSpec accepts an authenticated DeepSeek V4 Pro model", async () => {
	const authPath = createAuthPath({
		nebius: { type: "api_key", key: "nebius-test-key" },
	});
	writeFileSync(
		join(dirname(authPath), "models.json"),
		JSON.stringify({
			providers: {
				nebius: {
					baseUrl: "https://api.studio.nebius.ai/v1",
					api: "openai-completions",
					models: [{ id: "deepseek-ai/DeepSeek-V4-Pro" }],
				},
			},
		}) + "\n",
		"utf8",
	);
	const settingsPath = join(mkdtempSync(join(tmpdir(), "feynman-settings-")), "settings.json");

	await setDefaultModelSpec(settingsPath, authPath, "nebius/deepseek-ai/DeepSeek-V4-Pro");

	const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
		defaultProvider?: string;
		defaultModel?: string;
	};
	assert.equal(settings.defaultProvider, "nebius");
	assert.equal(settings.defaultModel, "deepseek-ai/DeepSeek-V4-Pro");
});

test("resolveModelProviderForCommand falls back to API-key providers when OAuth is unavailable", async () => {
	const authPath = createAuthPath({});

	const resolved = await resolveModelProviderForCommand(authPath, "google");

	assert.equal(resolved?.kind, "api-key");
	assert.equal(resolved?.id, "google");
});

test("resolveModelProviderForCommand supports LM Studio as a first-class local provider", async () => {
	const authPath = createAuthPath({});

	const resolved = await resolveModelProviderForCommand(authPath, "lm-studio");

	assert.equal(resolved?.kind, "api-key");
	assert.equal(resolved?.id, "lm-studio");
});

test("resolveModelProviderForCommand supports LiteLLM as a first-class proxy provider", async () => {
	const authPath = createAuthPath({});

	const resolved = await resolveModelProviderForCommand(authPath, "litellm");

	assert.equal(resolved?.kind, "api-key");
	assert.equal(resolved?.id, "litellm");
});

test("resolveModelProviderForCommand supports Requesty as a first-class gateway provider", async () => {
	const authPath = createAuthPath({});

	const resolved = await resolveModelProviderForCommand(authPath, "requesty");

	assert.equal(resolved?.kind, "api-key");
	assert.equal(resolved?.id, "requesty");
});

test("resolveModelProviderForCommand prefers OAuth when a provider supports both auth modes", async () => {
	const authPath = createAuthPath({});

	const resolved = await resolveModelProviderForCommand(authPath, "anthropic");

	assert.equal(resolved?.kind, "oauth");
	assert.equal(resolved?.id, "anthropic");
});

test("setDefaultModelSpec prefers the explicitly configured provider when a bare model id is ambiguous", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});
	const settingsPath = join(mkdtempSync(join(tmpdir(), "feynman-settings-")), "settings.json");
	const openAiModel = await getOpenAiGptModel(authPath);

	await setDefaultModelSpec(settingsPath, authPath, openAiModel.id);

	const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
		defaultProvider?: string;
		defaultModel?: string;
	};
	assert.equal(settings.defaultProvider, "openai");
	assert.equal(settings.defaultModel, openAiModel.id);
});

test("buildModelStatusSnapshotFromRecords flags an invalid current model and suggests a replacement", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "openai", id: "gpt-5.5" },
		],
		[{ provider: "openai", id: "gpt-5.5" }],
		"anthropic/claude-opus-4-6",
	);

	assert.equal(snapshot.currentValid, false);
	assert.equal(snapshot.recommended, "openai/gpt-5.5");
	assert.ok(snapshot.guidance.some((line) => line.includes("Configured default model is unavailable")));
});

test("chooseRecommendedModel prefers the newest MiniMax over highspeed when that is the authenticated provider", async () => {
	await withoutModelEnv(async () => {
		const authPath = createAuthPath({
			minimax: { type: "api_key", key: "minimax-test-key" },
		});

		const recommendation = await chooseRecommendedModel(authPath);

		assert.equal(recommendation?.spec, "minimax/MiniMax-M3");
	});
});

test("chooseRecommendedModel prefers kimi-for-coding when Kimi Coding is the authenticated provider", async () => {
	await withoutModelEnv(async () => {
		const authPath = createAuthPath({
			"kimi-coding": { type: "api_key", key: "kimi-test-key" },
		});

		const recommendation = await chooseRecommendedModel(authPath);

		assert.equal(recommendation?.spec, "kimi-coding/kimi-for-coding");
	});
});

test("resolveInitialPrompt maps top-level research commands to Pi slash workflows", () => {
	const workflows = new Set([
		"lit",
		"watch",
		"jobs",
		"deepresearch",
		"review",
		"audit",
		"replicate",
		"recipe",
		"compare",
		"draft",
		"autoresearch",
		"summarize",
		"log",
	]);
	assert.equal(resolveInitialPrompt("lit", ["tool-using", "agents"], undefined, workflows), "/lit tool-using agents");
	assert.equal(resolveInitialPrompt("watch", ["openai"], undefined, workflows), "/watch openai");
	assert.equal(resolveInitialPrompt("jobs", [], undefined, workflows), "/jobs");
	assert.equal(resolveInitialPrompt("deepresearch", ["scaling", "laws"], undefined, workflows), "/deepresearch scaling laws");
	assert.equal(resolveInitialPrompt("review", ["paper.md"], undefined, workflows), "/review paper.md");
	assert.equal(resolveInitialPrompt("audit", ["2401.12345"], undefined, workflows), "/audit 2401.12345");
	assert.equal(resolveInitialPrompt("replicate", ["chain-of-thought"], undefined, workflows), "/replicate chain-of-thought");
	assert.equal(resolveInitialPrompt("recipe", ["math", "reasoning"], undefined, workflows), "/recipe math reasoning");
	assert.equal(resolveInitialPrompt("compare", ["tool", "use"], undefined, workflows), "/compare tool use");
	assert.equal(resolveInitialPrompt("draft", ["mechanistic", "interp"], undefined, workflows), "/draft mechanistic interp");
	assert.equal(resolveInitialPrompt("autoresearch", ["gsm8k"], undefined, workflows), "/autoresearch gsm8k");
	assert.equal(resolveInitialPrompt("summarize", ["README.md"], undefined, workflows), "/summarize README.md");
	assert.equal(resolveInitialPrompt("log", [], undefined, workflows), "/log");
	assert.equal(resolveInitialPrompt("chat", ["hello"], undefined, workflows), "hello");
	assert.equal(resolveInitialPrompt("rank", ["sparse", "autoencoders"], undefined, workflows), undefined);
	assert.equal(resolveInitialPrompt("unknown", ["topic"], undefined, workflows), "unknown topic");
});

test("appendWorkflowFlagPositionals preserves summarize CLI flags parsed after positionals", () => {
	assert.deepEqual(
		appendWorkflowFlagPositionals("summarize", ["paper.md"], {
			"window-size": "2000",
			overlap: "200",
			"tier1-threshold": "8000",
			"tier2-threshold": "20000",
		}),
		["paper.md", "--window-size", "2000", "--overlap", "200", "--tier1-threshold", "8000", "--tier2-threshold", "20000"],
	);
	assert.deepEqual(appendWorkflowFlagPositionals("review", ["paper.md"], { "window-size": "2000" }), ["paper.md"]);
});

test("resolveThinkingConfig only passes launch thinking when explicitly configured", () => {
	assert.deepEqual(resolveThinkingConfig(undefined), {
		defaultThinkingLevel: "medium",
		launchThinkingLevel: undefined,
	});
	assert.deepEqual(resolveThinkingConfig("high"), {
		defaultThinkingLevel: "high",
		launchThinkingLevel: "high",
	});
	assert.deepEqual(resolveThinkingConfig("not-a-level"), {
		defaultThinkingLevel: "medium",
		launchThinkingLevel: undefined,
	});
});

test("resolvePiPromptOptions keeps top-level workflows interactive when stdin is a tty", () => {
	const workflows = new Set(["deepresearch", "summarize"]);

	assert.deepEqual(resolvePiPromptOptions("deepresearch", ["BM25"], undefined, workflows), {
		initialPrompt: "/deepresearch BM25",
	});
	assert.deepEqual(resolvePiPromptOptions("chat", ["hello"], undefined, workflows), {
		initialPrompt: "hello",
	});
	assert.deepEqual(resolvePiPromptOptions(undefined, [], "hello", workflows), {
		oneShotPrompt: "hello",
	});
	assert.deepEqual(resolvePiPromptOptions(undefined, [], undefined, workflows), {});
});

test("shouldRunInteractiveSetup triggers on first run when no default model is configured", async () => {
	const authPath = createAuthPath({});

	assert.equal(await shouldRunInteractiveSetup(undefined, undefined, true, authPath), true);
});

test("shouldRunInteractiveSetup triggers when the configured default model is unavailable", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});

	assert.equal(await shouldRunInteractiveSetup(undefined, "anthropic/claude-opus-4-6", true, authPath), true);
});

test("shouldRunInteractiveSetup skips onboarding when the configured default model is available", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});
	const openAiModel = await getOpenAiGptModel(authPath);

	assert.equal(await shouldRunInteractiveSetup(undefined, asModelSpec(openAiModel), true, authPath), false);
});

test("shouldRunInteractiveSetup skips onboarding for explicit model overrides or non-interactive terminals", async () => {
	const authPath = createAuthPath({
		openai: { type: "api_key", key: "openai-test-key" },
	});
	const openAiModel = await getOpenAiGptModel(authPath);

	assert.equal(await shouldRunInteractiveSetup(asModelSpec(openAiModel), undefined, true, authPath), false);
	assert.equal(await shouldRunInteractiveSetup(undefined, undefined, false, authPath), false);
});

test("isLocalModelProvider flags known local provider ids without consulting models.json", () => {
	const authPath = createAuthPath({});

	assert.equal(isLocalModelProvider(authPath, "ollama"), true);
	assert.equal(isLocalModelProvider(authPath, "lm-studio"), true);
	assert.equal(isLocalModelProvider(authPath, "vllm"), true);
	assert.equal(isLocalModelProvider(authPath, "anthropic"), false);
	assert.equal(isLocalModelProvider(authPath, ""), false);
});

test("isLocalModelProvider flags custom providers whose models.json baseUrl points at localhost", () => {
	const authPath = createAuthPath({});
	const modelsJsonPath = join(authPath, "..", "models.json");
	writeFileSync(
		modelsJsonPath,
		JSON.stringify({
			providers: {
				"my-proxy": { baseUrl: "http://127.0.0.1:8000/v1" },
				openrouter: { baseUrl: "https://openrouter.ai/api/v1" },
				requesty: { baseUrl: "https://router.requesty.ai/v1" },
			},
		}) + "\n",
		"utf8",
	);

	assert.equal(isLocalModelProvider(authPath, "my-proxy"), true);
	assert.equal(isLocalModelProvider(authPath, "openrouter"), false);
	assert.equal(isLocalModelProvider(authPath, "requesty"), false);
});

test("buildLocalModelWorkflowNotice names the configured model and the workflow", () => {
	const notice = buildLocalModelWorkflowNotice("ollama/gemma4:latest", "deepresearch");

	assert.ok(notice.includes("ollama/gemma4:latest"));
	assert.ok(notice.includes("/deepresearch"));
	assert.ok(notice.includes("feynman model set"));
});
