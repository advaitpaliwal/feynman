import { createHash, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createServer, request as httpRequest, type Server } from "node:http";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";

import { ALPHA_HUB_AUTH_014_SOURCE_CONTRACT, assertAlphaHubAuthSource, patchAlphaHubAuthSource } from "../scripts/lib/alpha-hub-auth-patch.mjs";

const LEGACY_ENDPOINTS = [
	"const CLERK_ISSUER = 'https://clerk.alphaxiv.org';",
	"const AUTH_ENDPOINT = `${CLERK_ISSUER}/oauth/authorize`;",
	"const TOKEN_ENDPOINT = `${CLERK_ISSUER}/oauth/token`;",
	"const REGISTER_ENDPOINT = `${CLERK_ISSUER}/oauth/register`;",
	"const CALLBACK_PORT = 9876;",
	"const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;",
	"const USERINFO_ENDPOINT = `${CLERK_ISSUER}/oauth/userinfo`;",
	"const SCOPES = 'profile email offline_access';",
].join("\n");

test("patchAlphaHubAuthSource uses alphaXiv's current OAuth endpoints", () => {
	const patched = patchAlphaHubAuthSource(LEGACY_ENDPOINTS);

	assert.match(patched, /https:\/\/api\.alphaxiv\.org\/auth/);
	assert.match(patched, /oauth2\/authorize/);
	assert.match(patched, /oauth2\/token/);
	assert.match(patched, /oauth2\/register/);
	assert.match(patched, /oauth2\/userinfo/);
	assert.match(patched, /openid profile email offline_access/);
	assert.doesNotMatch(patched, /clerk\.alphaxiv\.org/);
});

test("patchAlphaHubAuthSource fixes browser open logic for WSL and Windows", () => {
	const input = [
		"function openBrowser(url) {",
		"  try {",
		"    const plat = platform();",
		"    if (plat === 'darwin') execSync(`open \"${url}\"`);",
		"    else if (plat === 'linux') execSync(`xdg-open \"${url}\"`);",
		"    else if (plat === 'win32') execSync(`start \"\" \"${url}\"`);",
		"  } catch {}",
		"}",
	].join("\n");

	const patched = patchAlphaHubAuthSource(input);

	assert.match(patched, /const isWsl = plat === 'linux'/);
	assert.match(patched, /wslview/);
	assert.match(patched, /cmd\.exe \/c start/);
	assert.match(patched, /cmd \/c start/);
});

test("patchAlphaHubAuthSource includes the auth URL in login output", () => {
	const input = "process.stderr.write('Opening browser for alphaXiv login...\\n');";

	const patched = patchAlphaHubAuthSource(input);

	assert.match(patched, /Auth URL: \$\{authUrl\.toString\(\)\}/);
});

test("patchAlphaHubAuthSource validates OAuth state on the loopback callback", () => {
	const input = [
		"function waitForCallback(server) {",
		"      const code = url.searchParams.get('code');",
		"      const error = url.searchParams.get('error');",
		"",
		"      if (error) {",
		"  const code = await waitForCallback(server);",
	].join("\n");

	const patched = patchAlphaHubAuthSource(input);

	assert.match(patched, /function waitForCallback\(server, expectedState\)/);
	assert.match(patched, /const returnedState = url\.searchParams\.get\('state'\)/);
	assert.match(patched, /returnedState !== expectedState/);
	assert.match(patched, /OAuth state mismatch/);
	assert.match(patched, /waitForCallback\(server, state\)/);
	assert.doesNotMatch(patched, /waitForCallback\(server\);/);
	assert.equal(patchAlphaHubAuthSource(patched), patched);
});

test("patchAlphaHubAuthSource is idempotent", () => {
	const input = [
		"function openBrowser(url) {",
		"  try {",
		"    const plat = platform();",
		"    if (plat === 'darwin') execSync(`open \"${url}\"`);",
		"    else if (plat === 'linux') execSync(`xdg-open \"${url}\"`);",
		"    else if (plat === 'win32') execSync(`start \"\" \"${url}\"`);",
		"  } catch {}",
		"}",
		"process.stderr.write('Opening browser for alphaXiv login...\\n');",
	].join("\n");

	const once = patchAlphaHubAuthSource(input);
	const twice = patchAlphaHubAuthSource(once);

	assert.equal(twice, once);
});

