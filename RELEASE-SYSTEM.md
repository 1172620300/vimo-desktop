# Desktop 独立发布

仓库 `1172620300/vimo-desktop`、appId `com.vimo.desktop`、版本和安装目录均与 Worker 独立。下一版本 `0.1.1`。

启动检查更新，用户确认后下载；electron-updater 的 SHA512 校验完成后再验证固定仓库、固定版本 `SHA256SUMS.txt` 中的 SHA256。校验失败不能安装；内容不匹配的下载文件会删除，允许重新下载。更新说明使用 textContent 展示，详情按钮只打开本产品 GitHub Release。

`npm test` 验证更新流程；`npm run build:release` 构建 NSIS、blockmap、latest.yml 和 SHA256SUMS。Tag 采用本仓库独立的 `vX.Y.Z`，与 package 和 lockfile 一致。CI 先构建，再创建草稿、上传完整产物，最后公开。不会覆盖既有 Release；分支 workflow_dispatch 只生成构建 artifact。

已发布的 0.1.0 仍使用原有 SHA512 验证，首次更新到 0.1.1 后才具备新增 SHA256 校验能力。不要替换 0.1.0 的既有资产。

Windows 代码签名尚未配置。实际安装与跨版本升级仍需在独立 Windows 测试环境验收。
