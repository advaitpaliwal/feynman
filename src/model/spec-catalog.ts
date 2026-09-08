/**
 * Built-in catalog of well-known model specs for the custom API-key provider
 * setup flow (`feynman setup` / `feynman model login`).
 *
 * Pi hardcodes safe fallbacks for custom models.json providers that omit
 * limits: 128k context window, 16384 max output tokens, thinking disabled.
 * This catalog lets setup pre-fill real values (context length, max
 * completion tokens, supported reasoning efforts) as editable defaults when
 * it recognizes the model id, instead of silently degrading to those
 * fallbacks. Unknown values stay undefined here so setup prompts the user
 * instead of guessing a number into the catalog.
 *
 * This is static, reviewable data a maintainer extends by PR; setup makes no
 * network calls against it. Values carry their source so a reviewer can audit
 * each row: vendor docs for first-party caps, and the cited public hosted
 * catalogs (DeepInfra, Novita) where vendor docs stay silent. Only traceable
 * values are stored; a value without any traceable source stays undefined so
 * setup prompts the user for it instead of pre-filling a guess. Hosted-catalog
 * caps are read dates-stamped in the row comments because hosted deployments
 * can differ per provider.
 *
 * Scope: open-weight model families only (DeepSeek, Kimi, GLM, Qwen, MiMo,
 * Hunyuan, MiniMax, Nemotron). Closed-weight models (GPT, Claude, Gemini,
 * Grok) never appear here — their providers ship their own runtime model
 * registries, so a closed-weight id is simply unknown to this catalog and
 * prompts at setup with safe fallbacks.
 */

export type ModelThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Per-model definition accepted by Pi's models.json loader, carrying the
 * setup-derived limits. Written verbatim into `models.json` next to `id`.
 */
export type ModelSpecDefinition = {
	id: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
	thinkingLevelMap?: Partial<Record<ModelThinkingLevel, string | null>>;
	compat?: Record<string, unknown>;
};

export type KnownModelSpec = {
	/** Canonical model id this entry documents. */
	id: string;
	/** Human-readable family label shown during setup. */
	label: string;
	/** Official context window in tokens. Undefined = not documented, setup prompts. */
	contextWindow?: number;
	/** Official max completion (output) tokens. Undefined = setup prompts. */
	maxTokens?: number;
	/** Whether the model is a reasoning (thinking) model. */
	reasoning: boolean;
	/**
	 * Pi thinking-level map when the official API needs one beyond provider
	 * defaults; copied verbatim into the models.json entry.
	 */
	thinkingLevelMap?: Partial<Record<ModelThinkingLevel, string | null>>;
	/** Pi compat overrides the official API requires (e.g. a special thinking
	 * format); copied verbatim into the models.json entry. */
	compat?: Record<string, unknown>;
	/**
	 * Known caveats for this model id's reasoning-effort selection at its
	 * first-party endpoint, shown to the user during setup so the catalog
	 * never over-promises that a selected effort reaches the API.
	 */
	limitations?: string[];
	/** Alternative model ids (case-insensitive) that resolve to this spec. */
	matches?: string[];
	/** Regex source also accepted for this spec (matched against the bare id). */
	pattern?: string;
	/** Official documentation the values come from. */
	sources: string[];
};

const DEEPSEEK_DOCS = "https://api-docs.deepseek.com";
const MOONSHOT_DOCS = "https://platform.moonshot.ai/docs";
const ZAI_DOCS = "https://docs.z.ai/guides/llm/glm-5.3";
const QWEN_DOCS = "https://www.alibabacloud.com/help/en/model-studio/models";
const XIAOMI_MIMO_DOCS = "https://mimo.xiaomi.com";
const HUNYUAN_HY3_REPO = "https://github.com/Tencent-Hunyuan/Hy3";
const HUNYUAN_HY4_REPO = "https://github.com/Tencent-Hunyuan/Hy4-preview";
const MINIMAX_DOCS = "https://platform.minimax.io/docs/guides/models-intro";
const NVIDIA_NIM_DOCS = "https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b";
// Public hosted catalogs carrying per-variant context and output caps; used
// as cited sources for hosted deployments where vendor docs stay silent.
const DEEPINFRA_CATALOG = "https://api.deepinfra.com/v1/openai/models";
const NOVITA_MODELS = "https://api.novita.ai/v3/openai/models";