// Exact source fixtures from the integrity-verified @advaitpaliwal/alpha-hub@0.1.4 tarball.
// Published gitHead: 9ec42ba0d499284552220315247b3f2a811e6607. Gzip keeps tests self-contained.
const PERSONAL_AUTH = gunzipSync(Buffer.from(
	"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" +
	"pcG/AeGwZEqsIgAA",
	"base64",
)).toString("utf8");

test("personal 0.1.4 auth keeps upstream OAuth fixes and adds only retained Feynman controls", () => {
	const contract = ALPHA_HUB_AUTH_014_SOURCE_CONTRACT;
	assert.equal(createHash("sha256").update(PERSONAL_AUTH).digest("hex"), contract.upstreamSha256);
	const patched = patchAlphaHubAuthSource(PERSONAL_AUTH, { version: "0.1.4" });
	assertAlphaHubAuthSource(patched);
	assert.equal(createHash("sha256").update(patched).digest("hex"), contract.patchedSha256);
	assert.equal(patchAlphaHubAuthSource(patched, { version: "0.1.4" }), patched);
	assert.equal(patchAlphaHubAuthSource(PERSONAL_AUTH), patched);
	assert.equal((patched.match(/const returnedState =/g) || []).length, 2);
	assert.match(patched, /ALPHAXIV_CALLBACK_PORT/);
	assert.match(patched, /ALPHAXIV_CALLBACK_HOST/);
	assert.match(patched, /ALPHAXIV_CALLBACK_BIND/);
	assert.match(patched, /waitForCallback\(server, state\)/);
	assert.match(patched, /waitForManualRedirect\(state\)/);
	assert.match(patched, /const callbackWait = waitForCallback\(server, state\)/);
	assert.match(patched, /Promise\.race\(\[callbackWait, manualRedirect\]\)/);
	assert.match(patched, /callbackWait\.cancel\(\);/);
	assert.match(patched, /promise\.cancel = \(\) => \{[\s\S]*?clearTimeout\(timeout\);[\s\S]*?\};/);
	assert.match(patched, /wslview/);
	assert.match(patched, /Auth URL:/);
	// Existing branding substitution targeted older simple HTML, not 0.1.3/0.1.4 templates.
	for (const name of ["SUCCESS_HTML", "ERROR_HTML"]) {
		const pattern = new RegExp(`const ${name} = \\x60[\\s\\S]*?\\x60;`);
		assert.equal(patched.match(pattern)?.[0], PERSONAL_AUTH.match(pattern)?.[0]);
	}
});

test("personal auth fails closed on mutated raw/patched source and wrong explicit version", () => {
	const patched = patchAlphaHubAuthSource(PERSONAL_AUTH);
	for (const source of [PERSONAL_AUTH, patched]) {
		for (const changed of [source + "\n", source.replace("OAuth state mismatch", "ignored state"), source.replace("openid profile", "profile")]) {
			assert.throws(() => patchAlphaHubAuthSource(changed, { version: "0.1.4" }), /Unsupported/);
			assert.throws(() => patchAlphaHubAuthSource(changed), /Unsupported/);
			assert.throws(() => assertAlphaHubAuthSource(changed), /Unsupported/);
		}
	}
	assert.throws(() => patchAlphaHubAuthSource(PERSONAL_AUTH, { version: "0.1.5" }), /Unsupported/);
	assert.throws(() => patchAlphaHubAuthSource("", { version: "0.1.4" }), /Unsupported/);
	assert.throws(() => assertAlphaHubAuthSource(PERSONAL_AUTH), /Unsupported/);
});

test("personal patched auth executes Windows and WSL browser fallbacks without launching anything", () => {
	const patched = patchAlphaHubAuthSource(PERSONAL_AUTH);
	const browser = patched.match(/function openBrowser\(url\) \{[\s\S]*?\n\}/)?.[0];
	assert.ok(browser);
	for (const [platform, env, failWsl, expected] of [
		["darwin", {}, false, ['open "https://example.invalid/login"']],
		["win32", {}, false, ['cmd /c start "" "https://example.invalid/login"']],
		["linux", {}, false, ['xdg-open "https://example.invalid/login"']],
		["linux", { WSL_INTEROP: "test" }, false, ['wslview "https://example.invalid/login"']],
		["linux", { WSL_DISTRO_NAME: "test" }, true, ['wslview "https://example.invalid/login"', 'cmd.exe /c start "" "https://example.invalid/login"']],
	] as const) {
		const commands: string[] = [];
		const run = new Function("platform", "process", "execSync", `${browser}; return openBrowser;`)(
			() => platform, { env }, (command: string) => {
				commands.push(command);
				if (failWsl && command.startsWith("wslview")) throw new Error("not installed");
			},
		);
		run("https://example.invalid/login");
		assert.deepEqual(commands, expected);
	}
});

