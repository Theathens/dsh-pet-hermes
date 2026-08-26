# dsh-pet-hermes（pet 2.0 beta）

> 一只接了 **Hermes Agent** 大脑的独立桌宠，跑在 DeepSeek Harness（DSH）Web GUI 里。
> 她长得像原 `@linxin666/dsh-pet` 的鲸鱼娘，但**会真的和你对话**——背后是你本地配置的 Hermes，带着长期记忆和拟人人格，记得你是谁、你们聊过什么。

- **版本**：`0.1.0-beta.0`
- **状态**：beta（独立插件，已构建 + 隔离验证通过，尚未默认安装进 DSH）
- **许可**：双许可——**本插件代码 MIT**（见 `LICENSE`）；**桌宠精灵图 Apache-2.0**（源自 `zhu1090093659/dsh-web` 的内置鲸鱼素材，归属与修改声明见 `THIRD_PARTY_NOTICES.md`）
- **独立性**：与原 `@linxin666/dsh-pet` **零耦合**——自己的路由前缀、自己的素材、自己的 host/client，不修改、不依赖原插件

---

## 0. 使用前提

这个插件本身不内置任何大模型——它的"大脑"是**你本地跑着的 Hermes Agent**。装之前，确认下面四件事都满足，否则桌宠会出现但"大脑离线"。

### 前提 1：本机已装 DSH 并能跑 web GUI

```powershell
dsh --profile web     # 能打开 http://127.0.0.1:3080 即可
```

### 前提 2：本机有 Hermes Agent 的 gateway 在运行

