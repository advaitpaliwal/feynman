import { createHash } from "node:crypto";

// @advaitpaliwal/alpha-hub@0.1.4, published source 9ec42ba0d499284552220315247b3f2a811e6607.
// OAuth endpoints/openid/state are already fixed upstream. Feynman adds the
// Windows/WSL browser and URL-log adaptations, a configurable callback
// host/port/bind (so the browsing device can differ from the token-storage
// device, e.g. inside Docker), and a paste-the-redirect-URL login fallback
// with a visible paste prompt while the CLI waits for input.
export const ALPHA_HUB_AUTH_014_SOURCE_CONTRACT = Object.freeze({
	version: "0.1.4",
	upstreamSha256: "5a16cb4f7fd0faf440951861699450f4d762ae7ef1919701fcded3d4f373ced6",
	patchedSha256: "60e54a80e037735fa839e77fe7e018b414b6052c3b37be44c2c23c8beb59fa7f",
});
const LEGACY_AUTH_SHA256 = "fa1678c9a1e0f4d3240231728dadbd4b778ba9f9f4b937f235624df67346bf6c";
const sourceDigest = (source) => createHash("sha256").update(source).digest("hex");

export function assertAlphaHubAuthSource(source) {
	if (sourceDigest(source) !== ALPHA_HUB_AUTH_014_SOURCE_CONTRACT.patchedSha256) {
		throw new Error("Unsupported alpha-hub 0.1.4 patched auth source");
	}
}

const LEGACY_SUCCESS_HTML = "'<html><body><h2>Logged in to Alpha Hub</h2><p>You can close this tab.</p></body></html>'";
const LEGACY_ERROR_HTML = "'<html><body><h2>Login failed</h2><p>You can close this tab.</p></body></html>'";

const bodyAttr = 'style="font-family:system-ui,sans-serif;text-align:center;padding-top:20vh;background:#050a08;color:#f0f5f2"';
const logo = '<h1 style="font-family:monospace;font-size:48px;color:#34d399;margin:0">feynman</h1>';

const FEYNMAN_SUCCESS_HTML = `'<html><body ${bodyAttr}>${logo}<h2 style="color:#34d399;margin-top:16px">Logged in</h2><p style="color:#8aaa9a">You can close this tab.</p></body></html>'`;
const FEYNMAN_ERROR_HTML = `'<html><body ${bodyAttr}>${logo}<h2 style="color:#ef4444;margin-top:16px">Login failed</h2><p style="color:#8aaa9a">You can close this tab.</p></body></html>'`;

const CURRENT_OPEN_BROWSER = [
	"function openBrowser(url) {",
	"  try {",
	"    const plat = platform();",
	"    if (plat === 'darwin') execSync(`open \"${url}\"`);",
	"    else if (plat === 'linux') execSync(`xdg-open \"${url}\"`);",
	"    else if (plat === 'win32') execSync(`start \"\" \"${url}\"`);",
	"  } catch {}",
	"}",
].join("\n");

const PATCHED_OPEN_BROWSER = [
	"function openBrowser(url) {",
	"  try {",
	"    const plat = platform();",
	"    const isWsl = plat === 'linux' && (Boolean(process.env.WSL_DISTRO_NAME) || Boolean(process.env.WSL_INTEROP));",
	"    if (plat === 'darwin') execSync(`open \"${url}\"`);",
	"    else if (isWsl) {",
	"      try {",
	"        execSync(`wslview \"${url}\"`);",
	"      } catch {",
	"        execSync(`cmd.exe /c start \"\" \"${url}\"`);",
	"      }",
	"    }",
	"    else if (plat === 'linux') execSync(`xdg-open \"${url}\"`);",
	"    else if (plat === 'win32') execSync(`cmd /c start \"\" \"${url}\"`);",
	"  } catch {}",
	"}",
].join("\n");

const LEGACY_WIN_OPEN = "else if (plat === 'win32') execSync(`start \"${url}\"`);";
const FIXED_WIN_OPEN = "else if (plat === 'win32') execSync(`cmd /c start \"\" \"${url}\"`);";