// --- Behavioral tests -------------------------------------------------------
// These execute the real patched auth module (imports replaced by test doubles)
// so the configurable callback and the paste-the-redirect-URL fallback are
// exercised end to end without touching the live alphaXiv endpoints.

type PatchedAuthModule = {
	REDIRECT_URI: string;
	CALLBACK_PORT: number;
	CALLBACK_HOST: string;
	CALLBACK_BIND: string;
	startCallbackServer: () => Promise<Server>;
	waitForCallback: (server: Server, expectedState: string) => Promise<string>;
	parseManualRedirect: (raw: string, expectedState: string) => string | null;
	login: () => Promise<{ tokens: Record<string, unknown>; userInfo: Record<string, unknown> }>;
};

type LoadedAuth = {
	module: PatchedAuthModule;
	stdin: PassThrough;
	stderrLines: string[];
	openCommands: string[];
	registerBodies: Array<{ redirect_uris?: string[] }>;
	tokenBodies: URLSearchParams[];
	authWrites: Array<Record<string, unknown>>;
	timers: {
		created: Array<{ handle: NodeJS.Timeout; delay: number | undefined }>;
		cleared: Array<unknown>;
	};
	servers: Array<{ server: Server; closes: number }>;
};

function loadPatchedAuthModule(options: {
	env?: Record<string, string>;
	tokenResponse?: Record<string, unknown>;
} = {}): LoadedAuth {
	const patched = patchAlphaHubAuthSource(PERSONAL_AUTH, { version: "0.1.4" });
	const moduleBody = patched.replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, "");
	const stdin = new PassThrough();
	const stderrLines: string[] = [];
	const openCommands: string[] = [];
	const registerBodies: Array<{ redirect_uris?: string[] }> = [];
	const tokenBodies: URLSearchParams[] = [];
	const authWrites: Array<Record<string, unknown>> = [];
	// Capture the module's real timers and servers with pass-through wrappers,
	// so cleanup assertions observe actual behavior (the 120-second window stays
	// live; only its clearing is observed).
	const realSetTimeout = globalThis.setTimeout.bind(globalThis);
	const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
	const createdTimers: Array<{ handle: NodeJS.Timeout; delay: number | undefined }> = [];
	const clearedTimers: Array<unknown> = [];
	const timerStub = ((handler: () => void, delay?: number, ...args: never[]) => {
		const handle = realSetTimeout(handler, delay, ...args) as unknown as NodeJS.Timeout;
		createdTimers.push({ handle, delay });
		return handle;
	}) as unknown as typeof setTimeout;
	const clearStub = ((handle?: NodeJS.Timeout) => {
		clearedTimers.push(handle);
		return realClearTimeout(handle);
	}) as unknown as typeof clearTimeout;
	const capturedServers: Array<{ server: Server; closes: number }> = [];
	const serverStub = ((...args: Parameters<typeof createServer>) => {
		const server = createServer(...args);
		const originalClose = server.close.bind(server);
		const record = { server, closes: 0 };
		server.close = ((callback?: (error?: Error) => void) => {
			record.closes += 1;
			return originalClose(callback);
		}) as Server["close"];
		capturedServers.push(record);
		return server;
	}) as unknown as typeof createServer;
	const tokenResponse = options.tokenResponse ?? { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 };

	const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/oauth2/register")) {
			registerBodies.push(JSON.parse(String(init?.body ?? "{}")) as { redirect_uris?: string[] });
			return new Response(JSON.stringify({ client_id: "test-client" }), { status: 200 });
		}
		if (url.endsWith("/oauth2/token")) {
			tokenBodies.push(new URLSearchParams(String(init?.body ?? "")));
			return new Response(JSON.stringify(tokenResponse), { status: 200 });
		}
		if (url.endsWith("/oauth2/userinfo")) {
			return new Response(JSON.stringify({ sub: "user-1", name: "Tester", email: "tester@example.com" }), { status: 200 });
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	}) as typeof fetch;

	const fakeProcess = {
		env: { ...options.env },
		stdin,
		stderr: {
			write: (chunk: string | Uint8Array): boolean => {
				stderrLines.push(String(chunk));
				return true;
			},
		},
	} as unknown as typeof process;

	const build = new Function(
		"createHash", "randomBytes", "createServer", "readFileSync", "writeFileSync", "mkdirSync", "existsSync",
		"join", "homedir", "execSync", "platform", "createInterface", "fetch", "process", "setTimeout", "clearTimeout",
		`${moduleBody}\nreturn { REDIRECT_URI, CALLBACK_PORT, CALLBACK_HOST, CALLBACK_BIND, startCallbackServer, waitForCallback, parseManualRedirect, login };`,
	);
	const module = build(
		createHash,
		randomBytes,
		serverStub,
		() => {
			throw new Error("no auth file in test");
		},
		(_path: string, data: string) => {
			authWrites.push(JSON.parse(data) as Record<string, unknown>);
		},
		() => {},
		() => false,
		join,
		() => "/home/tester",
		(command: string) => {
			openCommands.push(command);
			return "";
		},
		() => "linux",
		createInterface,
		fetchStub,
		fakeProcess,
		timerStub,
		clearStub,
	) as PatchedAuthModule;
	return { module, stdin, stderrLines, openCommands, registerBodies, tokenBodies, authWrites, timers: { created: createdTimers, cleared: clearedTimers }, servers: capturedServers };
}

