# DeNoise —— AI 意图感知的网页注意力主动降噪器
## 产品需求与技术架构规格说明书 (PRD & Technical Specification v1.0)

---

## 1. 产品概述与核心设计原则

### 1.1 一句话定位
**`DeNoise`** 是一款面向大学生学习与科研场景的 **Chrome 浏览器插件（Manifest V3）**。它像一副“AI 视觉主动降噪耳机”，不采用传统防沉迷软件“一刀切封禁网站”的做法，而是根据用户当前输入的学习/工作任务目标，利用 **System-1 结构化判别模型（Jev）+ 通用大模型（OpenAI / Anthropic / Gemini BYOK）** 对网页内的推荐流、热搜弹窗以及浏览器标签页进行实时语义级降噪与防误杀治理。

### 1.2 核心设计红线（铁律）
1. **Notion 极简白底高对比度视觉规范**：
   - 全产品仅维护一套高质量 Notion 极简风格 UI。
   - **色彩体系**：纯白/暖白底色（`#FFFFFF` / `#F7F7F5`）、炭黑主文本（`#191919`）、次要灰文本（`#787774`）、1px 极细边框（`#E9E9E7`）、黑白高对比主按钮（`#191919` 背景配 `#FFFFFF` 文字），仅在状态指示点使用克制的低饱和语义色（心流绿 `#0F7B6C`、警告琥珀 `#D9730D`、拦截红 `#E03E3E`）。
   - **排版与动效**：块级（Block-based）干净留白、圆角 `6px ~ 8px`、微妙的 `1px` 边框替代厚重阴影，动画克制顺滑。
2. **严禁 UI 内置“速度自夸/跑分看板”**：
   - 产品界面内**绝对禁止**出现“Jev 比传统 LLM 快 X%”、“提速百分比对比条”等任何王婆卖瓜式的营销文案或测速跑分组件。所有界面文案只服务于用户的专注与降噪体验。
3. **零误杀底线（Anti-False-Positive Guarantee）**：
   - 宁可把存疑页面归入休息舱折叠，也绝不盲目永久销毁用户的学习资料；所有被强力模式关闭的标签页必须进驻带截图预览的《防误杀黑匣子》，支持一键原位复活。

---

## 2. 技术栈与系统架构（100% 纯前端 Serverless 插件）

### 2.1 技术选型
- **运行载体**：Chromium 浏览器扩展程序（Chrome / Edge / Arc，遵循 **Manifest V3** 规范）。
- **安装方式**：本地免证书加载（`chrome://extensions/` $\rightarrow$ 开启“开发者模式” $\rightarrow$ “加载已解压的扩展程序”选中构建产物 `dist/` 目录）。
- **后端需求**：**0 独立后端服务器（Serverless Extension）**。所有大模型与 Jev API 请求均由插件后台进程 `Background Service Worker` 利用 `<all_urls>` 跨域特权直接发起，用户 API Key 仅存储在本地浏览器隔离存储 `chrome.storage.local` 中。
- **前端工程栈**：
  - 框架与语言：**`React 18` + `TypeScript`**
  - 样式与图标：**`Tailwind CSS` + `Lucide Icons` (`lucide-react`)**
  - 构建工具：**`Vite`**（搭配 `@crxjs/vite-plugin` 或 `WXT` 框架）

