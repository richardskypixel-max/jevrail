# Terminal demo / 终端演示

![Actual JevRail terminal recording](../assets/demo.gif)

This 30-second GIF is rendered from an **asciinema 2.4.0 recording of actual CLI execution**, made on 2026-09-26 (Asia/Shanghai). It shows `plan`, one authorized `run`, and offline `status`. The input is synthetic. One paid decision succeeded, with a reported cost of **$0.000020160**; the other two items were left pending.

Only a scripted terminal session was captured. There is no desktop, Codex sidebar, task list, chat, credential value or account metadata in the recording. Scripted screen clears, labels and reading pauses make the output legible; model results and CLI output were not fabricated. The GIF loops and shows the first 30 seconds; replaying it makes no network calls.

这是一段真实终端执行记录生成的 30 秒 GIF：合成输入，1 次付费判断，关闭重试。画面只含测试命令和输出，不含桌面、Codex 左侧边栏、聊天、密钥或账户信息。循环播放不会重新调用 API。清屏、阶段标题和阅读停顿由录制脚本安排，结果来自实际调用。

## Text recording

The complete [asciinema recording](../assets/demo.cast) is plain-text JSON Lines and can be inspected without playing the GIF. If you have asciinema installed:

```sh
asciinema play assets/demo.cast
```

The `$` and `+` characters are displayed command prompts. In the recorded run, `$JEVRAIL_KEYCHAIN_SERVICE` selects an existing Keychain item by its service name; it is **not a secret**. The CLI still reads the key directly from Keychain. For a fresh setup, follow the README and use the default `jevrail.openrouter` item. Do not copy a secret into that variable.

The recorded commands were:

```sh
./jevrail plan examples/smoke-job.json
./jevrail run examples/smoke-job.json --out runs/demo \
  --max-items 1 --max-attempts 1 --budget-usd 0.01 \
  --reserve-usd 0.002 --keychain-service "$JEVRAIL_KEYCHAIN_SERVICE"
./jevrail status runs/demo
```

`run` is billable. `plan` and `status` are offline. The local budget does not enforce a provider-side maximum charge. See [validation scope](VALIDATION.md) for the observed answers, usage and limitations.

## Inspectable assets

- `assets/demo.cast`: original terminal output, with an empty captured-environment map.
- `assets/demo.gif`: 1040 × 700 pixels, 30 seconds, SHA-256 `b0a332dda16736f1f79a50263a413216cdbc07888cf92f2adb5204fa6c80acbf`.
- The publication checker permits only this manually reviewed GIF digest. Other binary files remain blocked.

Private raw provider receipts are retained locally and are not part of the public demo. One synthetic success is not evidence of production accuracy or a reason to remove the alpha label.
