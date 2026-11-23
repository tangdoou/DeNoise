# DeNoise — AI 网页注意力主动降噪器

> **像 AirPods 主动降噪（ANC）抵消环境噪音一样，识别你当下的学习与科研任务，用 AI 实时把网页里的算法投喂噪音与杂乱标签页静默消融，并把你的专注过程沉淀为可复盘的本地热力图与小票档案。**

---

## 1. 界面预览

**一句任务，开启主动降噪。** 输入当前学习目标后，DeNoise 把「降噪波形」熨平，并锁住本次专注。

![输入任务并开启 ANC 主动降噪](./docs/media/demo-focus-start.gif)

**网页级降噪：** 相关学习内容保留并打上 `🎯 任务相关`，娱乐推荐与热搜被实时虚化。

![网页信息流降噪前后对比](./docs/media/demo-feed-denoise.gif)

**真实站点实测（B 站搜索页）：** 42 个搜索结果卡片被实时打分，学习内容保留、无关内容虚化，右下角 SNR 与拦截计数同步更新。

![在 B 站搜索页实时降噪](./docs/media/demo-bilibili-live.gif)

| DeNoise 主动降噪舱（Popup） | 专注回顾与 53 周热力图（Options） |
|:---:|:---:|
| <img src="./docs/media/popup-preview.png" alt="DeNoise 主动降噪舱弹窗" width="300" /> | <img src="./docs/media/review-preview.png" alt="DeNoise 专注回顾与 53 周热力图" width="540" /> |

<details>
<summary>展开查看：双引擎路由、7 家 AI 供应商与白名单配置页</summary>

![DeNoise 引擎与降噪设置页](./docs/media/options-preview.png)

</details>

---

## 2. v1.1.0 新增与核心能力

### 2.1 开局一键语义整理标签页（Semantic Tab Grouping）
- **自动识别并着色归组**：开启专注的那一刻，后台对当前窗口已打开的标签页自动分类，按 4 类学习语义建立 Chrome Tab Group：
  - `🎬 视频课程`（cyan）
  - `💻 代码与文档`（blue）
  - `🔍 检索与问答`（green）
  - `📄 文献与笔记`（purple）
- **无关页温和折入或安全清理**：与任务无关的娱乐/信息流标签在标准模式下自动折入灰色的 `💤 暂存休息舱`；强力模式下**只有多模态模型看过截图并确认无关**（且页面没有未保存的输入）才会关闭，关闭前快照存档进《🛡️ 防误杀黑匣子》，支持随时一键恢复全部分组与标签。拿不准的页面一律只折叠、不关闭。

### 2.2 专注回顾仪表盘与 53 周热力图
- **多时间范围统计**：提供「今天 / 近 7 天 / 近 30 天 / 近 1 年 / 全部」视图，统计总专注时长、平均环境信噪比（SNR）、拦截/召回页数，以及本周 Pro 激励打卡进度（`300 min` 目标进度条与连续专注天数）。
- **53 周专注热力图**：支持切换「时长 / 信噪比 / 次数」热度维度，点击任意日期方块即可联动筛选下方明细，并配合「近 14 天专注节奏」柱状图。
- **AI 周期复盘 & 高清小票导出**：内置 DeepSeek 周期复盘生成，每条专注记录均支持导出 2× Retina 高清《DeNoise 降噪结算小票》PNG 与 Markdown 复盘块。

### 2.3 双引擎协同 + 7 家 AI 供应商 + 4 层降噪漏斗
- **多引擎灵活接入**：默认内置 **DeepSeek V4.1-Flash (`deepseek-flash`)** 与 **Zleap `Zev-1` System-1 判别模型**，同时支持 OpenAI、Anthropic Claude、Google Gemini、自定义服务商（OpenAI / Anthropic / Gemini 格式切换 + `/models` 拉取）以及本地 Ollama 节点；未配置或断网时自动退回本地词簇语义兜底。
- **4 层行为响应漏斗**（详见 [`docs/USER_BEHAVIOR_MATRIX.md`](./docs/USER_BEHAVIOR_MATRIX.md)）：
  1. **L1 域名直通/拦截（`< 1ms`）**：抖音/微博/淘宝等直接收舱，GitHub/arXiv/LeetCode/AI 问答站直通归组。
  2. **L2 内容启发式（`< 5ms`）**：对 B 站、YouTube、知乎、搜索引擎等混合平台做标题与搜索词初筛。
  3. **L3 LLM 语义判别**：由初筛引擎对卡片和标签做相关性打分与归类。
  4. **L4 多模态看图防误杀**：后台定时缓存活跃标签缩略图，强力模式遇到标题空白或灰区（`15% ~ 60%`）页面时调用 Vision 看图复核，存疑只折叠不关闭。