### 2.2 工程目录结构规范
```text
denoise-extension/
├── manifest.json                 # MV3 扩展清单文件
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── src/
    ├── shared/
    │   ├── types.ts              # 全局 TypeScript 数据模型与消息协议定义
    │   ├── storage.ts            # chrome.storage.local / session 读写封装
    │   └── constants.ts          # 默认配置、高频站点选择器规则库
    ├── background/
    │   ├── index.ts              # Service Worker 主入口：状态机、倒计时、消息总线
    │   ├── judgeEngine.ts        # AI 判别引擎抽象层（Jev + OpenAI/Claude/Gemini 路由）
    │   ├── tabGovernor.ts        # 标签页治理：分组休眠、强力关闭、黑匣子快照管理
    │   └── screenshotCache.ts    # 激活标签页静默缩略图快照缓存服务
    ├── content/
    │   ├── index.ts              # Content Script 入口：DOM 骨架提取、降噪挂载
    │   ├── domPurifier.ts        # 静态硬噪音移除 + MutationObserver 动态卡片毛玻璃引擎
    │   ├── siteAdapters.ts       # B站/知乎/CSDN/小红书/搜索引擎/通用网页 DOM 适配器
    │   └── shadowHud/            # 挂载在 Shadow DOM 内的页面浮层组件
    │       ├── ShadowRoot.tsx    # Shadow DOM 容器隔离封装
    │       ├── FloatingPill.tsx  # 角落常驻降噪微胶囊
    │       ├── BlackboxDrawer.tsx# 防误杀黑匣子（带截图预览与一键恢复）
    │       ├── DriftNudgeBar.tsx # 顶部偏航温和提醒条
    │       └── ReceiptModal.tsx  # 专注结束《DeNoise 降噪结算小票》居中弹窗
    ├── popup/
    │   ├── index.html
    │   └── PopupApp.tsx          # 右上角 Popup：任务输入、三级强度、ANC 波形拨杆启动器
    └── options/
        ├── index.html
        └── OptionsApp.tsx        # 设置页：四大 AI 引擎 BYOK 配置、自定义白名单管理
```

### 2.3 `manifest.json` 关键权限声明
```json
{
  "manifest_version": 3,
  "name": "DeNoise",
  "version": "1.0.0",
  "description": "AI 意图感知的网页注意力主动降噪器",
  "permissions": [
    "tabs",
    "tabGroups",
    "storage",
    "scripting",
    "activeTab",
    "alarms"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

---

## 3. 双引擎 AI 判别架构与多模型 BYOK 规范

### 3.1 四大 AI 供应商配置槽位（BYOK）
在插件设置页（`OptionsApp`）中提供 4 个独立的模型配置选项卡，用户可自由配置并勾选当前启用的 **“高速初筛引擎”** 与 **“多模态复核引擎”**：

| 供应商槽位 | 默认 Base URL | 核心参数 | 用途定位与特性 |
| :--- | :--- | :--- | :--- |
| **1. TypeSafe Jev** | 官方/自定义 Endpoint | `apiKey`, `baseUrl`, `model` | **System-1 结构化判别引擎**。通过 `Score`（0~10 连续相关性评分）与 `Noul`（0~1 布尔概率）原语，单次前向传播并行对批量网页卡片和标签页打分。 |
| **2. OpenAI 兼容** | `https://api.openai.com/v1` | `apiKey`, `baseUrl`, `model`, `supportsVision` (布尔开关) | 支持官方 GPT-4o / GPT-4o-mini 及 DeepSeek、硅基流动等任意 OpenAI 兼容接口。 |
| **3. Anthropic** | `https://api.anthropic.com/v1` | `apiKey`, `baseUrl`, `model`, `supportsVision` (布尔开关) | 支持 Claude 3.5 Sonnet / Haiku 等模型。 |
| **4. Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | `apiKey`, `baseUrl`, `model`, `supportsVision` (布尔开关) | 支持 Gemini 2.5 Flash / Pro，天然具备极速响应与多模态看图能力。 |

> **一键连通性测试**：每个配置槽位底部提供 `[ 测试连接 ]` 按钮，发送一条最小化 Ping 请求并在界面显示 `🟢 连接正常` 或具体报错信息。

### 3.2 统一判别器契约（`JudgeEngine`）
无论底层调用 Jev 还是通用生成式 LLM，`background/judgeEngine.ts` 对外暴露统一的批量判别接口：

- **输入 (`JudgeBatchRequest`)**：
  ```typescript
  export interface JudgeItemInput {
    id: string;
    type: 'feed_card' | 'tab_initial' | 'tab_vision_review';
    title: string;
    url?: string;
    snippet?: string;           // DOM 语义骨架（H1-H3、正文前300字、媒体Alt）
    screenshotBase64?: string;  // 仅在 tab_vision_review 阶段传入缓存的网页截图
  }

  export interface JudgeBatchRequest {
    taskIntent: string;         // 用户当前输入的专注任务，如“复习线性代数特征值与特征向量”
    intensity: 'gentle' | 'standard' | 'strict';
    items: JudgeItemInput[];
  }
  ```
