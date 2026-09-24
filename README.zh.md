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
| **折叠的工作区** | 折叠时在该行右侧显示一个数字，表示这个工作区里有几个会话被挂起；展开后数字消失（因为会话都在眼前，再显示就是冗余） |
| 挂起列表 | 每一行按它自己的**样式预设**渲染，和左侧会话栏同一个样子；挂起时间带一个浅色小框，不再和背景糊在一起 |
| **官方设置页** | 「设置」左侧导航里多一项「挂起提醒」，和面板齿轮打开的是**同一份**偏好编辑器 |
| **斜杠命令** | 在输入框里 `/suspend 备注`、`/suspended`、`/resume`，不花模型轮次 |

> 悬停提醒的位置是**可配置**的（官方卡片右侧 / 官方卡片左下），而且画定之后不会再移动
> （见下面「悬停框定位」）。

> 上面最后两项、以及下面「样式预设」里的总开关，默认都是打开的，可以在「样式设置」里各自关掉。

## 样式预设

偏好编辑器有两个入口，内容完全一致（同一份 `presets.json`，改任何一处立即生效）：

- 左下角面板 → 齿轮 → 「样式设置」
- **官方设置页**：「设置」左侧导航 → 「挂起提醒」（DSH 自己的 Settings 窗口，不用先展开侧边栏面板）

编辑器内容：

- **挂起时选择样式**（总开关，默认打开）：打开后每次挂起都弹下拉框让你选预设；关闭则直接用默认预设。
- **预设列表**：名称 / 样式 / 颜色 / 浓度（5%–100%），可新增、编辑、删除，最多 12 个。
- 预置三个：默认样式（左侧细条，琥珀色）、等待中（整行底色 16%，蓝色）、稍后（前置圆点，紫色）。
  这三个的名字跟随界面语言；一旦你改名，就以你填的为准。
- **折叠项目显示挂起数**（默认打开）：工作区折叠时，在该行右侧显示其中的挂起会话数。
  展开时自动隐藏——展开后数字会从 DOM 上摘掉，不是用 CSS 藏起来。
- **总览中按预设样式区分**（默认打开）：挂起列表里的每一行也套用该会话的预设样式，
  否则列表退化成纯文字、所有行一个样。
- **时间加上底色框**（默认打开）：挂起列表里的时间包一个浅色小框（圆角 8px）。
  关掉就是纯文字，适合喜欢极简的界面。

### 折叠工作区上的数字是怎么来的

这里有个实现上的坑值得记一笔：DSH 的工作区（界面叫「项目」）**折叠时根本不渲染它的会话行**
（`deriveGroups` 里 `sessions: expanded ? … : []`），所以 DOM 里一个成员都看不到，
数字**不可能**从 DOM 里数出来。插件的做法是反过来——从 `useWorkspaces` 这个全局 hook 拿到
工作区的成员名单，和挂起记录求交集；折叠的那一行只是把已经算好的数字贴上去。
工作区行本身没有 id，它在 React fiber 上的 `group` 才是身份，所以行和数字的对应关系
也是从 fiber 读的。

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

### 斜杠命令（不花模型轮次）

在输入框里直接打斜杠，DSH 的指令发现面板会列出本插件注册的三条：

| 命令 | 作用 |
| --- | --- |
| `/suspend <备注>` | 挂起**当前会话**；备注为空时给出用法提示 |
| `/suspended` | 列出全部挂起（备注 + 时间，新的在前），和 `list_suspended` 工具同一份数据 |
| `/resume` | 取消挂起当前会话；本来没挂起时如实告知 |

结果以流程节点形式落在当前会话的时间线里（官方对所有命令一视同仁），
侧边栏的高亮 / 角标 / 折叠计数同步更新。

### 手动

点会话页头部的「挂起备注」按钮，填写提醒内容保存即可（`Ctrl/Cmd + Enter` 快速保存）。

## 安装

