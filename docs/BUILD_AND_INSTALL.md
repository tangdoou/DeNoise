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

## 3. API Key 怎么填（不要写进代码或环境变量）

**API Key 不再通过 `.env.local` 注入。** 旧版本（v1.0.0 / v1.1.0）把 Key 编译进了扩展包并随 Release 发布，导致密钥泄露——这两把 Key 已作废。

现在的做法：

1. 直接执行 `npm run build`，不需要任何环境变量。
2. 在 Chrome 中加载 `dist/`。
3. 点击扩展图标 → 「引擎设置」，在对应供应商卡片里填入你自己的 Key，点「测试连接」确认可用，再「保存配置」。

Key 只保存在本机 `chrome.storage.local`，请求由扩展后台直连供应商，不经过任何第三方。

> 构建脚本内置了密钥扫描：如果检测到任何 `VITE_*` 变量，或产物里出现形似 API Key 的字符串（包括拆成小段再 `join` 的混淆写法），构建会**直接失败**。

## 4. 构建扩展

```bash
npm run typecheck
npm run build
```

构建成功后，产物位于项目根目录的 `dist/`。

> `dist/` 是本地构建产物，不提交到 Git。每次修改源码后都需要重新执行 `npm run build`。

## 5. 在 Chrome 中加载

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 打开右上角的 **开发者模式 (Developer mode)**。
3. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4. 选择项目根目录下的 `dist/` 文件夹。
5. 在扩展列表中确认 DeNoise 已启用。

## 6. 更新与排查

- 修改源码后重新执行 `npm run build`，然后在 `chrome://extensions/` 中点击 DeNoise 卡片上的刷新按钮。
- 如果构建提示 `Build aborted: these VITE_* variables would be inlined`，说明环境里存在 `VITE_*` 变量，请清除后重试（Key 应在扩展设置页填写）。
- 如果构建提示 `secret-like strings detected in dist/`，说明源码里有形似密钥的字符串，**不要发布这个构建**，排查后重新构建。
- 如果扩展没有加载，请确认选择的是 `dist/` 目录本身，而不是其中的某个文件。

## 安全提示

不要把真实 Key 写进任何会进入 Git 或构建产物的文件（`.env.local`、源码、`dist/`、Release zip）。Key 只应通过扩展设置页填写。