- **网页内两层降噪外科手术**：
  - **硬噪音秒切**：动态注入站点去噪 CSS，清理热搜榜、侧边栏推荐与弹窗，并将视频评论区折叠为静音开关条。
  - **动态毛玻璃遮罩**：`MutationObserver` + `300ms` 防抖增量扫描推荐流，相关卡片打上 `🎯 任务相关` 徽标，无关诱惑卡片平滑施加 `blur(11px) grayscale(85%)` 遮罩，提供 `[ 👁 临时查看 ]` 与 `[ 📌 标为资料 ]`。
- **三级专注强度 + 偏航轻提示**：
  - **🌱 温和模式**：仅做网页内毛玻璃降噪，不移动任何标签页。
  - **⚖️ 标准模式**：自动整理学习分组 + 将无关页折叠进 `💤 暂存休息舱`。
  - **🔥 强力模式**：候选页先经多模态看图复核，**只有模型确认无关且页面可安全关闭**才会关闭并写入《🛡️ 防误杀黑匣子》，否则只折叠；在低相关页面停留 ≥ 2s 时触发顶部轻提示，支持「确认偏离并切回 / 仅切回 / 误判标为资料」。

---

## 3. 下载安装与本地构建

### 方式 A：直接下载预打包版本（推荐）

1. 前往本仓库的 [Releases 页面](https://github.com/tangdoou/DeNoise/releases) 下载最新 `DeNoise-v*-chrome.zip` 并解压
2. 打开 Chrome 访问 `chrome://extensions/`
3. 开启右上角 **开发者模式 (Developer mode)**
4. 点击 **加载已解压的扩展程序 (Load unpacked)**，选择解压后的目录即可使用

> 本地加载无需开发者证书，也无需上架 Chrome 应用商店。

### 方式 B：从源码构建

`dist/` 是本地构建产物，**不提交到 Git 仓库**。首次使用请先构建，再在扩展设置页填入 Key：

```bash
# 1. 安装依赖
npm install

# 2. 类型检查与生产构建（不需要任何 API Key 或环境变量）
npm run typecheck
npm run build
```

构建完成后，在 Chrome 加载本项目根目录下的 `dist/` 文件夹，打开扩展的「引擎设置」页填入你自己的 API Key（仅保存在本机 `chrome.storage.local`）。完整步骤与排障见 [`docs/BUILD_AND_INSTALL.md`](./docs/BUILD_AND_INSTALL.md)。

---

## 4. 项目结构与延伸文档

```text
src/
├── background/        # Service Worker、4 层判别引擎、标签语义编组与黑匣子治理
├── content/           # 站点适配器、两层 DOM 降噪器、Shadow DOM 悬浮胶囊 / 偏航条 / 结算小票
├── options/           # 设置中心（引擎路由 / 7 家供应商 / 白名单）与专注回顾热力图面板
├── popup/             # 主动降噪舱弹窗、今日/周/月/年账本与 ANC 波形
└── shared/            # 域名规则、AI 预设、Chrome 存储管理与 2× Retina 小票 PNG 导出器
```

- [`docs/BUILD_AND_INSTALL.md`](./docs/BUILD_AND_INSTALL.md) — 构建、环境变量与本地安装说明
- [`docs/USER_BEHAVIOR_MATRIX.md`](./docs/USER_BEHAVIOR_MATRIX.md) — 用户行为 × 产品响应 4 层矩阵
- [`docs/ZLEAP_ZEV1_INTEGRATION.md`](./docs/ZLEAP_ZEV1_INTEGRATION.md) — Zleap Zev-1 System-1 接口接入与限流配置说明

### 重新录制演示 GIF

演示 GIF 由脚本自动录制，不依赖手工操作：

```bash
# 1) 需要登录态的真实站点，先从 Edge 导出 Cookie 到 /tmp
./scripts/export-edge-cookies.py

# 2) 录制（popup / feed / bilibili，可只跑单个场景）
node scripts/record-demo.cjs feed

# 3) webm 转 GIF
./scripts/webm-to-gif.sh docs/media/raw/feed/<file>.webm docs/media/demo-feed-denoise.gif
```

录制必须使用 Microsoft Edge（`/Applications/Microsoft Edge.app`）。Playwright 自带的 Chromium 在扩展调用 `chrome.tabs.discard` 时会崩溃，这是浏览器构建的缺陷，与 DeNoise 无关。
