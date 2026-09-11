---
title: CLI Commands
description: Complete reference for all Feynman CLI commands and flags.
section: Reference
order: 1
---

This page covers the dedicated Feynman CLI commands and flags. Workflow commands like `feynman deepresearch` are also documented in the [Slash Commands](/docs/reference/slash-commands) reference since they map directly to REPL slash commands.

## Core commands

| Command | Description |
| --- | --- |
| `feynman` | Launch the interactive REPL |
| `feynman chat [prompt]` | Start chat explicitly, optionally with an initial prompt |
| `feynman help` | Show CLI help |
| `feynman setup` | Run the guided setup wizard |
| `feynman setup preview` | Install or verify preview dependencies |
| `feynman doctor` | Diagnose config, auth, Pi runtime, and preview dependencies |
| `feynman status` | Show the current setup summary (model, auth, packages) |
| `feynman serve` | Start the local science workbench for projects, Pi chat, Feynman Bio Tools, notebooks, compute, artifact previews, provenance, settings, and onboarding context |
| `feynman rank "topic"` | Rank papers for deciding what to read first, with transparent citation, method, reproducibility, and provenance evidence |
| `feynman paper <id-or-title>` | Resolve legal full-text access candidates for one paper and optionally fetch source-specific text |

## Science workbench

`feynman serve` starts a local authenticated web app for research runs that need a control plane instead of a terminal-only session. It exposes projects, sessions, Pi-backed chat, Feynman Bio Tools for exact OpenAlex/arXiv literature workflows, trials, Grants.gov opportunity search, FDA regulatory data, exact gnomAD/CADD/ClinVar/dbSNP variant workflows, GTEx/PanglaoDB expression workflows, MyGene/OLS/QuickGO/UniProt/Reactome/KEGG genes-and-ontologies workflows, exact Ensembl genome workflows, exact UCSC Genome Browser workflows, exact ENCODE/JASPAR/UniBind regulation workflows, exact InterPro/Pfam/Human Protein Atlas/STRING protein-annotation workflows, exact Antibody Registry reagent workflows, exact Rfam RNA workflows, exact ArrayExpress/GEO/MetaboLights/MGnify/PRIDE omics-archive workflows, and bio databases, attachments, artifacts, audio/video/spreadsheet/notebook/LaTeX/science previews including KET/RXN/CDXML/CXSMILES chemistry sketches, versions, lineage, execution logs, verification checks, notebooks, compute inventory, specialists, skills, connectors, memory categories, permissions, storage, and credential availability.

Use `feynman serve --no-auth` for a trusted local-only session that should open at a plain `http://127.0.0.1:<port>/` URL without a launch token. Use the default token URL when exposing the server beyond your own machine.

The workbench is Feynman-owned. It uses Feynman Bio Tools and Feynman's own workspace/settings records; it does not require another local app to be installed for core product behavior. Feynman Bio Tools includes exact OpenAlex work search/detail, citations, references, author search/detail, venue metadata, exact arXiv search and batch paper retrieval, PubMed metadata, PMID/PMCID/DOI conversion, related-article links, citation matching, copyright/license checks, PMC full-text routing, ClinicalTrials.gov NCT detail records, sponsor-specific programs, eligibility filters, investigator/contact discovery, endpoint summaries, Grants.gov Search2 opportunity lookup, exact Antibody Registry search/detail/catalog/stat workflows, ChEMBL compound/drug/ADMET/bioactivity/mechanism/target workflows, exact gnomAD short/SV/mitochondrial variant workflows, CADD variant/position/range scoring, direct ClinVar search/accession/rsID workflows, dbSNP rsID/region workflows, GTEx dataset/tissue/sample/gene/expression/eQTL workflows, PanglaoDB marker-gene and gene-to-cell-type workflows, Ensembl lookup/xrefs/VEP/homology/sequence/overlap-region retrieval, UCSC track/chromosome/track-data/conservation/TFBS retrieval, exact ENCODE experiment/biosample/file search and detail workflows, exact JASPAR matrix/version/catalog workflows, exact UniBind dataset and regional TFBS workflows, exact GWAS Catalog association/study/trait/SNP workflows, exact eQTL Catalogue dataset and association workflows, PheWeb/FinnGen PheWAS workflows, exact Rfam RNA family metadata/accession/alignment/model/tree/region/structure/search workflows, exact ArrayExpress experiment/files/sample workflows, GEO series search/detail, MetaboLights study/file workflows, MGnify study/analysis workflows, PRIDE project/protein-evidence workflows, exact InterPro/Pfam domain architecture, entry, clan, and family member workflows, Human Protein Atlas gene/search workflows, STRING mapping/network/similarity workflows, MyGene query-many lookup, OLS ontology catalogue/search/term lookup, QuickGO annotations, UniProt entry retrieval, Reactome pathway mapping, KEGG entry/search/link/ID-conversion workflows, and richer bioRxiv/medRxiv DOI lookup, date/category preprint windows, published-preprint links, funder/ROR lookup, and usage/content statistics. See the [Science Workbench guide](/docs/getting-started/workbench).