- **输出 (`JudgeBatchResponse`)**：
  ```typescript
  export interface JudgeItemResult {
    id: string;
    relevanceScore: number;     // 0 ~ 100 归一化相关性分数
    confidence: number;         // 0 ~ 1 置信度
    decision: 'keep' | 'blur' | 'park' | 'close' | 'need_vision_review';
    reasonTag: string;          // 极简原因标签，如 "核心网课" / "代码文档" / "娱乐推荐"
  }
  ```

### 3.3 引擎路由与“无多模态”优雅降级规则
1. **初筛路由（网页推荐卡片 & 标签页初筛）**：
   - 若用户已配置并启用 `Jev` 槽位：将同一批次的 `items` 组装为 Jev 的 `state`（包含 `taskIntent`）与 `questions` 数组（每条 item 对应一个 `Score` 0~10 量表问题），单次请求并行获取全部得分并映射为 `0 ~ 100`。
   - 若用户未配置 `Jev`：自动使用用户设定的默认通用 LLM（OpenAI / Anthropic / Gemini），通过 System Prompt 要求模型严格返回 JSON 数组 `[{ "id": "...", "score": 85, "reason": "..." }]`。
2. **灰区多模态复核路由与降级保护**：
   - 在 **🔥 强力模式** 下，当某个标签页初筛得分处于 **`15 <= relevanceScore < 60`（模糊灰区）** 时，触发二次复核 (`tab_vision_review`)。
   - **情况 A（当前模型 `supportsVision === true` 且存在该 Tab 的缓存截图）**：将 **`缓存截图 Base64 + DOM 语义骨架 + 当前任务`** 一并发送给多模态 LLM，重点识别画面中是否包含教学板书、数学公式、代码编辑器、学术论文或技术文档。
   - **情况 B（当前模型不支持 Vision 或该后台 Tab 尚无缓存截图）**：**自动降级为深度文本骨架复核**（发送完整的 `{Title, URL, Meta, H1~H3, 正文前500字}` 进行精细推理）；若复核后得分仍 `< 60` 且置信度不足，**强制将该标签页动作降级为 `park`（归入 `💤 暂存休息舱` 折叠）而非 `close`（直接关闭）**，确保 0 误杀。

---

## 4. 核心功能模块详细规格

### 模块一：ANC 消音舱启动面板（右上角 `Popup`）

点击浏览器工具栏 `DeNoise` 图标弹出 Notion 极简风面板（宽度 `360px`）：

1. **任务意图输入区**：
   - 顶部标题栏：`DeNoise` 极简 Logo + 右侧 `[ ⚙️ 设置 ]` 按钮。
   - 任务输入框（Notion Callout 样式）：占位符 `当前正在攻克什么任务？（例如：写计算机网络实验报告）`。
   - 快捷辅助按钮：`[ ✨ 从当前活动网页自动提炼任务 ]`（点击后读取当前激活 Tab 的标题与 H1，调用 LLM 提炼为一句 15 字以内的专注目标填入输入框）。
2. **专注时长选择**：
   - 胶囊单选按钮组：`25 分钟` / `45 分钟` / `60 分钟` / `自定义`。
3. **三级专注强度选择器（Segmented Control 卡片）**：
   - **🌱 温和模式（Gentle）**：*“只净化网页，不碰标签页”* —— 移除网页热搜/广告，对无关推荐流施加毛玻璃虚化，保留所有已开标签页。
   - **⚖️ 标准模式（Standard · 默认推荐）**：*“无关标签页自动折叠进休息舱”* —— 网页降噪 + 将无关标签页自动移入浏览器最右侧的 `💤 暂存休息舱` 标签组并折叠休眠，专注结束后一键恢复。
   - **🔥 强力模式（Strict）**：*“净空关闭无关页 + 多模态防误杀保护”* —— 网页降噪 + 灰区标签页经多模态看图复核后，确认无关的标签页直接关闭并收进《防误杀黑匣子》（随时可看截图一键复活）。
4. **5 秒“ANC 主动降噪拨杆”启动仪式（方案 A）**：
   - 面板底部设有一枚高对比度黑白 **“ANC 降噪拨杆（Toggle Switch）”** 与一条动态 Canvas/SVG 声波噪点曲线。
   - **未开启时**：波形呈现杂乱高频跳动的灰黑噪点，旁边显示 `环境算法噪度：高`。
   - **拨动开启瞬间**：
     1. 杂乱跳动的噪点波形在 `1.5 秒` 内经过阻尼衰减动画被**平滑“熨平”为一条绝对静止的水平直线**；
     2. 状态文字同步跳变为 `🟢 0dB · 主动降噪已锁定`，随即启动后台标签页治理与当前网页实时净化。

