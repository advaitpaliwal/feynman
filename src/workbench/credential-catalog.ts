import { MODEL_API_KEY_PROVIDERS } from "../model/api-key-providers.js";

export type WorkbenchCredentialProvider = {
	id: string;
	name: string;
	envVar: string;
	section: string;
	source: string;
	tags: string[];
};

const MODEL_CREDENTIAL_SECTIONS: Record<string, { section: string; source: string; tags: string[] }> = {
	huggingface: { section: "Evidence and models", source: "Environment", tags: ["datasets", "models"] },
	opencode: { section: "Model providers", source: "Feynman model login", tags: ["model", "gateway"] },
	"opencode-go": { section: "Model providers", source: "Feynman model login", tags: ["model", "gateway"] },
	openrouter: { section: "Model providers", source: "Feynman model login", tags: ["model", "gateway"] },
	requesty: { section: "Model providers", source: "Feynman model login", tags: ["model", "gateway"] },
};

const ADDITIONAL_CREDENTIAL_PROVIDERS: WorkbenchCredentialProvider[] = [
	{ id: "github", name: "GitHub", envVar: "GITHUB_TOKEN", section: "Evidence and models", source: "Environment", tags: ["code", "issues", "repos"] },
	{ id: "modal", name: "Modal", envVar: "MODAL_TOKEN_SECRET", section: "Cloud providers", source: "Environment", tags: ["compute", "cloud"] },
	{ id: "nvidia", name: "NVIDIA API", envVar: "NVIDIA_API_KEY", section: "Cloud providers", source: "Environment", tags: ["biology", "inference"] },
	{ id: "exa", name: "Exa Search", envVar: "EXA_API_KEY", section: "Evidence and models", source: "Feynman search settings", tags: ["search", "papers"] },
	{ id: "perplexity", name: "Perplexity Search", envVar: "PERPLEXITY_API_KEY", section: "Evidence and models", source: "Feynman search settings", tags: ["search", "papers"] },
];

const modelCredentialProviders = MODEL_API_KEY_PROVIDERS.flatMap((provider): WorkbenchCredentialProvider[] => {
	if (!provider.envVar) return [];
	const overrides = MODEL_CREDENTIAL_SECTIONS[provider.id];
	return [{
		id: provider.id,
		name: provider.label,
		envVar: provider.envVar,
		section: overrides?.section ?? "Model providers",
		source: overrides?.source ?? "Feynman model login",
		tags: overrides?.tags ?? ["model", "api key"],
	}];
});

export const WORKBENCH_CREDENTIAL_PROVIDERS: WorkbenchCredentialProvider[] = [
	...modelCredentialProviders,
	...ADDITIONAL_CREDENTIAL_PROVIDERS,
];