// --- Tencent Hunyuan ---
// Verified from the official Tencent-Hunyuan repos: reasoning effort is set
// through `chat_template_kwargs.reasoning_effort` ("no_think" for direct
// responses, "low"/"high" for thinking). Hy4 defaults to "high" (deep CoT).
function hunyuanThinkingLevelMap(levels: Array<"low" | "high">): {
	thinkingLevelMap: Partial<Record<ModelThinkingLevel, string | null>>;
	compat: Record<string, unknown>;
} {
	return {
		thinkingLevelMap: {
			off: "no_think",
			minimal: null,
			low: levels.includes("low") ? "low" : null,
			medium: null,
			high: "high",
			xhigh: null,
			max: null,
		},
		compat: {
			thinkingFormat: "chat-template",
			chatTemplateKwargs: { reasoning_effort: {} },
		},
	};
}

export const KNOWN_MODEL_SPECS: KnownModelSpec[] = [
	// --- DeepSeek ---
	{
		id: "deepseek-v4-pro",
		label: "DeepSeek V4 Pro",
		// Thinking mode and reasoning_effort are officially documented, but
		// first-party caps are not. Hosted-catalog values (read 2026-09-08):
		// DeepInfra deepseek-ai/DeepSeek-V4-Pro 1048576/1048576; Novita hosts
		// the same model with a 393216 output cap - deployment configs differ.
		contextWindow: 1048576,
		maxTokens: 393216,
		reasoning: true,
		matches: ["deepseek-v4-pro-0813"],
		sources: [DEEPSEEK_DOCS, DEEPINFRA_CATALOG],
	},
	{
		id: "deepseek-v4-flash",
		label: "DeepSeek V4 Flash",
		// Hosted-catalog values (read 2026-09-08): DeepInfra 1048576/1048576
		// for deepseek-ai/DeepSeek-V4-Flash; Novita hosts 393216 output.
		contextWindow: 1048576,
		maxTokens: 393216,
		reasoning: true,
		matches: ["deepseek-v4-flash-0731", "deepseek-v4-flash-vision-exp"],
		sources: [DEEPSEEK_DOCS, DEEPINFRA_CATALOG],
	},

	// --- Kimi (Moonshot) ---
	{
		id: "kimi-k3",
		label: "Kimi K3 (Moonshot)",
		// Official docs: 1M-token context window; reasoning_effort supports
		// "low" / "high" / "max" (default "max"). Hosted catalogs agree on the
		// caps (read 2026-09-08): DeepInfra and Novita both host K3 at
		// 1048576 context / 1048576 output.
		contextWindow: 1048576,
		maxTokens: 1048576,
		reasoning: true,
		thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
		// Pi's openai-completions runtime drops reasoning_effort for Moonshot
		// base URLs unless told the endpoint supports it; the official Kimi
		// thinking guide confirms a top-level reasoning_effort for K3.
		compat: { supportsReasoningEffort: true },
		matches: ["k3"],
		sources: [MOONSHOT_DOCS],
	},
	{
		id: "kimi-k2.6",
		label: "Kimi K2.6 (Moonshot)",
		// Official docs: 256K context window, thinking and non-thinking modes;
		// per-model effort parameter values differ from K3, so the map is
		// prompted, not assumed. Hosted catalogs agree on the caps (read
		// 2026-09-08): DeepInfra and Novita both host K2.6 at 262144/262144.
		contextWindow: 262144,
		maxTokens: 262144,
		reasoning: true,
		matches: ["kimi-k2.5", "kimi-k2-thinking", "kimi-k2-thinking-turbo"],
		// The native Moonshot API drives thinking through a `thinking`
		// parameter, not an OpenAI-style reasoning_effort; a selected effort
		// may not bind at the first-party endpoint.
		limitations: ["Reasoning-effort selection may not bind on the first-party Moonshot endpoint; its native API uses a separate thinking parameter."],
		sources: [MOONSHOT_DOCS],
	},
	{
		id: "kimi-k2.7-code",
		label: "Kimi K2.7 Code (Moonshot)",
		// Official docs: 256K context window with thinking mode. Hosted
		// catalogs agree (read 2026-09-08): DeepInfra and Novita both host
		// K2.7-Code at 262144/262144.
		contextWindow: 262144,
		maxTokens: 262144,
		reasoning: true,
		matches: ["kimi-k2.7-code-highspeed", "kimi-for-coding", "kimi-for-coding-highspeed", "k3-256k"],
		limitations: ["Reasoning-effort selection may not bind on the first-party Moonshot endpoint; kimi-k2.7-code needs no thinking parameter."],
		sources: [MOONSHOT_DOCS],
	},
	{
		id: "kimi-k2-0905-preview",
		label: "Kimi K2 0905 (Moonshot)",
		// Novita hosts moonshotai/kimi-k2-0905 at 262144/100352 (read
		// 2026-09-08); DeepInfra does not carry this variant.
		contextWindow: 262144,
		maxTokens: 100352,
		reasoning: false,
		matches: ["kimi-k2-turbo-preview"],
		sources: [MOONSHOT_DOCS, NOVITA_MODELS],
	},
	{
		id: "kimi-k2-0711-preview",
		label: "Kimi K2 0711 (Moonshot)",
		// Novita hosts moonshotai/kimi-k2-instruct (the K2 131072-context
		// variant) at 131072/100352 (read 2026-09-08); no deepinfra variant.
		contextWindow: 131072,
		maxTokens: 100352,
		reasoning: false,
		sources: [MOONSHOT_DOCS, NOVITA_MODELS],
	},

	// --- GLM (Zhipu / Z.AI) ---
	{
		id: "glm-5.3",
		label: "GLM 5.3 (Z.AI)",
		// Official docs: 1M context, 128K max output; reasoning is always on
		// (disabling no longer supported) with effort levels low / high / max.
		contextWindow: 1048576,
		maxTokens: 131072,
		reasoning: true,
		thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
		// Pi's openai-completions runtime marks Z.AI endpoints as not
		// supporting reasoning effort and would send an undocumented thinking
		// toggle; the official GLM-5.3 docs confirm a top-level
		// reasoning_effort instead (disabling reasoning is no longer supported).
		compat: { supportsReasoningEffort: true, thinkingFormat: "openai" },
		// "glm-5.3-highspeed" removed: the id does not exist (captain-verified).
		matches: ["glm-5.3-flash"],
		sources: [ZAI_DOCS],
	},
	{
		id: "glm-5.2",
		label: "GLM 5.2 (Z.AI)",
		// Hosted catalogs (read 2026-09-08): Novita zai-org/glm-5.2 at
		// 1048576 context / 131072 output (consistent with the GLM-5.3
		// vendor output cap); DeepInfra hosts a 1048576/1048576 deployment.
		contextWindow: 1048576,
		maxTokens: 131072,
		reasoning: true,
		// "glm-5.2-highspeed" removed: the id does not exist (captain-verified).
		// No readable official doc confirms an OpenAI-style reasoning_effort
		// for 5.2 on the first-party endpoint, so a selected effort may not bind.
		limitations: ["Reasoning-effort selection may not bind on the first-party Z.AI endpoint for this model."],
		sources: [ZAI_DOCS, NOVITA_MODELS, DEEPINFRA_CATALOG],
	},
	{
		id: "glm-5.1",
		label: "GLM 5.1 (Z.AI)",
		// Hosted-catalog values (read 2026-09-08, captain-verified): DeepInfra
		// zai-org/GLM-5.1 at 202752/202752; Novita hosts 204800/131072 for
		// the same id - hosted deployments differ.
		contextWindow: 202752,
		maxTokens: 202752,
		reasoning: true,
		matches: ["glm-5", "glm-5-turbo", "glm-4.7"],
		limitations: ["Reasoning-effort selection may not bind on the first-party Z.AI endpoint for this model."],
		sources: [ZAI_DOCS, DEEPINFRA_CATALOG, NOVITA_MODELS],
	},

	// --- Qwen (Alibaba) ---
	{
		id: "qwen3.8-max",
		label: "Qwen 3.8 Max (Alibaba)",
		// Hosted-catalog values (read 2026-09-08): Novita qwen/qwen3.8-max at
		// 1000000/131072 (consistent with the official qwen3.8-flash family
		// values); DeepInfra hosts a 256000/256000 deployment - differs.
		contextWindow: 1000000,
		maxTokens: 131072,
		reasoning: true,
		sources: [QWEN_DOCS, NOVITA_MODELS, DEEPINFRA_CATALOG],
	},
	{
		id: "qwen3.8-flash",
		label: "Qwen 3.8 Flash (Alibaba)",
		// Official Model Studio page (alibabacloud.com/help/en/model-studio/
		// qwen3-8-flash.md): context window 1,000,000; max output 131,072
		// (thinking and direct modes); multimodal reasoning model.
		contextWindow: 1000000,
		maxTokens: 131072,
		reasoning: true,
		sources: [QWEN_DOCS],
	},
	{
		id: "qwen3.8-flash-next",
		label: "Qwen 3.8 Flash Next (Alibaba)",
		// Official Qwen3.8-Flash-Next card (huggingface.co/Qwen/Qwen3.8-Flash-Next):
		// context 262,144 natively (extensible to 1,000,000 only via self-hosted
		// YaRN RoPE scaling); recommended final-response output 131,072
		// (reasoning content 262,144); thinking controlled via enable_thinking /
		// preserve_thinking, reasoning_effort levels xhigh (default), medium, low.
		contextWindow: 262144,
		maxTokens: 131072,
		reasoning: true,
		thinkingLevelMap: { minimal: null, low: "low", medium: "medium", high: null, xhigh: "xhigh", max: null },
		sources: ["https://huggingface.co/Qwen/Qwen3.8-Flash-Next"],
	},
	{
		id: "qwen3.7-max",
		label: "Qwen 3.7 Max (Alibaba)",
		reasoning: true,
		matches: ["qwen3.7-plus", "qwen3.6-plus", "qwen3.6-flash"],
		sources: [QWEN_DOCS],
	},

	// --- MiMo (Xiaomi) ---
	{
		id: "mimo-v2.5",
		label: "MiMo v2.5 (Xiaomi)",
		// Official HF config.json: max_position_embeddings 1048576 for both
		// variants. Hosted-catalog output cap (read 2026-09-08): Novita hosts
		// both mimo-v2.5 and mimo-v2.5-pro at 1048576/131072 (consistent with
		// the vendor context); DeepInfra deployments differ (262144/1048576).
		contextWindow: 1048576,
		maxTokens: 131072,
		reasoning: true,
		matches: ["mimo-v2.5-pro", "mimo-v2.5-pro-ultraspeed"],
		sources: [XIAOMI_MIMO_DOCS, NOVITA_MODELS],
	},

	// --- Hunyuan 3 / Hunyuan 4 (Tencent) ---
	{
		id: "hy3",
		label: "Hunyuan 3 (Tencent)",
		contextWindow: 262144,
		// Tencent documents the context length and reasoning efforts but no
		// official max-completion cap; DeepInfra hosts tencent/Hy3 at
		// 262144/262144 (read 2026-09-08).
		maxTokens: 262144,
		reasoning: true,
		...hunyuanThinkingLevelMap(["low", "high"]),
		pattern: "^hy3(?:-preview)?(?:-fp8)?$",
		matches: ["hunyuan-t3"],
		sources: [HUNYUAN_HY3_REPO, DEEPINFRA_CATALOG],
	},
	{
		id: "hy4-preview",
		label: "Hunyuan 4 (Tencent)",
		contextWindow: 1048576,
		maxTokens: 64000,
		// No official max-completion cap is documented and neither hosted
		// catalog carries a Hy4 variant (read 2026-09-08), so setup prompts
		// for the output cap.
		reasoning: true,
		...hunyuanThinkingLevelMap(["high"]),
		matches: ["hy4", "hy4-preview-fp8", "hunyuan-t4"],
		sources: [HUNYUAN_HY4_REPO],
	},

	// --- MiniMax ---
	{
		id: "MiniMax-M3",
		label: "MiniMax M3",
		// Official docs: 1,000,000-token context window. Hosted-catalog output
		// cap (read 2026-09-08): Novita minimax/minimax-m3 at 1000000/131072
		// (context matches the vendor doc); DeepInfra hosts 524288/524288.
		contextWindow: 1048576,
		maxTokens: 131072,
		reasoning: true,
		matches: ["minimax-m3"],
		sources: [MINIMAX_DOCS, NOVITA_MODELS, DEEPINFRA_CATALOG],
	},
	{
		id: "MiniMax-M2.7",
		label: "MiniMax M2.7",
		// Official docs: 204,800 context window; hosted-catalog output cap
		// (read 2026-09-08): Novita hosts minimax-m2.7 and
		// minimax-m2.7-highspeed at 204800/131072.
		contextWindow: 204800,
		maxTokens: 131072,
		reasoning: true,
		matches: ["minimax-m2.7", "MiniMax-M2.7-highspeed", "minimax-m2.7-highspeed"],
		sources: [MINIMAX_DOCS, NOVITA_MODELS],
	},

	// --- Nemotron (NVIDIA) ---
	{
		id: "nvidia/nemotron-3-super-120b-a12b",
		label: "NVIDIA Nemotron 3 Super",
		// Official build.nvidia.com specification: contextLength 1048576
		// (serving defaults to 256k; the model spec is 1M). Hosted-catalog
		// output cap (read 2026-09-08): DeepInfra hosts the model at
		// 262144/262144.
		contextWindow: 1048576,
		maxTokens: 262144,
		reasoning: true,
		matches: ["nemotron-3-super-120b-a12b"],
		// The hosted build.nvidia.com API converts a requested effort client-side
		// into chat_template_kwargs; a top-level reasoning_effort is not documented.
		limitations: ["The hosted NVIDIA endpoint applies effort client-side via chat_template_kwargs; a top-level reasoning_effort may not be forwarded as-is."],
		sources: [NVIDIA_NIM_DOCS, DEEPINFRA_CATALOG],
	},
	{
		id: "nvidia/nemotron-3-ultra-550b-a55b",
		label: "NVIDIA Nemotron 3 Ultra",
		// Official build.nvidia.com specification: contextLength 1048576.
		// Hosted-catalog output cap (read 2026-09-08): DeepInfra hosts the
		// model at 262144/262144.
		contextWindow: 1048576,
		maxTokens: 262144,
		reasoning: true,
		matches: ["nemotron-3-ultra-550b-a55b"],
		limitations: ["The hosted NVIDIA endpoint applies effort client-side via chat_template_kwargs; a top-level reasoning_effort may not be forwarded as-is."],
		sources: [NVIDIA_NIM_DOCS, DEEPINFRA_CATALOG],
	},
	{
		id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
		label: "NVIDIA Nemotron 3 Nano Omni",
		// Official build.nvidia.com specification: contextLength 262144,
		// omni-modal input (text, image, audio, video). The hosted catalogs
		// carry no matching omni variant (read 2026-09-08), so setup prompts
		// for the output cap.
		contextWindow: 262144,
		reasoning: true,
		matches: ["nemotron-3-nano-omni-30b-a3b-reasoning"],
		limitations: ["The hosted NVIDIA endpoint applies effort client-side via chat_template_kwargs; a top-level reasoning_effort may not be forwarded as-is."],
		sources: [NVIDIA_NIM_DOCS],
	},
];

