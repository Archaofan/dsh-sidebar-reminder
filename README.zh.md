# dsh-session-suspend

DSH 网页版的「会话挂起提醒」插件：在对话里用自然语言描述待办，把当前会话挂起；左侧会话栏中对应会话**高亮**，鼠标悬停显示**提醒事项**。

轻量化、功能单一：只做这一件事，无运行时依赖、无构建步骤，两个源码文件（host 半边 + 浏览器半边）。

[English](README.md)

## 效果

| 位置 | 表现 |
| --- | --- |
| 左侧会话栏 | 被挂起的会话行按**样式预设**上色（默认左侧竖条；可选整行底色 / 前置圆点 / 标题着色 / 底部细线 / 外发光 等 7 种） |
| 悬停高亮行 | 行**下方**弹出提醒：`已挂起` + 时间 + 提醒原文 + 「打开」「清除」 |
| 侧边栏底部 | 「⏰ 挂起提醒 N」按钮，点击展开挂起列表（标题 / 提醒 / 时间 / 打开 / 清除）；齿轮进「样式设置」 |
| 侧边栏折叠时 | 展开按钮右上角出现小圆点，表示有挂起 |
| 会话页头部 | 「📌 挂起备注」按钮，手动填写 / 修改 / 清除当前会话的提醒 |
| 悬停任意会话行 | 官方「…」旁出现图钉按钮，点它直接给**该会话**写提醒 |

> 悬停提醒的位置是**可配置**的（官方卡片右侧 / 官方卡片左下），而且画定之后不会再移动
> （见下面「悬停框定位」）。

## 样式预设

左下角面板 → 齿轮 → 「样式设置」：

- **挂起时选择样式**（总开关，默认打开）：打开后每次挂起都弹下拉框让你选预设；关闭则直接用默认预设。
- **预设列表**：名称 / 样式 / 颜色 / 浓度（5%–100%），可新增、编辑、删除，最多 12 个。
- 预置三个：默认样式（左侧细条，琥珀色）、等待中（整行底色 16%，蓝色）、稍后（前置圆点，紫色）。
  这三个的名字跟随界面语言；一旦你改名，就以你填的为准。
- 自然语言挂起时也可指定：`suspend_session` 工具有 `preset_id` 参数（`list_suspended` 会列出可选 id）。

### 主题适配

插件自身不写死任何颜色，全部走 DSH 的设计令牌，因此浅色 / 深色自动跟随：

- 令牌定义在 `body` 上（不是 `:root`），深色变体选择器是 `body[data-ds-dark-theme]`
  （浅色即该属性缺席）——插件用同样的选择器做覆盖，**不用** `prefers-color-scheme`
  媒体查询，因为主题偏好是用户选的，可以和系统不一致。
- 琥珀色徽章用 `state-warn-primary`（琥珀-500，两个主题下取值相同）填充 + `neutral-1000`
  文字，对比度约 9.8:1；官方那套 `state-warn-tertiary` 填充 + `state-warn-label` 文字在浅色下
  只有约 2.5:1，这就是「不显眼」的根因。
- 原生 `<select>` / 颜色选择器显式声明 `color-scheme`（DSH 自己不声明，官方那个
  agent-team 的所有者下拉框就是这么糊的），并改用不透明令牌背景 + `appearance:none`。
- 所有 `var(--dsw-*)` 都带字面量回退，防止主题样式表挂载前渲染出不可读的界面。

## 使用

### 自然语言（主要方式）

直接在对话里说，模型会调用 `suspend_session` 工具。中英文都能触发：

- 「这个会话先挂起，晚点再继续」
- 「挂起：等对方回复后再继续」
- 「这事先放着，下午回来接着弄」
- "park this, remind me later"
- "suspend this session until the build finishes"
- "hold this, I will be back tonight"

完成后说「这事结了 / 取消挂起 / done, unpark / clear the reminder」即调用
`resume_session` 清除；问「我还有哪些事没做完 / what is still parked?」会调用
`list_suspended` 列出全部挂起。