---

### 模块二：不切页多模态防误杀与标签页治理流水线

#### 4.2.1 平时浏览时的“静默快照缓存”（解决 MV3 后台无法截图限制）
- **触发机制**：`background/screenshotCache.ts` 常驻监听 `chrome.tabs.onActivated` 与 `chrome.tabs.onUpdated`。
- **执行逻辑**：当用户切换到任意普通网页（非 `chrome://` 系统页）并正常停留满 `1.5 秒` 时，后台静默调用 `chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 40 })`，将返回的 DataURL 缩放至宽度 `480px` 以内的轻量缩略图，以 `tabId` 为键存入 `chrome.storage.session`（内存中最多保留最近 30 个标签页的快照，关闭标签页时若未进入黑匣子则自动清理）。
- **价值**：全过程 **100% 不切换用户当前页面、不闪烁、不调用 `chrome.debugger`（无顶部黄条警告）**，在开启专注时即可直接调取已浏览标签页的真实视觉快照。

#### 4.2.2 后台全量标签页“DOM 语义骨架”提取
- 当用户拨动 ANC 拨杆开启“标准模式”或“强力模式”时，针对当前窗口所有非固定（non-pinned）标签页，通过 `chrome.scripting.executeScript` 注入轻量提取函数，毫秒级返回结构化骨架：
  ```typescript
  export interface TabDomSkeleton {
    tabId: number;
    url: string;
    title: string;
    metaDescription: string;
    headings: string[];         // 页面前 8 个 H1 / H2 / H3 文本
    mainTextSnippet: string;    // 优先取 <article> / <main> 或高密度文本块前 300 字
    mediaAlts: string[];        // 首屏主要图片 alt 或视频播放器标题
  }
  ```

#### 4.2.3 标签页三级裁决与《🛡️ 防误杀黑匣子》
1. **初筛与多模态复核流水线**：
   - 将所有打开标签页的 `TabDomSkeleton` 批量送入 `JudgeEngine` 初筛：
     - **`relevanceScore >= 60`（任务相关）**：保留在工作区，不移动、不关闭。
     - **`relevanceScore < 15`（明确无关）**：直接按所选模式执行收拢或关闭。
     - **`15 <= relevanceScore < 60`（疑难灰区）**：
       - 若为 **标准模式**：直接归入 `💤 暂存休息舱` 折叠（不关闭，无损安全）。
       - 若为 **强力模式**：自动提取该 `tabId` 的**静默缓存截图 + DOM 语义骨架**送入多模态 LLM 二次复核（提示词重点指令：*“请结合网页截图与文本骨架判断：该页面是否包含与任务【{taskIntent}】相关的网课视频画面、公式推导、代码片段、技术问答或学术资料？若是，必须判定为 keep；仅当确认为无关娱乐/购物/八卦时才判定为 close。”*）。
2. **标准模式动作（`💤 暂存休息舱`）**：
   - 调用 `chrome.tabs.group({ tabIds })` 将所有判定为 `park` 的标签页合并到窗口最右侧，调用 `chrome.tabGroups.update(groupId, { title: '💤 暂存休息舱', color: 'grey', collapsed: true })` 折叠收起，并对组内后台标签页调用 `chrome.tabs.discard(tabId)` 释放内存。
3. **强力模式动作与《🛡️ 防误杀黑匣子（Blackbox Recovery Bin）》**：
   - 在调用 `chrome.tabs.remove(tabId)` 关闭被判定为 `close` 的标签页**之前**，必须先将该标签页的完整快照写入 `sessionState.blackboxTabs`：
     ```typescript
     export interface BlackboxTabItem {
       id: string;
       originalTabId: number;
       title: string;
       url: string;
       favicon?: string;
       screenshotBase64?: string; // 静默缓存的真实网页截图
       reasonTag: string;         // AI 给出的拦截原因，如“娱乐综艺 / 与计网实验无关”
       closedAt: number;
     }
     ```
   - **一键后悔药复活**：用户在《防误杀黑匣子》抽屉中可看到每条被关标签页的**缩略截图、标题、网址与拦截原因**。点击 `[ ↩ 恢复并标为资料 ]`，插件立即调用 `chrome.tabs.create({ url, active: true })` 重新打开该页，并将其 URL/域名加入本场专注的 **`whitelistUrls`（免死金牌白名单）**，本场不再拦截。

