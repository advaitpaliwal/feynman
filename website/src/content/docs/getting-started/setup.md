---
title: Setup
description: Walk through the guided setup wizard to configure Feynman.
section: Getting Started
order: 3
---

The `feynman setup` wizard configures your model provider, API keys, and optional packages. It runs automatically on first launch, but you can re-run it at any time to change your configuration.

## Running setup

```bash
feynman setup
```

The wizard walks you through three stages: model configuration, authentication, and optional package installation.

## Stage 1: Model selection

Feynman supports multiple model providers. The setup wizard presents a list of available providers and models. Select your preferred approved research model using the arrow keys:

```
? Select your default model:
> provider:approved-model-from-your-list
  provider:another-approved-model
```

The non-premium model you choose here becomes the default for all sessions. You can override it per-session with the `--model` flag or change it later via `feynman model set <provider/model>` or `feynman model set <provider:model>`. Feynman rejects premium Pro-class model IDs for default and explicit model selection. Exact DeepSeek V4 Pro IDs remain available because the model name does not identify a premium service tier.

## Stage 2: Authentication

Depending on your chosen provider, setup prompts you for an API key or walks you through OAuth login. For providers that support Pi OAuth, such as Anthropic, OpenAI, GitHub Copilot, and OpenRouter, Feynman opens a browser window to complete sign-in. GitHub Copilot sign-in retries model discovery once when GitHub rate-limits the request. In a remote or headless OpenRouter session where the loopback callback is unavailable, paste the browser's final redirect URL or authorization code into Feynman's prompt. You can also set `OPENROUTER_API_KEY` before launching Feynman to use an OpenRouter API key without OAuth. Stored credentials live in the Pi auth storage at `~/.feynman/`.

For API key providers, you are prompted to paste your key directly:

```
? Enter your API key: sk-ant-...
```

Keys are encrypted at rest and never sent anywhere except the provider's API endpoint.

### Amazon Bedrock

For Amazon Bedrock, choose:

```text
Amazon Bedrock (AWS credential chain)
```

Feynman verifies the same AWS credential chain Pi uses at runtime, including `AWS_PROFILE`, `~/.aws` credentials/config, SSO, ECS/IRSA, and EC2 instance roles. Once that check passes, Bedrock models become available in `feynman model list` without needing a traditional API key.

### Local models: LM Studio, LiteLLM, Ollama, vLLM

If you want to use LM Studio, start the LM Studio local server, load a model, choose the API-key flow, and then select:

```text
LM Studio (local OpenAI-compatible server)
```

The default settings are:

```text
Base URL: http://localhost:1234/v1
Authorization header: No
API key: lm-studio
```

Feynman attempts to read LM Studio's `/models` endpoint and prefill the loaded model id.

For LiteLLM, start the proxy, choose the API-key flow, and then select:

```text
LiteLLM Proxy (OpenAI-compatible gateway)
```

The default settings are:

```text
Base URL: http://localhost:4000/v1
API mode: openai-completions
Master key: optional, read from LITELLM_MASTER_KEY
```

Feynman attempts to read LiteLLM's `/models` endpoint and prefill model ids from the proxy config.

For Ollama, vLLM, or another OpenAI-compatible local server, choose:

```text
Custom provider (baseUrl + API key)
```

For Ollama, the typical settings are:

```text
API mode: openai-completions
Base URL: http://localhost:11434/v1
Authorization header: No
Model ids: llama3.1:8b
API key: local
```

After saving the provider, run:

```bash
feynman model list
feynman model set <provider>/<model-id>
```

to confirm the local model is available and make it the default.

## Stage 3: Optional packages

Feynman's core ships with the research essentials: alphaXiv access, web access, document parsing, subagents, and `/btw` side conversations while the main research agent is busy. On platforms with supported optional presets, the wizard can offer extras:

- **memory** -- Preference and correction memory for research-session continuity
- **hindsight** -- Hindsight-backed research-continuity memory; requires a Hindsight server or Hindsight Cloud account
- **session-search** -- Indexed recall for prior research-session transcripts. Available through Node.js 22.x while its sqlite dependency is native-bound

You can skip this step and install packages later with `feynman packages install <preset>`.

## Workbench onboarding

`feynman serve` includes a separate local onboarding flow for the science workbench. That flow creates a Feynman project and session, captures field and research-goal context, selects a suggested specialist, records chosen setup scopes, suggests seed workflows, and enables Feynman-owned connectors such as Feynman Bio Tools when science-database access is selected.

Workbench onboarding stores setup intent and redacted credential availability records in Feynman-owned state. It does not require another local app and does not expose raw credential values in the browser.

## Re-running setup

Configuration is stored in `~/.feynman/agent/settings.json`. Running `feynman setup` again overwrites previous settings. If you only need to change a specific value, edit the config file directly or use the targeted commands like `feynman model set` or `feynman alpha login`.
