# CareerMate · 比赛评审版

CareerMate 是面向大学生与职场新人的 AI 职业成长助手，包含职业画像、AI 对话、成长概览、职业路径、学习资源、模拟训练和长期记忆。

## 一键启动

请先将整个压缩包解压到可写目录，再启动。首次启动需要联网下载依赖并构建，后续启动会复用已安装的依赖和构建。

| 系统 | 启动方式 |
|---|---|
| Windows 10 / 11（x64、ARM64） | 双击 `start.bat` |
| macOS（Intel、Apple Silicon） | 双击 `start.command`；若缺少执行权限，在项目目录的终端执行 `bash start.sh` |
| Linux（x64、ARM64，常规 glibc 发行版） | 在项目目录的终端执行 `bash start.sh` |

启动脚本优先使用已安装的 Node.js 22 或 24；没有合适版本时，从 Node.js 官方站点下载带校验的便携运行环境到本目录 `.runtime/`，不需要管理员权限。Linux 需要系统已有 `bash`、`tar`、`curl` 或 `wget`、SHA256 校验工具，以及 OpenSSL。Windows 使用系统 PowerShell，macOS 使用系统终端工具。

启动完成后会打开浏览器，默认地址为 **http://localhost:3000**。服务只监听本机。请保留终端窗口，结束体验时按 **Ctrl+C** 停止服务。

首次下载需要访问 `nodejs.org`、`registry.npmjs.org`、`binaries.prisma.sh`；使用真实 AI 需要能访问包内配置的百宝箱服务。网络中断后可直接重新运行启动脚本。

## 体验账号

- 用户名：`reviewer`
- 密码：`careermate123`

首次启动自动建立独立数据库 `prisma/review.db` 和演示画像、职业计划、学习资源。也可以在登录页自行注册，体验从零建立画像的流程。后续启动会保留账号、聊天和成长记录，不会清空数据库。

建议依次体验：登录 → 成长概览 → AI 对话 → 职业路径 → 模拟训练 → 个人记忆。演示画像和计划为示例数据；新生成的 AI 内容使用实际配置的服务。岗位样本页可能没有导入数据，项目不提供实时招聘抓取。

## API 配置

本次交付包的 `.env` 已附带作者授权提供的 API 配置，评委无需填写密钥。真实 AI 需要网络及有效的服务额度。请勿公开上传这个压缩包或 `.env`。

源码仓库只保存 `.env.example` 模板；若从 Git 仓库获取源码，需要自行填写 `.env`，默认模板使用本地 mock 演示模式。不要将 API 密钥改成 `NEXT_PUBLIC_` 开头的变量。

## 常见问题

- **3000 端口被占用**：Windows 在命令提示符运行 `start.bat --port 3001`；macOS/Linux 运行 `bash start.sh --port 3001`，访问 `http://localhost:3001`。
- **浏览器没有自动打开**：手动访问终端中显示的地址。
- **Windows 提示策略或安全限制**：按照所在单位的电脑管理要求运行脚本；也可自行安装 Node.js 22/24 后，在项目目录运行 `node scripts/launch-review.mjs`。
- **macOS 无法双击脚本**：打开终端，进入解压目录后执行 `bash start.sh`。
- **下载失败**：检查上述站点连通性，重新启动；不要删除 `prisma/review.db`。
- **依赖损坏**：关闭服务后删除 `node_modules/` 与 `.careermate/review-build.json`，再启动。数据库和 API 配置不受影响。
- **AI 未响应**：检查网络、API 额度和平台服务状态；错误会在页面提示，已有本地数据保留。

可选参数：`--no-open` 禁止自动打开浏览器；`--setup-only` 只下载依赖、准备数据库和构建。

本包仅包含运行所需源码、锁定依赖清单、数据库迁移、必要静态资源及启动说明；未附带 `node_modules`、构建缓存、Git 历史、测试报告、开发文档或作者的个人数据库。`release-manifest.json` 记录源码提交与包内文件校验值。