---

### 模块三：网页结构外科手术与“先放后遮”无限滚动毛玻璃引擎

Content Script (`src/content/domPurifier.ts`) 在所有网页中根据当前专注状态执行两层净化：

#### 4.3.1 第一层：高频站点硬噪音秒切（CSS 规则隐藏）
专注开启后，立即向页面注入对应站点的去噪样式表（专注结束后立即移除恢复原貌）：
- **B 站 (`bilibili.com`)**：
  - 首页：隐藏顶部轮播巨幕广告、分区娱乐排行榜；
  - 视频播放页（看网课核心场景）：自动隐藏右侧“大家围观的直播/游戏推广”、底部活动横幅；对评论区默认折叠为 `[ 💬 评论区已由 DeNoise 静音（点击临时展开） ]`（防止看网课时刷热评走神）。
- **知乎 (`zhihu.com`)**：
  - 隐藏右侧“知乎热榜 / 盐选故事推广栏”、右下角悬浮推广卡片，正文区自动居中拓宽为清爽阅读排版。
- **CSDN (`csdn.net`)**：
  - 隐藏两侧悬浮广告、底部推荐弹窗、左侧博主推销栏，自动展开代码块全文。
- **小红书 (`xiaohongshu.com`) / 百度 (`baidu.com`) / 必应 (`bing.com`)**：
  - 隐藏百度热搜榜、小红书发现页无关娱乐分类导航栏。

#### 4.3.2 第二层：动态推荐流“先放后遮 · 无感顺滑”（策略 B）
针对 B 站首页/播放页右侧相关视频卡片、知乎信息流卡片、小红书瀑布流卡片、搜索引擎结果条目以及通用网页的推荐列表：

1. **先放后遮（Optimistic Rendering）**：
   - 页面初次加载或用户向下无限滚动刷出新卡片时，**新卡片先保持原样正常显示**（不预先全屏打码，避免页面闪烁或卡顿感）。
2. **MutationObserver + 300ms 防抖批量送检**：
   - `MutationObserver` 监听新增的卡片 DOM 节点（为已扫描节点打上 `data-denoise-status="pending"` 属性防止重复送检）。
   - 每 `300ms` 将当前收集到的未判别卡片（提取其 `id`、`标题文本`、`UP主/作者名或标签`、每批最多 20 条）打包发往 `Background` 的 `JudgeEngine`。
   - 内置**本场标题语义缓存（`Map<normalizedTitle, JudgeItemResult>`）**：相同标题卡片直接命中本地缓存，0 重复 Token 消耗。
3. **毛玻璃虚化遮罩与微标渲染**：
   - **相关内容（`relevanceScore >= 50`）**：
     - 保持清晰显示，将属性更新为 `data-denoise-status="kept"`；
     - 在卡片右上角渲染一枚极简 Notion 风格黑白微标：`🎯 任务相关`。
   - **无关算法诱惑（`relevanceScore < 50`）**：
     - 将属性更新为 `data-denoise-status="blurred"`；
     - 对卡片内部内容容器平滑施加 CSS 过渡（`transition: filter 0.35s ease, opacity 0.35s ease`）：`filter: blur(10px) grayscale(85%); opacity: 0.38; pointer-events: none;`；
     - 在卡片表面居中叠加一层极简白底细框胶囊遮罩层：
       - 主文案：`🛡️ 已过滤无关推荐`（附小字原因标签，如 `游戏娱乐`）
       - 两个轻量交互按钮：
         - `[ 👁 临时查看 ]`：点击后当前卡片解除模糊，允许用户正常点击观看；
         - `[ 📌 标为资料 ]`：点击后解除模糊并将该卡片关键词纳入本场正面上下文。

---

### 模块四：Shadow DOM 网页内嵌浮层与《DeNoise 降噪结算小票》

为了确保在 B 站、知乎、CSDN 等任何复杂网站上 UI 绝不走样，所有网页内嵌组件统一挂载在页面底部的 `#denoise-shadow-host` 节点的 **Closed/Open Shadow DOM** 中，并在 Shadow Root 内部独立注入 Tailwind 样式。