const OPEN_BROWSER_LOG = "process.stderr.write('Opening browser for alphaXiv login...\\n');";
const OPEN_BROWSER_LOG_WITH_URL = "process.stderr.write(`Opening browser for alphaXiv login...\\nAuth URL: ${authUrl.toString()}\\n`);";

const LEGACY_CALLBACK_DECLARATION = "function waitForCallback(server) {";
const VALIDATING_CALLBACK_DECLARATION = "function waitForCallback(server, expectedState) {";

const LEGACY_CALLBACK_PARAMS = [
	"      const code = url.searchParams.get('code');",
	"      const error = url.searchParams.get('error');",
	"",
	"      if (error) {",
].join("\n");

const VALIDATING_CALLBACK_PARAMS = [
	"      const code = url.searchParams.get('code');",
	"      const error = url.searchParams.get('error');",
	"      const returnedState = url.searchParams.get('state');",
	"",
	"      if (!returnedState || returnedState !== expectedState) {",
	"        res.writeHead(400, { 'Content-Type': 'text/html' });",
	"        res.end(ERROR_HTML);",
	"        clearTimeout(timeout);",
	"        server.close();",
	"        reject(new Error('OAuth state mismatch'));",
	"        return;",
	"      }",
	"",
	"      if (error) {",
].join("\n");

const LEGACY_CALLBACK_CALL = "  const code = await waitForCallback(server);";
const VALIDATING_CALLBACK_CALL = "  const code = await waitForCallback(server, state);";

const CURRENT_CALLBACK_CONSTANTS = [
	"const CALLBACK_PORT = 9876;",
	"const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;",
].join("\n");

const CONFIGURABLE_CALLBACK_CONSTANTS = [
	"const CALLBACK_PORT = Number(process.env.ALPHAXIV_CALLBACK_PORT) || 9876;",
	"const CALLBACK_HOST = process.env.ALPHAXIV_CALLBACK_HOST || '127.0.0.1';",
	// The direct browser callback stays loopback-only: reject a non-loopback
	// callback host so the redirect URI can never reference one.
	"if (!isLoopbackHost(CALLBACK_HOST)) {",
	"  throw new Error(`ALPHAXIV_CALLBACK_HOST must be a loopback host (localhost, 127.x, or ::1). The direct browser callback is loopback-only; for cross-device login publish the callback port (ALPHAXIV_CALLBACK_BIND=0.0.0.0) or use the paste-redirect-URL fallback.`);",
	"}",
	// The address the local callback server binds; the loopback redirect host
	// binds itself unless ALPHAXIV_CALLBACK_BIND publishes it (e.g. 0.0.0.0
	// inside Docker so a forwarded port reaches the server).
	"const CALLBACK_BIND = process.env.ALPHAXIV_CALLBACK_BIND || CALLBACK_HOST.replace(/^\\[|\\]$/g, '');",
	// The redirect URI is always http and loopback-only; cross-device
	// completion uses the paste fallback. A bare IPv6 loopback host is
	// bracketed in the URI so new URL parses it and browsers can navigate it.
	"const REDIRECT_HOST = CALLBACK_HOST === '::1' ? '[::1]' : CALLBACK_HOST;",
	"const REDIRECT_URI = `http://${REDIRECT_HOST}:${CALLBACK_PORT}/callback`;",
].join("\n");

const CURRENT_LISTEN_TARGET = "    server.listen(CALLBACK_PORT, '127.0.0.1', () => {";
const CURRENT_LISTEN_PATCHED = "    server.listen(CALLBACK_PORT, CALLBACK_BIND, () => {";

