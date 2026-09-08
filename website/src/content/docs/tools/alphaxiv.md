---
title: AlphaXiv
description: Search and retrieve academic papers through the AlphaXiv integration.
section: Tools
order: 1
---

AlphaXiv is the primary academic paper search and retrieval tool in Feynman. It provides access to a large corpus of research papers, discussion threads, citation metadata, and source-specific paper text when available. The researcher agent uses AlphaXiv as its primary source for academic content.

## Authentication

AlphaXiv requires authentication. Set it up during initial setup or at any time:

```bash
feynman alpha login
```

Check your authentication status:

```bash
feynman alpha status
```

### Logging in from another device

Before this change, completing the alphaXiv sign-in from a different device was
not possible at all: the flow hard-assumed the browser and the token-storage
device were the same machine. Login now also finishes from any device by
pasting the redirect URL; credentials are always stored on the device running
Feynman.

**Paste the redirect URL (works everywhere, no network setup):** run
`feynman alpha login`, complete the sign-in on any device you like, then paste
the browser's final address — `http://127.0.0.1:9876/callback?code=...` — into
the waiting CLI, which shows a `Paste the redirect URL:` prompt while it
listens. The page may fail to load (nothing may be listening on the
browsing device's loopback), but the address bar still holds the URL; the CLI
extracts the code from it. Press Ctrl-C to cancel. The wait window is 120
seconds, so complete the sign-in and paste within that time or rerun the
login.

This works with zero network assumptions: the redirect URI is the token
device's own loopback (`127.0.0.1`), which is exactly why a remote browser can
never reach the callback directly — and why the paste path exists.

**SSH reverse tunnel (hands-free, automatic completion):** forward the
browsing device's loopback port back to the token device's callback server
while the login is waiting, e.g. from the token device:

```bash
ssh -R 9876:127.0.0.1:9876 user@browsing-device
```

The browser's `http://127.0.0.1:9876/callback` redirect then reaches Feynman
through the tunnel and login completes without pasting anything.

**Published container port (Docker):** when the browser runs on the Docker
host, publish the callback port and bind all interfaces so the loopback
redirect resolves through the published port:

```bash
docker run -p 9876:9876 -e ALPHAXIV_CALLBACK_BIND=0.0.0.0 ... feynman alpha login
```

The callback is configurable through environment variables, all optional:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALPHAXIV_CALLBACK_PORT` | `9876` | Callback port used in both the redirect URI and the local server bind |
| `ALPHAXIV_CALLBACK_HOST` | `127.0.0.1` | Loopback host in the redirect URI (`localhost`, `127.x`, or `::1`). The redirect URI is always `http` and the direct browser callback is loopback-only; a non-loopback value is rejected with an error pointing to the paste fallback |
| `ALPHAXIV_CALLBACK_BIND` | the loopback callback host | Address the local callback server binds (e.g. `0.0.0.0` inside Docker) |

## What it provides

AlphaXiv gives Feynman access to several capabilities that power the research workflows:

- **Paper search** -- Find papers by topic, author, keyword, or arXiv ID (`feynman alpha search`)
- **Paper content retrieval** -- Fetch alphaXiv-provided paper content or source-specific text when available (`feynman alpha get`)
- **Section-focused extraction (agent tool)** -- In-agent `alpha_get_paper` supports `section` and `sections` filters for abstract, introduction, methodology, experiments, results, discussion, limitations, and conclusion when available
- **Paper Q&A** -- Ask targeted questions about a paper's content (`feynman alpha ask`)
- **Code inspection** -- Read files from a paper's linked GitHub repository (`feynman alpha code`)
- **Annotations** -- Persistent local notes on papers across sessions (`feynman alpha annotate`)

## How it is used

Feynman ships an `alpha-research` skill that teaches the agent to use Feynman's alphaXiv tools for paper operations. The researcher agent uses them during workflows like deep research, literature review, and internal research review. When you provide an arXiv ID (like `2401.12345`), the agent fetches the paper via `feynman alpha get`.

You can also use Feynman's bundled alphaXiv client directly from the terminal:

```bash
feynman alpha search "scaling laws"
feynman alpha get 2401.12345
feynman alpha ask 2401.12345 "What optimizer did they use?"
feynman alpha code https://github.com/org/repo src/model.py
```

## Configuration

Authentication state is managed by the bundled alphaXiv client and persists separately from Feynman's own home directory. Feynman stores its runtime state under `~/.feynman`; alphaXiv login state can be removed separately from `~/.ahub` during uninstall. No additional configuration is needed beyond logging in.

## Without AlphaXiv

If you choose not to authenticate with AlphaXiv, Feynman still functions but with reduced academic search capabilities. It falls back to web search for finding papers, which works for well-known work but misses AlphaXiv citation metadata, discussion threads, and source-specific paper text when available. For serious research workflows, AlphaXiv authentication is strongly recommended.
