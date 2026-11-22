# Grill Session: denoise-mvp

Started: 2026-11-22
Last updated: 2026-11-22
Status: complete
Domain: 产品交互设计 + AI 判别功能与需求定义（聚焦产品内容与逻辑自洽，不涉及 Agent 编码提示词与赛后路演）

## Summary

DeNoise 是一款面向学习与科研场景的 Notion 极简风“AI 意图感知网页注意力降噪器”（Chrome Extension Manifest V3 纯前端 Serverless 架构，基于 React 18 + TypeScript + Tailwind CSS + Vite 构建）。它摒弃传统防沉迷软件“一刀切封禁网站”的做法，通过“Jev（System One 结构化判别模型）+ 通用大模型（OpenAI / Anthropic / Gemini BYOK）”双引擎架构，结合三级专注强度（温和/标准/强力）、ANC 消音舱波形启动仪式、无限滚动“先放后遮”无感毛玻璃降噪、以及“静默缓存截图 + DOM 语义骨架 + 多模态灰区复核 + 防误杀黑匣子”多重保护机制，在不误杀任何学习资料的前提下消除娱乐平台的算法诱惑。

## Decision Log

### DECIDED: 项目名称与 UI 视觉风格
- **Decision**: 命名为 `DeNoise`；UI 锁定单版本 **Notion 极简白底高对比度风格**。
- **Rationale**: “降噪”直击过滤算法噪音的核心价值；单版本 Notion 风格干净克制，避免多套皮肤分散精力。
- **Date**: 2026-11-22

### DECIDED: 产品载体形态（分支 2）
- **Decision**: 先做 **Chrome 浏览器插件（Manifest V3）**；若后续时间充裕再探索套壳 Chromium 的专注浏览器。
- **Rationale**: 插件开发周期短、可直接在真实高频网站（B站/知乎/CSDN等）上跑通核心降噪体验。
- **Date**: 2026-11-22

### DECIDED: 双引擎架构与去自夸 UI 原则（分支 1）
- **Decision**: 底层采用“通用 LLM（OpenAI / Anthropic / Gemini BYOK）+ Jev 判别模型”双引擎支持；**严禁在产品 UI 里写“比传统 LLM 快 X%”之类的自夸/测速看板**（速度对比仅作为路演讲解内容，产品界面保持纯粹克制）。
- **Rationale**: 产品 UI 里展示提速百分比显得像“王婆卖瓜”，破坏 Notion 极简工具质感。
- **Date**: 2026-11-22

### DECIDED: 轻量专注仪式感与结算反馈（分支 3）
- **Decision**: 选定 **方案 A（ANC 消音舱 + 降噪结算小票）**。启动时拨动极简黑白 ANC 降噪拨杆（噪点波形被熨平为直线），进行中展示极简微胶囊，结束时弹出黑白单据风《DeNoise 降噪结算小票》。
- **Rationale**: 最契合 `DeNoise` 的品牌心智与 Notion 极简高对比度风格。
- **Date**: 2026-11-22

### DECIDED: 专注强度分级与“不切页多模态防误杀”机制（分支 4）
- **Decision**:
  1. 开启前提供 3 级强度选择：**温和模式**（只做页面热搜移除与无关卡片毛玻璃虚化，不碰标签页）、**标准模式**（无关标签页归入右侧 `💤 暂存休息舱` 标签组折叠休眠）、**强力模式**（关闭无关标签页 + 存入带缩略图的“防误杀黑匣子”支持一键恢复）。
  2. 防误杀技术路径：利用“平时浏览激活页时静默 `captureVisibleTab` 缓存缩略图 + 后台未激活页注入脚本提取 DOM 语义骨架”，当初筛相关性处于模糊灰区时，自动将缓存截图与 DOM 骨架交由多模态 LLM 二次复核。
- **Rationale**: 规避了 Chrome MV3 无法直接截取后台未激活 Tab 的底层限制，同时构成“事前多模态看图复核 + 事后带截图黑匣子秒恢复”的双重防误杀闭环。
- **Date**: 2026-11-22

### RESOLVED: 赛后路演分支（分支 5）
- **Resolution**: 路演剧本属于开发完成后的事项，移出当前需求拷问范围。
- **Date**: 2026-11-22

### DECIDED: 纯前端插件架构与技术栈选型（分支 6）
- **Decision**:
  1. 采用 **100% 纯前端插件架构（Serverless Chrome Extension MV3）**，不搭建独立后端服务器；利用 `Background Service Worker` 的跨源请求特权直接调用各大 AI 接口，API Key 仅保存在本地 `chrome.storage.local`。
  2. 前端技术栈锁定 **方案 A：`React 18` + `TypeScript` + `Tailwind CSS` + `Vite`（配合 `@crxjs/vite-plugin` 或 `WXT`）+ `Lucide Icons`**，编译产物通过 Chrome `开发者模式 -> 加载已解压的扩展程序` 免证书本地安装。
- **Rationale**: 零后端运维成本、无 CORS 跨域阻碍、免证书 1 秒安装，且 React + Tailwind 最利于 AI Coding Agent 高质量还原 Notion 极简白底 UI 与波形动画。
- **Date**: 2026-11-22

### DECIDED: UI 挂载形态、无限滚动策略与多模型降级保护（分支 7）
- **Decision**:
  1. **UI 双挂载形态**：右上角 `Popup` 负责“任务输入、三级强度选择、ANC 降噪拨杆启动与跳转设置”；网页内嵌浮层采用 **`Shadow DOM` 样式隔离**，专注中在网页角落展示极简微胶囊（可随时呼出《防误杀黑匣子》），专注结束时在网页正中央弹出《DeNoise 降噪结算小票》。
  2. **无限滚动策略（选定策略 B：先放后遮 · 无感顺滑）**：B 站/知乎等动态加载的新卡片先正常显示，后台防抖批量送检 AI，判定无关后再丝滑施加毛玻璃虚化遮罩。
  3. **多模型 BYOK 与无多模态降级保护**：设置页提供 `OpenAI` / `Anthropic` / `Gemini` / `Jev` 四大配置槽位（支持自定义 `Base URL`、`API Key`、`Model Name`）；当用户所配模型不支持多模态看图（Vision）时，强力模式下的灰区标签页自动退化为“DOM 语义骨架深度文本复核 + 不确定则归入 `💤 暂存休息舱` 折叠而非直接关闭”，守住零误杀底线。
- **Rationale**: 解决了 Popup 点击外部即销毁的痛点，避免了“先遮后放”导致的正常浏览闪烁卡顿感，并补齐了纯文本 API Key 下的防误杀闭环。
- **Date**: 2026-11-22

## Open Threads

无（所有核心产品与技术分支均已封板）。

## Deferred / Open Risks (Parking Lot)

### DEFERRED: 套壳 Chromium 独立专注浏览器形态
- **Reason**: MVP 阶段优先集中精力打磨 Chrome 插件（MV3），独立浏览器壳留待插件完成后视剩余时间决定是否扩展。
- **Open questions**: 若后期封装 Electron / Chromium，如何迁移 `chrome.tabGroups` 与 `captureVisibleTab` 等扩展 API。
- **Risk if ignored**: 无近期风险；Chrome 插件形态本身即可完整承载黑客松全部核心功能与演示。
- **Date**: 2026-11-22