// Helpers for the configurable callback host and the pasted-redirect-URL
// login fallback, inserted ahead of startCallbackServer.
const MANUAL_REDIRECT_HELPERS = [
	"function isLoopbackHost(host) {",
	"  const bare = host.startsWith('[') ? host.slice(1, -1) : host;",
	"  return bare === 'localhost' || bare === '::1' || /^127\\.\\d+\\.\\d+\\.\\d+$/.test(bare);",
	"}",
	"",
	"function parseManualRedirect(raw, expectedState) {",
	"  if (typeof raw !== 'string' || !raw.trim()) return null;",
	"  let text = raw.trim();",
	"  if (!/^[a-z][a-z0-9+.-]*:\\/\\//i.test(text)) text = `http://${text}`;",
	"  let url;",
	"  try {",
	"    url = new URL(text);",
	"  } catch {",
	"    throw new Error('not a valid URL. Paste the full address the browser ended on.');",
	"  }",
	"  if (url.pathname !== '/callback') {",
	"    throw new Error(`expected the /callback path (got ${url.pathname}). Paste the full address the browser ended on.`);",
	"  }",
	"  const error = url.searchParams.get('error');",
	"  if (error) {",
	"    throw new Error(`OAuth error: ${error}`);",
	"  }",
	"  const returnedState = url.searchParams.get('state');",
	"  if (!returnedState || returnedState !== expectedState) {",
	"    throw new Error('OAuth state mismatch. Paste the redirect URL from the same login attempt.');",
	"  }",
	"  const code = url.searchParams.get('code');",
	"  if (!code) {",
	"    throw new Error('no authorization code found in that URL');",
	"  }",
	"  return code;",
	"}",
	"",
	"function waitForManualRedirect(expectedState) {",
	"  let settle;",
	"  const promise = new Promise((resolve) => {",
	"    process.stderr.write(`Login on a different device? Complete the sign-in anywhere, then paste the final redirect URL here (the ${REDIRECT_URI}?... address the browser ends on) and press Enter. Wait for the browser callback if this machine opened the browser. Ctrl-C cancels.\\n`);",
	"    let settled = false;",
	"    const rl = createInterface({ input: process.stdin, terminal: false });",
	// The prompt is the one visible signal that the terminal is waiting for
	// the pasted URL; it re-appears after every unusable line. Plain ASCII
	// stays readable on the constrained terminals (Docker, Windows consoles,
	// SSH sessions) where cross-device login happens.
	"    const PASTE_PROMPT = 'Paste the redirect URL: ';",
	"    const writePrompt = () => process.stderr.write(PASTE_PROMPT);",
	"    writePrompt();",
	"    settle = (value, fromLine) => {",
	"      if (settled) return;",
	"      settled = true;",
	"      try { rl.close(); } catch {}",
	// A TTY's own Enter echo closes the prompt line after a pasted line;
	// with no echo (piped stdin) or when the prompt never received a line
	// because the browser callback won the race, one newline closes the
	// dangling prompt so later output starts on a fresh line.
	"      if (!fromLine || !process.stdin.isTTY) {",
	"        try { process.stderr.write('\\n'); } catch {}",
	"      }",
	"      resolve(value);",
	"    };",
	"    rl.on('line', (line) => {",
	"      if (settled) return;",
	"      let code;",
	"      try {",
	"        code = parseManualRedirect(line, expectedState);",
	"      } catch (err) {",
	"        process.stderr.write(`Could not use that URL: ${err.message}\\n`);",
	"        writePrompt();",
	"        return;",
	"      }",
	"      if (code) settle(code, true);",
	"      else writePrompt();",
	"    });",
	// A closed or errored stdin must not settle the race with a null code:
	// piped-stdin logins still wait for the browser callback, and Ctrl-C
	// remains the cancel path. The race winner calls promise.cancel().
	"    rl.on('close', () => {});",
	"    rl.on('error', () => {});",
	"  });",
	"  promise.cancel = () => settle(null);",
	"  return promise;",
	"}",
	"",
	"function startCallbackServer() {",
].join("\n");

