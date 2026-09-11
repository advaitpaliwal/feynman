import type { ModelsJsonModelConfig } from "./models-json.js";

// Requesty is an OpenAI-compatible LLM gateway. Pi has no built-in provider for
// it, so Feynman registers it as a custom `openai-completions` provider in
// models.json and seeds the model list from Requesty's public catalog endpoints.

export const REQUESTY_PROVIDER_ID = "requesty";
export const REQUESTY_API_KEY_ENV_VAR = "REQUESTY_API_KEY";
export const REQUESTY_BASE_URL_ENV_VAR = "REQUESTY_BASE_URL";
export const REQUESTY_DEFAULT_BASE_URL = "https://router.requesty.ai/v1";
export const REQUESTY_EU_BASE_URL = "https://router.eu.requesty.ai/v1";
export const REQUESTY_API_KEYS_URL = "https://app.requesty.ai/api-keys";

const CATALOG_TIMEOUT_MS = 8000;
const USD_PER_TOKEN_TO_PER_MILLION = 1_000_000;

export type RequestyCatalogModel = {
	id: string;
	api?: string;
	context_window?: number;
	max_output_tokens?: number;
	input_price?: number;
	output_price?: number;
	cached_price?: number;
	caching_price?: number;
	supports_reasoning?: boolean;
	supports_vision?: boolean;
	description?: string;
};

export type RequestyCatalogSource = "managed" | "full";

export type RequestyCatalog = {
	models: RequestyCatalogModel[];
	sources: RequestyCatalogSource[];
};

export function resolveRequestyDefaultBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const override = env[REQUESTY_BASE_URL_ENV_VAR]?.trim();
	return override ? override.replace(/\/+$/, "") : REQUESTY_DEFAULT_BASE_URL;
}

export function isRequestyChatModel(model: unknown): model is RequestyCatalogModel {
	if (!model || typeof model !== "object") return false;
	const candidate = model as Record<string, unknown>;
	if (typeof candidate.id !== "string" || !candidate.id) return false;
	return candidate.api === undefined || candidate.api === "chat";
}

function perMillion(usdPerToken: number | undefined): number {
	if (typeof usdPerToken !== "number" || !Number.isFinite(usdPerToken) || usdPerToken < 0) return 0;
	return Number((usdPerToken * USD_PER_TOKEN_TO_PER_MILLION).toPrecision(6));
}

function positiveInteger(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
	return Math.floor(value);
}

export function toRequestyModelConfig(model: RequestyCatalogModel): ModelsJsonModelConfig {
	const config: ModelsJsonModelConfig = {
		id: model.id,
		reasoning: model.supports_reasoning === true,
		input: model.supports_vision === true ? ["text", "image"] : ["text"],
		cost: {
			input: perMillion(model.input_price),
			output: perMillion(model.output_price),
			cacheRead: perMillion(model.cached_price),
			cacheWrite: perMillion(model.caching_price),
		},
	};
	const contextWindow = positiveInteger(model.context_window);
	if (contextWindow !== undefined) config.contextWindow = contextWindow;
	const maxTokens = positiveInteger(model.max_output_tokens);
	if (maxTokens !== undefined) config.maxTokens = maxTokens;
	return config;
}

/**
 * Managed policies come first because they are the curated list users should
 * see before the full vendor/model catalog. Duplicate ids keep the first entry.
 */
export function mergeRequestyCatalogs(managed: RequestyCatalogModel[], full: RequestyCatalogModel[]): RequestyCatalogModel[] {
	const seen = new Set<string>();
	const merged: RequestyCatalogModel[] = [];
	for (const model of [...managed, ...full]) {
		if (!isRequestyChatModel(model) || seen.has(model.id)) continue;
		seen.add(model.id);
		merged.push(model);
	}
	return merged;
}

async function fetchRequestyCatalogEndpoint(url: string, apiKey: string | undefined): Promise<RequestyCatalogModel[] | undefined> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
			signal: controller.signal,
		});
		if (!response.ok) {
			return undefined;
		}
		const json = (await response.json()) as { data?: unknown };
		if (!Array.isArray(json?.data)) return undefined;
		return json.data.filter(isRequestyChatModel);
	} catch {
		return undefined;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetches the Requesty chat catalog. `/models/managed` (curated routing
 * policies) is the primary source; `/models` (full vendor/model catalog) is
 * merged in when requested, and used as the fallback when the managed list is
 * unavailable. Returns undefined when neither endpoint responded.
 */
export async function fetchRequestyCatalog(
	baseUrl: string,
	apiKey: string | undefined,
	options: { includeFullCatalog: boolean },
): Promise<RequestyCatalog | undefined> {
	const managed = await fetchRequestyCatalogEndpoint(`${baseUrl}/models/managed`, apiKey);
	const full = options.includeFullCatalog || !managed
		? await fetchRequestyCatalogEndpoint(`${baseUrl}/models`, apiKey)
		: undefined;

	const sources: RequestyCatalogSource[] = [];
	if (managed) sources.push("managed");
	if (full) sources.push("full");
	if (sources.length === 0) {
		return undefined;
	}

	return {
		models: mergeRequestyCatalogs(managed ?? [], full ?? []),
		sources,
	};
}