已在 **DSH 0.1.6-alpha.2 与 0.1.7-rc.2 两条线上实测通过**——同一个包两边都能跑
（见[DSH 版本兼容](#dsh-版本兼容)）。需要 DSH ≥ 0.1.6-alpha.1 的 web profile。
两个 `@deepseek-ai/*` 依赖
（`dsh-home-paths`、`dsh-tools`）按生态惯例声明为 **peerDependencies**（同
`dsh-better-sidebar`）：打包安装时由包管理器装进插件自己在 profile 里的
`node_modules`，不改动 profile 的依赖树；版本范围与 harness 一致。

### 方式 A：打包安装（推荐，自包含）

```bash
# 在插件目录打包（只含 7 个交付文件，见 package.json 的 files）
pnpm pack --pack-destination .

# 装进生产 profile
dsh plugin --profile web add E:\DSH-Workspace\DSH-Plugin\dsh-session-suspend-0.1.5.tgz --ignore-scripts
```

自包含：装完后即使插件目录被移动/删除也不影响生产；升级时重新打包再 `add` 一次即可。
依赖随包一起装进 profile 内插件自己的 `node_modules`（与 harness 同版本，互不影响）。

> ⚠️ **Windows 上一定要加 `--ignore-scripts`。** `dsh plugin add` 把自己的参数
> 原样转给 pnpm，而 pnpm 默认会重跑**整个 profile 里每个包**的安装脚本，不只是新装的这个。
> 在真实 profile 上实测，不加这个参数会造成三种后果：安装永远跑不完（node-gyp 在重建
> `ssh2` / `cpu-features`，而机器上没有 Visual Studio）；`cloudflared` 的 postinstall
> ——它下载的是 **latest**，无视包版本号——会把 `cloudflared.exe` 截断成 0 字节。
> 加上 `--ignore-scripts` 后同一次安装约 3 秒完成，且除了插件本身什么都不碰。
> 本插件自己不声明任何安装脚本，所以跳过它们没有任何损失。

### 方式 B：目录联接（开发迭代用）

```bash
dsh plugin --profile web add E:\DSH-Workspace\DSH-Plugin --ignore-scripts
```

pnpm 以 `link:` 协议联接目录，改代码重启即生效。**前提是插件目录的 `node_modules` 存在**
（Node 从联接真实路径解析依赖，摸不到 DSH 安装目录）。本机实测：link 安装/卸载偶尔会把这
个 `node_modules` 修剪掉，表现为启动报 `Cannot find package
'@deepseek-ai/dsh-home-paths'`——在插件目录执行一次 `npm install` 即可恢复。因此生产
安装请用方式 A。

### 发布后

```bash
dsh plugin --profile web add dsh-session-suspend --ignore-scripts
dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder --ignore-scripts
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
index.js   host 半边：3 个模型工具 + 3 条斜杠命令 + 3 个本地 HTTP 路由 + JSON 持久化
client.js  浏览器半边：轮询 / 面板 / 角标 / 行高亮 / 悬停 tooltip / 官方设置页分区（单文件，无构建）
```

- **存储**：`~/.dsh/storages/session-suspend/suspended.json`（`{ 会话id: { note, createdAt } }`，临时文件 + 原子重命名写入）。
- **数据流**：浏览器每 2.5s 轮询 `GET /session-suspend/list`；保存 / 清除走 `POST /session-suspend/set|clear`。host 是唯一事实源。
- **模型工具**：`suspend_session` / `resume_session` / `list_suspended`，按 DSH 官方 `defineTool` 约定注册；只允许主会话（root agent）挂起自己的会话。
- **斜杠命令**：`/suspend` / `/suspended` / `/resume`，按 `ctx.commands.register` 约定注册（名字必须全小写），与工具共用同一套存储与解析逻辑，只是少一次模型往返。
- **UI**：全部使用官方插槽（`sidebar.footer.action`、`conversation.session.header.actions`、`settings.section`），不 shadow 任何官方组件。
- **行高亮**：官方会话行没有按行插槽，且只读内置 `schedule` projection，因此与社区插件（dsh-activity-bell 等）一致，采用 DOM 增强：给匹配标题的 `[role="treeitem"]` 行写入 `data-dsh-suspend` 属性 + 高亮 class，React 重渲染后由 MutationObserver + 定时扫描补写。

## 悬停框定位

官方卡片和我们的卡片都在同一个 500ms 悬停后出现，所以定位就是全部问题：

| 设置 | 位置 | 取舍 |
| --- | --- | --- |
| **官方卡片左下**（默认） | `行右缘 + 8`，紧贴官方卡片下沿 | 不压侧边栏、也不盖官方卡片；指针路程约 162px，`打开`在官方 200ms 宽限内点得到 |
| **官方卡片右侧** | `行右缘 + 260`，并排 | 不依赖官方卡片高度，所以**不可能跳**；但指针要跑约 385px |

「左下」会去量官方卡片的下沿，量不到时就退到**和「右侧」完全相同**的那个确定位置，
所以卡片绝不会从一个地方跑到另一个地方。「左下」还会等官方卡片布局好再一次画定，
而不是先按兜底位置画、事后校正（那个校正正是卡片可见滑动的来源）。

时序与官方 `HoverCard` 对齐——开 500ms、关 200ms（`usePointerGrace`）——两张卡片
节奏不一致时，哪怕各自都正确，看起来也像出了 bug。其中**开**这一侧是**下限**而不是
写死的宿主持有值：官方 dwell 不是契约，而且已经变过一次（0.1.7 的会话行卡片传
`openDelayMs: 800`，0.1.6 用的是 500 默认值）。因此插件最早也在 500ms 才出现，
之后再继续等，最多等到一个 700ms 的预算用完，直到官方卡片可测量为止——这样不管宿主
dwell 是 500 还是 800，两张卡片都是一起出现的。`check-host-card.cjs` 会读真实的
DSH 安装目录，一旦卡片的宽度、8px 锚点偏移或 dwell 漂移出插件假设的范围就报错。

## DSH 版本兼容

同一个包，两条线都实测过。0.1.7 的变化与对应处理：

| 0.1.7 的变化 | 对本插件的影响 | 处理方式 |
| --- | --- | --- |
| 会话行 `HoverCard` 的 dwell 从 500 提到 **800ms** | 提示框原本按**帧数**（约 100ms）等待，官方卡片还有 300ms 才出现时等待就到期了，「左下」于是按兜底位置画在行旁边，而不是画到官方卡片下面 | 等待改成 **700ms 的时间预算**。预算用完前不显示任何东西，所以宿主更慢只意味着多等一会儿，绝不会出现跳动。门禁变体 11 复现这个 bug |
| 首次运行引导（内测声明 + API Key） | 整页遮罩会拦掉所有点击，侧边栏点不动，e2e 在**第一个**点击就失败 | `dismissFirstRun(page)`——在 GUI 稳定**之后**再关（先关会找不到对话框，随后遮罩出现，下一次点击就超时），并按 **exact** 的 role 名称点最后一个按钮 |
| 插件管理页卡片标题改成完整包名（`dsh-session-suspend`，不再是 `session-suspend`） | e2e 的卡片选择器匹配的是文本恰为 `session-suspend` 的元素 | 改为匹配 `…_cardTitle` class 加 `session-suspend$` 后缀，两种拼写都能中 |
| 会话日志格式 **v3 → v4** | 0.1.6 写的会话 0.1.7 读不了（反之亦然）——这是环境限制，不是插件的。因此 0.1.7 的 profile 没有可测量的会话行 | 真实 GUI 的几何那一半放在 0.1.6 上跑（那边有真实会话）；0.1.7 上依赖行的检查报 *skipped* 而不是 *failed*，同样的几何假设由 `check-host-card.cjs` 对两个安装目录做静态守护 |
| `dsh-settings` 重写、`ui-primitives` 图标具名导出整族改名 | 无影响——本插件只消费官方 slot（`sidebar.footer.action`、`conversation.session.header.actions`、`settings.section`），两条线上都稳定 | 不需要改；e2e 断言三个 slot 仍然渲染且无冲突注册 |

插件运行时**不做任何版本门禁**：没有 `if (dshVersion)`。两个宿主由同一份代码处理，
兼容性声明由 `check-host-card.cjs` 读每个安装目录来背书，而不是靠一个版本号字符串。

两个 `@deepseek-ai/*` peer（`dsh-home-paths`、`dsh-tools`）在两条线上导出的签名完全
一致——`defineTool(options)` 和 `dshHomePath(...segments)`——所以 0.1.6 的副本在 0.1.7
宿主上同样可用，反之亦然。这一点是通过 diff 两个安装目录验证的，不是假设。

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
- 界面文案内置中 / 英两种。启动时按文档语言取一份，随后**跟随 DSH 的界面语言**：
  在设置里切换语言，侧边栏、面板、官方设置页当场跟着变，不用刷新页面
  （没有 locale 服务的组合里退化为文档语言）。
- 「打开」会话走 `uiWorkspace.openSession`（DSH 侧边栏自己也是这么点的），失败时退化为
  点击侧边栏里对应行，再失败会在面板里给出文字提示。
- 行内按钮取 session id 优先读 React fiber，读不到时退回标题匹配。
- 非环回（远程）浏览器里预设改动只在本进程生效（DSH 设置管线的既定行为）。

## 开发与沙箱验证

插件直接改生产 DSH 的风险是真实的：补丁或清单有问题会让**整个插件树加载失败、DSH 起不来**。
本仓库的开发流程是「沙箱先行」，沙箱已搭好并验证过：

```
.sandbox/        DSH 0.1.6-alpha.2 —— 回归基线
├── dsh/          与生产同版本（0.1.6-alpha.2）的完整 DSH 安装副本
├── home/         独立的 DSH_HOME（profiles/sandbox、storages 都在这里）
├── node_modules/ 仅沙箱用的 pnpm
└── boot-*.log    历次引导日志
.sandbox-next/    DSH 0.1.7-rc.2 —— 适配目标
```

日常验证循环（改代码 → 打包进沙箱 → 引导 → 看路由/UI → 再上生产）。**用 tarball 而不是
link**：link 安装偶尔会被 pnpm 修剪掉插件的 `node_modules`，容易拿到过期代码或莫名启动失败。

```powershell
# 0. 语法自检
node --check index.js && node --check client.js

# 1. 打包并装进沙箱 profile（自包含，依赖随包走）
$env:DSH_HOME = 'E:\DSH-Workspace\DSH-Plugin\.sandbox\home'
npm pack --ignore-scripts            # 产物 dsh-session-suspend-<version>.tgz
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox remove dsh-session-suspend
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox add .sandbox\dsh-session-suspend-0.1.5.tgz --ignore-scripts

# 2. 引导沙箱（独立端口 12996、仅回环、独立 home，绝不碰生产）
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js --profile sandbox --no-open --port 12996 --host 127.0.0.1

# 3. 校验（另开终端）
curl "http://127.0.0.1:12996/session-suspend/list?token=<引导日志里的token>"
curl -X POST "http://127.0.0.1:12996/session-suspend/set?token=<token>" -H "content-type: application/json" -d '{\"sessionId\":\"t\",\"note\":\"n\"}'
# 浏览器打开引导日志里打印的 http://127.0.0.1:12996/?token=... 看 UI
```

> 端口被占用时用 `netstat -ano | Select-String '12996'` 找 PID（`Get-NetTCPConnection`
> 在本机不可靠），只杀沙箱那个进程——**生产监听 12931，绝不能碰**。
> （注意生产绑定的是 `0.0.0.0:12931`，grep 时别写成 `127.0.0.1:12931`，否则会误判成没在跑。）
>
> `npm pack` 默认缓存不可写时报权限错，指向沙箱自带缓存即可：
> `$env:npm_config_cache = 'E:\DSH-Workspace\DSH-Plugin\.sandbox\.npm-cache'`。
> Windows 上 `npm.ps1` 可能被执行策略拦掉，用 `npm.cmd` 调用。

> ⚠️ **交互验证必须由你本人在普通 PowerShell 终端里启动沙箱**，不要让 AI 助手代启。
> 官方的工作区目录选择器是原生 Win32 对话框，由宿主进程用带管道的 `child_process.spawn`
> 拉起；AI 运行时的文件沙箱会拦掉这种 spawn（`EPERM`），结果是「无法选择工作区、新建不了
> 对话」。在普通终端里启动的沙箱与生产行为完全一致（隔离仍由 DSH_HOME + profile + 端口保证）。
> 推荐把工作区选到 `.sandbox\workspace`（一次性目录，随便改）。

已验证通过：boot 图组合、host 四个路由与持久化（list / set / clear / presets，含 400/413
状态码与预设校验）、client bundle 被组合下发、三个插槽注册、官方设置页分区与斜杠命令的
真实浏览器验证、tarball 安装路径、重复挂载的
运行时守卫、以及「缺依赖 / 端口占用」导致 boot 失败的反面案例（都是沙箱拦下的，没到生产）。
沙箱与生产完全隔离（独立 home / profile / 端口），可随时整个删掉。

## 发布前清单

初版发布前需要确认：

- [x] 把 `package.json` 里 `repository.url` 的占位符换成真实仓库地址
      —— 已填 `https://github.com/Archaofan/dsh-sidebar-reminder`。
- [x] 发布后，在**沙箱 profile** 上先验证「发布后」那条安装路径
      （`dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder
      --ignore-scripts`），确认没问题再动生产。
- [x] 升 `version` 并重新打包；tarball 文件名带版本号。
- [x] 用 `--ignore-scripts` 装进生产（见方式 A 的警告）；已在 profile `web` 上验证，
      7 个文件与发布 tarball 逐字节一致，未碰其他任何包。
- [ ] 在普通终端里再把交互 UI 完整过一遍：两种界面语言各挂起一次、切换悬停框位置、
      改一个预设名，并确认 `打开` 在官方卡片宽限内点得到。
- [ ] 确认生产 profile 未被改动：在你决定安装之前，插件不应该出现在生产里。

### 老 profile 上的 pnpm 版本错配

如果在一个**已经有插件**的 profile 上 `dsh plugin add` 报
`ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF` 或 `ERR_PNPM_UNEXPECTED_STORE`，
说明该 profile 的 `node_modules` 是用**另一个 pnpm 大版本**建的。看
`node_modules\.modules.yaml` 里的 `packageManager` 字段。DSH 0.1.6-alpha.2 自带
pnpm 10，而 pnpm 10 拒绝修改 pnpm 8 建的 store（反过来也一样）。要么先统一 pnpm
版本，要么把插件装到一个新建的 profile——硬混会在依赖树里留下半联接状态。

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

它检查十件事：模块作用期不抛异常、`apply()` 能跑完且三个插槽都注册成功、
`inject` 里只列真正可达的服务（且模块读到的服务都在里面——见踩过的坑五）、
**绘制链**（备注里存的 `presetId` 确实决定了
行上的样式类，而不是永远回退到默认预设）、**预设名本地化**（内置预设按界面
语言显示，改过名的那个以你填的名字为准）、**悬停框定位**（两种配置位置都离开
侧边栏、都不盖官方卡片，且画定之后不再移动）、**等待行为**（`below` 位置会等官方
卡片布局好再画，而不是先画再校正造成可见跳动）、**时序对齐**（开 500ms /
关 200ms，与官方 `HoverCard` 的 `openDelayMs = 500` 和 `usePointerGrace` 的
200ms 完全一致）、**语言字典与热切换**（zh/en 两本都发布到 `ctx.locale`，
激活时跟随框架语言而非文档语言，切换语言后字典与 store 一起刷新），以及
**官方设置页分区**（`settings.section` 注册成功、导航标签是会跟随语言的 thunk、
组件能渲染）。

`.sandbox/tool-schema.cjs` 是 host 半边的对应门禁：注册真实工具、逐个调用，
递归核对返回值里每个字段是否已在输出 schema 中声明（`additionalProperties:
false` 时未声明即违规，见下面踩过的坑四）；三条斜杠命令也会被逐个自测
（名字必须全小写、返回值必须是 `{kind:'success'|'error'}`）。

`.sandbox/gate.cjs` 是总回归门禁，两个半边各跑好版本 + 坏版本：客户端十二个坏版本
（`inject` 含不可达的服务；读了 `ctx.locale` 却没把它列进 `inject`；
`noteByTitle` 形状不匹配；悬停框挂回侧边栏；`below`
位置瞎猜官方卡片高度；`showTipWhenReady` 不再等待；开延迟偏离 500；关宽限偏离
200；语言切换不重绑字典；设置页导航标签写成了静态字符串；卡片等待预算缩回
旧的按帧计数——正是 0.1.7 的那个回归本身；没给 deadline 被当成「一直等下去」
而不是「没有预算」），host 三个坏版本
（`suspend_session` 返回未声明的 `presetId`；`/suspend` 忽略 rawInput；
命令名大小写不合规），确认全部被拒
（exit 1），同时四个好版本通过（exit 0：中文、英文、以及「文档是英文但框架
语言是中文」的错配组合——证明插件跟随框架语言）。

`check-host-card.cjs` 是门禁的第三半边，直接读**真实安装的 DSH**：官方卡片的
宽度（244px）、它 8px 的锚点偏移、它的停留时长，任何一项漂移到插件假设之外就
报错。这三项都不是对外承诺过的接口——停留时长已经从 500 动到 800 过一次了——
所以只能靠测出来，不能靠信。它对每个已安装版本都跑一遍：新的 DSH 动其中任何
一项，都是在这里挂掉，而不是在用户的侧边栏里挂掉。

浏览器半边有三个 e2e，全部用 Playwright 驱动**真实 GUI**，插槽注册表、React
渲染、官方 `HoverCard`、官方设置窗口、指令发现面板全部是真的：

- `.sandbox/e2e/e2e.mjs`——插件的页脚按钮渲染出来了、没有 "did not activate"
  报错、挂起的行真的带上了高亮属性，以及——假 DOM 无论如何测不到的那部分——
  悬停一行时我们的卡片**位于官方卡片左下且不重叠**、**画定之后不再移动**、
  操作按钮在卡片自己的边框内、且**不横跨在侧边栏上方**，还有切换定位方式后
  卡片真的会动并写回 host。
- `.sandbox/e2e/e2e-new-surfaces.mjs`——官方设置页里我们的分区渲染出标题 /
  开关 / 预设列表，勾选「挂起时选择样式」后 host 侧的偏好真的翻转；再在真实
  会话里依次打 `/suspend`、`/suspended`、`/resume`，挂起、列表、清除都在
  时间线里看得到。
- `.sandbox/e2e-settings-page.mjs`——插件管理页里我们的卡片显示 v0.1.5、
  包名、中文优先的描述，且组件状态是「运行中」（这是唯一按插件报告激活状态的地方）。

```bash
pnpm install                      # 装一次，拿 playwright 开发依赖
node .sandbox/e2e/e2e.mjs http://127.0.0.1:12996/?token=...              # 用沙箱引导日志里的地址
node .sandbox/e2e/e2e-new-surfaces.mjs http://127.0.0.1:12996/?token=...
node .sandbox/e2e-settings-page.mjs http://127.0.0.1:12996/?token=...
# E2E_CHROMIUM=/path/to/chrome.exe node .sandbox/e2e/e2e.mjs <url>   # 任意较新的 Chromium 都行
```

两个新 e2e 都是**自包含**的：没有挂起会话时它会自己打开一个会话并用
`/suspend` 挂一个，不再需要人工预先准备数据。选择器都是从真实 DOM 上学来的，
值得记一笔：官方设置窗口的导航是唯一同时列出内置分区（「通用设置」）的
`<nav>`——侧边栏底部按钮和我们的导航项文案一样，不限空间的文本搜索会点错；
输入框是 `contenteditable` 而不是 `textarea`；命令结果是**会话时间线里的
流程节点**，问候屏没挂时间线，所以要先打开一个有历史的会话；
插件管理页在 0.1.6 里不再是 `code[data-plugin-name]`，而是卡片里一个
按钮形式的标题。

### 工具对模型是否可见

注册一个工具只是把它放进 `ctx.tools`；模型真正收到的是 `ctx.tools.schemas()`
投影出来的东西。为在真实启动里证明这半边，曾往沙箱里临时装了一个一次性诊断插件，
在本插件旁边把真实注册表在插件树稳定后 dump 出来，随后移除。那次启动的结果：

```
ctx.tools.constructor.name        ToolRuntime
ctx.tools.schemas()               ["suspend_session", "resume_session", "list_suspended"]
ctx.tools.wireSchemas().schemas   ["suspend_session", "resume_session", "list_suspended"]
```

三条描述逐字在内，中英文触发示例都包含。复现时有两件事值得注意：在激活时**同步**
读注册表会读到空视图——工具是由兄弟插件的 effect 注册的，要延后一点再读；内置
工具（`run_code`、`bash` 等）在全局视图里根本不出现，它们是按 agent 作用域的，
所以全局列表为空本身并不能说明有问题。

这**不能**证明的是：模型在听到某句话时会不会真的去调用工具——那需要一次带凭据的
模型往返，也是唯一留给人工的检查项。

> 踩过的坑一：`inject` 里列了本插件 fiber 不可达的服务（`uiWorkspace` 是由
> `dsh-client-ui-workspace` 自己的 fiber 提供的，和本插件是兄弟而非父子关系），
> cordis 会一直等它，插件于是永不激活（GUI 报 "1 entry did not activate"）。
> `inject` 只写真正可达的 `['slots', 'locale']`（两者都是 dsh-base 组合在根
> 作用域注册的），需要其他服务时在调用点 opportunistic 读取并做好兜底。
>
> 踩过的坑五（v0.1.5 实测）：runner 的 `ctx` 是**fail-loud** 的——读一个没有
> 列进 `inject` 的服务会直接抛 `cannot get property "locale" without inject`，
> 而且抛在 `apply()` 里，整个插件树当场暴毙。假 ctx 如果直接返回 undefined
> 就把这类 bug 永远藏住了，所以 `.sandbox/client-harness.cjs` 的假 ctx 现在是
> 一个严格代理：只有 `inject` 声明过的服务和 cordis 内置项解析，其余一律抛错。
> 对应坏版本（删掉 `inject` 里的 `locale`）必须被 gate 拒掉。
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
