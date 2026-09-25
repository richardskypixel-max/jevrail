<p align="center"><img src="assets/banner.svg" alt="JevRail — 让每一次 AI 判断，都有据可查。" width="100%"></p>

<p align="center"><strong>让每一次 AI 判断，都有据可查。</strong><br>调用过程看得见，费用查得到，失败不盲目重试。</p>

<p align="center"><a href="README.md">English</a> · 简体中文<br>macOS 优先 · TypeScript + Node.js · 无第三方运行时依赖 · MIT · Alpha</p>

**JevRail** 是通过 OpenRouter 调用 Jev 的轻量命令行工具。它把请求、供应商原始返回、模型版本、费用和哈希保存在一起，让脚本和编码 Agent 能说明一次调用到底发生了什么。

你使用自己的 OpenRouter key。程序从 macOS 钥匙串读取密钥，直接请求 OpenRouter；没有项目方中转服务器、后台服务、账号系统或遥测。

这是独立社区项目，目前只支持 Jev 的结构化判断，不是通用聊天框架，也不是 OpenRouter 或 TypeSafe 官方产品。

## 为什么做它

使用一个 AI 工具前，我们希望能看清四件事：密钥发给谁、模型收到了什么、实际返回了什么、失败重试会不会再次计费。

JevRail 把这些问题落实为可读源码和本地记录。我们分享的是一种可检查的使用方式，不把“开源”“无依赖”当作绝对安全的保证，也不指控其他工具存在恶意行为。

## 不用密钥，先体验

下载或克隆仓库后，进入目录。需要 Node.js 22.18 以上的 22.x 版本，或 Node.js 24 以上。当前真实调用的密钥读取只支持 macOS。

```sh
chmod +x ./jevrail
./jevrail --version
./jevrail plan examples/smoke-job.json
```

这会在本地检查三条合成案例，不读密钥、不联网、不计费。正常执行不需要安装 npm 依赖或编译；开发检查工具另行安装。

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

## 给 Codex 使用

让 Codex 阅读本仓库和 [调用约定](docs/CODEX.md)，即可通过命令行操作。不需要另装 MCP 或 Skill。先准备和预检任务，再在用户授权的内容及费用范围内执行。

## 开发验证

```sh
chmod +x ./jevrail
npm ci --ignore-scripts
npm run check
```

测试使用明确标注的合成传输，不需要密钥、不计费。当前为 Alpha：早期本机版本通过了三条真实合成案例及缓存复跑；公开版增加了通用配置和英文案例，未额外做真实调用。详见 [验证范围](docs/VALIDATION.md)。

[命令与任务格式](docs/USAGE.md) · [架构](docs/ARCHITECTURE.md) · [参与贡献](CONTRIBUTING.md) · [路线图](docs/ROADMAP.md)

代码采用 [MIT 许可证](LICENSE)。OpenRouter / TypeSafe 的服务条款与模型权限不包含在代码许可证中。接口参考：[OpenRouter Jev 文档](https://openrouter.ai/docs/guides/community/jev-tutorial)。
