# 数据分析、报表清洗与办公自动化编队 (`data_office_automation`)

> **适用场景**：CSV/Excel 大表清洗统计、财务/运营/业务分析报告、PDF/Word/PPT 批量转换与自动化汇总、图表可视化制作。

## 团队花名册（1 Tab = 1 员工）

| role | 岗位名称 | 站点渠道 | 推荐模型 | 思考等级 | 核心职责与交付物 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lead_analyst` | 首席数据分析师 | `aistudio` (Playground) | `gemini-4-neon` | `medium` / `high` | 设计分析维度、统一指标计算口径、解读最终商业洞察 |
| `data_engineer` | 云端数据工程与制图员 | `gemini_task` | `gemini-4-hydrogen`（复杂清洗用 `4 Neon`） | — | 接收原始数据附件，在 Debian 12 沙盒运行 Python 清洗、作图、生成办公文档 |
| `researcher` | 行业对标调研员 | `aistudio` (Playground) | `deep-research-preview-04-2026` | — | 按需检索行业基准值、公开财报或竞品参考口径（独立开启，不阻塞清洗） |

## 标准并行波次与沙盒工具链提示

- **Wave 1（指标设计 + 对标 并行）**：
  - `lead_analyst`：读取字段样本，使用 `medium` 思考等级快速拟定清洗规则、统计指标清单与所需图表列表；
  - `researcher`（如需要外部参考）：同步输出行业对标基线。
- **Wave 2（Task 沙盒重加工）**：
  - 向 `data_engineer` 上传原始 `.csv` / `.xlsx` / `.json` / `.pdf` 附件。
  - **沙盒优势（预装无需安装）**：`pandas 2.2.3`、`numpy 2.1.3`、`matplotlib 3.10.1`、`PIL 11.1.0`、`libreoffice 7.4.7.2`（可命令行转 PDF/DOCX/XLSX）。
  - **防坑契约**：未开启 `gemini-spark` 远程联网时需声明禁用 `pip install`（已开启联网可装包但严禁传入含敏感凭据/隐私的机密表）；缺 `pandoc`/`zip` CLI，中文字体/图表需处理好兼容，最终结果（清洗后 Excel/CSV、高清 PNG 图表、LibreOffice 导出的 PDF 简报）**统一用 Python `zipfile` 打包成一个 `.zip` 交付**。
- **Wave 3（洞察成稿）**：将 `data_engineer` 算出的真实汇总 JSON（而非几万行原始数据）贴给 `lead_analyst`，生成最终面向管理层/用户的决策摘要与报告。