function randomPort(): string {
	return String(30000 + Math.floor(Math.random() * 20000));
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			const code = (error as NodeJS.ErrnoException | undefined)?.code;
			if (error && code !== "ERR_SERVER_NOT_RUNNING") reject(error);
			else resolve();
		});
	});
}

async function startServerOnFreePort(options: { env?: Record<string, string>; tokenResponse?: Record<string, unknown> } = {}): Promise<LoadedAuth & { server: Server }> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const loaded = loadPatchedAuthModule({
			...options,
			env: { ...options.env, ALPHAXIV_CALLBACK_PORT: randomPort() },
		});
		try {
			const server = await loaded.module.startCallbackServer();
			return { ...loaded, server };
		} catch (error) {
			// startCallbackServer wraps EADDRINUSE into a plain Error whose message
			// names the port; detect it by message so the retry loop actually fires.
			if (!/already in use/.test((error as Error).message ?? "")) throw error;
		}
	}
	throw new Error("no free ephemeral port for tests");
}

async function waitForStderrMatch(lines: string[], pattern: RegExp, timeoutMs = 10_000): Promise<string> {
	const started = Date.now();
	for (;;) {
		const hit = lines.find((line) => pattern.test(line));
		if (hit) return hit;
		if (Date.now() - started > timeoutMs) throw new Error(`stderr never matched ${pattern}`);
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

// Starts the patched login() on a free ephemeral port and returns once the
// auth URL has been printed (so the callback server is bound and waiting).
async function startLoginOnFreePort(options: { tokenResponse?: Record<string, unknown> } = {}): Promise<{
	loaded: LoadedAuth;
	loginPromise: Promise<{ tokens: Record<string, unknown>; userInfo: Record<string, unknown> }>;
	authUrl: string;
}> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const loaded = loadPatchedAuthModule({ ...options, env: { ALPHAXIV_CALLBACK_PORT: randomPort() } });
		const loginPromise = loaded.module.login();
		const loginRejection = loginPromise.then(() => undefined, (reason: unknown) => reason);
		try {
			const authLine = await waitForStderrMatch(loaded.stderrLines, /Auth URL: (\S+)/);
			const authUrl = authLine.match(/Auth URL: (\S+)/)?.[1] ?? "";
			if (!authUrl) throw new Error("no auth URL captured");
			return { loaded, loginPromise, authUrl };
		} catch (error) {
			loginPromise.catch(() => {});
			// A port collision surfaces as the wrapped 'already in use' error on the
			// login promise (the stderr wait times out first with its own message);
			// detect either so the retry loop actually fires.
			const loginError = await loginRejection;
			const portInUse =
				/already in use/.test((error as Error).message ?? "") ||
				(loginError instanceof Error && /already in use/.test(loginError.message));
			if (!portInUse) throw error;
		}
	}
	throw new Error("no free ephemeral port for tests");
}

