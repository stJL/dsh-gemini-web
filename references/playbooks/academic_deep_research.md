# 深度调研、竞品分析、学术综述与长文编队 (`academic_deep_research`)

> **适用场景**：跨领域技术/市场深度调研、竞品对比白皮书、学术文献综述、论文架构与可视化配图、万字长文深度创作。

## 团队花名册（1 Tab = 1 员工）

| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `chief_researcher` | 深度检索与信息搜集员 | `aistudio` (Playground) | `deep-research-preview-04-2026` | — | 多轮联网检索一手资料、竞品规格、引用来源与事实核查 |
| `architect_writer` | 主笔架构与逻辑撰稿人 | `aistudio` (Playground) | `gemini-4-neon` | `high` / `extra_high` | 搭建万字报告大纲、基于一手素材深度推演撰写（1M 长输出） |
| `fact_reviewer` | 独立盲审与结构校对员 | `aistudio` (Playground) | `gemini-4-neon`（或 `argon`） | `medium` / `high` | 独立开启新 Tab 交叉核对数据口径、逻辑漏洞、事实幻觉与排版 |
| `chart_formatter` | 论文图表与文档排版员 | `gemini_task` | `gemini-4-hydrogen` | — | 用沙盒 `matplotlib`/`PIL` 绘制数据图、用 `libreoffice` 转换 PDF/Word 并打包 |

## 标准并行波次与分工要点

- **Wave 1（一手调研 + 框架定稿）**：`chief_researcher` 运行 Deep Research 收集可追溯来源；同时可用 `architect_writer`（先开 `medium` 档快速对齐目录结构与问题树）。
- **Wave 2（深度长文撰稿）**：将调研结果文件（`.md` / `.pdf`）挂载给 `architect_writer`，拉到 `high` 或 `extra_high` + `1048576` 输出生成完整长文（超长篇要求分章落盘或单包导出，**严禁直接回传给本地弱模型重抄**）。
- **Wave 3（独立交叉审校 + 配图导出）**：
  - 将草稿附件发给全新 Tab `fact_reviewer` 做“零先验偏见”找茬审查（比自检自己更准）；
  - 若需专业统计图或正式排版导出（`.pdf` / `.docx`），派给 `chart_formatter` 在 Debian 12 沙盒用 **`matplotlib` + `libreoffice`** 渲染后用 **Python `zipfile`** 打包交付。
