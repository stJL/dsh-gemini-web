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
> **四大核心调度铁律**：
> 1. **零本地开销与严禁代劳**：严禁本地直接作答，严禁调用 `subagent`（消耗付费 API），严禁使用本地 `read`/`cat`/`bash` 预读取 `@文件`——直接将文件路径交由外部网页端 1M 上下文解析！
> 2. **一律先问后用（第 1 步）**：输出格式化确认卡后**立即停止回复**，等待用户确认（回复 `1` 或 `确认`）。
> 3. **多轮任务循环重置（抗历史惯性）**：确认流程是针对【每一个独立任务】的循环，绝非整场对话只出现一次！即使同一聊天室上一轮刚刚完成任务，只要用户再次发起新指令，必须立即重置回第 1 步重新输出确认卡，绝不可跳过确认直接作答！
> 4. **参数化动态读取**：100% 尊重用户指定的具体模型与渠道，按三场景规则精准装配，严禁胡乱拼接！

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
| **执行模型** | `{model_mode_label}`<br>`{model_ladder_or_target}` | **按渠道分流判定**：<br>1. **Gemini 官网渠道**：一律显示 `Auto (Gemini 官网原生模型)`，绝不输出 AI Studio 降级阶梯！严禁输出「gemini.google.com -> gemini-4-hydrogen」等荒谬拼接！<br>2. **Google Flow 渠道**：显示 `Nano Banana 2.1 (2K 生图)` 或 `Omni 1.2 / Veo (视频)`<br>3. **Google AI Studio 渠道**：<br>   • 用户显式指定模型 ➔ `（用户指定）\n  - {用户指定模型别名}`<br>   • 严格模式 ➔ `（严格模式）\n  - {当前锁定的单模型}`<br>   • 智能/降级模式 ➔ `（智能/降级模式）\n  - {当前系统生效之阶梯序列}`（实时原样读取系统配置） |
| **推演配置** | `{thinking_config}` | • **Gemini 官网** ➔ `联网搜索增强 (Task 联网模式)` 或 `官网标准对话模式`（⚠️ 官网无 Thinking 等级概念，严禁输出 Thinking 设为 high！）<br>• **Google Flow** ➔ `生成数量设为 x1，分辨率设为 2K`<br>• **Google AI Studio** ➔ `Thinking 设为 {系统当前配置等级}`（如 `high` / `medium`） |

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
