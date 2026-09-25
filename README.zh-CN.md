<p align="center"><img src="assets/banner.svg" alt="JevRail — 让每一次 AI 判断，都有据可查。" width="100%"></p>

<p align="center"><strong>让每一次 AI 判断，都有据可查。</strong><br>调用过程看得见，费用查得到，失败不盲目重试。</p>

<p align="center"><a href="README.md">English</a> · 简体中文<br>macOS 优先 · TypeScript + Node.js · 无第三方运行时依赖 · MIT · Alpha</p>

## 这是什么

**Jev** 是 TypeSafe AI 的「System One」判断模型，面向高频、低延迟的结构化判断：是/否、分类、评分，返回概率或置信度等结构化信息。它可以用于内容初筛、文本分类、数据标注质检，以及根据已有文字观察对素材评分。[模型说明](https://docs.typesafe.ai/models)

截至 2026-09-26，OpenRouter 列出的 Jev 1.13 价格为 **输入 $0.042 / 百万 token，输出免费**。价格以[模型页面](https://openrouter.ai/typesafe/jev-1.13)为准，实际延迟随请求和网络变化；JevRail 没有做大规模性能基准。

**JevRail** 是通过 OpenRouter 调用 Jev 的轻量命令行工具。批量任务跑起来以后，还需要回答这些问题：

- 这条记录被判为「差」，模型实际收到了什么、返回了什么？
- 任务跑到一半断了，哪些已经完成，哪些费用还需要核对？
- 这批任务花了多少钱，记录能对应到每一次调用吗？

JevRail 把请求、供应商原始返回、模型版本、费用和哈希保存在本地记录里，让脚本和编码 Agent 能说明一次调用到底发生了什么。

你使用自己的 OpenRouter key。程序从 macOS 钥匙串读取密钥，直接请求 OpenRouter；没有项目方中转服务器、后台服务、账号系统或遥测。

这是独立社区项目，目前只支持 Jev 的结构化判断，不是通用聊天框架，也不是 OpenRouter 或 TypeSafe 官方产品。

## 为什么做它

使用一个 AI 工具前，我们希望能看清四件事：密钥发给谁、模型收到了什么、实际返回了什么、失败重试会不会再次计费。

JevRail 把这些问题落实为可读源码和本地记录。我们分享的是一种可检查的使用方式，不把“开源”“无依赖”当作绝对安全的保证，也不指控其他工具存在恶意行为。

**适合谁：**需要批量执行判断任务，并能复查每次判定和费用的人。典型场景是内容初筛、数据标注质检、基于素材观察记录的批量评分。素材需要先转成文字或结构化观察；JevRail 不读取图片、音频或视频。当前每个任务最多 500 条，更大的任务需分批准备，批量生产效果仍需自行验收。

如果只是偶尔调用几次 Jev，[官方 SDK](https://openrouter.ai/docs/guides/community/typesafe-sdk)已经是简洁的起点。需要保留回执、核查费用和处理任务中断时，可以选择 JevRail。

## 不用密钥，先体验

下载或克隆仓库后，进入目录。需要 Node.js 22.18 以上的 22.x 版本，或 Node.js 24 以上。当前真实调用的密钥读取只支持 macOS。

```sh
chmod +x ./jevrail
./jevrail --version
./jevrail plan examples/smoke-job.json
```

这会在本地检查三条合成案例，不读密钥、不联网、不计费。校验通过后，会输出 `OFFLINE_PLAN`、案例数量、模型、每条请求的字节数和任务哈希，方便正式运行前核对。`plan` 不调用模型，也不估算 token 或费用。正常执行不需要安装 npm 依赖或编译；开发检查工具另行安装。

![JevRail 30 秒终端演示：离线预检、单条真实调用、查看本地记录](assets/demo.gif)

上图为真实的 `plan → run --max-items 1 → status` 终端录制：合成输入，1 次付费判断，关闭重试，费用 **$0.000020160**。其中 `plan` 和 `status` 离线运行；`run` 需要密钥并计费。只录制测试终端。[录制说明与文本记录](docs/DEMO.md)

## 小规模真实调用

先运行 `./jevrail keychain-info` 查看应使用的钥匙串条目名和账户名；该命令不读取密钥。在 macOS“钥匙串访问”中新建普通密码条目：名称 `jevrail.openrouter`，账户使用显示值，密码填写你自己的 OpenRouter key。不要把 key 放进命令行、聊天记录或任务文件。

使用设置了消费限额的普通 API key，先跑一条：

```sh
./jevrail key-status
./jevrail run examples/smoke-job.json --out runs/first-try \
  --max-items 1 --max-attempts 1 --budget-usd 0.01 --reserve-usd 0.002

# 相同目录、输入和策略：复用第一条缓存，只补跑剩余两条。
./jevrail run examples/smoke-job.json --out runs/first-try \
  --max-attempts 1 --budget-usd 0.01 --reserve-usd 0.002

./jevrail status runs/first-try
```

`run` 会产生真实费用。`$0.01` 是本地调度预算，不能强制供应商把单次收费限制在预留金额内；服务端实际费用超出预留时，程序会记录并停止追加请求。平台 key 限额仍需单独设置。

已有钥匙串条目可通过 `--keychain-service 名称 --keychain-account 账户` 选择。这里填写的是条目标识，不能填写密钥；程序不会自动搜索其他凭据或修改钥匙串。

## 给编码 Agent 使用

JevRail 的设计目标之一，是让 Codex、Claude Code 等编码 Agent 通过命令行执行可复查的批量判断任务。不需要另装 MCP 或 Skill，让 Agent 阅读本仓库和[调用约定](docs/CODEX.md)即可开始。这里只依赖命令行接口，不代表所有 Agent 都经过集成测试。

- **费用有记录：**按 `--budget-usd` 预留调度预算；预算不足时不再发出新请求，实际费用超出单次预留时停止追加任务。它不是供应商硬性收费上限，仍需设置平台 Key 限额。
- **行为可复查：**保存请求原文、收到的供应商原始返回和费用记录；Agent 的解释与原始结果分开。
- **失败不盲目重发：**超时或结果不确定时停止，交由人工核查；仅 HTTP 429 最多重试一次，`--max-attempts 1` 可关闭重试。

建议先让 Agent 用 `plan` 做离线预检，展示输入、任务数量与计划预算，经授权后再执行 `run`。这些约束作用于本次 CLI 调用；JevRail 不是限制 Agent 其他操作的沙箱。

## 核心能力

| 能力 | 实际行为 |
|---|---|
| 类型检查 | 验证 noul、choice、score、题目 ID、范围、模型、供应商和用量 |
| 明确的网络边界 | 固定 OpenRouter HTTPS 地址，禁止跳转，启动器清除继承的代理和 Node 注入配置 |
| 费用预留 | 先写账本后发请求，并发受限，未知费用保留预留金额 |
| 断点续跑 | 检查已完成原始响应哈希，缓存命中不新增判断调用 |
| 保守的重试 | 超时或结果不确定时停止；仅 429 最多再试一次，可完全关闭重试 |
| 保留证据 | 原始响应与解析结果分开保存，不把本地解释冒充 Jev 输出 |
| 输入拦截 | 拦截明显凭据、联系信息、链接和常见私人路径；业务文本需显式开启 |

运行记录存放在指定输出目录，目录权限 700，文件权限 600。Git 默认排除这些记录。输入筛查不能代替脱敏；哈希也不是签名，更不能证明 AI 判断正确。

请求内容仍会到达 OpenRouter 和模型供应商。更多限制见 [SECURITY.md](SECURITY.md)。

## 开发验证

```sh
chmod +x ./jevrail
npm ci --ignore-scripts
npm run check
```

测试使用明确标注的合成传输，不需要密钥、不计费。当前为 Alpha：macOS 和 Linux 的云端检查均通过；公开版于 2026-09-26 完成了 1 条英文合成案例的真实调用，其余 2 条未运行。本次沿用已有钥匙串条目，不代表新建凭据流程、大批量性能或真实素材评分已验收。详见 [验证范围](docs/VALIDATION.md)。

[命令与任务格式](docs/USAGE.md) · [架构](docs/ARCHITECTURE.md) · [参与贡献](CONTRIBUTING.md) · [路线图](docs/ROADMAP.md)

代码采用 [MIT 许可证](LICENSE)。OpenRouter / TypeSafe 的服务条款与模型权限不包含在代码许可证中。接口参考：[OpenRouter Jev 文档](https://openrouter.ai/docs/guides/community/jev-tutorial)。