### 手动

点会话页头部的「挂起备注」按钮，填写提醒内容保存即可（`Ctrl/Cmd + Enter` 快速保存）。

## 安装

需要 DSH ≥ 0.1.6-alpha.1 的 web profile。两个 `@deepseek-ai/*` 依赖
（`dsh-home-paths`、`dsh-tools`）按生态惯例声明为 **peerDependencies**（同
`dsh-better-sidebar`）：打包安装时由包管理器装进插件自己在 profile 里的
`node_modules`，不改动 profile 的依赖树；版本范围与 harness 一致。

### 方式 A：打包安装（推荐，自包含）

```bash
# 在插件目录打包（只含 6 个交付文件，见 package.json 的 files）
pnpm pack --pack-destination .

# 装进生产 profile
dsh plugin --profile web add E:\DSH-Workspace\DSH-Plugin\dsh-session-suspend-0.1.0.tgz
```

自包含：装完后即使插件目录被移动/删除也不影响生产；升级时重新打包再 `add` 一次即可。
依赖随包一起装进 profile 内插件自己的 `node_modules`（与 harness 同版本，互不影响）。

### 方式 B：目录联接（开发迭代用）

```bash
dsh plugin --profile web add E:\DSH-Workspace\DSH-Plugin
```

pnpm 以 `link:` 协议联接目录，改代码重启即生效。**前提是插件目录的 `node_modules` 存在**
（Node 从联接真实路径解析依赖，摸不到 DSH 安装目录）。本机实测：link 安装/卸载偶尔会把这
个 `node_modules` 修剪掉，表现为启动报 `Cannot find package
'@deepseek-ai/dsh-home-paths'`——在插件目录执行一次 `npm install` 即可恢复。因此生产
安装请用方式 A。

### 发布后

```bash
dsh plugin --profile web add dsh-session-suspend
dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder
```

安装后**重启 DSH**（插件在启动时加载，之后创建的会话都会带上工具）。
在「设置 → 插件市场」或 `dsh plugin --profile web list` 中可确认已启用。

> 首次调用工具时，如果当前会话的权限策略弹审批，允许一次即可（插件只读写自己的存储文件）。

### 重复挂载的容错

如果插件被挂了两次（例如既走了 `dsh plugin add`，又在 profile 的 `cordis.patch.yml`
里手工加了一行），官方 loader 会因为**重复注册工具名 / 路由**而让**整个插件树加载失败、
DSH 起不来**。本插件在 host 侧对工具和路由注册都做了运行时守卫：后挂载的那个实例自动
退让（记一条 warn 日志），先挂载的实例继续工作，**启动不会失败**。若发现插件不工作，
先用 `dsh plugin --profile web list` 检查是否挂了两次。

## 工作原理

```
index.js   host 半边：3 个模型工具 + 3 个本地 HTTP 路由 + JSON 持久化
client.js  浏览器半边：轮询 / 面板 / 角标 / 行高亮 / 悬停 tooltip（单文件，无构建）
```

- **存储**：`~/.dsh/storages/session-suspend/suspended.json`（`{ 会话id: { note, createdAt } }`，临时文件 + 原子重命名写入）。
- **数据流**：浏览器每 2.5s 轮询 `GET /session-suspend/list`；保存 / 清除走 `POST /session-suspend/set|clear`。host 是唯一事实源。
- **模型工具**：`suspend_session` / `resume_session` / `list_suspended`，按 DSH 官方 `defineTool` 约定注册；只允许主会话（root agent）挂起自己的会话。
- **UI**：全部使用官方插槽（`sidebar.footer.action`、`sidebar.toggle.badge`、`conversation.session.header.actions`），不 shadow 任何官方组件。
- **行高亮**：官方会话行没有按行插槽，且只读内置 `schedule` projection，因此与社区插件（dsh-activity-bell 等）一致，采用 DOM 增强：给匹配标题的 `[role="treeitem"]` 行写入 `data-dsh-suspend` 属性 + 高亮 class，React 重渲染后由 MutationObserver + 定时扫描补写。

