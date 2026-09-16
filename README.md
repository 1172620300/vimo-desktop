# 映序 Studio — 独立 UI 原型

参考 ToonFlow 的居中登录卡片、窄侧栏、工作台布局与浅色蓝色主题，重新编写界面。不是 ToonFlow 官方产品，未使用其品牌标识及业务代码。

登录页仍是预览入口，不验证或保存账号密码。画布已移植 imaideo 网站的真实 React Flow 组件，支持新建多个画布、图片与音频导入、视频/图片/音频节点编辑、节点拖动、连线、框选、删除、节点搜索、排列、缩放、小地图与本地自动保存。任务页仍是空状态展示。

生成服务尚未接入：模型列表为空，不能实际生成图片、视频或音频。没有复制网站账号、密钥、项目数据或云端任务。桌面运行时继续禁止 HTTP/HTTPS 请求。

本地画布和导入素材存储在 Electron 用户数据目录下的 IndexedDB（数据库名 scene-studio-canvases）。清理应用数据会删除这些内容；当前没有备份导出功能。所有本机预览用户共用该本地工作区。暂未提供撤销重做。

## 画布来源与构建

源代码来自用户服务器 `/opt/imaideo/migration/h3-integration-20260915/src/components/CanvasWorkspace.tsx`，以及其提示词素材引用和视频尾帧工具。桌面版本保留原始交互组件，替换 Next.js 路由、服务器 API 和模型选择依赖，添加本地 IndexedDB 适配层，主题统一为蓝色、浅色圆角。网站服务未作修改。

构建：`node canvas-app/build.cjs`。存储验证：`node --test canvas-app/store.test.cjs`。`canvas-app/src` 为当前维护源文件；prepare/integrate/lighten 脚本记录首次移植过程，不应重复运行覆盖后续修改。

双击桌面「映序 Studio（界面原型）」启动。也可直接用浏览器打开 index.html 查看界面。

源码独立于此前 drama-studio 项目。当前桌面快捷方式复用本机已有 Electron 运行环境；不是独立安装包。

设计参考：https://github.com/HBAI-Ltd/Toonflow-web
