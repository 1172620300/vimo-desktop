# Vimo Desktop 自动更新接入记录

状态：本地代码及测试完成；Windows x64 NSIS 打包验证通过。已创建空的公开仓库 https://github.com/1172620300/vimo-desktop，并配置本地更新源。用户要求先不要上传第一版：没有上传源码、安装包，也没有创建 Release。

## 技术栈与方案
Electron 44.4.0；原生主进程 / preload + HTML/JS，画布为 React + esbuild。使用 electron-builder 26.15.3、electron-updater 6.8.9、GitHub provider、NSIS x64。没有打包调度服务器、H3 Worker、模型或 ComfyUI。

## 文件清单
修改：package.json、package-lock.json、desktop.cjs、preload.cjs、index.html、.gitignore、canvas-app/store.test.cjs。画布 bundle.js / bundle.css 经现有构建脚本重新生成。
新增：updater.cjs、updater-ui.js、updater.css、updater.test.cjs、electron-builder.cjs、release.config.json、scripts/release.cjs、.github/workflows/release.yml、RELEASING.md。
旧画布测试仍断言已经废弃的“只支持文生视频”错误；已修正为当前无桌面连接时的错误提示，没有修改画布业务逻辑。

## 更新源与凭据
release.config.json 已配置 owner=1172620300、repo=vimo-desktop；发布脚本会拒绝未配置的构建。electron-builder.cjs 使用 GitHub provider。推荐公开的 Releases 仓库以支持匿名下载。
本地发布只读取环境变量 GH_TOKEN；Actions 使用 secrets.GITHUB_TOKEN（contents: write）。若发布到另一个仓库，需将 workflow 的 GH_TOKEN 改为有目标仓库 contents:write 权限的 Actions Secret。客户端不包含 Token。
仓库已创建且 owner/repo 已配置；遵循用户当前限制，先不上传或发布。

## 版本与发布
package.json 是版本来源；应用页面经 app.getVersion() 显示版本，安装包由同一版本生成。
在源码目录运行：

    npm version 0.1.1 --no-git-tag-version
    npm test
    npm run build:release

产物位于源码目录 dist/：Vimo-Setup-0.1.1.exe、latest.yml、Vimo-Setup-0.1.1.exe.blockmap。三个文件由同一次构建生成，不要手改 latest.yml 校验值。
需要正式上传时设置 GH_TOKEN，再执行 npm run release。该命令清理 dist、编译画布、打包并发布 GitHub Release；当前不要运行该上传命令。
GitHub Actions 在推送 v0.1.1 等 Tag 或手动 workflow_dispatch 时执行。Tag 必须匹配 package.json。必须先将源码和工作流放到构建仓库才能运行，空仓库无法直接运行 Actions。
Release Notes 可在发布时填写 GitHub Release 的正文；客户端从 updater 返回的 releaseNotes 获取，以纯文本显示，避免执行远程 HTML。

## 客户端流程
正式 Windows 包：主界面加载后延迟 5 秒检查 → 无更新安静结束 → 有更新显示版本与说明 → 用户点击立即更新才后台下载 → 展示进度、大小及速度 → 下载成功并通过 updater 校验后允许立即重启安装 → 自动启动新版。
稍后重启不会在普通退出时自动安装；用户必须选择立即重启并更新。下载可以取消和重试。开发模式 npm run dev 禁用正式更新。
设置 → 关于 Vimo 提供当前版本、自动检查状态、检查更新和安装按钮。
更新 IPC 仅接受主窗口主 frame 的本地来源；不开放任意 URL 或任意文件安装接口。网页的现有网络隔离不变，updater 使用自身独立网络 session。

## 数据及日志
继续使用 %APPDATA%/scene-studio-ui 用户目录，保持原 API Key、账号加密存储、服务器配置、IndexedDB 和 generated-videos 的位置不变。NSIS 不删除应用数据。实际跨版本保留效果仍需真实升级验收。
日志位于该目录 updater.log，超过 1 MB 轮换；不记录 Token、请求头、Release 内容或原始网络错误。
updater.cjs 的 evaluatePolicy(current, policy) 预留 minimum_client_version / minimum_version、latest_version、force_update 字段。当前只提供评估接口，尚未接入服务器强制更新 UI。

## 已验证与未验证
11 项自动测试全部通过，包括开发环境禁用、用户确认下载、完成后才安装、失败重试、取消、IPC 来源限制、最低版本及既有画布/视频客户端测试。画布构建与 JavaScript 语法检查通过。
已运行 npm run build:release，生成 dist/Vimo-Setup-0.1.0.exe、latest.yml 和 blockmap；核验版本、文件大小、SHA512 校验值及安装包内 GitHub provider 配置均通过。这些文件仅保存在本地，没有上传。
没有完成 0.1.0 → 0.1.1 真实 GitHub 升级。没有声称已验证安装/卸载、更新后登录状态/API Key/项目数据保留、真实调度服务连接或实际视频任务提交。测试使用模拟客户端，不代表线上业务验收。
正式发布前还需要代码签名证书配置；目前未配置签名证书，不能声称安装包具有可信发布者签名。

## 后续真实验收
获得用户发布授权后：配置仓库 → 构建并安装 0.1.0 → 保存测试配置和画布、登录测试账号 → 修改版本为 0.1.1 并构建发布同批次三个文件 → 旧版检查/下载/重启安装 → 验证新版显示 0.1.1、原数据存在、服务器连接和视频任务正常。使用测试账号，不把生产 API Key 或用户文件上传到 GitHub。



## 视频 API 入口和路由恢复
设置页面已恢复“视频 API”，可选择 Vimo 账号服务，或自定义的 H3 兼容 API / ComfyUI。旧 video-api.json 有地址时恢复为自定义服务，无配置时默认账号服务。切换为账号服务保留旧自定义加密密钥；空白密钥表示保留，不再提交显示掩码。
video-router.cjs 为每次操作固定所选地址和凭据；verify / submit / status / download / export 使用同一路由。自定义请求不附带 Vimo 登录 Token，也不依赖账号服务的 /me 请求成功。应用登录界面仍保留。
API 服务切换后旧任务查询使用新选中的服务，所以请先完成旧服务任务，或查询旧任务前切回对应服务。ComfyUI 原有任务映射仍只在当前客户端会话内有效。
将 ComfyUI H3 工作流 JSON 放入 workflows/ 并纳入安装包，修复原先依赖源码目录外 outputs 文件的问题；不包含模型、ComfyUI 服务或 Worker。
16 项自动测试通过；隔离 Electron 界面验证通过（配置显示、密钥不回填、保存、账号来源切换和测试连接）。没有使用真实 API Key 发起付费生成任务，没有上传新安装包。
