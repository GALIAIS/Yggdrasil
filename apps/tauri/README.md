# Yggdrasil Desktop Dev Workflow

当前桌面端开发统一走 Yggdrasil Desktop Runtime + Vite HMR。

## 推荐命令

```bash
pnpm dev:tauri
```

行为：

- 若 `http://127.0.0.1:5173` 已有 Vite dev server，则直接复用
- 若没有，则自动拉起 `@yggdrasil/renderer` 的开发服务器
- React 改动走 Vite 热重载
- `src-tauri` Rust 改动走桌面运行时自动重编译 + 应用重启

## 常用变体

```bash
pnpm dev:tauri:renderer
pnpm dev:tauri
```

- 第一条命令单独维持 renderer 的 HMR
- 第二条命令附着桌面运行时外壳并复用已有 5173

```bash
pnpm dev:tauri:verbose
```

- 输出更详细的桌面运行时 CLI 日志，适合排查启动问题

```bash
pnpm dev:tauri:no-watch
```

- 禁用桌面运行时 Rust 文件监听，适合只调前端界面

## 关键文件

- `apps/tauri/src-tauri/tauri.conf.json`
- `scripts/renderer-dev-tauri.mjs`
- `scripts/renderer-build-tauri.mjs`

## 当前约束

- `build.devUrl` 固定为 `http://127.0.0.1:5173`
- renderer 开发服务器必须使用 `apps/renderer/package.json` 里的固定端口配置
- `scripts/renderer-dev-tauri.mjs` 会先探测 `/@vite/client`，避免重复启动 Vite
- `bundle.icon` 当前显式指向 `apps/tauri/src-tauri/icons/icon.ico`，否则 MSI 打包会失败

## 构建与打包

```bash
pnpm build:tauri
```

- 生成 debug 的未打包构建
- 对应命令：`tauri build --debug --no-bundle`

```bash
pnpm build:tauri:release
```

- 生成 release 的未打包构建
- 对应命令：`tauri build --no-bundle`

```bash
pnpm package:tauri
```

- 生成 Windows NSIS 安装包
- 对应命令：`tauri build --bundles nsis --ci --no-sign`

```bash
pnpm package:tauri:msi
```

- 生成 Windows MSI 安装包
- 对应命令：`tauri build --bundles msi --ci --no-sign`

## 开发期状态持久化

- Tauri 主窗口的位置和尺寸会写入：

```text
apps/tauri/.tauri-dev/window-state.json
```

- 开发期启动日志会追加写入：

```text
apps/tauri/.tauri-dev/tauri-dev.log
```