## 悬停框定位

官方卡片和我们的卡片都在同一个 500ms 悬停后出现，所以定位就是全部问题：

| 设置 | 位置 | 取舍 |
| --- | --- | --- |
| **官方卡片左下**（默认） | `行右缘 + 8`，紧贴官方卡片下沿 | 不压侧边栏、也不盖官方卡片；指针路程约 162px，`打开`在官方 200ms 宽限内点得到 |
| **官方卡片右侧** | `行右缘 + 260`，并排 | 不依赖官方卡片高度，所以**不可能跳**；但指针要跑约 385px |

「左下」会去量官方卡片的下沿，量不到时就退到**和「右侧」完全相同**的那个确定位置，
所以卡片绝不会从一个地方跑到另一个地方。「左下」还会用 `requestAnimationFrame`
等官方卡片布局好再一次画定，而不是先按兜底位置画、事后校正（那个校正正是卡片可见滑动的来源）。

时序与官方 `HoverCard` 完全一致——开 500ms（`openDelayMs`）、关 200ms
（`usePointerGrace`）——两张卡片节奏不一致时，哪怕各自都正确，看起来也像出了 bug。

## 已知限制

- **三点菜单加不了第四项**：官方会话行的「…」菜单（重命名 / 分叉会话 / 归档会话）是
  `dsh-client-ui-workspace` 里**硬编码的数组**，整条渲染链上没有任何插槽
  （`sidebar → sidebar.workspaces → WorkspaceBrowser`），插件无法注入菜单项。
  替代方案就是行内那个图钉按钮（悬停行时出现在「…」旁边）。
- **官方悬停卡片也无法扩展**：它同样没有插槽，只能并排共存（见上）。
- **按标题匹配**：行高亮靠「会话标题 ↔ 存储中的会话 id」匹配（匹配行的任意叶子文本，标题优先）；
  同名会话会同时高亮（面板中仍按 id 区分）。刚建、还没有标题的会话（显示为「新会话」）不高亮
  （面板 / 角标仍可见）。
- **升级脆弱性**：DOM 增强依赖官方会话行的 `role="treeitem"` 与标题文本结构，DSH 升级后行结构若变化，
  高亮可能失效（此时面板、角标、工具均不受影响）。
- **HTTP 路由无鉴权**：与社区插件一致，仅监听本机回环，同机其他进程可读写该文件。
- 每个会话只保存一条提醒（再次挂起即覆盖）；归档会话的提醒会保留到手动清除。
- 浏览器语言按 `document.documentElement.lang` 取，只内置了中 / 英两种文案。
- 预设存在插件自己的 `presets.json`，没有接进 DSH 官方设置页（要接需引入
  `ctx.settings` / `settings.section` 等依赖，见「扩展方向」）。
- 「打开」会话走 `uiWorkspace.openSession`（DSH 侧边栏自己也是这么点的），失败时退化为
  点击侧边栏里对应行，再失败会在面板里给出文字提示。
- 行内按钮取 session id 优先读 React fiber，读不到时退回标题匹配。
- 非环回（远程）浏览器里预设改动只在本进程生效（DSH 设置管线的既定行为）。

## 开发与沙箱验证

插件直接改生产 DSH 的风险是真实的：补丁或清单有问题会让**整个插件树加载失败、DSH 起不来**。
本仓库的开发流程是「沙箱先行」，沙箱已搭好并验证过：

```
.sandbox/
├── dsh/          与生产同版本（0.1.6-alpha.2）的完整 DSH 安装副本
├── home/         独立的 DSH_HOME（profiles/sandbox、storages 都在这里）
├── node_modules/ 仅沙箱用的 pnpm
└── boot-*.log    历次引导日志
```

日常验证循环（改代码 → 打包进沙箱 → 引导 → 看路由/UI → 再上生产）。**用 tarball 而不是
link**：link 安装偶尔会被 pnpm 修剪掉插件的 `node_modules`，容易拿到过期代码或莫名启动失败。