本插件只通过 HTTP 调 Hermes 的 **API Server**，不直接碰 Hermes 进程。参考 [Hermes Agent](https://github.com/NousResearch/hermes-agent)。

> **API Server 是 Hermes gateway 的一个 platform adapter**（`gateway/platforms/api_server.py`），不是独立进程。它只在 **gateway 运行时**才会监听端口——所以前提 2 实际要求"有一个正在跑的 Hermes gateway，且启用了 API Server"。只跑交互式 `hermes` CLI（不启 gateway）时，`127.0.0.1:8642` 上没有任何监听者，插件的 `chat-status` 会报 `healthy:false`。

### 前提 3（关键）：Hermes 的 API Server 网关已开启

Hermes 默认**不开** API Server（`API_SERVER_ENABLED` 默认 `false`），而本插件**只能**通过这个网关对话。所以你必须先把 Hermes 的 API Server 网关配好。

#### Hermes API Server 网关的配置细节

Hermes 的 API Server 是一个 **OpenAI 兼容**的 HTTP 网关，由以下项控制（环境变量，或 `~/.hermes/config.yaml` 的 `gateway.api_server:` 段，**config.yaml 优先级更高**——同名项以 config.yaml 为准）：

| 环境变量 | 默认值 | 说明 | 本插件要求 |
|---|---|---|---|
| `API_SERVER_ENABLED` | `false` | 是否开启 API Server | **必须 `true`**，否则插件连不上 |
| `API_SERVER_PORT` | `8642` | HTTP 端口 | 插件默认连 `8642`；改端口要在插件 `endpoint` 同步改 |
| `API_SERVER_HOST` | `127.0.0.1` | 绑定地址（默认仅本机） | **保持 `127.0.0.1`**（插件强制 loopback，不接远程 Hermes） |
| `API_SERVER_KEY` | _(必填)_ | Bearer 鉴权密钥 | **必须有值，且 ≥16 字符、不能是占位符**（`hermes` / `example` / `sk-…` 之类会被启动守卫直接拒）；插件用它调 Hermes（见下） |
| `API_SERVER_CORS_ORIGINS` | _(无)_ | 允许的浏览器来源 | 本插件**用不到**（插件走 host 端转发，不是浏览器直连） |
| `API_SERVER_MODEL_NAME` | default profile → `hermes-agent`；命名 profile → 该 profile 名 | `/v1/models` 里的 model 名 | 插件默认用 `hermes-agent`；**若你用的是命名 profile 且没设 `API_SERVER_MODEL_NAME`，这里实际是 profile 名**，插件 `model` 要改成它（`/v1/models` 可查） |

#### 开启步骤（二选一）

**方式 A：环境变量 / `.env` 文件**

两种方式，`config.yaml` 的 `gateway.api_server:` 段会**覆盖**环境变量（见方式 B），二者等价但 config.yaml 优先。

- **进程级 env**（Hermes 启动前 `export`）：
  ```bash
  export API_SERVER_ENABLED=true
  export API_SERVER_PORT=8642
  export API_SERVER_KEY=***   # ≥16 字符，非占位符
  ```
- **`~/.hermes/.env` 文件**（推荐，跨重启持久）：在文件里加 `API_SERVER_KEY=<你的key>`。Hermes 的 secret 读取链（`hermes_cli/auth.py::has_usable_secret` / `_get_scoped_secret`）会优先从 `.env` 读，避免被父进程遗留的旧 `export` 遮蔽——**如果你既 `export` 过又写进 `.env`，以 `.env` 为准**。

> `API_SERVER_ENABLED` 这个 env 开关是**最弱**的启用路径：gateway 的 config loader（`gateway/config.py`）实际的主检查是"key 是否存在且够强"，key 一到位平台就会注册，`enabled` 只是显式标记。所以**把 key 放对位置就够了**，`enabled: true` 是双保险。

**方式 B：配置文件** `~/.hermes/config.yaml`

```yaml
gateway:
  api_server:
    enabled: true
    port: 8642
    host: 127.0.0.1
    key: <你的API_SERVER_KEY>   # ≥16 字符，非占位符；与 .env 里的值一致
```

> 注意：
> - **key 的读取位置**：默认 profile 读 `~/.hermes/.env`；命名 profile 读 `~/.hermes/profiles/<profile>/.env`。`config.yaml` 的 `gateway.api_server.key` 若设了，会**覆盖** `.env`（`api_server.py:1376` 的 `extra.get("key", ...)` 优先）。
> - **key 的强度是硬门槛**：启动守卫（`api_server.py::_api_key_passes_startup_guard`）要求 `API_SERVER_KEY` **≥16 字符且非占位符**，否则**拒绝启动**——不是警告，是 fail-closed，监听器根本不会起来，gateway 日志会打 `Refusing to start: API_SERVER_KEY ...`。弱 key 不会"降级运行"，只会让 8642 端口没有服务。
> - **即使 loopback 绑定也强制要 key**：`API_SERVER_HOST=127.0.0.1` 不是免鉴权，所有部署（含仅本机）都必须有可用 key。

#### 验证 Hermes 网关已就绪

```powershell
# 1) 网关开了吗（无需鉴权）
# 应返回 {"status":"ok","platform":"hermes-agent","version":...}
curl http://127.0.0.1:8642/health -UseBasicParsing

# 2) model 名是什么（需要 Bearer；插件的 model 要匹配这个 id）
# 应返回 {"object":"list","data":[{"id":"hermes-agent",...}]}
curl http://127.0.0.1:8642/v1/models -UseBasicParsing -Headers @{ Authorization = "Bearer 你的API_SERVER_KEY" }

# 3)（可选）机器可读能力清单，确认流式/会话头都支持
curl http://127.0.0.1:8642/v1/capabilities -UseBasicParsing -Headers @{ Authorization = "Bearer 你的API_SERVER_KEY" }
```

- `health` 通 = gateway 在跑且 API Server 起来了（`/health` **无需鉴权**，所以这一步通不代表 token 对）
- `/v1/models` 返回的 `id`（如 `hermes-agent`）= 插件 `model` 要填的值。**这一步需要正确的 Bearer**——如果返回 401，说明 key 错了，先修 key 再继续
- `/v1/capabilities` 会列出 `session_continuity_header: X-Hermes-Session-Id` 和 `session_key_header: X-Hermes-Session-Key`——这是 Hermes 长期记忆的作用机制（见下"插件如何拿到记忆"）
- 记下你的 **`API_SERVER_KEY` 值**——下一步要把它放进插件的 `token.txt`

> **`chat-status` 绿 ≠ token 对**：插件的 `chat-status` 端点只探 `/health`（无鉴权），所以它报 `healthy:true` 只能证明"gateway 活着"，**不能证明 token 能用**。token 对不对，只有真正发一次 `/v1/chat/completions`（需要 Bearer）才知道——第一次对话 401 就是 token 的锅。

#### 插件如何拿到"长期记忆"（机制说明）

Hermes 的长期记忆（memory provider）是按 **session key** 作用域的。API Server 提供两个 opt-in 头（`api_server.py:2046-2081`）：

- `X-Hermes-Session-Id`：继续某个已存在的对话 session（历史从 SessionDB 读，不用在 body 里重发）
- `X-Hermes-Session-Key`：把长期记忆固定到一个**稳定的 per-channel 标识**，跨多轮对话持久

**本插件目前两个头都不发**（`src/chat.ts` 只发 `Authorization` + `model` + `messages`），靠"每轮把完整 `messages` 数组重发 + system prompt 里 prepend persona"来维持对话连续性。Hermes 侧的长期记忆（memory provider 的跨会话知识）仍然生效——因为记忆是 Hermes Agent 进程级的，不依赖客户端传 header。但**插件的对话 transcript 本身是浏览器内存态**，刷新即丢（Hermes 侧"记得你"，但面板里的聊天记录不持久，见[已知限制](#8-已知限制beta)）。

> 后续优化方向：让 host 给每轮请求带上 `X-Hermes-Session-Key: agent:main:pet-hermes:<固定值>`，把桌宠对话绑定到一个稳定的记忆作用域，这样 Hermes 的 memory provider 能更精准地跨会话记住"这只桌宠和这个用户的对话"。

### 前提 4：把 Hermes key 交给插件

插件怎么知道你的 `API_SERVER_KEY`？按以下优先级从高到低解析（见[配置](#5-配置)）：

1. **settings.yaml 显式 `token` 字段**（最优先，一般不用）
2. 环境变量 **`DSH_PET_HERMES_TOKEN=<key>`**
3. **`tokenFile` 文件内容**——`tokenFile` 留空时（settings.yaml 默认），回退到**插件根目录的 `token.txt`**（最省事，推荐首次安装用这个）

> 部署后的"插件根目录" = `~/.dsh/profiles/web/node_modules/dsh-pet-hermes/`（即 DSH profile 的 `node_modules` 下的插件目录，不是你的开发目录）。`token.txt` 内容就是**一整行**你的 `API_SERVER_KEY`，无引号、无多余空格/换行。


### 前提速查

| # | 前提 | 不满足的后果 |
|---|---|---|
| 1 | DSH 能跑 web GUI | 插件无处可挂 |
| 2 | Hermes **gateway** 在跑（API Server 是它的 platform adapter） | 桌宠出现但"大脑离线" |
| 3 | API Server 开启（`API_SERVER_KEY` ≥16 字符且非占位符，key 到位即注册） | 同上（`healthy:false` / 401） |
| 4 | 插件拿到了 `API_SERVER_KEY`（token.txt / env / tokenFile） | `chat-token-missing` |

> 全部满足后，`curl http://127.0.0.1:3080/api/pet-hermes/chat-status` 返回 `healthy:true` 代表 gateway 链路通了（Hermes 活着、API Server 起来了）。但 token 对不对只有真正对话一次才知道（`chat-status` 只探 `/health`，无鉴权）——第一次对话 401 就是 token 的锅。

---

## 1. 立项

### 为什么做这个

原 `@linxin666/dsh-pet` 是一只很出色的**观赏型**桌宠：随 agent 状态切动画和台词、有碎碎念、有亲密度/喂食互动。但它的"说话"都是**内置台词库**——几百句轮换文案，它**不认识你、不记得你**。

我们想要的不只是"会动的小宠物"，而是一个**有记忆、有人格、认识你**的桌宠。假如你的本地恰好跑着一个 **Hermes Agent**（[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)），它自带：

- **长期记忆**：跨会话持久，记得你是谁、你的项目、你们的对话
- **拟人人格**：可定制 system prompt
- **对外 API**：OpenAI 兼容的 `/v1/chat/completions`（SSE 流式）

那么把两者结合：**桌宠的"身体"（精灵渲染 + 交互）+ Hermes 的"大脑"（记忆 + 推理）**，便能得到不一样的体验。

### 为什么不直接改原插件

评估过直接给原 `dsh-pet` 加对话功能，但遇到两个硬障碍：

1. **原插件的 npm 包不附带 `tsconfig.json`**，整包 `tsc -b && tsdown` 在 `node_modules` 安装环境里跑不起来（官方构建依赖 monorepo 的 tsconfig 体系）。
2. **Hermes API Server 拒绝浏览器 CORS**（preflight 403），桌宠浏览器端无法直调 Hermes，必须有个 host 端代理转发。

与其在原插件上打补丁、承担回归风险，不如**做一个完全独立的 beta 插件**：

- 原插件照常用，互不影响
- 新插件专注"能对话的拟人桌宠"这一件事，轻量、可控
- 迭代/回滚都不碰原插件

### beta 范围

**做**：桌宠本体（精灵动画）+ Hermes 对话（流式 + 记忆）+ 独立路由
**不做**（留待后续）：原插件的亲密度/喂食/多会话气泡/状态联动动画、Live2D 渲染、语音

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────────┐
│  DSH Web GUI（浏览器）                                       |
│                                                             | 
│  ┌──────────────────────────────────────────——┐             |  
│  │ dsh-pet-hermes client  (lib/client.js)     |             |
│  │                                            |             |
│  │  PetHermesEntry                            |             |
│  │   ├─ PetSprite   精灵动画（帧步进/拖拽）     |             |
│  │   └─ PetChatPanel 对话面板（打字机流式）     |             |
│  │                                            |             |
│  │  pet-store（transcript + 面板状态）         |             |
│  └───────────────┬──────────────────────────——┘             |   
│                  │ fetch（同源，无 CORS 问题）                |
│                  ▼                                           |   
└──────────────────────────────────────────────────────────────┘
                         │
                         │  /api/pet-hermes/*
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  dsh-pet-hermes host 半 (lib/index.js)                      |  
│                                                             | 
│  GET  /api/pet-hermes/pet         → 桌宠定义（atlas+tracks） |
│  GET  /api/pet-hermes/chat-status → Hermes 健康探测          |
│  POST /api/pet-hermes/chat        → 转发 Hermes，NDJSON 流式 |
│  GET  /pet-hermes/<file>          → 精灵素材                  |
│                                                              |
│  chat.ts：读 token（host 侧，永不发浏览器）+ SSE 解析 + 降级    |
└───────────────┬──────────────────────────────────────────────┘
                │  Bearer token（host 侧读取）
                ▼
┌─────────────────────────────────────────────────────────────┐
│  本地 Hermes Agent API Server（127.0.0.1:8642）              |
│  /v1/chat/completions（OpenAI 兼容，SSE 流式）               |
│  长期记忆 + 拟人人格 + 自我进化                               | 
└─────────────────────────────────────────────────────────────┘
```

### 关键设计

| 决策 | 说明 |
|---|---|
| **浏览器拥有对话历史** | client 每轮把完整 `messages` 数组发给 host（无状态转发），host 不存会话。简单、无服务端状态 |
| **token 只在 host 侧** | 浏览器永远拿不到 Hermes 密钥；host 从文件/env 读取，加 `Authorization: Bearer` |
| **强制 loopback** | 所有 `/api/pet-hermes/*` 路由只接受本机请求；Hermes endpoint 也必须是 `127.0.0.1/localhost` |
| **NDJSON 流式** | host 把 Hermes 的 SSE 转成 `{'delta':...}` 逐行 + `{'done':true}` 终止，浏览器打字机渲染 |
| **降级** | Hermes 挂了 → `chat-status` 报 `healthy:false`，面板显示"大脑离线"，桌宠本体不受影响 |
| **独立素材** | 精灵图拷进插件自己的 `assets/pet/`，host 用 realpath  containment 安全服务，不引用原插件 |

---

## 3. 目录结构

```
dsh-pet-hermes/
├─ package.json              插件清单（name: dsh-pet-hermes, dsh.bundle/client 声明）
├─ cordis.patch.yml          注册行（id: pet-hermes）
├─ tsconfig.json             构建类型配置
├─ tsdown.config.ts          构建入口（复用 shared 的 clientBundle preset）
├─ shared/                   构建助手（tsdown.client.ts / web-platform.ts）
├─ src/
│  ├─ index.ts               host 半：name/inject/apply + 极简 registry + 路由
│  ├─ chat.ts                Hermes 对话桥（token/转发/SSE/健康探测，可复用）
│  └─ client/
│     ├─ index.ts            client 半入口：挂载 + SSE chatSend + Hermes 探测
│     ├─ PetHermesEntry.tsx  组合入口（精灵 + 面板 + 召唤/隐藏）
│     ├─ PetSprite.tsx       精灵渲染（帧动画/拖拽/点击开对话）
│     ├─ PetChatPanel.tsx    对话面板（输入/流式渲染/状态栏）
│     ├─ pet-store.ts        状态（桌宠定义 + transcript + 面板状态）
│     └─ pet.module.css      样式（蓝玻璃主题，和原插件同族）
├─ assets/pet/               独立精灵素材
│  ├─ pet.json               动画轨道定义（9 tracks）
│  ├─ spritesheet.webp       精灵图（9 行 × 不等列）
│  └─ previews/idle.gif      预览
├─ lib/                      构建产物（部署时只用这个）
│  ├─ index.js               host 半
│  └─ client.js              client 半（ModuleLoader 格式）
└─ isolation-host.mjs        隔离验证脚本（不碰真实 DSH）
```

### 9 种动画轨道

`idle`（待机）/ `running-right` / `running-left` / `waving`（挥手）/ `jumping`（跳跃）/ `failed` / `waiting` / `running` / `review`

---

## 4. 安装

> ⚠️ 安装会**修改 DSH profile 配置**并需要**重启 DSH**。建议先备份（见下文回滚）。

### 前置条件

1. 本地已有一个**运行中的 Hermes Agent**，且开了 **API Server**（OpenAI 兼容端点，默认 `http://127.0.0.1:8642`）
2. Hermes 的 **API 密钥**可被 host 读取——首次安装把你的 key 放进**插件根目录的 `token.txt`**（见[首次安装](#首次安装把你的-hermes-接上)）
3. DSH 已装好（`dsh --profile web` 能跑）

### 步骤

#### 1. 备份（务必先做）

```powershell
# 备份原 profile 配置（含 cordis.patch.yml）
$web = "$env:USERPROFILE\.dsh\profiles\web"
Copy-Item "$web\cordis.patch.yml" "$web\cordis.patch.yml.bak-pet-hermes"
# 备份原 dsh-pet 插件（确认没被误碰）
Copy-Item "$web\node_modules\@linxin666\dsh-pet" "$env:TEMP\dsh-pet-backup" -Recurse
```

#### 2. 拷贝插件到 profile

部署只需 `lib/` + `assets/` + 3 个清单文件（**不需要** `src/`、`shared/`、`node_modules/`、`*.ts`）：

```powershell
$web = "$env:USERPROFILE\.dsh\profiles\web"
# 改成你的 dsh-pet-hermes 源码目录（你 clone/开发的位置）
$src = "<你的 dsh-pet-hermes 源码目录>"
$dst = "$web\node_modules\dsh-pet-hermes"

New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\lib"      $dst\lib      -Recurse -Force
Copy-Item "$src\assets"   $dst\assets   -Recurse -Force
Copy-Item "$src\package.json"      $dst\package.json      -Force
Copy-Item "$src\cordis.patch.yml"  $dst\cordis.patch.yml  -Force
```

> 插件的运行时依赖（`@deepseek-ai/cordis`、`dsh-client-runtime`、`dsh-host-webserver`、`react`、`clsx`）由 DSH profile 的既有 node_modules 提供（peer/runtime 依赖），无需在插件目录单独装。

#### 3. 注册插件行

在 `$web\cordis.patch.yml` 里追加一行 insert（和 mcp-browser 那行并列）。

文件当前形如：
```yaml
[ { insert: [ { id: mcp-browser, name: '@deepseek-ai/dsh-mcp-client', config: { ... } } ] } ]
```

改成（追加第二个 insert 元素）：
```yaml
[
  { insert: [ { id: mcp-browser, name: '@deepseek-ai/dsh-mcp-client', config: { serverName: browser, transport: stdio, command: npx, args: [ '-y', '@playwright/mcp@latest', '--browser', 'msedge' ] } } ] },
  { insert: [ { id: pet-hermes, name: 'dsh-pet-hermes' } ] }
]
```

> 注意 `id: pet-hermes` 必须和 `cordis.patch.yml`（插件自带那份）里的 id 一致；`name` 是包名。

#### 4. 重启 DSH

```powershell
dsh --profile web
```

重启后，Web GUI 右下角会出现**第二只**鲸鱼娘（pet 2.0 beta），和原桌宠并存。点她或她身上的 💬 按钮，弹出对话面板。

### 验证安装成功

```powershell
# Hermes 健康（应 healthy:true）
curl http://127.0.0.1:3080/api/pet-hermes/chat-status
# 桌宠定义（应返回 whale-girl-refined）
curl http://127.0.0.1:3080/api/pet-hermes/pet
```

> 端口以你 DSH Web 实际监听为准（默认通常是 3080，以 `dsh --profile web` 启动时打印的 URL 为准）。

---

## 5. 配置

对话桥的配置在 **host 侧**（`src/chat.ts`），有默认值，**开箱即用**——指向本地 Hermes 默认端点、默认 token 文件。需要定制时，通过插件 config 传入（`apply(ctx, { chat: {...} })`）。

### 配置项

| 项 | 默认值 | 说明 |
|---|---|---|
| `endpoint` | `http://127.0.0.1:8642` | Hermes API Server 地址，**必须 loopback** |
| `model` | `hermes-agent` | Hermes 暴露的 model id（`GET /v1/models` 可查） |
| `token` | —（见下） | Bearer 密钥，优先级最高 |
| `tokenFile` | **插件根目录的 `token.txt`**（留空即此默认） | 密钥文件路径（一行一个 token）。**首次安装把你的 key 放进这里**，或填绝对路径指向别处 |
| `persona` | 内置鲸鱼娘人设 | 每轮 prepend 的 system prompt |
| `maxHistory` | `20` | 每轮转发给 Hermes 的最大历史消息数（超出截断最旧） |
| `timeoutMs` | `120000` | 单轮超时（ms），超时中止流式 |
| `enabled` | `true` | 总开关，false 时 chat 路由返回 409 |

### Token 读取优先级

1. 显式 `token` 配置值
2. 环境变量 **`DSH_PET_HERMES_TOKEN`**
3. `tokenFile` 文件内容 —— `tokenFile` 留空（settings.yaml 默认）时，回退到**插件根目录的 `token.txt`**

> **安全**：token 永远只在 host 进程里读取，**不会**出现在浏览器、网络响应或日志里。不要把密钥值写进任何前端可见的地方；`token.txt` 建议加入你的 `.gitignore`（如果这个目录在版本库里）。

### 首次安装：把你的 Hermes 接上

> **这是首次安装者唯一必须做的事**——告诉插件"你的 Hermes 在哪、key 在哪"。

1. **确认你的 Hermes 在跑且开了 API Server**：
   ```powershell
   curl http://127.0.0.1:8642/health -UseBasicParsing
   # 应返回 {"status":"ok","platform":"hermes-agent",...}
   ```
   - 端口不是 8642？记下实际端口，下面 `endpoint` 要改。
   - 没开 API Server？先去 Hermes 那边开（见 Hermes 文档的 api-server 功能）。

2. **把你的 Hermes API key 放进插件根目录的 `token.txt`**（最省事）：
   - 插件根 = `~/.dsh/profiles/web/node_modules/dsh-pet-hermes/`（部署后的位置）
   - 新建 `token.txt`，内容就是**一整行**你的 Hermes API key（无引号、无多余空格/换行）：
     ```
     你的hermes-api-key-贴这一行
     ```
   - 不想放默认位置？在 settings.yaml 里给 `tokenFile` 填你自己的绝对路径即可（见下）。

3. **（可选）改 endpoint / persona 等**：在 `~/.dsh/settings.yaml` 加块（**只有改过才会写入**，不改就走默认）：
   ```yaml
   pet-hermes:
     endpoint: http://127.0.0.1:8642     # 你的 Hermes 端口
     model: hermes-agent                  # 一般不用改
     tokenFile: ""                        # 留空=用插件根/token.txt；或填你的 key 路径
     persona: ""                          # 留空=内置鲸鱼娘人设
     maxHistory: 20
     timeoutMs: 120000
   ```

4. **重启 DSH + 验证**：
   ```powershell
   dsh --profile web
   curl http://127.0.0.1:3080/api/pet-hermes/chat-status -UseBasicParsing
   # 应返回 {"ok":true,"enabled":true,"healthy":true,...}
   ```
   `healthy: true` = 连上了。去 GUI 点桌宠试对话。

#### 首次配置错误对照

| `chat-status` / 对话现象 | 原因 | 解决 |
|---|---|---|
| `healthy: false` | Hermes 没起 / 端口不对 | `curl <端口>/health` 确认通；改 `endpoint` |
| `chat-token-missing` (409) | token.txt 没放 / 路径错 | 把 key 放进插件根 `token.txt`；或 settings.yaml 填 `tokenFile`；或设 env |
| 对话 401 | key 值不对 | token.txt 要**纯 token**，无空格/引号/换行残留 |
| `chat-endpoint-not-loopback` (400) | endpoint 不是 127.0.0.1/localhost | Hermes 必须本机；改 `endpoint` 为 `http://127.0.0.1:端口` |

### 改 Hermes 端点/密钥（不改代码）

最省事的方式是**环境变量**（在启动 DSH 前设置）：

```powershell
$env:DSH_PET_HERMES_TOKEN = "你的hermes密钥"
dsh --profile web
```

或改 `src/chat.ts` 顶部的 `DEFAULT_CHAT_*` 常量后重新构建（见[构建](#六构建与开发)）。

### 改人设（persona）

默认 persona 在 `src/chat.ts` 的 `DEFAULT_CHAT_PERSONA`：

```
你是用户的桌面鲸鱼娘伙伴，住在他的电脑右下角。用轻松、俏皮、简短的中文陪他聊天，
像会说话的小宠物：有温度、偶尔撒娇、记得他告诉你的事。回答尽量控制在两三句内，
除非他要求详细。不要自称 AI 助手或模型。
```

改它 → 重新构建。这是控制"她说话什么口吻"的地方。

---

## 6. 构建与开发

### 前置

- Node.js `^22.19 || >=24`
- 能访问 npm registry

### 安装开发依赖

```powershell
cd "<你的 dsh-pet-hermes 源码目录>"
npm install
```

> 若系统 npm cache 有权限问题，指定一个可用的 cache 目录：`npm install --cache "<你的 cache 路径>"`

### 构建

```powershell
npm run build        # 等价 tsdown
```

产出 `lib/index.js`（host）+ `lib/client.js`（client，ModuleLoader 格式 + CSS 内联）。

### 隔离验证（不碰真实 DSH）

```powershell
node isolation-host.mjs
# → http://127.0.0.1:8811
```

起一个最小 host，加载工作区 `lib/index.js` 注册路由，可 curl 验证 chat 桥 / 桌宠定义 / 素材，**完全不碰真实 DSH 和原插件**。适合改完 host 逻辑后快速回归。

### 改代码的流程

```
改 src/  →  npm run build  →  （可选）node isolation-host.mjs 验证  →  重新部署 lib/ 到 profile  →  重启 DSH
```

---

## 7. 回滚

出问题想卸载 pet 2.0 beta：

```powershell
$web = "$env:USERPROFILE\.dsh\profiles\web"
# 1. 删插件目录
Remove-Item "$web\node_modules\dsh-pet-hermes" -Recurse -Force
# 2. 还原 profile 配置
Copy-Item "$web\cordis.patch.yml.bak-pet-hermes" "$web\cordis.patch.yml" -Force
# 3. 重启 DSH
dsh --profile web
```

原 `@linxin666/dsh-pet` 全程未被修改，回滚后不受任何影响。

---

## 7.5 故障排查

### 症状：重启后 GUI 打不开，显示 "Failed to load plugins"

```
web boot: 1 entry did not activate
dsh-pet-hermes: pending (waiting for service: runtime)
```

**这是本插件首版（0.1.0-beta.0）踩过的坑，已修复。** 记录在此以防回归。

- **根因**：client 入口 `src/client/index.ts` 的 `export const inject` 里写了 DSH **未注册**的服务短名（首版误写为 `['connection', 'runtime']`）。DSH client 加载器按 inject 列表去找对应服务，找不到 `runtime` 就永久 pending，进而 `1 entry did not activate`，**整个 web boot 失败**（不是只这一个插件挂，是 GUI 完全打不开）。
- **正确做法**：本插件的 client 是**自包含**的——store 通过 `import ... from '@deepseek-ai/dsh-client-runtime/client'` 拿（是模块导入，不是 injectable 服务），fetch 同源，React 走 `createRoot`。所以 **`inject` 应为空数组 `[]`**：

  ```ts
  // src/client/index.ts
  export const inject: string[] = []
  ```

- **判别**：`inject` 里只能填 DSH client 已注册的服务短名（如 `slots` / `locale` / `connection` / `settingsScope` / `remote` / `sessions`，参照原 dsh-pet 的 client inject）。**包名（`@deepseek-ai/dsh-client-runtime`）不是服务短名，不能填进 `inject`**——包名只出现在 `package.json` 的 `dsh.client.inject`（那是"依赖哪些包"的声明，机制不同）。
- **应急**：出现此症状先按[回滚](#七回滚)恢复，再确认 `lib/client.js` 里是 `const inject = []`（`Select-String lib\client.js "const inject ="`）。

### 症状：桌宠出现了，但图像"从左到右移动循环"/帧漂移

- **根因**：精灵图几何参数（cell 尺寸 / 列数）填错。host 的 `petDefinition()` 早期 beta 硬编码了 `cell: {width:128,height:128}` + `columns: 9`，而原 dsh-pet 对 whale-refined 精灵图的实际默认是 **`cell: {width:192,height:208}` + `columns: 8`**。尺寸不符 → `backgroundSize` 把 atlas 缩放到错误宽度 → `framePosition` 每步偏移和实际格子对不上 → 鲸鱼每帧逐渐右移、循环时跳回，观感就是"从左往右飘"。
- **修复**：`src/index.ts` 的 `petDefinition()` 用原 dsh-pet 同款默认值（`192/208` / `8` 列），并优先读 pet.json 的 `cell`/`columns`（若存在）：

  ```ts
  const cell = {
    width: raw.sprite2d.cell?.width ?? 192,
    height: raw.sprite2d.cell?.height ?? 208,
  }
  const columns = raw.columns ?? 8
  ```
- **判别**：`curl http://127.0.0.1:3080/api/pet-hermes/pet` 返回的 `cell` 应是 `{width:192,height:208}`、`columns: 8`。若返回 `128/128` + `9`，说明**部署的不是修复版 lib**（见下"部署未覆盖"）。
- **通用教训**：精灵图的 cell 尺寸/列数**必须和 atlas 实际像素一致**，不能凭空估。本插件的 whale-refined 精灵图实测 **1536×1872px**，正好 = `192×208 cell × 8 列 × 9 行`，可据此反推校验。换素材时要么在 pet.json 里写 `cell`/`columns`，要么量图确认默认值匹配。

### 症状：改了 lib 重新部署，但行为没变 / 还是旧 bug（部署未覆盖）

- **现象**：源码改了、也 `npm run build` 了、也跑了一遍"拷贝 lib 到 profile"，重启后却**还是旧行为**（例如 cell 漂移依旧）。`curl /api/pet-hermes/pet` 返回的还是旧值。
- **根因**：**DSH 进程运行时会占用 `lib/*.js` 文件**，`Copy-Item src\lib dst\lib` 会**静默失败**（文件被锁，新内容没写进去），但命令不报错，看起来"部署成功"了。部署目录里仍是旧 lib。
- **正确做法**（三步，缺一不可）：
  1. **先停 DSH**（关 GUI / 停 `dsh` 进程）——释放 lib 文件锁
  2. **删旧再拷新**：`Remove-Item $dst\lib -Recurse -Force` 然后 `Copy-Item $src\lib $dst\lib -Recurse -Force`
  3. **验证内容**：`Select-String $dst\lib\index.js "192"` 确认新值真写进去了，再重启
- **判别**：部署后不重启先 `curl /api/pet-hermes/pet`（若 DSH 还开着会读到内存旧值，所以这步要在停 DSH、拷完、**重启后**做）。返回新值才说明覆盖成功。
- **通用教训**：对**正在被进程占用的目录**做覆盖，必须"停进程 → 删旧 → 拷新 → 验证内容"，不能只信 `Copy-Item` 没报错。

### 症状：GUI 能开，但右下角没有第二只鲸鱼娘

- client 半挂载问题。看浏览器 DevTools 控制台（`F12`）的报错，常见是 `lib/client.js` 里某个 `@deepseek-ai/*` import 在真实 DSH 环境解析不到。
- 确认插件 client bundle 被加载：控制台看是否有 `dsh-pet-hermes` 相关的模块加载日志/报错。

### 症状：桌宠出现了，但对话报错 / 状态栏显示"大脑离线"

- **大脑离线**：Hermes 没起，或 `endpoint` 配错。`curl http://127.0.0.1:8642/health` 应返回 `{"status":"ok",...}`。
- **chat 401/403**：token 不对。确认**插件根目录的 `token.txt`** 内容正确（纯 token，无空格/引号），或 settings.yaml 的 `tokenFile` 指向对的 key 文件，或设 `$env:DSH_PET_HERMES_TOKEN`。
- **chat 409 chat-token-missing**：token 三处来源（config / env / 文件）都没读到，检查 token 文件路径。
- **chat 超时**：Hermes 响应慢（全量记忆注入，首字延迟高属正常），可调大 `timeoutMs`。

---

## 8. 已知限制（beta）

| 限制 | 说明 / 后续方向 |
|---|---|
| **每次对话注入全量记忆** | Hermes 的拟人代价：每轮 prompt 含该用户 Hermes 记忆库的全量 token（取决于记忆积累量，可能数万），首字延迟偏高、token 消耗大。后续可加轻量模式/频控 |
| **对话历史仅浏览器内存** | 刷新页面 transcript 清空（Hermes 侧记忆仍在，她会"记得"，但面板里的对话记录不持久）。后续可加 localStorage 持久化 |
| **桌宠动画不联动 agent 状态** | 目前只播 idle/waving 等 ambient 动画，不随 DSH agent 思考/运行切状态（原插件有，本 beta 未做） |
| **单 persona** | 一个固定鲸鱼娘人设，未做多人格切换 |
| **无语音** | 纯文字对话 |

> ✅ **已在真实 DSH 里端到端验证**（2026-08-26）：装进 `~/.dsh/profiles/web` 后，GUI 正常启动、右下角出现 pet 2.0 鲸鱼娘、点她/💬 弹出对话面板、Hermes 流式回复正常（实锤长期记忆——与 Hermes Agent 记忆数据库互通）。期间踩的两个坑（client `inject` 误用未注册服务名 / cell 几何填错 + 部署未覆盖）均已修复并记入[故障排查](#七五故障排查)。

---

## 9. 与原 dsh-pet 的关系

| | 原 `@linxin666/dsh-pet` | 本 `dsh-pet-hermes` (pet 2.0) |
|---|---|---|
| 定位 | 观赏型桌宠（状态联动 + 互动） | 对话型拟人桌宠（Hermes 大脑） |
| "说话" | 内置台词库（不记得你） | 真对话（Hermes 长期记忆 + 人格） |
| 路由前缀 | `/api/pet/*` | `/api/pet-hermes/*` |
| 素材 | 插件内 assets | 插件内 assets（独立拷贝） |
| 依赖 | 彼此独立 | 彼此独立 |
| 形象 | whale / whale-refined | whale-refined（同款素材） |

两者可**并存**：原桌宠照旧观赏，pet 2.0 负责陪你聊天。

---

## 10. 版权说明（双许可）

本项目采用**双许可**：自写代码与第三方精灵素材分开授权，互不覆盖。

- **本插件代码**（`src/`、`shared/`、构建配置、`install.py`、`isolation-host.mjs`、`README.md`）：**MIT**，见 `LICENSE`。可自行使用/修改。
- **桌宠精灵图**（`assets/pet/spritesheet.webp`、`assets/pet/previews/`、`pet.json` 的 `sprite2d` 块）：**Apache-2.0**。源自 `zhu1090093659/dsh-web` 的内置鲸鱼（whale-refined）素材（原 `@linxin666/dsh-pet` 的 npm 元数据声明为 Apache-2.0，源码仓库为 <https://github.com/zhu1090093659/dsh-web>）。本仓库为拷贝副本，并经 AI 辅助修复/精修——归属与修改声明见 **`THIRD_PARTY_NOTICES.md`**，`pet.json` 内 `"license": "Apache-2.0"`。
- **Hermes Agent**：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)，其自身许可见该仓库；本插件只通过其 HTTP API 调用，不内置 Hermes 代码。

> **再分发约束**：Apache-2.0 素材在再分发时须保留原作者版权声明与本文件许可声明（已做到）；不得暗示 `zhu1090093659` / dsh-web 背书本插件。若原作者要求移除或改换许可，可单独移除精灵素材而不影响代码部分。

---

*文档随代码演进更新。当前版本对应 `lib/` 构建产物 2026-08-26 的隔离验证通过状态。*