const CURRENT_CALLBACK_CALL = "  const code = await waitForCallback(server, state);";
const RACED_CALLBACK_WAIT = [
	"  const callbackWait = waitForCallback(server, state);",
	"  const manualRedirect = waitForManualRedirect(state);",
	"  let code;",
	"  try {",
	"    code = await Promise.race([callbackWait, manualRedirect]);",
	"  } finally {",
	// Cleanup on completion, either path: the callback wait's own 120-second
	// timeout timer stays ref'd until someone clears it (its handler branches
	// clear it, but a paste-path win never reaches them), and an abandoned
	// timer kept the CLI alive for the full window after a successful login.
	"    callbackWait.cancel();",
	"    manualRedirect.cancel();",
	"    server.close();",
	"  }",
].join("\n");

// waitForCallback holds the 120-second login-wait timer inside its Promise
// executor, so nothing outside could clear it when the wait settles another
// way (paste win, or an already-settled callback). Give the returned promise
// a cancel that clears the abandoned timer; the wait window itself is
// untouched - only completion cleanup is added.
const CALLBACK_PROMISE_HEAD_TARGET = [
	"function waitForCallback(server, expectedState) {",
	"  return new Promise((resolve, reject) => {",
	"    const timeout = setTimeout(() => {",
].join("\n");
const CALLBACK_PROMISE_HEAD_PATCHED = [
	"function waitForCallback(server, expectedState) {",
	"  let timeout;",
	"  const promise = new Promise((resolve, reject) => {",
	"    timeout = setTimeout(() => {",
].join("\n");
const CALLBACK_PROMISE_TAIL_TARGET = [
	"        resolve(code);",
	"      }",
	"    });",
	"  });",
	"}",
].join("\n");
const CALLBACK_PROMISE_TAIL_PATCHED = [
	"        resolve(code);",
	"      }",
	"    });",
	"  });",
	"  promise.cancel = () => {",
	"    clearTimeout(timeout);",
	"  };",
	"  return promise;",
	"}",
].join("\n");

const CURRENT_READLINE_TARGET = "import { platform } from 'node:os';";
const CURRENT_READLINE_PATCHED = [
	"import { platform } from 'node:os';",
	"import { createInterface } from 'node:readline';",
].join("\n");

const LEGACY_AUTH_ENDPOINTS = [
	"const CLERK_ISSUER = 'https://clerk.alphaxiv.org';",
	"const AUTH_ENDPOINT = `${CLERK_ISSUER}/oauth/authorize`;",
	"const TOKEN_ENDPOINT = `${CLERK_ISSUER}/oauth/token`;",
	"const REGISTER_ENDPOINT = `${CLERK_ISSUER}/oauth/register`;",
	"const CALLBACK_PORT = 9876;",
	"const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;",
	"const USERINFO_ENDPOINT = `${CLERK_ISSUER}/oauth/userinfo`;",
	"const SCOPES = 'profile email offline_access';",
].join("\n");

const CURRENT_AUTH_ENDPOINTS = [
	"const ALPHAXIV_AUTH_ISSUER = 'https://api.alphaxiv.org/auth';",
	"const AUTH_ENDPOINT = `${ALPHAXIV_AUTH_ISSUER}/oauth2/authorize`;",
	"const TOKEN_ENDPOINT = `${ALPHAXIV_AUTH_ISSUER}/oauth2/token`;",
	"const REGISTER_ENDPOINT = `${ALPHAXIV_AUTH_ISSUER}/oauth2/register`;",
	"const CALLBACK_PORT = 9876;",
	"const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;",
	"const USERINFO_ENDPOINT = `${ALPHAXIV_AUTH_ISSUER}/oauth2/userinfo`;",
	"const SCOPES = 'openid profile email offline_access';",
].join("\n");