// Guarantees a pending login settles inside the test window; on guard
// timeout it injects the manual unblock so the suite can still exit cleanly.
function settleLogin<T>(loginPromise: Promise<T>, unblock: () => void, timeoutMs = 15_000): Promise<T> {
	let guardFired = false;
	const guard = new Promise<never>((_resolve, reject) => {
		const timer = setTimeout(() => {
			guardFired = true;
			unblock();
			reject(new Error("login did not settle within the test window"));
		}, timeoutMs);
		timer.unref?.();
	});
	return Promise.race([loginPromise, guard]).catch(async (error) => {
		if (guardFired) await loginPromise.catch(() => undefined as unknown as T);
		throw error;
	});
}

function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk: string) => {
				body += chunk;
			});
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
		});
		req.on("error", reject);
		req.end();
	});
}

test("patched manual redirect parser extracts the code and rejects unusable pastes", () => {
	const { module } = loadPatchedAuthModule();
	assert.equal(module.parseManualRedirect("http://127.0.0.1:9876/callback?code=abc&state=xyz", "xyz"), "abc");
	assert.equal(module.parseManualRedirect("  http://localhost:9876/callback?code=abc&state=xyz  ", "xyz"), "abc");
	assert.equal(module.parseManualRedirect("127.0.0.1:9876/callback?code=abc&state=xyz", "xyz"), "abc");
	assert.equal(module.parseManualRedirect("https://box.lan:9876/callback?code=abc&state=xyz", "xyz"), "abc");
	assert.equal(module.parseManualRedirect("", "xyz"), null);
	assert.equal(module.parseManualRedirect("   ", "xyz"), null);
	assert.throws(() => module.parseManualRedirect("http://127.0.0.1:9876/other?code=abc&state=xyz", "xyz"), /callback path/);
	assert.throws(() => module.parseManualRedirect("http://127.0.0.1:9876/callback?error=access_denied&state=xyz", "xyz"), /OAuth error/);
	assert.throws(() => module.parseManualRedirect("http://127.0.0.1:9876/callback?code=abc&state=other", "xyz"), /state mismatch/);
	assert.throws(() => module.parseManualRedirect("http://127.0.0.1:9876/callback?state=xyz", "xyz"), /no authorization code/);
	assert.throws(() => module.parseManualRedirect("completely invalid \\", "xyz"), /not a valid URL/);
});

test("patched callback constants honor configured host, port, and bind", async () => {
	const defaults = loadPatchedAuthModule();
	assert.equal(defaults.module.CALLBACK_PORT, 9876);
	assert.equal(defaults.module.CALLBACK_HOST, "127.0.0.1");
	assert.equal(defaults.module.CALLBACK_BIND, "127.0.0.1");
	assert.equal(defaults.module.REDIRECT_URI, "http://127.0.0.1:9876/callback");

	const loopback = loadPatchedAuthModule({ env: { ALPHAXIV_CALLBACK_PORT: "9443", ALPHAXIV_CALLBACK_HOST: "localhost" } });
	assert.equal(loopback.module.CALLBACK_PORT, 9443);
	assert.equal(loopback.module.CALLBACK_HOST, "localhost");
	assert.equal(loopback.module.CALLBACK_BIND, "localhost");
	assert.equal(loopback.module.REDIRECT_URI, "http://localhost:9443/callback");

	// A non-loopback callback host is rejected outright, so no non-loopback
	// host and no https can ever appear in the redirect URI.
	for (const host of ["box.lan", "10.0.0.5", "[2001:db8::1]"]) {
		assert.throws(() => loadPatchedAuthModule({ env: { ALPHAXIV_CALLBACK_HOST: host } }), /ALPHAXIV_CALLBACK_HOST must be a loopback host/);
	}
	for (const host of ["localhost", "127.0.0.1", "127.8.9.10", "::1", "[::1]"]) {
		const loaded = loadPatchedAuthModule({ env: { ALPHAXIV_CALLBACK_HOST: host } });
		const redirectHost = host === "::1" ? "[::1]" : host;
		assert.equal(loaded.module.REDIRECT_URI, `http://${redirectHost}:9876/callback`);
		assert.doesNotThrow(() => new URL(loaded.module.REDIRECT_URI));
		assert.equal(loaded.module.CALLBACK_BIND, host.replace(/^\[|\]$/g, ""));
	}

	const published = await startServerOnFreePort({ env: { ALPHAXIV_CALLBACK_BIND: "0.0.0.0" } });
	try {
		assert.equal(published.module.CALLBACK_HOST, "127.0.0.1");
		assert.equal(published.module.REDIRECT_URI, `http://127.0.0.1:${published.module.CALLBACK_PORT}/callback`);
		const address = published.server.address() as AddressInfo;
		assert.equal(address.address, "0.0.0.0");
		assert.equal(address.port, published.module.CALLBACK_PORT);
	} finally {
		await closeServer(published.server);
	}
});