## Paper access commands

| Command | Description |
| --- | --- |
| `feynman paper 10.7717/peerj.4375` | Resolve OpenAlex, DOI, publisher/repository, and Europe PMC access candidates |
| `feynman paper pmid:29456894` | Resolve a PubMed/PMC-indexed paper through exact OpenAlex PMID/PMCID metadata and Europe PMC candidates |
| `feynman paper 2309.08600 --fetch-full-text` | Fetch text through source-specific APIs when available and write bounded access artifacts |
| `feynman paper "paper title" --json` | Search OpenAlex by title and print a machine-readable access summary |

Paper access writes `<slug>-paper-access.md` and `<slug>-paper-access.json`. It records access candidates from OpenAlex, DOI, PMID/PMCID, arXiv/alphaXiv, and Europe PMC. It does not bypass paywalls and does not write raw full-text bodies to artifacts.

## PaperRank commands

| Command | Description |
| --- | --- |
| `feynman rank "topic"` | Fetch OpenAlex works and rank papers for a topic |
| `feynman rank "topic" --limit 20` | Limit the candidate paper count |
| `feynman rank "topic" --expand-citations 2` | Add cited and citing works to the local graph before scoring graph prestige |
| `feynman rank "topic" --full-text-top 3` | Fetch source-specific full text for top candidates, add section-aware rubric evidence, and rescore |
| `feynman rank "topic" --critique-top 5` | Write research-critique strengths, concerns, and follow-up questions for top ranked papers |
| `feynman rank "topic" --preference-file preferences.json` | Evaluate rank agreement against researcher read-order preferences |
| `feynman rank "topic" --reproduction-notes reproduction-notes.json` | Record completed reproduction outcomes separately from planned replication checks |
| `feynman rank "topic" --synthesis-top 7` | Choose how many ranked papers enter the bounded model-synthesis packet |
| `feynman rank "topic" --synthesize` | Ask the recommended approved research model to write `<slug>-model-synthesis.md` and print the selected model |
| `feynman rank "topic" --synthesize --model provider/model` | Run model synthesis with an explicit approved model for this command |
| `feynman rank "topic" --synthesize --synthesis-model provider/model` | Run model synthesis with an explicit approved model without changing the chat model flag |
| `feynman rank "topic" --output-dir outputs` | Choose where artifacts are written |
| `feynman rank "topic" --json` | Print a compact JSON summary after writing artifacts |

PaperRank writes a ranked brief, normalized paper/score JSONL, a score audit, citation/field context, graph explorer, rank-sensitivity data, and provenance by default. Optional flags add research critique, empirical preference calibration, completed reproduction notes, source-specific full-text enrichment, citation-neighborhood expansion, or model synthesis. The CLI output, JSON summary, generated synthesis, and provenance record the selected model and whether it came from the recommendation path or an explicit override. The score separates topical relevance, citation impact, local graph prestige, citation velocity, methodology screening, and reproducibility screening. The score audit explains per-paper weights, contribution math, visible evidence, missing components, rubric gaps, field roles, and critique status. Preference files and reproduction notes are treated as external evidence; without them, PaperRank labels those checks as not provided without writing extra calibration or reproduction files. The synthesis packet and prompt are bounded model inputs that omit raw full text and are written only when synthesis is requested. The graph explorer is an inspection view and does not embed raw full-text bodies.

## Model management