/** Safe fallbacks for a model id the catalog does not recognize. */
export const UNKNOWN_MODEL_FALLBACK = {
	contextWindow: 128000,
	maxTokens: 16384,
	reasoning: false,
	reasoningLevels: [] as ModelThinkingLevel[],
} as const;

const DATE_SUFFIX_PATTERN = /-\d{8}$/;

/**
 * Resolve a bare model id against the built-in catalog. Matching is
 * case-insensitive on the exact id and documented aliases, tolerates a
 * trailing `-YYYYMMDD` date suffix, and falls back to an anchored family
 * pattern when one is declared.
 */
export function lookupKnownModelSpec(modelId: string): KnownModelSpec | undefined {
	const id = modelId.trim().toLowerCase();
	if (!id) return undefined;

	const exact = (candidate: string) => KNOWN_SPEC_INDEX.get(candidate);
	return exact(id)
		?? (DATE_SUFFIX_PATTERN.test(id) ? exact(id.replace(DATE_SUFFIX_PATTERN, "")) : undefined)
		?? KNOWN_SPEC_PATTERNS.reduce<KnownModelSpec | undefined>((hit, pattern) => hit ?? (pattern.pattern.test(id) ? pattern.spec : undefined), undefined);
}

const KNOWN_SPEC_INDEX = new Map<string, KnownModelSpec>();
for (const spec of KNOWN_MODEL_SPECS) {
	KNOWN_SPEC_INDEX.set(spec.id.toLowerCase(), spec);
	for (const alias of spec.matches ?? []) {
		KNOWN_SPEC_INDEX.set(alias.toLowerCase(), spec);
	}
}

