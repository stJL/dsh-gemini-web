# 全栈 Web / SaaS / 工具应用研发编队 (`web_fullstack_app`)

> **适用场景**：现代 Web 应用、SaaS 管理后台、前后端分离工具站、桌面包装 Web 工程、API 服务与全栈原型开发。

## 团队花名册（1 Tab = 1 员工）

| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `director` | 项目总监 / 架构师 | `aistudio` (Playground) | `gemini-4-neon` | `high` | 拆分前后端模块、锁定 API/数据结构契约、合并审查 |
| `frontend_builder` | 前端外包工程组 | `build` (`/apps`) 或 `gemini_task` | `MAX` + `Gemini 4 Neon` | — | 整站前端页面骨架搭建与 `.zip` 导出（**须带防加料锁**） |
| `backend_coder` | 后端与核心研发 | `gemini_task` | `gemini-4-neon` | — | 后端 API/SQLite/核心逻辑编写，沙盒内用 `python3`/`node` 跑通单测 |
| `ui_artist` | UI 视觉素材组 | `flow` | `Nano Banana 2.1` | — | 生成 Logo、Banner、图标、空状态插画（`x1` 省点数） |
| `qa_tester` | 无头浏览器 QA | `gemini_task` | `gemini-4-neon`（或 `hydrogen`） | — | 利用沙盒预装 `chromium 156` + Python/Node 跑端到端冒烟与边界校验 |

## 标准并行波次（Wave Execution）

- **Wave 0（架构定界）**：总监（`director`）锁定目录树、API 接口字段（JSON Schema）、端口与静态资源路径，产出所有下游工单。
- **Wave 1（多 Tab 并行生产）**：
  - `frontend_builder`：按契约生成前端工程（若用 `/apps` Build，Prompt **必须内嵌禁止擅自新增页面/假后端/多余依赖的负面清单**）；
  - `backend_coder`：在 Debian 12 沙盒写好服务端与单元测试（**零外网依赖**，仅用 Python 标准库或 Node 内置模块），跑通测试并用 **Python `zipfile`** 打包交付；
  - `ui_artist`：在 Flow（`x1` 0 点数）生成 Logo 与插画（`1K`/`2K`）。
- **Wave 2（集成与素材裁切）**：本地调度 `harvest` 解包前后端；若需要切图/转 WebP/缩图，把原图交给 `qa_tester`（或 `backend_coder`）的 `Task` Tab 用预装 `PIL` 批处理打包，本地完成静态资源对接。
- **Wave 3（沙盒自测 & 本地验收）**：将集成后工程打包发给 `qa_tester` 启动本地服务并用沙盒内 `chromium` 跑冒烟验收；本地运行真实启动脚本，报错直接贴回原员工 Tab 返工。
