import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildModelStatusSnapshotFromRecords } from "../src/model/catalog.js";
import { upsertProviderConfig } from "../src/model/models-json.js";
import { createModelRegistry } from "../src/model/registry.js";
import {
	REQUESTY_DEFAULT_BASE_URL,
	REQUESTY_EU_BASE_URL,
	fetchRequestyCatalog,
	isRequestyChatModel,
	mergeRequestyCatalogs,
	resolveRequestyDefaultBaseUrl,
	toRequestyModelConfig,
	type RequestyCatalogModel,
} from "../src/model/requesty.js";
import { WORKBENCH_CREDENTIAL_PROVIDERS } from "../src/workbench/credential-catalog.js";

function createAuthPath(contents: Record<string, unknown>): string {
	const root = mkdtempSync(join(tmpdir(), "feynman-requesty-auth-"));
	const authPath = join(root, "auth.json");
	writeFileSync(authPath, JSON.stringify(contents, null, 2) + "\n", "utf8");
	return authPath;
}

const MANAGED_SONNET: RequestyCatalogModel = {
	id: "claude-sonnet-4-5",
	api: "chat",
	context_window: 200000,
	max_output_tokens: 64000,
	input_price: 0.000003,
	output_price: 0.000015,
	cached_price: 0.0000003,
	caching_price: 0.00000375,
	supports_reasoning: true,
	supports_vision: true,
};

const FULL_GPT_4O_MINI: RequestyCatalogModel = {
	id: "openai/gpt-4o-mini",
	api: "chat",
	context_window: 128000,
	max_output_tokens: 16384,
	input_price: 0.00000015,
	output_price: 0.0000006,
	supports_reasoning: false,
	supports_vision: true,
};

test("toRequestyModelConfig maps Requesty catalog fields to Pi models.json fields", () => {
	const config = toRequestyModelConfig(MANAGED_SONNET);

	assert.deepEqual(config, {
		id: "claude-sonnet-4-5",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 200000,
		maxTokens: 64000,
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	});
});

test("toRequestyModelConfig omits unknown limits and zeroes missing prices", () => {
	const config = toRequestyModelConfig({ id: "vendor/model", api: "chat" });

	assert.deepEqual(config, {
		id: "vendor/model",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	});
});

test("mergeRequestyCatalogs lists managed policies first and drops non-chat and duplicate entries", () => {
	const merged = mergeRequestyCatalogs(
		[MANAGED_SONNET, { id: "openai/text-embedding-3-small", api: "embedding" }],
		[FULL_GPT_4O_MINI, MANAGED_SONNET, { id: "" }],
	);

	assert.deepEqual(merged.map((model) => model.id), ["claude-sonnet-4-5", "openai/gpt-4o-mini"]);
	assert.equal(isRequestyChatModel({ id: "x", api: "image" }), false);
	assert.equal(isRequestyChatModel({ id: "x" }), true);
});

test("resolveRequestyDefaultBaseUrl honors REQUESTY_BASE_URL for regional routers", () => {
	assert.equal(resolveRequestyDefaultBaseUrl({}), REQUESTY_DEFAULT_BASE_URL);
	assert.equal(resolveRequestyDefaultBaseUrl({ REQUESTY_BASE_URL: `${REQUESTY_EU_BASE_URL}/` }), REQUESTY_EU_BASE_URL);
	assert.equal(resolveRequestyDefaultBaseUrl({ REQUESTY_BASE_URL: "   " }), REQUESTY_DEFAULT_BASE_URL);
});