#### 4.4.1 角落常驻降噪微胶囊（`FloatingPill.tsx`）
- **位置与外观**：固定在视口右下角（`bottom: 20px; right: 20px; z-index: 2147483647`），支持鼠标拖拽吸附；采用 Notion 白底 `#FFFFFF`、`1px solid #191919` 高对比极简边框与微妙阴影。
- **折叠态展示内容**：
  - `🟢 23:45`（倒计时） `|` `信噪比 94%` `|` `已滤 18 条`
  - 若强力模式下有被关闭的标签页，右侧显示醒目角标按钮：`[ 🛡️ 黑匣子 (2) ]`。
- **展开态快捷操作（点击微胶囊展开小型 Notion 菜单块）**：
  - `[ 📌 标记当前网页为本任务资料 ]`（一键豁免当前页所有内容与标签页）
  - `[ 🛡️ 打开防误杀黑匣子 (N) ]`（滑出黑匣子截图恢复抽屉）
  - `[ ⏸ 暂停降噪 / ⏹ 提前结束并出小票 ]`

#### 4.4.2 偏航温和召回条（`DriftNudgeBar.tsx`）
- **触发条件**：在专注期间，当用户主动切换到或新打开一个页面，经 `JudgeEngine` 判定整页相关性 `< 20%`（且不在白名单内）：
  - **温和 / 标准模式**：当用户在该无关页面持续停留超过 `20 秒` 时，从网页顶部丝滑滑出一枚 Notion Callout 风格的横幅：
    `📡 检测到当前页面偏离任务【{taskIntent}】 · 建议保持心流频段`
    右侧附带两个按钮：`[ ↩ 一键切回刚才的学习页 ]` | `[ 📌 这是学习资料，不再提醒 ]`。
  - **强力模式**：对新打开且经复核确认为纯娱乐（`< 15%`）的页面，直接弹出居中极简拦截卡（提供 `[ ↩ 返回学习页 ]` 与 `[ 📌 误判，这是我的学习资料（立即放行） ]`）。

#### 4.4.3 专注结束凭证：《DeNoise 降噪结算小票》（`ReceiptModal.tsx`）
当倒计时正常结束，或用户点击“完成本次专注”时，在当前激活网页正中央弹出 **Notion 极简黑白单据风（Receipt Aesthetics）的《DeNoise 降噪结算小票》**：

```text
┌──────────────────────────────────────────────┐
│                  D e N o i s e               │
│           ACTIVE NOISE CANCELLATION          │
│              专注降噪结算小票 #01             │
│ -------------------------------------------- │
│ 任务目标   复习线性代数特征值与特征向量      │
│ 专注模式   🔥 强力降噪模式                   │
│ 专注时长   25 分钟 (2026-11-22 15:00-15:25)  │
│ -------------------------------------------- │
│ 降噪明细                               数量  │
│ · 虚化过滤无关推荐流卡片               42 条 │
│ · 移除热搜榜与干扰弹窗                  6 处 │
│ · 休眠/黑匣子接管无关标签页             5 个 │
│ · 多模态复核保护学习资料页              2 个 │
│ · 偏航温和召回                          1 次 │
│ -------------------------------------------- │
│ 平均环境信噪比 (SNR)                   96.4% │
│ 心流纯净度评级                         [ S ] │
│ -------------------------------------------- │
│  [ ↩ 一键恢复全部休眠/黑匣子标签页 (5) ]     │
│  [ 📋 复制 Markdown 复盘块 ]   [ 关闭小票 ]  │
└──────────────────────────────────────────────┘
```

- **核心收尾交互**：
  1. **`[ ↩ 一键恢复全部休眠/黑匣子标签页 ]`**：点击后自动展开 `💤 暂存休息舱` 标签组并取消分组，同时将《防误杀黑匣子》中暂存的标签页全部重新打开，完美消除用户“用完专注工具找不到之前网页”的后顾之忧。
  2. **`[ 📋 复制 Markdown 复盘块 ]`**：一键生成标准 Notion Markdown Callout 格式的专注记录，可直接粘贴进用户自己的 Notion 每日笔记中。

---

## 5. 全局数据状态与消息协议规范（供 Coding Agent 编码对齐）

