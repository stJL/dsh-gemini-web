---
name: gemini-web-agent
description: >-
  【必须最优先加载・一律先问后用】当用户提到 AI Studio, Google Flow, Gemini 网页端, 指定 Hydrogen/Argon/Neon/Flash/Flash-Lite/Nano Banana/Omni/Lyria, 或输入 `/gemini-web-agent` 时必须调用！
  1. 先问后用：第 1 步在聊天中输出【🌐 Gemini Web Agent】确认卡并立即停止回复。严禁擅自发包，严禁调用本地工具 (read/cat/bash) 或 subagent！
  2. 确认后发包：第 2 步待用户明确确认（回复「1」或「确认」）后调用 `gemini_web_agent`。
  3. 参数化动态组装：严格尊重用户指定模型；降级阶梯必须实时动态镜像当前系统配置。
---

# Gemini Web Agent（KISS 精简版）

> [!IMPORTANT]
> **三大核心调度铁律**：
> 1. **零本地开销与严禁代劳**：严禁本地直接作答，严禁调用 `subagent`（消耗付费 API），严禁使用本地 `read`/`cat`/`bash` 预读取 `@文件`——直接将文件路径交由外部网页端 1M 上下文解析！
> 2. **一律先问后用（第 1 步）**：输出格式化确认卡后**立即停止回复**，等待用户确认（回复 `1` 或 `确认`）。
> 3. **参数化动态读取**：100% 尊重用户指定的具体模型，严禁擅自升级为 Hydrogen；在智能模式下，**必须实时动态读取系统注入的阶梯序列**（`【当前系统生效之确认卡配置】`），绝对严禁硬编码！

---

## 一、 参数化统一确认卡模板

在第 1 步中，根据任务属性与当前系统配置，动态组装并输出如下确认卡，随后**立即停止回复**：

```markdown
### 🌐 Gemini Web Agent
检测到您欲调用外部 Google 网页端{action_description}，相关配置如下：

- 🎯 执行渠道：{execution_channel}
- 📁 挂载文件：[{mounted_files}]
- 🚪 入口模式：{entry_mode}
- 🧠 执行模型：{model_mode_label}
  - {model_ladder_or_target}
- ⚙️ 推演配置：{thinking_config}
- 🔄 话题隔离：new_chat: true（预设开启全新独立对话）

👉 请确认是否发包执行？
- 回复 「确认」 或 「1」：立即调用外部 Chrome 自动化发包执行
- 回复 调整参数（如「改用 Flash Lite」、「改用 Argon」等）：按您的要求调整后直接发包
- 回复 「取消」：中止外部调度，改由本地作答
```

---

## 二、 参数动态解析规则矩阵

各字段相互独立、正交组合，**严禁从旧文档或历史对话中抄写写死的硬编码字符串**：

| 字段 | 占位变量 | 动态解析规则与取值逻辑 |
| :--- | :--- | :--- |
| **任务描述** | `{action_description}` | • 涉及本地文件/代码 ➔ `分析本地文件`<br>• 涉及生图/视频 ➔ `实现多媒体生成`<br>• 常规推演/编码 ➔ `实现任务` 或 `实现并发任务` |
| **执行渠道** | `{execution_channel}` | • 生图/视频 ➔ `Google Flow（flow）`<br>• 用户指定官网或联网调研 ➔ `gemini.google.com（可选择：Google AI Studio / Gemini Web）`<br>• 默认（代码、长文本、本地文件分析） ➔ `Google AI Studio（可选择：Google AI Studio / Gemini Web）` |
| **挂载文件** | `- 📁 挂载文件：[...]` | • **条件项**：仅当用户传入了本地文件路径、论文 PDF、日志、代码文件或输入了 `@文件` 时才动态渲染此行，内容为具体文件路径列表，如 `[src/index.ts, src/config.ts]`。<br>• **若无文件需求，则完全不输出此行**，绝不输出空的中括号 `[]`！ |
| **入口模式** | `{entry_mode}` | • 若用户指定官网任务模式/画布 ➔ `task`<br>• 默认 ➔ `chat` |
| **执行模型** | `{model_mode_label}`<br>`{model_ladder_or_target}` | **三条优先级判定规则**：<br>1. **用户显式指定模型**：如「用 Flash Lite」➔ 显示 `（用户指定）\n  - {用户指定模型别名}`<br>2. **严格模式**：显示 `（严格模式）\n  - {当前锁定的单模型}`<br>3. **智能/定时模式（默认）**：<br>   `（智能/定时模式）\n  - {当前系统生效之阶梯序列}`<br>   🚨 **死命令铁律**：**绝对禁止抄袭对话历史中上一轮旧助手的卡片**！必须实时逐字原样镜像顶部【当前系统生效之确认卡配置】。若用户把 `gemini.google.com` 置顶，必须输出其在首位！ |
| **推演配置** | `{thinking_config}` | • Flow 画布生图 ➔ `将生成数量设为 x1，分辨率设为 2K`<br>• 默认 ➔ `Thinking 设为 {系统当前配置等级}`（如 `high` / `medium`） |

---

## 三、 第 2 步授权发包与工具参数

当用户确认（回复 `1` 或 `确认`）后，正式调用 `gemini_web_agent`：

| 工具参数 | 说明与传参规范 |
| :--- | :--- |
| `task` | 用户的完整需求提示词与任务描述 |
| `files` | 待上传的本地文件路径数组（仅在涉及挂载文件时传入，如 `["path/to/file.ext"]`） |
| `model` | 用户指定的具体模型别名；智能降级模式下留空 |
| `site` | 目标渠道：`aistudio`（默认）、`flow` 或 `gemini` |
| `entry` | `chat`（默认）或 `task` |
| `thinking_level` | `high`（默认）、`medium` 或 `low` |
| `thinking_policy` | `adaptive`（默认）、`strict` 或 `custom` |
| `new_chat` | `true`（默认开启独立新会话） |

**交付规范**：调用完成后，在最终回复中呈现降级通知、可点击的 `file://` 落地文件超链接以及核心架构说明，切忌全量重抄超长代码。
