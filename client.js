window.__ModuleLoader__.load({
	id: "dsh-pet-hermes",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/pet-store.ts
		/**
		* Browser-side store for the pet-hermes client: the pet definition (atlas
		* geometry from /api/pet-hermes/pet) plus the chat transcript + panel state.
		* Written only through the store's actions; components read snapshots.
		* @module dsh-pet-hermes/client/pet-store
		*/
		/** Create the store handle (apply world only). */
		function createPetHermesStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					definition: null,
					visible: true,
					enabled: true,
					chat: {
						open: false,
						messages: [],
						streaming: false,
						hermesHealthy: null,
						error: null
					}
				}),
				actions: {
					setDefinition: (draft, definition) => {
						draft.definition = definition;
					},
					setEnabled: (draft, enabled) => {
						draft.enabled = enabled;
						if (!enabled) draft.visible = false;
					},
					setVisible: (draft, visible) => {
						draft.visible = visible;
					},
					setChatOpen: (draft, open) => {
						draft.chat.open = open;
						if (!open) draft.chat.error = null;
					},
					chatPushUser: (draft, text) => {
						draft.chat.error = null;
						draft.chat.messages = [...draft.chat.messages, {
							role: "user",
							content: text
						}];
					},
					chatStartAssistant: (draft) => {
						draft.chat.streaming = true;
						draft.chat.error = null;
						draft.chat.messages = [...draft.chat.messages, {
							role: "assistant",
							content: "",
							pending: true
						}];
					},
					chatAppendDelta: (draft, text) => {
						const messages = draft.chat.messages;
						const last = messages[messages.length - 1];
						if (last === void 0 || last.role !== "assistant") return;
						draft.chat.messages = [...messages.slice(0, -1), {
							...last,
							content: last.content + text
						}];
					},
					chatFinishAssistant: (draft) => {
						const messages = draft.chat.messages;
						const last = messages[messages.length - 1];
						if (last !== void 0 && last.role === "assistant") draft.chat.messages = [...messages.slice(0, -1), {
							role: "assistant",
							content: last.content
						}];
						draft.chat.streaming = false;
					},
					chatError: (draft, error) => {
						draft.chat.error = error;
						draft.chat.streaming = false;
						const messages = draft.chat.messages;
						const last = messages[messages.length - 1];
						if (last !== void 0 && last.role === "assistant" && last.pending && last.content === "") draft.chat.messages = messages.slice(0, -1);
					},
					setChatHermes: (draft, healthy) => {
						draft.chat.hermesHealthy = healthy;
					},
					chatClear: (draft) => {
						draft.chat.messages = [];
						draft.chat.error = null;
					}
				}
			});
		}
		//#endregion
		//#region \0dsh-css:src/client/pet.module.css.mjs
		const css$1 = ".v78Lda_float{z-index:2147483000;pointer-events:auto;-webkit-user-select:none;user-select:none;will-change:transform;flex-direction:column;align-items:center;display:flex;position:fixed}.v78Lda_spriteWrap{justify-content:center;align-items:center;display:flex;position:relative}.v78Lda_sprite{image-rendering:auto;touch-action:none;contain:paint}.v78Lda_closeButton{z-index:2;color:#f8fafc;cursor:pointer;background:#070b1ac7;border:1px solid #e2e8ffb8;border-radius:999px;width:22px;height:22px;padding:0;font:600 14px/18px sans-serif;transition:background .12s;position:absolute;top:2px;right:-6px}.v78Lda_closeButton:hover{background:#2c3e7ef2}.v78Lda_closeButton:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98fff2}.v78Lda_chatHint{z-index:2;cursor:pointer;background:linear-gradient(165deg,#131c36f2,#070b1af7);border:1px solid #7e98ff80;border-radius:999px;width:28px;height:28px;padding:0;font-size:14px;line-height:1;transition:transform .12s,box-shadow .12s;position:absolute;bottom:-6px;right:-10px;box-shadow:0 4px 12px #02061780}.v78Lda_chatHint:hover{transform:scale(1.1);box-shadow:0 6px 16px #02061799,0 0 10px #4d6bfe66}.v78Lda_chatHint:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98fff2}.v78Lda_summon{color:#c3d3ff;cursor:pointer;background:linear-gradient(165deg,#131c36f2,#070b1af7);border:1px solid #7e98ff80;border-radius:999px;padding:8px 14px;font-size:13px;transition:filter .12s,box-shadow .12s;box-shadow:0 6px 18px #02061780}.v78Lda_summon:hover{filter:brightness(1.1);box-shadow:0 8px 22px #02061799,0 0 12px #4d6bfe59}.v78Lda_chatPanel{z-index:2147483000;backdrop-filter:blur(12px);color:#e6ebf8;background:linear-gradient(165deg,#131c36f7,#070b1afa);border:1px solid #7e98ff59;border-radius:14px;flex-direction:column;width:300px;max-width:calc(100vw - 32px);max-height:min(440px,72vh);font-size:13px;animation:.2s cubic-bezier(.22,1,.36,1) v78Lda_pet-hermes-panel-in;display:flex;position:fixed;overflow:hidden;box-shadow:0 10px 30px #02061780,0 0 0 1px #4d6bfe1f,inset 0 1px #e2e8ff14}@keyframes v78Lda_pet-hermes-panel-in{0%{opacity:0;transform:translateY(6px)scale(.97)}to{opacity:1;transform:translateY(0)scale(1)}}.v78Lda_chatHeader{background:#070b1a66;border-bottom:1px solid #7e98ff2e;align-items:center;gap:8px;padding:8px 10px;display:flex}.v78Lda_chatTitle{letter-spacing:.02em;background:linear-gradient(90deg,#a9c1ff,#6c8bff 60%,#4d6bfe);color:#0000;text-overflow:ellipsis;white-space:nowrap;-webkit-background-clip:text;background-clip:text;flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden}.v78Lda_chatStatus{color:#7dd3fc;white-space:nowrap;font-size:11px}.v78Lda_chatStatusDown{color:#fca5a5}.v78Lda_chatClose{color:#e6ebf8;cursor:pointer;background:#070b1a99;border:1px solid #7e98ff66;border-radius:999px;flex:none;width:22px;height:22px;padding:0;font:600 14px/18px sans-serif;transition:background .12s}.v78Lda_chatClose:hover{background:#2c3e7ee6}.v78Lda_chatClose:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98ffe6}.v78Lda_chatLog{scrollbar-width:thin;scrollbar-color:#7e98ff66 transparent;flex-direction:column;flex:1;gap:8px;min-height:0;padding:10px;display:flex;overflow-y:auto}.v78Lda_chatEmpty{color:#8ea6ff;text-align:center;opacity:.85;margin:auto;padding:12px;font-size:12px;line-height:1.6}.v78Lda_chatLine{flex-direction:column;gap:2px;max-width:92%;display:flex}.v78Lda_chatLineUser{align-self:flex-end;align-items:flex-end}.v78Lda_chatLinePet{align-self:flex-start;align-items:flex-start}.v78Lda_chatRole{letter-spacing:.04em;opacity:.6;font-size:10px;font-weight:600}.v78Lda_chatText{white-space:pre-wrap;word-break:break-word;border-radius:10px;padding:6px 10px;line-height:1.5}.v78Lda_chatLineUser .v78Lda_chatText{color:#fff;background:linear-gradient(#4a68f5eb,#3a55e0eb);border-bottom-right-radius:4px}.v78Lda_chatLinePet .v78Lda_chatText{color:#e6ebf8;background:#131c36d9;border:1px solid #7e98ff40;border-bottom-left-radius:4px}.v78Lda_chatLinePending .v78Lda_chatText{opacity:.92}.v78Lda_chatCursor{color:#8ea6ff;margin-left:1px;animation:.9s step-end infinite v78Lda_pet-hermes-blink;display:inline-block}@keyframes v78Lda_pet-hermes-blink{0%,50%{opacity:1}50.01%,to{opacity:0}}.v78Lda_chatError{color:#fecaca;word-break:break-word;background:#7f1d1d59;border:1px solid #f8717166;border-radius:8px;margin:0 2px;padding:6px 8px;font-size:11px;line-height:1.5}.v78Lda_chatInputRow{background:#070b1a66;border-top:1px solid #7e98ff2e;gap:6px;padding:8px;display:flex}.v78Lda_chatInput{color:#e6ebf8;background:#131c36e6;border:1px solid #7e98ff66;border-radius:8px;outline:none;flex:1;min-width:0;padding:6px 9px;font-size:13px;transition:border-color .12s,box-shadow .12s}.v78Lda_chatInput::placeholder{color:#8ea6ff99}.v78Lda_chatInput:focus{border-color:#4d6bfe;box-shadow:0 0 0 2px #4d6bfe66}.v78Lda_chatInput:disabled{opacity:.6}.v78Lda_chatSend{cursor:pointer;color:#fff;background:linear-gradient(#4a68f5,#3a55e0);border:none;border-radius:8px;flex:none;padding:6px 12px;font-size:12px;font-weight:600;transition:filter .12s,box-shadow .12s,transform .12s;box-shadow:0 2px 6px #4d6bfe4d}.v78Lda_chatSend:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px)}.v78Lda_chatSend:focus-visible{outline:none;box-shadow:0 0 0 2px #7e98ffe6}.v78Lda_chatSend:disabled{opacity:.5;cursor:default}@media (prefers-reduced-motion:reduce){.v78Lda_chatPanel,.v78Lda_chatCursor{animation:none}.v78Lda_chatHint,.v78Lda_chatClose,.v78Lda_chatSend,.v78Lda_summon{transition:none}}";
		const tagId$1 = "dsh-pet-hermes/pet.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-pet-hermes";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var pet_module_css_default = {
			"chatClose": "v78Lda_chatClose",
			"chatCursor": "v78Lda_chatCursor",
			"chatEmpty": "v78Lda_chatEmpty",
			"chatError": "v78Lda_chatError",
			"chatHeader": "v78Lda_chatHeader",
			"chatHint": "v78Lda_chatHint",
			"chatInput": "v78Lda_chatInput",
			"chatInputRow": "v78Lda_chatInputRow",
			"chatLine": "v78Lda_chatLine",
			"chatLinePending": "v78Lda_chatLinePending",
			"chatLinePet": "v78Lda_chatLinePet",
			"chatLineUser": "v78Lda_chatLineUser",
			"chatLog": "v78Lda_chatLog",
			"chatPanel": "v78Lda_chatPanel",
			"chatRole": "v78Lda_chatRole",
			"chatSend": "v78Lda_chatSend",
			"chatStatus": "v78Lda_chatStatus",
			"chatStatusDown": "v78Lda_chatStatusDown",
			"chatText": "v78Lda_chatText",
			"chatTitle": "v78Lda_chatTitle",
			"closeButton": "v78Lda_closeButton",
			"float": "v78Lda_float",
			"pet-hermes-blink": "v78Lda_pet-hermes-blink",
			"pet-hermes-panel-in": "v78Lda_pet-hermes-panel-in",
			"sprite": "v78Lda_sprite",
			"spriteWrap": "v78Lda_spriteWrap",
			"summon": "v78Lda_summon"
		};
		//#endregion
		//#region src/client/PetSprite.tsx
		/**
		* Pet-hermes sprite — renders the bundled whale-girl sprite2d atlas as a
		* fixed-position floating pet. Plays the active animation track (CSS
		* background-position frame stepping, driven by requestAnimationFrame) and
		* exposes the interaction surface: click to open the chat panel, a small
		* control to hide/show. Self-contained: reads the atlas geometry from the
		* store's definition (fetched from /api/pet-hermes/pet).
		* @module dsh-pet-hermes/client/PetSprite
		*/
		/** The 9 animation rows, in atlas order (matches pet.json `frames`). */
		const ROW_ORDER = [
			"idle",
			"running-right",
			"running-left",
			"waving",
			"jumping",
			"failed",
			"waiting",
			"running",
			"review"
		];
		/** Background-position (px) of one frame within the scaled atlas. */
		function framePosition(cell, row, col, scale) {
			const x = -(col * cell.width * scale);
			const y = -(row * cell.height * scale);
			return x + "px " + y + "px";
		}
		function PetSprite(props) {
			const { store, definition, onOpenChat, onHide } = props;
			const [position, setPosition] = (0, react.useState)({
				right: 32,
				bottom: 56
			});
			const [anim, setAnim] = (0, react.useState)("idle");
			const containerRef = (0, react.useRef)(null);
			const spriteRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const chat = (0, react.useSyncExternalStore)(store.subscribe, () => store.getSnapshot().chat);
			const prevStreaming = (0, react.useRef)(false);
			const oneShotTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				if (oneShotTimer.current !== void 0) {
					window.clearTimeout(oneShotTimer.current);
					oneShotTimer.current = void 0;
				}
				if (chat.streaming) setAnim("waiting");
				else if (prevStreaming.current) {
					if (chat.error !== null) {
						setAnim("failed");
						oneShotTimer.current = window.setTimeout(() => {
							setAnim((current) => current === "failed" ? "idle" : current);
							oneShotTimer.current = void 0;
						}, 4800);
					} else {
						setAnim("jumping");
						oneShotTimer.current = window.setTimeout(() => {
							setAnim((current) => current === "jumping" ? "idle" : current);
							oneShotTimer.current = void 0;
						}, 2100);
					}
				}
				prevStreaming.current = chat.streaming;
			}, [chat.streaming, chat.error]);
			(0, react.useEffect)(() => () => {
				if (oneShotTimer.current !== void 0) window.clearTimeout(oneShotTimer.current);
			}, []);
			const scale = 160 / definition.cell.height;
			const cellW = definition.cell.width * scale;
			const cellH = definition.cell.height * scale;
			(0, react.useEffect)(() => {
				if (props.onPositionChange) props.onPositionChange({ ...position });
			}, [position, props.onPositionChange]);
			(0, react.useEffect)(() => {
				const row = ROW_ORDER.indexOf(anim);
				if (row < 0) return;
				const frames = definition.frames[row] ?? 1;
				const durations = definition.tracks[anim]?.durations ?? [500];
				let frame = 0;
				let elapsed = 0;
				let last = performance.now();
				let raf = 0;
				const tick = () => {
					const now = performance.now();
					const delta = now - last;
					last = now;
					elapsed += delta;
					const duration = durations[frame % durations.length] ?? 500;
					if (elapsed >= duration) {
						elapsed -= duration;
						frame = (frame + 1) % frames;
						const el = spriteRef.current;
						if (el !== null) el.style.backgroundPosition = framePosition(definition.cell, row, frame, scale);
					}
					raf = requestAnimationFrame(tick);
				};
				const el = spriteRef.current;
				if (el !== null) el.style.backgroundPosition = framePosition(definition.cell, row, 0, scale);
				raf = requestAnimationFrame(tick);
				return () => cancelAnimationFrame(raf);
			}, [
				anim,
				definition,
				scale
			]);
			(0, react.useEffect)(() => {
				if (chat.streaming) return;
				const timer = window.setInterval(() => {
					setAnim((current) => {
						if (current === "idle") return Math.random() < .25 ? "waving" : "idle";
						return "idle";
					});
				}, 6e3);
				return () => window.clearInterval(timer);
			}, [chat.streaming]);
			const onPointerDown = (e) => {
				dragRef.current = {
					startX: e.clientX,
					startY: e.clientY,
					origRight: position.right,
					origBottom: position.bottom,
					moved: false
				};
			};
			const onPointerMove = (e) => {
				const drag = dragRef.current;
				if (drag === null) return;
				const dx = e.clientX - drag.startX;
				const dy = e.clientY - drag.startY;
				if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
				setPosition({
					right: Math.max(0, drag.origRight - dx),
					bottom: Math.max(0, drag.origBottom - dy)
				});
			};
			const onPointerUp = () => {
				dragRef.current = null;
			};
			const onClick = () => {
				if (dragRef.current === null) onOpenChat();
			};
			const float = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: containerRef,
				className: pet_module_css_default.float,
				style: {
					right: position.right,
					bottom: position.bottom
				},
				onPointerMove,
				onPointerUp,
				onPointerLeave: onPointerUp,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: pet_module_css_default.spriteWrap,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: spriteRef,
							className: pet_module_css_default.sprite,
							style: {
								width: cellW,
								height: cellH,
								backgroundImage: "url(" + definition.atlasUrl + ")",
								backgroundSize: definition.cell.width * definition.columns * scale + "px " + definition.cell.height * ROW_ORDER.length * scale + "px",
								backgroundRepeat: "no-repeat",
								backgroundPosition: framePosition(definition.cell, 0, 0, scale),
								cursor: "grab"
							},
							onPointerDown,
							onClick,
							role: "button",
							"aria-label": definition.displayName
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: pet_module_css_default.closeButton,
							"aria-label": "隐藏",
							title: "隐藏",
							onPointerDown: (e) => e.stopPropagation(),
							onClick: (e) => {
								e.stopPropagation();
								onHide();
							},
							children: "×"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: pet_module_css_default.chatHint,
							"aria-label": "对话",
							title: "和鲸鱼娘对话",
							onPointerDown: (e) => e.stopPropagation(),
							onClick: (e) => {
								e.stopPropagation();
								onOpenChat();
							},
							children: "💬"
						})
					]
				})
			});
			return (0, react_dom.createPortal)(float, document.body);
		}
		//#endregion
		//#region node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region src/client/PetChatPanel.tsx
		/**
		* Pet-hermes chat panel — the conversation surface for the Hermes-brained pet.
		* The user types, the panel POSTs the transcript to /api/pet-hermes/chat (the
		* host forwards to a local Hermes Agent), and the streamed reply renders as a
		* typewriter bubble. State lives in the store's chat slice.
		* @module dsh-pet-hermes/client/PetChatPanel
		*/
		/** Gap between the pet and the panel (px). */
		const PANEL_GAP = 14;
		/** Panel width (px) — must match the CSS `.chatPanel` width. */
		const PANEL_WIDTH = 300;
		function PetChatPanel(props) {
			const { store, chatSend, petRight, petBottom, spriteWidth, onClose } = props;
			const chat = store.getSnapshot().chat;
			const panelRight = (typeof window !== "undefined" ? window.innerWidth : 1280) - petRight - spriteWidth - PANEL_GAP >= PANEL_WIDTH ? petRight + spriteWidth + PANEL_GAP : Math.max(0, petRight - PANEL_WIDTH - PANEL_GAP);
			const [input, setInput] = (0, react.useState)("");
			const scrollRef = (0, react.useRef)(null);
			const inputRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const el = scrollRef.current;
				if (el !== null) el.scrollTop = el.scrollHeight;
			}, [chat.messages]);
			(0, react.useEffect)(() => {
				if (chat.open) inputRef.current?.focus();
			}, [chat.open]);
			const send = () => {
				const text = input.trim();
				if (text === "" || chat.streaming) return;
				const actions = store.actions;
				const history = [...chat.messages, {
					role: "user",
					content: text
				}].slice(-50);
				setInput("");
				actions.chatPushUser(text);
				actions.chatStartAssistant();
				chatSend(history).then(() => {
					if (store.getSnapshot().chat.streaming) actions.chatFinishAssistant();
				});
			};
			const onKeyDown = (event) => {
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					send();
				} else if (event.key === "Escape") onClose();
			};
			const streaming = chat.streaming;
			const hermesDown = chat.hermesHealthy === false;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: pet_module_css_default.chatPanel,
				"data-testid": "pet-hermes-chat-panel",
				style: {
					right: panelRight,
					bottom: petBottom
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pet_module_css_default.chatHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: pet_module_css_default.chatTitle,
								children: "鲸鱼娘 · Hermes"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: clsx(pet_module_css_default.chatStatus, hermesDown && pet_module_css_default.chatStatusDown),
								children: hermesDown ? "大脑离线" : chat.hermesHealthy === true ? "在线" : "…"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: pet_module_css_default.chatClose,
								"aria-label": "关闭",
								title: "关闭",
								onClick: onClose,
								children: "×"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pet_module_css_default.chatLog,
						ref: scrollRef,
						children: [
							chat.messages.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: pet_module_css_default.chatEmpty,
								children: "在这里输入，她会记得你告诉她的事情。"
							}),
							chat.messages.map((message, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: clsx(pet_module_css_default.chatLine, message.role === "user" ? pet_module_css_default.chatLineUser : pet_module_css_default.chatLinePet, message.pending && pet_module_css_default.chatLinePending),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: pet_module_css_default.chatRole,
									children: message.role === "user" ? "你" : "她"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: pet_module_css_default.chatText,
									children: [message.content, message.pending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: pet_module_css_default.chatCursor,
										children: "▍"
									})]
								})]
							}, index)),
							chat.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: pet_module_css_default.chatError,
								children: chat.error
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: pet_module_css_default.chatInputRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							ref: inputRef,
							className: pet_module_css_default.chatInput,
							type: "text",
							value: input,
							placeholder: "说点什么…（Enter 发送，Esc 关闭）",
							onChange: (event) => setInput(event.target.value),
							onKeyDown,
							disabled: streaming,
							maxLength: 500
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: pet_module_css_default.chatSend,
							onClick: send,
							disabled: streaming || input.trim() === "",
							children: streaming ? "…" : "发送"
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/PetHermesEntry.tsx
		/**
		* Pet-hermes global entry — composes the floating sprite and the chat panel.
		* While visible it renders the PetSprite (a portal onto body); while hidden
		* it renders a fixed-position summon button so the pet can always come back.
		* The chat panel opens beside the sprite when the user taps the pet or the
		* chat hint.
		* @module dsh-pet-hermes/client/PetHermesEntry
		*/
		function PetHermesEntry(props) {
			const { store, chatSend } = props;
			const { definition, visible, enabled, chat } = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const [petPos, setPetPos] = (0, react.useState)(null);
			const handlePosition = (0, react.useCallback)((pos) => {
				setPetPos(pos);
			}, []);
			if (!enabled) return null;
			if (!visible) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: pet_module_css_default.summon,
				style: {
					position: "fixed",
					right: 32,
					bottom: 56,
					zIndex: 2147483e3
				},
				onClick: () => store.actions.setVisible(true),
				"data-testid": "pet-hermes-summon",
				children: "🐋 召唤鲸鱼娘"
			});
			if (definition === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: pet_module_css_default.summon,
				style: {
					position: "fixed",
					right: 32,
					bottom: 56,
					zIndex: 2147483e3,
					cursor: "default"
				},
				"data-testid": "pet-hermes-loading",
				children: "鲸鱼娘正在赶来…"
			});
			const spriteWidth = Math.round(definition.cell.width * 160 / definition.cell.height);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"data-pet-hermes-dock": true,
				"data-testid": "pet-hermes-dock",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PetSprite, {
					store,
					definition,
					onOpenChat: () => store.actions.setChatOpen(true),
					onHide: () => store.actions.setVisible(false),
					onPositionChange: handlePosition,
					spriteWidth
				}), chat.open && petPos !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PetChatPanel, {
					store,
					chatSend,
					petRight: petPos.right,
					petBottom: petPos.bottom,
					spriteWidth,
					onClose: () => store.actions.setChatOpen(false)
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:src/client/settings-card.module.css.mjs
		const css = ".KApx_W_card{color:#e6ebf8;background:linear-gradient(165deg,#131c36f7,#070b1afa);border:1px solid #7e98ff59;border-radius:14px;margin:8px 0;font-size:13px;list-style:none;overflow:hidden;box-shadow:0 10px 30px #02061780}.KApx_W_header{background:#070b1a66;border-bottom:1px solid #7e98ff2e;align-items:center;gap:10px;padding:10px 14px;display:flex}.KApx_W_name{background:linear-gradient(90deg,#a9c1ff,#6c8bff 60%,#4d6bfe);color:#0000;-webkit-background-clip:text;background-clip:text;font-size:13px;font-weight:600}.KApx_W_description{color:#8ea6ff;opacity:.8;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:12px;overflow:hidden}.KApx_W_pending{color:#7dd3fc;white-space:nowrap;font-size:11px}.KApx_W_body{flex-direction:column;gap:14px;padding:12px 14px;display:flex}.KApx_W_readOnly{color:#fca5a5;background:#7f1d1d40;border:1px solid #f8717166;border-radius:8px;padding:8px 10px;font-size:12px}.KApx_W_field{flex-direction:column;gap:4px;display:flex}.KApx_W_head{align-items:center;gap:8px;display:flex}.KApx_W_label{color:#c3d3ff;font-size:12px;font-weight:600}.KApx_W_badge{color:#7dd3fc;background:#7dd3fc26;border:1px solid #7dd3fc66;border-radius:999px;padding:1px 6px;font-size:10px}.KApx_W_input,.KApx_W_select{color:#e6ebf8;box-sizing:border-box;background:#131c36e6;border:1px solid #7e98ff66;border-radius:8px;outline:none;width:100%;padding:6px 9px;font-size:13px;transition:border-color .12s,box-shadow .12s}.KApx_W_input:focus,.KApx_W_select:focus{border-color:#4d6bfe;box-shadow:0 0 0 2px #4d6bfe66}.KApx_W_input:disabled,.KApx_W_select:disabled{opacity:.6;cursor:default}.KApx_W_hint{color:#8ea6ff;opacity:.7;margin:0;font-size:11px;line-height:1.4}.KApx_W_failed{color:#fecaca;background:#7f1d1d59;border:1px solid #f8717166;border-radius:8px;margin:0;padding:6px 8px;font-size:11px;line-height:1.5}.KApx_W_footer{border-top:1px solid #7e98ff26;justify-content:flex-end;gap:8px;padding-top:4px;display:flex}.KApx_W_discard,.KApx_W_save{cursor:pointer;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;transition:filter .12s,transform .12s}.KApx_W_discard{color:#c3d3ff;background:#2c3e7e99}.KApx_W_discard:hover:not(:disabled){filter:brightness(1.15)}.KApx_W_save{color:#fff;background:linear-gradient(#4a68f5,#3a55e0);box-shadow:0 2px 6px #4d6bfe4d}.KApx_W_save:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px)}.KApx_W_discard:disabled,.KApx_W_save:disabled{opacity:.5;cursor:default}@media (prefers-reduced-motion:reduce){.KApx_W_input,.KApx_W_select,.KApx_W_discard,.KApx_W_save{transition:none}}";
		const tagId = "dsh-pet-hermes/settings-card.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-pet-hermes";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var settings_card_module_css_default = {
			"badge": "KApx_W_badge",
			"body": "KApx_W_body",
			"card": "KApx_W_card",
			"description": "KApx_W_description",
			"discard": "KApx_W_discard",
			"failed": "KApx_W_failed",
			"field": "KApx_W_field",
			"footer": "KApx_W_footer",
			"head": "KApx_W_head",
			"header": "KApx_W_header",
			"hint": "KApx_W_hint",
			"input": "KApx_W_input",
			"label": "KApx_W_label",
			"name": "KApx_W_name",
			"pending": "KApx_W_pending",
			"readOnly": "KApx_W_readOnly",
			"save": "KApx_W_save",
			"select": "KApx_W_select"
		};
		//#endregion
		//#region src/client/PetHermesSettingsCard.tsx
		/**
		* dsh-pet-hermes 简版设置卡 — 一级设置页（settings.section 席位）。
		* 参考原 @linxin666/dsh-pet 的 PetSettingsCard 结构，但简化：硬编码中文
		* label、不搬 locale 系统、不搬完整卡片 chrome。字段读写走 SettingsScope
		* （scope.set/unset 真正写 ~/.dsh/settings.yaml 的 pet-hermes: 段，立即生效）。
		* @module dsh-pet-hermes/client/PetHermesSettingsCard
		*/
		/** pet-hermes 的字段列表（顺序 = 卡片渲染顺序）。 */
		const FIELDS = [
			{
				key: "enabled",
				label: "启用桌宠",
				hint: "关闭后右下角不显示桌宠（设置卡仍可见）",
				kind: "boolean"
			},
			{
				key: "endpoint",
				label: "Hermes API 地址",
				hint: "Hermes 的 OpenAI 兼容网关基址，如 http://127.0.0.1:8642",
				kind: "text"
			},
			{
				key: "model",
				label: "模型名",
				hint: "/v1/models 里的 model id，如 hermes-agent",
				kind: "text"
			},
			{
				key: "persona",
				label: "人设（system prompt）",
				hint: "留空用内置鲸鱼娘人设；每轮对话前 prepend",
				kind: "text"
			},
			{
				key: "maxHistory",
				label: "历史轮数上限",
				hint: "每轮转发给 Hermes 的最大消息数（1-200）",
				kind: "number",
				min: 1,
				max: 200,
				integer: true
			},
			{
				key: "timeoutMs",
				label: "请求超时（毫秒）",
				hint: "单次对话的超时上限（1000-600000）",
				kind: "number",
				min: 1e3,
				max: 6e5,
				integer: true
			}
		];
		/**
		* 简版设置卡：staged 表单 + 保存/丢弃。
		* 用户改字段只是 staged，点"保存"才调 scope.set/unset 真正写 settings.yaml。
		* 写成功后 host 的 getConfig() 下次请求读到新值 → 立即生效。
		*/
		function PetHermesSettingsCard(props) {
			const { scope } = props;
			const [snapshot, setSnapshot] = (0, react.useState)(() => scope.getSnapshot());
			const [drafts, setDrafts] = (0, react.useState)({});
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(null);
			(0, react.useRef)(false);
			(0, react.useEffect)(() => {
				return scope.subscribe(() => {
					setSnapshot(scope.getSnapshot());
					setDrafts({});
					setFailed(null);
				});
			}, [scope]);
			const value = snapshot.value;
			const available = snapshot.status === "ready";
			const writable = snapshot.writable;
			/** 读一个字段当前的显示文字（有 staged 草稿用草稿，否则用生效值）。 */
			const displayText = (def) => {
				if (drafts[def.key] !== void 0) return drafts[def.key];
				if (value === void 0) return "";
				const v = value[def.key];
				if (typeof v === "boolean") return v ? "true" : "false";
				if (typeof v === "number") return String(v);
				if (typeof v === "string") return v;
				return "";
			};
			/** 字段是否 dirty（草稿 ≠ 当前生效值）。 */
			const isDirty = (def) => {
				const d = drafts[def.key];
				if (d === void 0) return false;
				return d !== (value === void 0 ? "" : String(value[def.key] ?? ""));
			};
			const anyDirty = FIELDS.some(isDirty);
			/** 解析一个字段的草稿成写入值，非法返回 undefined。 */
			const parseDraft = (def, text) => {
				const trimmed = text.trim();
				if (trimmed === "") return "clear";
				if (def.kind === "boolean") {
					if (trimmed === "true") return true;
					if (trimmed === "false") return false;
					return;
				}
				if (def.kind === "number") {
					const n = Number(trimmed);
					if (!Number.isFinite(n)) return void 0;
					if (def.integer && !Number.isInteger(n)) return void 0;
					if (def.min !== void 0 && n < def.min) return void 0;
					if (def.max !== void 0 && n > def.max) return void 0;
					return n;
				}
				return trimmed;
			};
			/** 保存：对每个 dirty 字段调 scope.set/unset。 */
			const save = async () => {
				if (!anyDirty || saving) return;
				setSaving(true);
				setFailed(null);
				let ok = true;
				for (const def of FIELDS) {
					if (!isDirty(def)) continue;
					const parsed = parseDraft(def, drafts[def.key] ?? "");
					try {
						if (parsed === void 0) {
							setFailed(`字段「${def.label}」的值不合法，未保存`);
							ok = false;
							continue;
						}
						if (parsed === "clear") await scope.unset(def.key);
						else await scope.set(def.key, parsed);
					} catch (error) {
						setFailed(`保存「${def.label}」失败：` + (error instanceof Error ? error.message : String(error)));
						ok = false;
					}
				}
				if (ok) setDrafts({});
				setSaving(false);
			};
			/** 丢弃：清所有草稿。 */
			const discard = () => {
				setDrafts({});
				setFailed(null);
			};
			const setDraft = (key, text) => {
				setDrafts((prev) => ({
					...prev,
					[key]: text
				}));
			};
			if (!available) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: settings_card_module_css_default.header,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.name,
						children: "Hermes 桌宠"
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: settings_card_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: snapshot.status === "loading" ? "设置加载中…" : "当前部署未向本客户端暴露 pet-hermes 设置（namespace 不可用）"
					})
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.header,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.name,
							children: "Hermes 桌宠"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.description,
							children: "dsh-pet-hermes 的对话与连接设置"
						}),
						anyDirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.pending,
							children: "有未保存修改"
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.body,
					children: [
						!writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.readOnly,
							role: "status",
							children: "当前 settings 文档只读，无法保存修改。"
						}),
						FIELDS.map((def) => {
							const text = displayText(def);
							const dirty = isDirty(def);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: settings_card_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: settings_card_module_css_default.head,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: settings_card_module_css_default.label,
											htmlFor: "ph-" + String(def.key),
											children: def.label
										}), dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: settings_card_module_css_default.badge,
											children: "已修改"
										})]
									}),
									def.kind === "boolean" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										id: "ph-" + String(def.key),
										className: settings_card_module_css_default.select,
										value: text,
										disabled: !writable || saving,
										onChange: (e) => {
											setDraft(def.key, e.target.value);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: "继承默认"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "true",
												children: "开"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "false",
												children: "关"
											})
										]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "ph-" + String(def.key),
										className: settings_card_module_css_default.input,
										type: "text",
										...def.kind === "number" ? { inputMode: "numeric" } : {},
										value: text,
										disabled: !writable || saving,
										onChange: (e) => {
											setDraft(def.key, e.target.value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: settings_card_module_css_default.hint,
										children: def.hint
									})
								]
							}, String(def.key));
						}),
						failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.failed,
							role: "status",
							children: failed
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.footer,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.discard,
								disabled: !anyDirty || saving,
								onClick: discard,
								children: "丢弃"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.save,
								disabled: !anyDirty || saving || !writable,
								onClick: () => {
									save();
								},
								children: saving ? "保存中…" : "保存"
							})]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* Services the client injects. Empty on purpose: the pet-hermes client is
		* self-contained — the store comes from importing
		* '@deepseek-ai/dsh-client-runtime/client' (a module, not an injectable
		* cordis service), fetch is same-origin, and React mounts via createRoot.
		* Declaring a service name DSH does not register (e.g. 'runtime') leaves the
		* entry pending and fails the whole web boot, so we inject nothing.
		*/
		const inject = [];
		/**
		* Send one chat turn to the host bridge and stream the reply into the store.
		* The host answers newline-delimited JSON: {'delta':text} chunks, then a
		* terminal {'done':true} or {'error':...}.
		*/
		async function sendChat(store, messages) {
			const actions = store.actions;
			try {
				const response = await fetch("/api/pet-hermes/chat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ messages })
				});
				if (!response.ok || response.body === null) {
					let detail = "";
					try {
						detail = (await response.json()).error ?? "";
					} catch {}
					actions.chatError(detail === "" ? "chat " + response.status : detail);
					return;
				}
				const reader = response.body.getReader();
				const decoder = new TextDecoder("utf-8");
				let buffer = "";
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					let newline;
					while ((newline = buffer.indexOf("\n")) >= 0) {
						const line = buffer.slice(0, newline).replace(/\r$/, "");
						buffer = buffer.slice(newline + 1);
						if (line.trim() === "") continue;
						let json;
						try {
							json = JSON.parse(line);
						} catch {
							continue;
						}
						if (typeof json.delta === "string") actions.chatAppendDelta(json.delta);
						else if (json.done === true) {
							actions.chatFinishAssistant();
							return;
						} else if (typeof json.error === "string") {
							actions.chatError(json.error);
							return;
						}
					}
				}
				if (store.getSnapshot().chat.streaming) actions.chatFinishAssistant();
			} catch (error) {
				actions.chatError(error instanceof Error ? error.message : String(error));
			}
		}
		/** Probe Hermes liveness for the chat panel's status line. */
		async function probeStatus(store) {
			try {
				const response = await fetch("/api/pet-hermes/chat-status", {});
				if (!response.ok) return;
				const payload = await response.json();
				store.actions.setChatHermes(payload.enabled === false ? false : payload.healthy === true);
			} catch {}
		}
		/**
		* Client plugin body: create one store instance, mount the global pet entry
		* on document.body via a React root, fetch the definition, probe Hermes.
		* The pet is host-global (no session dimension), so it mounts directly on
		* body — the same reason the original pet avoids a session-scoped slot.
		*/
		function apply(ctx) {
			const store = createPetHermesStore().create();
			fetch("/api/pet-hermes/pet", {}).then((response) => {
				if (!response.ok) return;
				return response.json();
			}).then((definition) => {
				if (definition && typeof definition === "object") store.actions.setDefinition(definition);
			}, () => {});
			probeStatus(store);
			const container = document.createElement("div");
			container.dataset.dshPetHermesRoot = "";
			container.dataset.dshPlugin = "pet-hermes";
			document.body.appendChild(container);
			const root = (0, react_dom_client.createRoot)(container);
			root.render((0, react.createElement)(PetHermesEntry, {
				store,
				chatSend: (messages) => sendChat(store, messages)
			}));
			try {
				ctx.inject(["slots", "settingsScope"], (subCtx) => {
					try {
						const scope = subCtx.settingsScope.bind({ namespace: "pet-hermes" });
						const slots = subCtx.slots;
						if (slots && typeof slots.register === "function") slots.register({
							name: "settings.section",
							id: "pet-hermes",
							order: 140,
							label: () => "Hermes 桌宠"
						}, () => (0, react.createElement)(PetHermesSettingsCard, { scope }));
						let lastEndpoint;
						const applyFromScope = () => {
							const snapshot = scope.getSnapshot();
							const value = snapshot.value;
							if (!value) return;
							if (snapshot.status === "ready") store.actions.setEnabled(value.enabled);
							if (value.endpoint !== void 0 && value.endpoint !== lastEndpoint) {
								lastEndpoint = value.endpoint;
								probeStatus(store);
							}
						};
						applyFromScope();
						scope.subscribe(() => {
							applyFromScope();
						});
					} catch (error) {
						console.warn("[pet-hermes] settings section 注册失败：", error);
					}
				});
			} catch (error) {
				console.warn("[pet-hermes] settings inject 失败（服务不可用？）：", error);
			}
			ctx.effect(() => () => {
				root.unmount();
				container.remove();
			}, "pet-hermes: client lifecycle");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map