const KNOWN_SPEC_PATTERNS = KNOWN_MODEL_SPECS.filter((spec) => spec.pattern !== undefined).map((spec) => ({
	spec,
	pattern: new RegExp(spec.pattern!, "i"),
}));

/**
 * Reasoning efforts a catalog spec documents, derived from its thinking-level
 * map (identity-mapped levels) when present, otherwise the provider defaults
 * for a reasoning model.
 */
export function specReasoningLevels(spec: KnownModelSpec | undefined): ModelThinkingLevel[] {
	if (!spec) return [];
	if (spec.thinkingLevelMap) {
		const levels: ModelThinkingLevel[] = [];
		for (const level of ["minimal", "low", "medium", "high", "xhigh", "max"] as const) {
			const mapped = spec.thinkingLevelMap[level];
			if (typeof mapped === "string") levels.push(level);
		}
		return levels;
	}
	return spec.reasoning ? ["low", "medium", "high"] : [];
}

/**
 * Build the thinking-level map a custom models.json entry should carry for
 * the selected reasoning levels. Unselected levels are pinned to null so the
 * runtime cannot send an effort the model does not accept; selected levels
 * reuse any documented provider-specific value and fall back to the identity
 * string otherwise. The "off" level stays available and keeps a documented
 * disable value (e.g. Hunyuan's "no_think") when the spec carries one.
 */