### 5.1 本地存储数据结构 (`src/shared/types.ts`)
```typescript
export type ProviderId = 'jev' | 'openai' | 'anthropic' | 'gemini';
export type FocusIntensity = 'gentle' | 'standard' | 'strict';

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
}

export interface AppSettings {
  providers: Record<ProviderId, ProviderConfig>;
  primaryFastProvider: ProviderId;   // 默认初筛引擎（优先 jev，未配则选通用 LLM）
  visionReviewProvider: ProviderId;  // 多模态复核引擎（优先支持 Vision 的 openai/gemini/anthropic）
  globalWhitelistDomains: string[];  // 全局白名单域名，如 ['github.com', 'arxiv.org']
}

export interface FocusSessionState {
  isActive: boolean;
  taskIntent: string;
  intensity: FocusIntensity;
  startTime: number;
  durationMinutes: number;
  endTime: number;
  lastActiveLearningTabId?: number;
  parkedGroupId?: number;
  sessionWhitelistUrls: string[];    // 用户点击“📌 标为资料”豁免的 URL 列表
  blackboxTabs: BlackboxTabItem[];   // 强力模式下被关闭的标签页快照列表
  stats: {
    blurredCardsCount: number;
    removedNoiseWidgetsCount: number;
    parkedOrClosedTabsCount: number;
    visionProtectedTabsCount: number;
    driftNudgesCount: number;
    totalScannedItems: number;
    relevantKeptItems: number;
  };
}
```

### 5.2 `Content Script <-> Background` 消息通信协议
```typescript
export type ExtensionMessage =
  | { type: 'START_FOCUS_SESSION'; payload: { taskIntent: string; durationMinutes: number; intensity: FocusIntensity } }
  | { type: 'STOP_FOCUS_SESSION'; payload: { showReceipt: boolean } }
  | { type: 'GET_SESSION_STATE' }
  | { type: 'JUDGE_FEED_CARDS_BATCH'; payload: { items: { id: string; title: string; snippet?: string }[] } }
  | { type: 'REPORT_NOISE_WIDGET_REMOVED'; payload: { count: number } }
  | { type: 'WHITELIST_CURRENT_URL'; payload: { url: string } }
  | { type: 'RESTORE_BLACKBOX_TAB'; payload: { blackboxItemId: string } }
  | { type: 'RESTORE_ALL_TABS' }
  | { type: 'EXTRACT_TASK_FROM_ACTIVE_TAB' };
```

---

## 6. 开发与验收里程碑（建议 AI Coding Agent 执行顺序）

1. **Milestone 1：工程脚手架与 Notion 风设置页 / Popup 启动器**
   - 初始化 `Vite + React 18 + TypeScript + Tailwind CSS` MV3 插件工程；
   - 实现 `OptionsApp` 四大 AI 引擎 BYOK 配置与连通性测试；
   - 实现 `PopupApp` 任务输入、三级强度选择、以及 **ANC 降噪拨杆 + 噪点波形熨平动画**。
2. **Milestone 2：双引擎判别层 (`JudgeEngine`) 与无 API 时的智能降级**
   - 实现 `TypeSafe Jev`（`Score` / `Noul`）请求适配器与 `OpenAI / Anthropic / Gemini` 结构化 JSON / 多模态 Vision 适配器；
   - 内置本场结果缓存与 `300ms` 批量防抖队列。
3. **Milestone 3：静默截图缓存、标签页三级治理与《防误杀黑匣子》**
   - 实现激活页停留 1.5s 静默 `captureVisibleTab` 缩略图缓存；
   - 实现全量后台 Tab 的 DOM 语义骨架提取；
   - 跑通“初筛 $\rightarrow$ 灰区多模态看图复核（或纯文本降级折叠）$\rightarrow$ `💤 暂存休息舱` 分组休眠 / 强力关闭进《防误杀黑匣子》$\rightarrow$ 看截图一键原位恢复”全闭环。
4. **Milestone 4：网页硬噪音清除、“先放后遮”毛玻璃引擎与 Shadow DOM 结算小票**
   - 完成 B 站、知乎、CSDN、小红书、百度/必应与通用网页的 DOM 适配器；
   - 实现无限滚动下的“先放后遮”平滑毛玻璃遮罩（含 `[临时查看]` 与 `[📌 标为资料]`）；
   - 实现 Shadow DOM 隔离的角落常驻微胶囊、偏航温和提醒条，以及黑白单据风 **《DeNoise 降噪结算小票》**。