test("fetchRequestyCatalog prefers /models/managed and merges /models only when requested", async () => {
	const originalFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		requested.push(url);
		assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, "Bearer test-key");
		if (url.endsWith("/models/managed")) {
			return new Response(JSON.stringify({ object: "list", data: [MANAGED_SONNET] }), { status: 200 });
		}
		if (url.endsWith("/models")) {
			return new Response(JSON.stringify({ object: "list", data: [FULL_GPT_4O_MINI] }), { status: 200 });
		}
		return new Response("not found", { status: 404 });
	}) as typeof fetch;

	try {
		const managedOnly = await fetchRequestyCatalog(REQUESTY_DEFAULT_BASE_URL, "test-key", { includeFullCatalog: false });
		assert.deepEqual(managedOnly?.sources, ["managed"]);
		assert.deepEqual(managedOnly?.models.map((model) => model.id), ["claude-sonnet-4-5"]);
		assert.deepEqual(requested, [`${REQUESTY_DEFAULT_BASE_URL}/models/managed`]);

		requested.length = 0;
		const merged = await fetchRequestyCatalog(REQUESTY_DEFAULT_BASE_URL, "test-key", { includeFullCatalog: true });
		assert.deepEqual(merged?.sources, ["managed", "full"]);
		assert.deepEqual(merged?.models.map((model) => model.id), ["claude-sonnet-4-5", "openai/gpt-4o-mini"]);
		assert.deepEqual(requested, [`${REQUESTY_DEFAULT_BASE_URL}/models/managed`, `${REQUESTY_DEFAULT_BASE_URL}/models`]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchRequestyCatalog falls back to /models when managed policies are unavailable", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = String(input);
		if (url.endsWith("/models/managed")) {
			return new Response("unavailable", { status: 503 });
		}
		return new Response(JSON.stringify({ object: "list", data: [FULL_GPT_4O_MINI] }), { status: 200 });
	}) as typeof fetch;

	try {
		const catalog = await fetchRequestyCatalog(REQUESTY_DEFAULT_BASE_URL, undefined, { includeFullCatalog: false });
		assert.deepEqual(catalog?.sources, ["full"]);
		assert.deepEqual(catalog?.models.map((model) => model.id), ["openai/gpt-4o-mini"]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("Requesty models.json provider resolves through the Pi registry with an env-backed key", async () => {
	const authPath = createAuthPath({});
	const modelsJsonPath = join(dirname(authPath), "models.json");
	const result = upsertProviderConfig(modelsJsonPath, "requesty", {
		baseUrl: REQUESTY_DEFAULT_BASE_URL,
		apiKey: "$REQUESTY_API_KEY",
		api: "openai-completions",
		authHeader: true,
		models: [toRequestyModelConfig(MANAGED_SONNET), toRequestyModelConfig(FULL_GPT_4O_MINI)],
	});
	assert.equal(result.ok, true);

	const previousKey = process.env.REQUESTY_API_KEY;
	process.env.REQUESTY_API_KEY = "sk-requesty-test";
	try {
		const registry = await createModelRegistry(authPath);
		assert.equal(registry.getError(), undefined);
		const model = registry.getAll().find((entry) => entry.provider === "requesty" && entry.id === "openai/gpt-4o-mini");
		assert.equal(model?.api, "openai-completions");
		assert.equal(model?.baseUrl, REQUESTY_DEFAULT_BASE_URL);
		assert.equal(model?.contextWindow, 128000);
		assert.equal(model?.maxTokens, 16384);
		assert.ok(registry.getAvailable().some((entry) => entry.provider === "requesty" && entry.id === "claude-sonnet-4-5"));
		assert.equal(await registry.getApiKeyForProvider("requesty"), "sk-requesty-test");
	} finally {
		if (previousKey === undefined) delete process.env.REQUESTY_API_KEY;
		else process.env.REQUESTY_API_KEY = previousKey;
	}
});

test("Requesty is labeled in model status and listed as a gateway credential", () => {
	const snapshot = buildModelStatusSnapshotFromRecords(
		[{ provider: "requesty", id: "openai/gpt-4o-mini" }],
		[{ provider: "requesty", id: "openai/gpt-4o-mini" }],
		"requesty/openai/gpt-4o-mini",
	);
	assert.equal(snapshot.currentValid, true);
	assert.equal(snapshot.providers[0]?.label, "Requesty");

	const credential = WORKBENCH_CREDENTIAL_PROVIDERS.find((provider) => provider.id === "requesty");
	assert.equal(credential?.envVar, "REQUESTY_API_KEY");
	assert.deepEqual(credential?.tags, ["model", "gateway"]);
});