```powershell
# 0. 语法自检
node --check index.js && node --check client.js

# 1. 打包并装进沙箱 profile（自包含，依赖随包走）
$env:DSH_HOME = 'E:\DSH-Workspace\DSH-Plugin\.sandbox\home'
& .sandbox\node_modules\.bin\pnpm.cmd pack --pack-destination .sandbox
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox remove dsh-session-suspend
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox add .sandbox\dsh-session-suspend-0.1.0.tgz

# 2. 引导沙箱（独立端口 12991、仅回环、独立 home，绝不碰生产）
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js --profile sandbox --no-open --port 12991 --host 127.0.0.1

# 3. 校验（另开终端）
curl http://127.0.0.1:12991/session-suspend/list                                  # host 路由
curl -X POST http://127.0.0.1:12991/session-suspend/set -H "content-type: application/json" -d '{\"sessionId\":\"t\",\"note\":\"n\"}'
# 浏览器打开引导日志里打印的 http://127.0.0.1:12991/?token=... 看 UI
```

> 端口被占用时用 `netstat -ano | Select-String '12991'` 找 PID（`Get-NetTCPConnection`
> 在本机不可靠），只杀沙箱那个进程——**生产监听 12931，绝不能碰**。
> （注意生产绑定的是 `0.0.0.0:12931`，grep 时别写成 `127.0.0.1:12931`，否则会误判成没在跑。）

> ⚠️ **交互验证必须由你本人在普通 PowerShell 终端里启动沙箱**，不要让 AI 助手代启。
> 官方的工作区目录选择器是原生 Win32 对话框，由宿主进程用带管道的 `child_process.spawn`
> 拉起；AI 运行时的文件沙箱会拦掉这种 spawn（`EPERM`），结果是「无法选择工作区、新建不了
> 对话」。在普通终端里启动的沙箱与生产行为完全一致（隔离仍由 DSH_HOME + profile + 端口保证）。
> 推荐把工作区选到 `.sandbox\workspace`（一次性目录，随便改）。

已验证通过：boot 图组合、host 四个路由与持久化（list / set / clear / presets，含 400/413
状态码与预设校验）、client bundle 被组合下发、三个插槽注册、tarball 安装路径、重复挂载的
运行时守卫、以及「缺依赖 / 端口占用」导致 boot 失败的反面案例（都是沙箱拦下的，没到生产）。
沙箱与生产完全隔离（独立 home / profile / 端口），可随时整个删掉。

## 发布前清单

初版发布前需要确认：

- [x] 把 `package.json` 里 `repository.url` 的占位符换成真实仓库地址
      —— 已填 `https://github.com/Archaofan/dsh-sidebar-reminder`。
- [ ] 发布后，在**沙箱 profile** 上先验证「发布后」那条安装路径
      （`dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder`），
      确认没问题再动生产。
- [ ] 升 `version` 并重新打包；tarball 文件名带版本号。
- [ ] 在普通终端里再把交互 UI 完整过一遍：两种界面语言各挂起一次、切换悬停框位置、
      改一个预设名，并确认 `打开` 在官方卡片宽限内点得到。
- [ ] 确认生产 profile 未被改动：在你决定安装之前，插件不应该出现在生产里。

## 卸载

```bash
dsh plugin --profile web remove dsh-session-suspend
```

再次重启后插槽、高亮、路由、工具全部消失；存储文件如不需要可手动删除 `~/.dsh/storages/session-suspend/`。

## 开发

```bash
node --check index.js && node --check client.js   # 语法自检
```

无需安装依赖即可运行；host 半边引用的 `@deepseek-ai/*` 由 DSH 安装目录解析（与 dsh-workspace-kit 等官方包的做法一致）。

### 客户端半边的验证（重要）

