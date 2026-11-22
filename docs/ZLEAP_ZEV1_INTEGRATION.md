# DeNoise × Zleap Zev-1 对接说明

更新时间：2026-11-22

## 结论

DeNoise 的初筛引擎已从占位实现切换为 Zleap `Zev-1` 决策模型。每个网页条目会发送一次同步请求，同时返回两个结构化问题：

1. `disposition`：`choice`，输出 `keep`、`review`、`discard`。
2. `relevance`：`score`，按 4 级相关度标准输出加权分值。

当前接口限时免费，但仍会返回 token 用量；账户需保留正余额。

## API 契约

- Endpoint：`POST https://api.zleap.com/v1/systemone`
- Headers：`Authorization: Bearer <API_KEY>`、`Content-Type: application/json`
- Model：`Zev-1`

请求使用页面标题、URL 和摘要组成 `state`；`questions` 同时声明 `disposition` 与 `relevance`。返回时通过 `answers.disposition.choice`、`answers.disposition.confidence`、`answers.relevance.score`、`answers.relevance.confidence`、`answers.relevance.probabilities` 读取结果。

## 映射规则

1. `relevance.score` 先按 0–3 归一化，再换算成 0–100 的 `relevanceScore`。
2. `disposition.choice` 映射为中文原因标签：
   - `keep` → `任务相关`
   - `review` → `灰区待复核`
   - `discard` → `无关内容`
3. `confidence` 由处置置信度和相关度置信度加权合成。
4. 最终 `decision` 仍由 DeNoise 现有强度策略根据 `relevanceScore` 决定：
   - 推荐流：`>= 50` 保留，否则毛玻璃降噪。
   - 标签页初筛：`>= 60` 保留；`15–59` 进入灰区复核；低于 15 关闭。
   - 灰区复核：`>= 50` 保留；`30–49` 暂存；低于 30 关闭。

这样 Zev-1 提供结构化决策，DeNoise 保留防误杀策略与多模态降级保护。

## 配置方式

打开扩展设置页，在 `Zleap Zev-1 (System-1 判别模型)` 槽位中：

1. 开启槽位。
2. 填入 Zleap API Key。
3. Base URL 保持 `https://api.zleap.com/v1/systemone`。
4. Model Name 保持 `Zev-1`。
5. 将「默认高速初筛引擎」设为 `Zleap Zev-1`。
6. 保存后点击连通性测试。

连通性测试会发送固定学习任务样本，成功后显示 `keep`/`review`/`discard` 与加权 `score`。

## 安全与降级

- API Key 只保存在本机 `chrome.storage.local`，请求由 MV3 Service Worker 直连 Zleap。
- 不要把 API Key 提交到 Git、截图或写入文档。
- Zev-1 不支持截图；它只做文本结构化初筛。
- 强力模式灰区截图仍路由到多模态复核引擎。
- Zev-1 失败时自动回退到本地语义判别，保证插件可继续运行。
- 旧存储中的 `https://api.typesafe.ai/v1/jev` 或 `jev-1` 会在读取设置时迁移到新的 Zleap 默认值。

## 当前工程参数

截至 2026-11-22：

1. Zev-1 批量初筛并发数：`8`。
2. `429` 自动重试次数：最多 `3` 次。
3. 重试延迟：优先读取响应中的 `Retry-After`；缺失时按 `750ms → 1.5s` 指数退避，单次最长 `15s`。
4. Zleap 免费额度为 `100 RPM`；充值后为 `500 RPM`。并发 8 仍预留了明显余量。
5. 代码位置：`src/background/judgeEngine.ts` 中的 `requestZev` 与 `requestJev`。

## 已验证

以下命令已通过：

```bash
npm run typecheck
npm run build
```

线上服务状态页显示 `Zev-1` 运行正常；使用有效密钥实测可返回 `answers` 与 `usage`。

## 给后续会话的交接

项目路径：`/Users/Apple/Documents/ChatGPT/11.22 黑客松`。

后续会话应先读本文件，再查看 `src/background/judgeEngine.ts`。不要在聊天或文档中粘贴真实 API Key；密钥应只在扩展设置页填写。