test("patched callback rejects a state mismatch and accepts the matching browser callback", async () => {
	const { module, server } = await startServerOnFreePort();
	try {
		const address = server.address() as AddressInfo;
		const mismatch = module.waitForCallback(server, "expected-state");
		const mismatchSettled = assert.rejects(mismatch, /OAuth state mismatch/);
		const bad = await httpGet(address.port, "/callback?code=x&state=other");
		assert.equal(bad.status, 400);
		assert.match(bad.body, /Login failed/);
		await mismatchSettled;
		assert.equal(server.listening, false);
	} finally {
		await closeServer(server);
	}

	const fresh = await startServerOnFreePort();
	try {
		const wait = fresh.module.waitForCallback(fresh.server, "expected-state");
		const good = await httpGet((fresh.server.address() as AddressInfo).port, "/callback?code=browser-code&state=expected-state");
		assert.equal(good.status, 200);
		assert.match(good.body, /Logged in/);
		assert.equal(await wait, "browser-code");
	} finally {
		await closeServer(fresh.server);
	}
});

test("patched login completes the normal same-device browser flow unchanged", async () => {
	const { loaded, loginPromise, authUrl } = await startLoginOnFreePort();
	const { module, stdin, stderrLines, tokenBodies, registerBodies, authWrites, openCommands } = loaded;
	const state = new URL(authUrl).searchParams.get("state");
	assert.ok(state);
	assert.equal(new URL(authUrl).searchParams.get("redirect_uri"), module.REDIRECT_URI);
	assert.equal(new URL(authUrl).searchParams.get("response_type"), "code");
	// The paste fallback prompt coexists with the normal browser flow.
	assert.ok(stderrLines.some((line) => line.includes("paste the final redirect URL")));
	assert.match(openCommands[0] ?? "", /^xdg-open /);

	const page = await httpGet(module.CALLBACK_PORT, `/callback?code=browser-code&state=${state}`);
	assert.equal(page.status, 200);
	assert.match(page.body, /Logged in/);
	const result = await settleLogin(loginPromise, () => stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=late&state=${state}\n`));
	assert.deepEqual(result.tokens, { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
	assert.equal(registerBodies[0]?.redirect_uris?.[0], module.REDIRECT_URI);
	assert.equal(tokenBodies[0]?.get("code"), "browser-code");
	assert.equal(tokenBodies[0]?.get("redirect_uri"), module.REDIRECT_URI);
	assert.equal(tokenBodies[0]?.get("client_id"), "test-client");
	assert.equal(authWrites.at(-1)?.client_id, "test-client");
	assert.equal(authWrites.at(-1)?.user_name, "Tester");
	assert.equal(authWrites.at(-1)?.user_email, "tester@example.com");
});

test("patched login accepts a pasted redirect URL completed on another device", async () => {
	const { loaded, loginPromise, authUrl } = await startLoginOnFreePort();
	const { module, stdin, stderrLines, tokenBodies, registerBodies, authWrites } = loaded;
	const state = new URL(authUrl).searchParams.get("state");
	assert.ok(state);
	// No HTTP callback happens: the browser lands on the pasted URL elsewhere.
	stdin.write(`http://localhost:${module.CALLBACK_PORT}/callback?code=manual-code&state=${state}\n`);
	const result = await settleLogin(loginPromise, () => stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=manual-code&state=${state}\n`));
	assert.deepEqual(result.tokens, { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
	assert.equal(tokenBodies[0]?.get("code"), "manual-code");
	assert.equal(tokenBodies[0]?.get("redirect_uri"), module.REDIRECT_URI);
	assert.equal(registerBodies[0]?.redirect_uris?.[0], module.REDIRECT_URI);
	assert.equal(authWrites.at(-1)?.access_token, "test-access");
});

test("patched login survives a bad pasted redirect and completes on a good one", async () => {
	const { loaded, loginPromise, authUrl } = await startLoginOnFreePort();
	const { module, stdin, stderrLines, tokenBodies } = loaded;
	const state = new URL(authUrl).searchParams.get("state");
	assert.ok(state);
	stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=x&state=stale-state\n`);
	await waitForStderrMatch(stderrLines, /Could not use that URL: OAuth state mismatch/);
	stdin.write(`http://localhost:${module.CALLBACK_PORT}/callback?code=recovered-code&state=${state}\n`);
	const result = await settleLogin(loginPromise, () => stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=recovered-code&state=${state}\n`));
	assert.deepEqual(result.tokens, { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
	assert.equal(tokenBodies[0]?.get("code"), "recovered-code");
});

test("patched login waits for the browser callback even when stdin closes before a paste", async () => {
	const { loaded, loginPromise, authUrl } = await startLoginOnFreePort();
	const { module, stdin, tokenBodies } = loaded;
	const state = new URL(authUrl).searchParams.get("state");
	assert.ok(state);
	// Simulate piped stdin: EOF arrives with no pasted line.
	stdin.end();
	const page = await httpGet(module.CALLBACK_PORT, `/callback?code=browser-code&state=${state}`);
	assert.equal(page.status, 200);
	const result = await settleLogin(loginPromise, () => stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=browser-code&state=${state}\n`));
	assert.deepEqual(result.tokens, { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
	assert.equal(tokenBodies[0]?.get("code"), "browser-code");
});

test("patched login clears the pending 120-second timer and closes the server when a pasted login wins", async () => {
	const { loaded, loginPromise, authUrl } = await startLoginOnFreePort();
	const { module, stdin, tokenBodies, timers, servers } = loaded;
	const state = new URL(authUrl).searchParams.get("state");
	assert.ok(state);
	// Regression guard for the cross-device paste path: no HTTP callback ever
	// reaches the server, so without completion cleanup its pending wait timer
	// kept the CLI alive for the full window after a successful login.
	const waitTimer = timers.created.find((entry) => entry.delay === 120000);
	assert.ok(waitTimer, "login still creates the exact 120-second wait window");
	assert.ok(!timers.cleared.includes(waitTimer.handle), "the window stays armed while the wait is pending");
	stdin.write(`http://localhost:${module.CALLBACK_PORT}/callback?code=manual-code&state=${state}\n`);
	const result = await settleLogin(loginPromise, () => stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=manual-code&state=${state}\n`));
	assert.deepEqual(result.tokens, { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
	assert.equal(tokenBodies[0]?.get("code"), "manual-code");
	// The wait settled through the paste path: the abandoned timer must be
	// cleared and the callback server closed, so the CLI returns promptly.
	assert.ok(timers.cleared.includes(waitTimer.handle));
	const loginServer = servers[0];
	assert.ok(loginServer);
	assert.ok(loginServer.closes >= 1, "callback server is closed after a pasted login");
	assert.equal(loginServer.server.listening, false);
});

test("patched login performs the same timer and server cleanup after a successful browser callback", async () => {
	const { loaded, loginPromise, authUrl } = await startLoginOnFreePort();
	const { module, stdin, tokenBodies, timers, servers } = loaded;
	const state = new URL(authUrl).searchParams.get("state");
	assert.ok(state);
	const page = await httpGet(module.CALLBACK_PORT, `/callback?code=browser-code&state=${state}`);
	assert.equal(page.status, 200);
	const result = await settleLogin(loginPromise, () => stdin.write(`http://127.0.0.1:${module.CALLBACK_PORT}/callback?code=late&state=${state}\n`));
	assert.deepEqual(result.tokens, { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
	assert.equal(tokenBodies[0]?.get("code"), "browser-code");
	const waitTimer = timers.created.find((entry) => entry.delay === 120000);
	assert.ok(waitTimer, "browser flow still creates the exact 120-second wait window");
	assert.ok(timers.cleared.includes(waitTimer.handle));
	const loginServer = servers[0];
	assert.ok(loginServer);
	assert.ok(loginServer.closes >= 1, "callback server is closed after a browser callback");
	assert.equal(loginServer.server.listening, false);
});