export function patchAlphaHubAuthSource(source, options = {}) {
	const digest = sourceDigest(source);
	const contract = ALPHA_HUB_AUTH_014_SOURCE_CONTRACT;
	const isReviewedCurrent = digest === contract.upstreamSha256 || digest === contract.patchedSha256;
	if (options.version !== undefined && options.version !== "0.1.3" && options.version !== contract.version) {
		throw new Error(`Unsupported alpha-hub auth version: ${options.version}`);
	}
	if (options.version === contract.version && !isReviewedCurrent) {
		throw new Error("Unsupported alpha-hub 0.1.4 auth source");
	}
	// Retain small legacy fixtures, but never accept a drifted installed module
	// merely because it still contains an OAuth marker.
	const isModule = /\bimport\s/.test(source) || source.includes("export async function login(");
	if (isModule && !isReviewedCurrent && digest !== LEGACY_AUTH_SHA256) {
		throw new Error("Unsupported alpha-hub auth source");
	}
	if (digest === contract.patchedSha256) return source;
	let patched = source;

	if (patched.includes(LEGACY_AUTH_ENDPOINTS)) {
		patched = patched.replace(LEGACY_AUTH_ENDPOINTS, CURRENT_AUTH_ENDPOINTS);
	}
	if (patched.includes(LEGACY_SUCCESS_HTML)) {
		patched = patched.replace(LEGACY_SUCCESS_HTML, FEYNMAN_SUCCESS_HTML);
	}
	if (patched.includes(LEGACY_ERROR_HTML)) {
		patched = patched.replace(LEGACY_ERROR_HTML, FEYNMAN_ERROR_HTML);
	}
	if (patched.includes(CURRENT_OPEN_BROWSER)) {
		patched = patched.replace(CURRENT_OPEN_BROWSER, PATCHED_OPEN_BROWSER);
	}
	if (patched.includes(LEGACY_WIN_OPEN)) {
		patched = patched.replace(LEGACY_WIN_OPEN, FIXED_WIN_OPEN);
	}
	if (patched.includes(OPEN_BROWSER_LOG)) {
		patched = patched.replace(OPEN_BROWSER_LOG, OPEN_BROWSER_LOG_WITH_URL);
	}
	if (patched.includes(LEGACY_CALLBACK_DECLARATION)) {
		patched = patched.replace(LEGACY_CALLBACK_DECLARATION, VALIDATING_CALLBACK_DECLARATION);
	}
	if (patched.includes(LEGACY_CALLBACK_PARAMS)) {
		patched = patched.replace(LEGACY_CALLBACK_PARAMS, VALIDATING_CALLBACK_PARAMS);
	}
	if (patched.includes(LEGACY_CALLBACK_CALL)) {
		patched = patched.replace(LEGACY_CALLBACK_CALL, VALIDATING_CALLBACK_CALL);
	}
	if (patched.includes(CURRENT_CALLBACK_CONSTANTS)) {
		patched = patched.replace(CURRENT_CALLBACK_CONSTANTS, CONFIGURABLE_CALLBACK_CONSTANTS);
	}
	if (patched.includes(CURRENT_LISTEN_TARGET)) {
		patched = patched.replace(CURRENT_LISTEN_TARGET, CURRENT_LISTEN_PATCHED);
	}
	if (patched.includes("function startCallbackServer() {") && !patched.includes("function parseManualRedirect(")) {
		patched = patched.replace("function startCallbackServer() {", MANUAL_REDIRECT_HELPERS);
	}
	if (patched.includes(CURRENT_READLINE_TARGET) && !patched.includes("createInterface } from 'node:readline'")) {
		patched = patched.replace(CURRENT_READLINE_TARGET, CURRENT_READLINE_PATCHED);
	}
	if (patched.includes(CALLBACK_PROMISE_HEAD_TARGET)) {
		patched = patched.replace(CALLBACK_PROMISE_HEAD_TARGET, CALLBACK_PROMISE_HEAD_PATCHED);
	}
	if (patched.includes(CALLBACK_PROMISE_TAIL_TARGET)) {
		patched = patched.replace(CALLBACK_PROMISE_TAIL_TARGET, CALLBACK_PROMISE_TAIL_PATCHED);
	}
	if (patched.includes(CURRENT_CALLBACK_CALL)) {
		patched = patched.replace(CURRENT_CALLBACK_CALL, RACED_CALLBACK_WAIT);
	}

	if (isModule || isReviewedCurrent) assertAlphaHubAuthSource(patched);
	return patched;
}
