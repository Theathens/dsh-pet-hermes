import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Service } from "@deepseek-ai/cordis";
import z from "schemastery";
/**
* Service Definition for the user-settings capability seam (`ctx.settings`). Providers store one raw document of
* per-namespace sections; plugins register a namespace schema and read the
* resolved value, which layers schema defaults, the registrant's composition
* `base`, and the user document section, in that order.
* @module @deepseek-ai/dsh-settings
*/
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
/**
* Brand a raw string as a {@link SettingsNamespace}.
* @param value - candidate namespace; lowercase kebab-case, as in plugin short names.
* @returns the branded namespace.
*/
function settingsNamespace(value) {
	if (!NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
	return value;
}
Service.init;
/**
* Value mirror of the `FiberState` members {@link isUnloading} compares
* against: a const enum has no runtime object to import, and the value is
* needed at runtime (same rationale as the CLI boot driver's mirror).
*/
const FIBER_DISPOSED = 4;
const FIBER_UNLOADING = 5;
/** Whether the consumer's own fiber is tearing down (not just losing the settings service). */
function isUnloading(ctx) {
	const state = ctx.fiber.state;
	return state === FIBER_UNLOADING || state === FIBER_DISPOSED;
}
/**
* Install the canonical optional-settings consumer wiring: while a settings
* service exists, register `ns` with the consumer's composition entry as the
* `base` layer and point the source thunk at the resolved scope; when the
* service goes away (disposal, provider reload), fall back to the entry so
* the consumer keeps working exactly as composed. The registration rides the
* scoped fiber, so no settings service ever mounted means none of this runs.
* @param ctx - consumer plugin context owning the wiring.
* @param ns - the consumer-owned settings namespace.
* @param schema - schema resolving the namespace (typically the plugin Config).
* @param entry - the consumer's composition entry config, used as `base`.
* @param hooks - source sink and change notification.
*/
function installSettingsSection(ctx, ns, schema, entry, hooks) {
	ctx.inject(["settings"], (sctx) => {
		const scope = sctx.settings.register(ns, schema, {
			base: entry,
			...hooks.validate === void 0 ? {} : { validate: hooks.validate }
		});
		hooks.setSource(() => scope.get());
		sctx.effect(() => () => {
			if (isUnloading(ctx)) return;
			hooks.setSource(() => entry);
			hooks.onChange();
		});
		hooks.onChange();
		scope.watch(() => {
			if (isUnloading(ctx)) return;
			hooks.onChange();
		});
	});
}
/**
* The Hermes API key lives by default in `token.txt` at the PLUGIN ROOT (next
* to package.json / lib / assets) — a stable, predictable location that ships
* with the install rather than an author-specific absolute path. First-time
* users drop their key there; anyone who keeps it elsewhere points `tokenFile`
* at their own path (settings.yaml) or uses the env var.
*
* Resolved at call time from this module's location: built, this file is
* <root>/lib/chat.js, so the plugin root is one level up.
*/
const DEFAULT_TOKEN_FILE_NAME = "token.txt";
function defaultTokenFile() {
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		return join(here, "..", DEFAULT_TOKEN_FILE_NAME);
	} catch {
		return join(process.cwd(), DEFAULT_TOKEN_FILE_NAME);
	}
}
/** Env var that overrides the token file (highest priority after explicit token). */
const CHAT_TOKEN_ENV = "DSH_PET_HERMES_TOKEN";
/**
* Read the Hermes token: the explicit config value wins, then the env var,
* then the key file. Returns undefined when no source yields a token (the
* route then answers a clear "not configured" error).
*/
function resolveChatToken(raw) {
	if (typeof raw.token === "string" && raw.token.trim() !== "") return raw.token.trim();
	const env = process.env[CHAT_TOKEN_ENV];
	if (typeof env === "string" && env.trim() !== "") return env.trim();
	const file = raw.tokenFile ?? defaultTokenFile();
	try {
		if (existsSync(file)) {
			const text = readFileSync(file, "utf8").trim();
			if (text !== "") return text;
		}
	} catch {}
}
/** Whether an endpoint URL points at the loopback interface. */
function isLoopbackEndpoint(endpoint) {
	try {
		const url = new URL(endpoint);
		return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1");
	} catch {
		return false;
	}
}
/** Apply defaults to a raw chat config (token resolved at call time). */
function resolveChatConfig(raw = {}) {
	return {
		enabled: raw.enabled ?? true,
		endpoint: (raw.endpoint ?? "http://127.0.0.1:8642").replace(/\/+$/, ""),
		model: raw.model ?? "hermes-agent",
		token: resolveChatToken(raw) ?? "",
		persona: raw.persona ?? "你是用户的桌面鲸鱼娘伙伴，住在他的电脑右下角。用轻松、俏皮、简短的中文陪他聊天，像会说话的小宠物：有温度、偶尔撒娇、记得他告诉你的事。回答尽量控制在两三句内，除非他要求详细。不要自称 AI 助手或模型。",
		maxHistory: raw.maxHistory ?? 20,
		timeoutMs: raw.timeoutMs ?? 12e4
	};
}
/** The messages array to forward: persona first, then the trimmed history. */
function buildUpstreamMessages(config, history) {
	const trimmed = history.length > config.maxHistory ? history.slice(history.length - config.maxHistory) : history;
	const body = [];
	if (config.persona.trim() !== "") body.push({
		role: "system",
		content: config.persona
	});
	for (const message of trimmed) {
		if (message.content.trim() === "") continue;
		body.push({
			role: message.role,
			content: message.content
		});
	}
	return body;
}
/**
* Forward one turn to Hermes and stream the reply back through `cb`.
* Always settles: exactly one of onDone/onError fires.
*/
function forwardChat(config, messages, cb) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);
	const body = JSON.stringify({
		model: config.model,
		messages,
		stream: true
	});
	fetch(config.endpoint + "/v1/chat/completions", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: "Bearer " + config.token
		},
		body,
		signal: controller.signal
	}).then(async (upstream) => {
		if (!upstream.ok || upstream.body === null) {
			let detail = "";
			try {
				detail = (await upstream.text()).slice(0, 300);
			} catch {}
			throw new Error("hermes " + upstream.status + (detail === "" ? "" : ": " + detail));
		}
		const reader = upstream.body.getReader();
		const decoder = new TextDecoder("utf-8");
		let buffer = "";
		let full = "";
		const parseChunk = (line) => {
			const payload = line.replace(/^data:\s*/, "").trim();
			if (payload === "" || payload === "[DONE]") return;
			let json;
			try {
				json = JSON.parse(payload);
			} catch {
				return;
			}
			const record = typeof json === "object" && json !== null ? json : {};
			const choices = Array.isArray(record.choices) ? record.choices : [];
			for (const choice of choices) {
				const delta = typeof choice.delta === "object" && choice.delta !== null ? choice.delta.content : void 0;
				if (typeof delta === "string" && delta !== "") {
					full += delta;
					cb.onDelta(delta);
				}
			}
		};
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let newline;
				while ((newline = buffer.indexOf("\n")) >= 0) {
					const line = buffer.slice(0, newline).replace(/\r$/, "");
					buffer = buffer.slice(newline + 1);
					if (line.startsWith("data:")) parseChunk(line);
				}
			}
			const tail = buffer.trim();
			if (tail !== "" && !tail.startsWith("data:")) {
				const json = JSON.parse(tail);
				const record = typeof json === "object" && json !== null ? json : {};
				const choices = Array.isArray(record.choices) ? record.choices : [];
				for (const choice of choices) {
					const message = typeof choice.message === "object" && choice.message !== null ? choice.message.content : void 0;
					if (typeof message === "string" && message !== "") {
						full += message;
						cb.onDelta(message);
					}
				}
			}
			cb.onDone(full);
		} catch (error) {
			cb.onError(error instanceof Error ? error.message : String(error));
		}
	}, (error) => {
		if (controller.signal.aborted) cb.onError("hermes timeout after " + Math.round(config.timeoutMs / 1e3) + "s");
		else cb.onError(error instanceof Error ? error.message : String(error));
	}).finally(() => {
		clearTimeout(timer);
	});
}
/**
* Liveness probe (GET /health, no auth): the route uses it to give the client
* a friendly "Hermes offline" bubble instead of a raw network error. Resolves
* true when the server answers 200.
*/
async function hermesHealthy(config) {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 3e3);
		const response = await fetch(config.endpoint + "/health", { signal: controller.signal });
		clearTimeout(timer);
		return response.ok;
	} catch {
		return false;
	}
}
//#endregion
//#region src/index.ts
/**
* dsh-pet-hermes — pet 2.0 (beta), a standalone Hermes-brained desktop pet for
* the DSH web GUI. Independent of the original @linxin666/dsh-pet: it ships
* its own (copied) whale-girl sprite assets, a minimal host registry that reads
* them, the Hermes chat bridge, and a browser client that renders the sprite
* plus a chat panel wired to a local Hermes Agent.
*
* Host half: registers /api/pet-hermes/* routes on the DSH web server:
*   - GET  /api/pet-hermes/pet         → the pet definition (atlas URL + tracks)
*   - GET  /api/pet-hermes/chat-status → Hermes liveness probe
*   - POST /api/pet-hermes/chat        → forward the transcript to Hermes, stream NDJSON back
*   - GET  /pet-hermes/<file>          → serve the bundled sprite assets
*
* The chat brain is a local Hermes Agent (OpenAI-compatible /v1/chat/completions);
* the token is read on the host (never sent to the browser). See ./chat.ts.
* @module dsh-pet-hermes
*/
/** Browser-facing base path of the pet-hermes API + asset routes. */
const API_PREFIX = "/api/pet-hermes";
const ASSET_PREFIX = "/pet-hermes";
/** The plugin's own root (the package dir), resolved from this module. */
function packageRoot() {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..");
}
/** The bundled pet assets directory (assets/pet). */
function assetsDir() {
	return join(packageRoot(), "assets", "pet");
}
let cachedDef;
function petDefinition() {
	if (cachedDef !== void 0) return cachedDef;
	const manifestFile = join(assetsDir(), "pet.json");
	const raw = JSON.parse(readFileSync(manifestFile, "utf8"));
	const cell = {
		width: raw.sprite2d.cell?.width ?? 192,
		height: raw.sprite2d.cell?.height ?? 208
	};
	const columns = raw.columns ?? 8;
	cachedDef = {
		id: raw.id,
		displayName: raw.displayName,
		renderer: "sprite2d",
		atlasUrl: "/pet-hermes/" + raw.sprite2d.spritesheetPath,
		cell,
		columns,
		frames: raw.sprite2d.frames,
		tracks: raw.sprite2d.tracks
	};
	return cachedDef;
}
/** Narrow an unknown value to a chat history message, or undefined. */
function asChatMessage(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const record = value;
	if (record.role !== "user" && record.role !== "assistant") return void 0;
	if (typeof record.content !== "string") return void 0;
	return {
		role: record.role,
		content: record.content
	};
}
/** Loopback fence: the pet-hermes API is local-only. */
function isLoopback(req) {
	const remote = req.socket?.remoteAddress ? String(req.socket.remoteAddress) : "";
	return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-cache"
	});
	res.end(JSON.stringify(body));
}
/** Read a bounded JSON body (null on empty/invalid/overflow). */
async function readJsonBody(req, maxBytes) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > maxBytes) {
			req.destroy();
			return null;
		}
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
/** GET /api/pet-hermes/pet — the pet definition for the browser. */
function petRoute(ctx) {
	return {
		kind: "exact",
		path: API_PREFIX + "/pet",
		handler: (req, res) => {
			if (!isLoopback(req)) {
				writeJson(res, 403, {
					ok: false,
					error: "forbidden: loopback-only"
				});
				return;
			}
			if (req.method !== "GET") {
				writeJson(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				return;
			}
			try {
				writeJson(res, 200, petDefinition());
			} catch (error) {
				writeJson(res, 500, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	};
}
/** POST /api/pet-hermes/chat — forward the transcript to Hermes, stream NDJSON back.
*  Config is read PER REQUEST via getConfig() so edits to settings.yaml apply
*  live without a DSH restart. */
function chatRoute(getConfig) {
	return {
		kind: "exact",
		path: API_PREFIX + "/chat",
		handler: (req, res) => {
			const config = getConfig();
			if (!isLoopback(req)) {
				writeJson(res, 403, {
					ok: false,
					error: "forbidden: loopback-only"
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				return;
			}
			if (!config.enabled) {
				writeJson(res, 409, {
					ok: false,
					error: "chat-disabled"
				});
				return;
			}
			if (!isLoopbackEndpoint(config.endpoint)) {
				writeJson(res, 400, {
					ok: false,
					error: "chat-endpoint-not-loopback"
				});
				return;
			}
			if (config.token === "") {
				writeJson(res, 409, {
					ok: false,
					error: "chat-token-missing"
				});
				return;
			}
			readJsonBody(req, 262144).then((parsed) => {
				const record = typeof parsed === "object" && parsed !== null ? parsed : {};
				const rawHistory = Array.isArray(record.messages) ? record.messages : [];
				const history = [];
				for (const entry of rawHistory) {
					const message = asChatMessage(entry);
					if (message !== void 0) history.push(message);
				}
				if (history.length === 0 || history[history.length - 1].role !== "user") {
					writeJson(res, 400, {
						ok: false,
						error: "chat-needs-user-message"
					});
					return;
				}
				const messages = buildUpstreamMessages(config, history);
				res.writeHead(200, {
					"content-type": "application/x-ndjson; charset=utf-8",
					"cache-control": "no-cache",
					"x-accel-buffering": "no"
				});
				const send = (obj) => {
					if (res.writableEnded) return;
					res.write(JSON.stringify(obj) + "\n");
				};
				let settled = false;
				const finish = (obj) => {
					if (settled) return;
					settled = true;
					send(obj);
					res.end();
				};
				forwardChat(config, messages, {
					onDelta: (text) => {
						send({ delta: text });
					},
					onDone: (full) => {
						finish({
							done: true,
							full
						});
					},
					onError: (message) => {
						finish({ error: message });
					}
				});
				req.on("close", () => {
					settled = true;
				});
			}, (error) => {
				writeJson(res, 400, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
		}
	};
}
/** GET /api/pet-hermes/chat-status — Hermes liveness probe (config read per request). */
function chatStatusRoute(getConfig) {
	return {
		kind: "exact",
		path: API_PREFIX + "/chat-status",
		handler: (req, res) => {
			const config = getConfig();
			if (!isLoopback(req)) {
				writeJson(res, 403, {
					ok: false,
					error: "forbidden: loopback-only"
				});
				return;
			}
			if (req.method !== "GET") {
				writeJson(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				return;
			}
			hermesHealthy(config).then((healthy) => {
				writeJson(res, 200, {
					ok: true,
					enabled: config.enabled,
					healthy,
					endpoint: config.endpoint,
					model: config.model
				});
			}, () => {
				writeJson(res, 200, {
					ok: true,
					enabled: config.enabled,
					healthy: false,
					endpoint: config.endpoint,
					model: config.model
				});
			});
		}
	};
}
/**
* Serve the bundled pet assets (spritesheet.webp, pet.json, previews/*).
* Path: /pet-hermes/<file> — realpath containment keeps it inside assets/pet.
*/
function assetRoute() {
	const MIME = {
		".webp": "image/webp",
		".png": "image/png",
		".gif": "image/gif",
		".json": "application/json; charset=utf-8"
	};
	return {
		kind: "prefix",
		path: ASSET_PREFIX,
		handler: (req, res) => {
			if (!isLoopback(req)) {
				res.writeHead(403);
				res.end();
				return;
			}
			if (req.method !== "GET" && req.method !== "HEAD") {
				res.writeHead(405);
				res.end();
				return;
			}
			let pathname;
			try {
				pathname = new URL(req.url ?? "/", "http://pet-hermes.local").pathname;
			} catch {
				res.writeHead(400);
				res.end();
				return;
			}
			const rel = decodeURIComponent(pathname.slice(11).replace(/^\/+/, ""));
			if (rel === "" || rel.includes("..")) {
				res.writeHead(400);
				res.end();
				return;
			}
			const base = assetsDir();
			const file = join(base, rel);
			let resolved;
			try {
				const realBase = realpathSync(base);
				resolved = realpathSync(file);
				if (resolved !== realBase && !resolved.startsWith(realBase + sep)) {
					res.writeHead(403);
					res.end();
					return;
				}
			} catch {
				res.writeHead(404);
				res.end();
				return;
			}
			try {
				if (!statSync(resolved).isFile()) {
					res.writeHead(404);
					res.end();
					return;
				}
			} catch {
				res.writeHead(404);
				res.end();
				return;
			}
			const ext = file.endsWith(".") ? file.slice(file.lastIndexOf(".")).toLowerCase() : "";
			readFile(resolved).then((body) => {
				res.writeHead(200, {
					"content-type": MIME[ext] ?? "application/octet-stream",
					"content-length": String(body.byteLength),
					"cache-control": "no-cache"
				});
				if (req.method === "HEAD") {
					res.end();
					return;
				}
				res.end(body);
			}, () => {
				res.writeHead(404);
				res.end();
			});
		}
	};
}
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
const name = "pet-hermes";
/** Services required before the pet-hermes can mount its surfaces. */
const inject = ["webServer"];
/** Settings namespace pet-hermes owns in settings.yaml (the `pet-hermes:` block). */
const SETTINGS_NS = "pet-hermes";
/**
* The settings.yaml surface for pet-hermes. Each field is optional with a
* default (see chat.ts), so an empty/absent block resolves to the out-of-the-box
* local-Hermes config. `token` is deliberately NOT a settings field: the key
* stays in a file / env var (never written into settings.yaml, which is more
* likely to be shared/committed). Edit `tokenFile` to point at a different key.
*/
function makeSettingsSchema() {
	return z.object({
		enabled: z.boolean().default(true),
		endpoint: z.string().default("http://127.0.0.1:8642"),
		model: z.string().default("hermes-agent"),
		tokenFile: z.string().default(""),
		persona: z.string().default(""),
		maxHistory: z.number().step(1).min(1).max(200).default(20),
		timeoutMs: z.number().step(1).min(1e3).max(6e5).default(12e4)
	});
}
/**
* Register the pet-hermes routes + a settings.yaml section. The chat config is
* resolved PER REQUEST from the live settings scope (so editing settings.yaml
* applies without a DSH restart), falling back to the plugin's defaults.
*/
function apply(ctx, config = {}) {
	let current = () => defaultSettings;
	const defaultSettings = {
		enabled: true,
		endpoint: "http://127.0.0.1:8642",
		model: "hermes-agent",
		tokenFile: "",
		persona: "",
		maxHistory: 20,
		timeoutMs: 12e4
	};
	const getConfig = () => {
		const s = current();
		return resolveChatConfig({
			enabled: s.enabled,
			endpoint: s.endpoint,
			model: s.model,
			...s.tokenFile && s.tokenFile.trim() !== "" ? { tokenFile: s.tokenFile } : {},
			...s.persona && s.persona.trim() !== "" ? { persona: s.persona } : {},
			maxHistory: s.maxHistory,
			timeoutMs: s.timeoutMs
		});
	};
	const routes = [
		petRoute(ctx),
		chatRoute(getConfig),
		chatStatusRoute(getConfig),
		assetRoute()
	];
	for (const route of routes) ctx.webServer.register(route);
	installSettingsSection(ctx, settingsNamespace(SETTINGS_NS), makeSettingsSchema(), defaultSettings, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {}
	});
}
//#endregion
export { API_PREFIX, ASSET_PREFIX, apply, inject, name };
