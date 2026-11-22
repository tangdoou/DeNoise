# DeNoise 构建与本地安装

本文档适用于从源码本地构建并在 Chrome 中加载 DeNoise。全程不需要开发者证书，也不需要上架 Chrome 应用商店。

## 1. 准备环境

- Node.js 18 或更高版本
- npm
- Chrome 桌面版

## 2. 安装依赖

在项目根目录执行：

```bash
npm install
```

## 3. 配置本地 API Key

复制环境变量模板：

```bash
cp .env.example .env.local
```

打开 `.env.local`，把占位符替换为真实 Key：

```dotenv
VITE_DENOISE_DEEPSEEK_KEY=sk-your-deepseek-api-key-here
```

说明：

- `.env.local` 已被 `.gitignore` 忽略，**不要提交到 Git**。
- 真实 Key 只保存在本机 `.env.local`，构建时由 Vite 注入。
- `.env.example` 只包含占位符，可以安全提交。
- 如需使用 Zleap Zev-1，可同时填写 `ZLEAP_API_KEY`。

## 4. 构建扩展

```bash
npm run typecheck
npm run build
```

构建成功后，产物位于项目根目录的 `dist/`。

> `dist/` 是本地构建产物，不提交到 Git。每次修改源码或 `.env.local` 后都需要重新执行 `npm run build`。

## 5. 在 Chrome 中加载

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 打开右上角的 **开发者模式 (Developer mode)**。
3. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4. 选择项目根目录下的 `dist/` 文件夹。
5. 在扩展列表中确认 DeNoise 已启用。

## 6. 更新与排查

- 修改源码后重新执行 `npm run build`，然后在 `chrome://extensions/` 中点击 DeNoise 卡片上的刷新按钮。
- 修改 `.env.local` 后也必须重新构建，Key 才会写入新的 `dist/`。
- 如果构建提示 `VITE_DENOISE_DEEPSEEK_KEY is not set`，请确认 `.env.local` 位于项目根目录且变量名拼写正确。
- 如果扩展没有加载，请确认选择的是 `dist/` 目录本身，而不是其中的某个文件。

## 安全提示

公开仓库中只应出现 `.env.example` 的占位符。不要提交 `.env.local`、真实 Key 或包含真实 Key 的构建产物。