| Command | Description |
| --- | --- |
| `feynman model list` | List available models in Pi auth storage |
| `feynman model login [id]` | Authenticate a model provider with OAuth or API-key setup |
| `feynman model logout [id]` | Clear stored auth for a model provider |
| `feynman model set <provider/model>` | Set the default approved research model for all sessions |

These commands manage your model provider configuration. The `model set` command updates `~/.feynman/agent/settings.json` with the new default. It accepts either `provider/model-name` or `provider:model-name`; run `feynman model list` first and choose an approved model ID from that output. For `feynman model login openrouter` over SSH or another headless session, paste the browser's final redirect URL or authorization code into Feynman when the loopback callback is unavailable, or set `OPENROUTER_API_KEY` before launch to use API-key authentication without OAuth. `feynman model login requesty` registers the Requesty OpenAI-compatible gateway (set `REQUESTY_API_KEY`, optionally `REQUESTY_BASE_URL` for the EU router) and seeds its models from Requesty's managed policies. Running `feynman model login google` or `feynman model login amazon-bedrock` routes directly into the relevant API-key setup flow instead of requiring the interactive picker.

## AlphaXiv commands

| Command | Description |
| --- | --- |
| `feynman alpha login` | Sign in to alphaXiv |
| `feynman alpha logout` | Clear alphaXiv auth |
| `feynman alpha status` | Refresh expired alphaXiv credentials when possible and verify live auth status |
| `feynman alpha search "query"` | Search papers through Feynman's bundled alphaXiv client |
| `feynman alpha get <id-or-url>` | Fetch paper content and local annotations |
| `feynman alpha ask <id-or-url> "question"` | Ask a question about a paper |
| `feynman alpha code <github-url> [path]` | Inspect a paper repository |
| `feynman alpha annotate ...` | Read, write, list, or clear local paper notes |

AlphaXiv authentication enables Feynman to search and retrieve papers, access discussion threads, and pull citation metadata. Use `feynman alpha ...` for shell access so Feynman runs its bundled patched alphaXiv client.

## Package management

| Command | Description |
| --- | --- |
| `feynman packages list` | List supported optional research packages and their install status |
| `feynman packages install <preset>` | Install an optional package preset |
| `feynman update [package]` | Update installed packages, or a specific package by name |

Use `feynman packages list` to see which optional research-continuity packages are available on your platform and which are already installed. The default install keeps only the research essentials in core, including `/btw` side conversations for steering while the main research agent is busy. Install optional presets one by one when they directly support an active research workflow.

## Utility commands

| Command | Description |
| --- | --- |
| `feynman search status` | Show Pi web-access status and config path |

## REPL hotkeys

Inside the interactive REPL, use `/hotkeys` to show the live keyboard map. The default reasoning controls are:

| Hotkey | Action |
| --- | --- |
| `Shift+Tab` | Cycle thinking/reasoning level |
| `Ctrl+T` | Toggle thinking block visibility |

## Workflow commands

All research workflow slash commands can also be invoked directly from the CLI:

```bash
feynman deepresearch "topic"
feynman lit "topic-or-lab"
feynman review artifact.md
feynman audit 2401.12345
feynman replicate "claim"
feynman recipe "fine-tune a small model for math reasoning"
feynman compare "topic"
feynman draft "topic"
```

These are equivalent to launching the REPL and typing the corresponding slash command.

## Flags

| Flag | Description |
| --- | --- |
| `--prompt "<text>"` | Run one prompt and exit (one-shot mode) |
| `--model <provider/model|provider:model>` | Force a specific approved research model for this session |
| `--thinking <level>` | Set thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |
| `--cwd <path>` | Set the working directory for all file operations |
| `--session-dir <path>` | Set the session storage directory |
| `--new-session` | Start a new persisted session |
| `--alpha-login` | Sign in to alphaXiv and exit |
| `--alpha-logout` | Clear alphaXiv auth and exit |
| `--alpha-status` | Show alphaXiv auth status and exit |
| `--doctor` | Alias for `feynman doctor` |
| `--setup-preview` | Alias for `feynman setup preview` |

Use the standard `--` delimiter before an interactive prompt that starts with
a dash, so Pi treats it as research text rather than another option:

```bash
feynman -- "- summarize the strongest evidence first"
```

For one-shot mode, attach a dash-leading value directly to `--prompt`:

```bash
feynman --prompt="- summarize the strongest evidence first"
```