**DSH 的模块加载器只有在浏览器真正 import 时才会物化客户端 bundle**，所以哪怕沙箱
启动成功、每个路由都通，也只证明了 host 半边——客户端半边可能根本没跑起来。客户端
激活失败在 GUI 里表现为：

```
HARNESS Failed to load plugins / <插件名> / web boot: 1 entry did not activate
```

`.sandbox/client-harness.cjs` 用一个假 DOM + 假 cordis ctx 在 Node 里直接物化
`client.js` 并调用 `apply()`，把这类问题在无浏览器的情况下暴露出来：

```bash
node .sandbox/client-harness.cjs client.js        # 对源码跑
node .sandbox/client-harness.cjs <已安装的client.js>  # 对安装产物跑
HARNESS_LANG=en node .sandbox/client-harness.cjs client.js  # 同一套检查，英文界面
```

它检查八件事：模块作用期不抛异常、`apply()` 能跑完且三个插槽都注册成功、
`inject` 里只列真正可达的服务、**绘制链**（备注里存的 `presetId` 确实决定了
行上的样式类，而不是永远回退到默认预设）、**预设名本地化**（内置预设按界面
语言显示，改过名的那个以你填的名字为准）、**悬停框定位**（两种配置位置都离开
侧边栏、都不盖官方卡片，且画定之后不再移动）、**等待行为**（`below` 位置会等官方
卡片布局好再画，而不是先画再校正造成可见跳动），以及**时序对齐**（开 500ms /
关 200ms，与官方 `HoverCard` 的 `openDelayMs = 500` 和 `usePointerGrace` 的
200ms 完全一致）。

`.sandbox/tool-schema.cjs` 是 host 半边的对应门禁：注册真实工具、逐个调用，
递归核对返回值里每个字段是否已在输出 schema 中声明（`additionalProperties:
false` 时未声明即违规，见下面踩过的坑四）。

`.sandbox/gate.cjs` 是总回归门禁，两个半边各跑好版本 + 坏版本：客户端七个坏版本
（`inject` 含不可达的服务；`noteByTitle` 形状不匹配；悬停框挂回侧边栏；`below`
位置瞎猜官方卡片高度；`showTipWhenReady` 不再等待；开延迟偏离 500；关宽限偏离
200），host 一个坏版本（`suspend_session` 返回未声明的 `presetId`），确认全部被拒
（exit 1），同时两个好版本通过（exit 0）。

> 踩过的坑一：`inject` 里列了本插件 fiber 不可达的服务（`uiWorkspace` 是由
> `dsh-client-ui-workspace` 自己的 fiber 提供的，和本插件是兄弟而非父子关系），
> cordis 会一直等它，插件于是永不激活（GUI 报 "1 entry did not activate"）。
> `inject` 只写 `['slots']`，需要服务时在调用点 opportunistic 读取并做好兜底。
>
> 踩过的坑二：`noteByTitle()` 一度返回 `{sessionId, entry}`，而消费方 `presetFor()`
> 读的是 `note.presetId`——字段被嵌在里面从来没被读到，于是每一行都静默回退到默认
> 预设，表现为「选了别的样式，应用的还是默认那一种」。现在 `noteByTitle()` 直接摊平
> note 字段并带上 `sessionId`，并由上面的绘制链测试守住。
>
> 踩过的坑四：`suspend_session` 的返回值里带了 `presetId`，但输出 schema 没声明它，
> 而 schema 是 `additionalProperties: false`——dsh-tools 会把任何未声明的返回值字段
> 判为违规，模型侧就表现为每次挂起都附带一个序列化告警（功能本身是好的，所以特别
> 容易被忽略）。修法是补上 `presetId: { type: 'string' }`，并由 `.sandbox/tool-schema.cjs`
> 守住：它注册真实工具、逐个调用、递归核对返回值里每个字段是否已在 schema 中声明。
> 注意 `required: true` 写在属性里是 DSH 的约定（`dsh-tools` 会把它提升成标准的
> `required: [...]` 数组），不要改成标准 JSON Schema 写法。

## 许可

MIT