export function buildThinkingLevelMap(
	selectedLevels: ModelThinkingLevel[],
	baseMap?: Partial<Record<ModelThinkingLevel, string | null>>,
): Partial<Record<ModelThinkingLevel, string | null>> {
	const map: Partial<Record<ModelThinkingLevel, string | null>> = {};
	for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const) {
		if (level === "off") {
			const disabled = baseMap?.off;
			if (typeof disabled === "string") map.off = disabled;
			continue;
		}
		if (selectedLevels.includes(level)) {
			const mapped = baseMap?.[level];
			map[level] = typeof mapped === "string" ? mapped : level;
		} else {
			map[level] = null;
		}
	}
	return map;
}

/**
 * Parse a user-entered token count. Accepts plain integers plus `k`/`m`
 * suffixes (e.g. "128k", "1m") so a suffixed value is never truncated to its
 * leading digits. Returns undefined when the input is not a positive count.
 */
export function parseTokenCountInput(input: string): number | undefined {
	const match = /^(\d+)([kKmM])?$/.exec(input.trim());
	if (!match) return undefined;
	const value = Number.parseInt(match[1], 10);
	if (!Number.isFinite(value) || value <= 0) return undefined;
	const multiplier = match[2]?.toLowerCase() === "k" ? 1000 : match[2]?.toLowerCase() === "m" ? 1000000 : 1;
	return value * multiplier;
}
