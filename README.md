# dsh-gemini-web

> **DeepSeek Harness (DSH) 原生調度外掛**：專為接入 [@582835293/gemini-web-agent](https://github.com/582835293/gemini-web-agent) 多渠道網頁額度生態而設計的 GUI 與 Agent 工具適配器。

---

## 🙏 致謝與開源聲明 (Credits & Attribution)

本外掛作為 DeepSeek Harness (DSH) 桌面客戶端的生態外掛，底層核心瀏覽器自動化規則、DOM 選擇器精準調校、多渠道調度邏輯與風控防護策略**100% 傳承並致敬原作者 [@582835293](https://github.com/582835293) 的開源專案 [gemini-web-agent](https://github.com/582835293/gemini-web-agent)**。

特此向作者 [@582835293](https://github.com/582835293) 的傑出貢獻與無私開源致以最誠摯的感謝！❤️

---

## 🌟 核心特性與設計哲學

### 1. 雙通道智慧路由 (Dual-Channel Smart Bridge)
* **通道 A (AgentLimb - 推薦首選)**：
  - ⚡ **100% 零彈窗**：利用本機配對協議，徹底告別傳統 CDP 每次連線的「Allow」惱人授權彈窗。
  - 🛡️ **通道 B 絕對休眠**：當 AgentLimb 處於連線就緒時，CDP 備用通道完全休眠，不碰觸 9222 端口。
* **通道 B (Chromium CDP - 備援模式)**：
  - 免安裝額外擴充套件，全自動動態遍歷掃描本機 Chromium 家族瀏覽器（Chrome、Edge、Brave、Vivaldi 等）的 DevToolsActivePort，並具備多實例防衝突機制。

### 2. 三大站點額度獨立與付費防扣款保護
* **AI Studio (`aistudio.google.com`)**：
  - 默認工作於 **`key_off` 免費無限輪詢層級**（左上角未綁定付費 API Key），支援 1M Token 超長上下文輸出。
  - **付費防護鐵律**：本外掛與原作者一致，強制過濾並鎖定所有標記為 `Paid` 的付費模型（如 `gemini-4-carbon`），非用戶顯式要求付費時絕不誤調，守護用戶錢包！
  - **免費池定位與 Extra High 安全上鎖說明**：
    - 本外掛專為**「100% 免費配額（key_off）」**調度而打造，目標是幫使用者的本機節省 Token 開銷。
    - Google AI Studio 的 `Extra High` 思考等級屬於高負載算力，免費用戶一旦選用會直接觸發 Google 伺服器的 `403 Permission Denied` 錯誤以及長達數分鐘的排隊假死。因此，本外掛在 GUI 設定介面與底層調度器中**已將 `Extra High` 思考安全上鎖（Disabled）**，確保調用 100% 順暢穩定。
    - 💡 **付費調用需求**：若您具備 Google Cloud Platform (GCP) 付費專案、綁定了付費 API Key，或有調用頂級 Paid 模型 / Extra High 極限深度思考的進階商業需求，建議下載安裝專門針對 Google 付費 API 設計的其他第三方外掛。
* **Gemini 官網 (`gemini.google.com`)**：
  - 獨立 5 小時滾動免費/會員對話池，探測完畢立即關閉分頁，零垃圾分頁殘留。
* **Google Flow (`flow.google.com`)**：
  - **獨立點數用途**：帳號享有每月獨立點數免費額度（依帳號方案等級而異），專門用於 Veo / Omni 視頻生成（每支影片消耗少量點數）。
  - **生圖免扣點特權**：使用 Nano Banana 2.1 生成 2K 高清圖片時「完全不扣除點數」（單張扣 0 點，等同無限免費生圖）！
  - **點數重置機制**：每月定期自動補滿額度，零扣款風險。

### 3. 多語言動態切換 (i18n) 與中立設計
* **全語系覆蓋**：完整支援**簡體中文**、**繁體中文**與 **English**。
* **無敏感國旗圖標**：採用標準中立文字標籤，避免地域敏感性；選單順序依序為「自動 (跟隨系統)」、「簡體中文」、「繁體中文」、「English」。
* **DSH 系統語言熱聯動**：外掛掛載 `MutationObserver` 實時監聽 DSH 根頁面語言，DSH 主介面切換語言時本外掛即刻動態刷新，無需重整頁面。

### 3. 模型池動態分類與非對話模型安全鎖
* **💬 文字與推理對話池**：開放選取為日常對話首選模型（`Gemini 4 Argon`, `Gemini 4 Hydrogen`, `Gemini 3.8 Flash`, `Gemini 3.5 Flash Lite`, `Gemini Decision 1`）。
* **🔒 多模態專用池（非日常聊天模型）**：
  - `Nano Banana 2.1`（生圖專用）
  - `Gemini Omni 1.2 Flash`（視頻專用）
  - `Lyria 3.5`（音樂專用）
  - `Gemini 3.8 Flash TTS`（語音配音專用）
  - `Gemini 3.5 Transcribe`（語音轉寫專用）
  - **安全鎖機制**：在首選模型清單中鎖定（Disabled），禁止用戶誤選為日常聊天模型；僅由 DeepSeek Agent 在執行多模態任務時精準調度。

### 4. 尖峰壅塞階梯降級機制 (Sequential Fallback Ladder)
* 當遭遇 Google 免費池尖峰塞車、Thinking 超時或伺服器暫不可用時，外掛支援依序階梯降級：
  $$\text{Argon} \longrightarrow \text{Hydrogen} \longrightarrow \text{Flash} \longrightarrow \text{Flash Lite}$$
* 若全數階梯備援皆耗盡，觸發 `CONGESTION_HALT` 警告，DeepSeek 會主動在對話中告知用戶當前排隊狀態並詢問決策。
* 用戶亦可在設定頁切換為「🛑 嚴格模式」，強制只用指定模型。

### 5. 多模態檔案本地落地與 Markdown 超連結規範
* 所有生成之多模態媒體（PNG 圖片、MP4 視頻、MP3 音樂、WAV 配音、Build ZIP 專案包）統一落地於目前 DSH 工作區的 `downloads/` 目錄。
* 輸出內容格式化為可直接點擊之絕對路徑 Markdown 超連結：
  ```markdown
  - [gemini_img_1732000000.png](file:///workspace/downloads/gemini_img_1732000000.png)
  ```

### 6. DSH 會話生命週期無感綁定與自動分頁清理
* **同一話題無感延續**：自動綁定 DSH 會話 ID，連續追問時複用瀏覽器上下文，不重複開新分頁。
* **全新話題乾淨重置**：當用戶開啟新對話時，自動開啟乾淨會話。
* **分頁生命週期自動關閉**：任務執行完畢後，後台自動執行 `tab_close` 關閉任務分頁，保持用戶瀏覽器視窗乾淨清爽；若需手動除錯可傳入 `--keep-tab`。

---

## 💡 人類使用者召喚秘笈與使用動機指南 (Cheat Sheet & Motivation Guide)

### 📌 核心關鍵觀念：為什麼不能只說「請幫我寫個快速排序」？
> **本地模型本身就能回答！**
> 在 DeepSeek Harness (DSH) 或 Antigravity 內，宿主 AI 大模型（如 DeepSeek V3、Claude、GPT）本身就具備極強的通用編程與對話能力。
> 如果人類用戶只是講大白話「幫我寫個快速排序」，宿主 AI 會直接在本地生成答案，**沒有任何理由耗費額外時間去啟動外部瀏覽器**。
>
> **因此，人類使用者在召喚時，請務必表明您的「使用動機」！**
> 只要在提示詞中帶出動機（節省配額、超長上下文、畫布生圖、官網 Task 聯網），宿主 AI 就會立刻心領神會，精準調用 `gemini_web_agent`！

---

### 🚀 五大黃金使用動機與召喚秘笈

| 使用場景 / 動機 | 為什麼要調用外部 Google 網頁？ | 🗣️ 推薦召喚提示詞 (Prompt 範例) | 底層自動路由通道 |
| :--- | :--- | :--- | :--- |
| **1. 節省本地 / API 配額** | 本地 API 按 Token 計費。Google AI Studio 提供完全免費的 `key_off` 額度，完全不扣本機額度！ | `「請使用 gemini_web_agent 幫我重構這段代碼，幫我節省本地額度」`<br>`「請用 Google 免費額度幫我總結這份文檔」` | Google AI Studio (`aistudio.google.com`)<br>模型：`gemini-3.5-flash-lite` 或 `3.8-flash` |
| **2. 巨型上下文與深度推理** | 本地上下文窗口受限（如 32k~64k）。AI Studio 支援 **1M~2M 超巨型上下文**，且 Gemini 4 Hydrogen / Argon 具備頂級深度思考能力。 | `「這份 10 萬行日誌請用 AI Studio 的 Gemini 4 Hydrogen 分析瓶頸」`<br>`「請用 Gemini 4 Argon 開啟深度思考，幫我推導快速排序時間複雜度的數學證明」` | Google AI Studio (`aistudio.google.com`)<br>模型：`gemini-4-hydrogen` 或 `gemini-4-argon` |
| **3. 零點數 2K 高清生圖** | 本地文本模型無法生圖。Google Flow 享有獨立點數池，且 **Nano Banana 2.1 享有 0 點數消耗特權**（無限免費生圖）！ | `「請使用 gemini_web_agent（site 設定為 flow），用 Nano Banana 2.1 生一張賽博朋克風格的貓咪圖」`<br>`「請在 Google Flow 幫我生一張科幻太空站 2K 桌布」` | Google Flow (`flow.google.com`)<br>模型：`gemini-nano-banana-2.1` |
| **4. 連貫短視頻生成** | 利用 Google Flow 專屬獨立點數影片池生成高品質短視頻。 | `「請在 Google Flow 畫布使用 Omni 1.2 Flash 生成一段未來飛車穿梭賽博朋克城市的影片」` | Google Flow (`flow.google.com`)<br>模型：`omni` / `veo-3.1` |
| **5. 即時深度聯網與行程畫布** | 需要最新時效資訊（機票、酒店、實時新聞），並需要 Google 生成互動式 SVG 預算表、地鐵圖與本地落地指南。 | `「請在 Gemini 官網切換至 task 模式，幫我建立一個三天兩夜的東京旅遊規劃任務」`<br>`「請使用 Gemini 官網 task 模式聯網調研最新 AI 晶片進展並做成圖表」` | Gemini 官網 (`gemini.google.com`)<br>入口：`entry: "task"` |

---

### 💬 聊天室主調用窗口 (Primary Conversational Gateway)

本外掛全面回歸並統一採用 **聊天室自然語言直通**。無需輸入任何斜槓指令，只需在 DSH 一般對話框中自然發送需求，宿主 AI 會自動調用 `gemini-web-agent` 工具，將即時思考推演、高亮程式碼與落地檔案完整呈現在對話視窗內：

* **調用 Hydrogen 極限代碼生成**：
  > *「請用 Gemini 4 Hydrogen 實作高效能紅黑樹並附帶完整繁中註釋」*
* **直達 Google Flow 畫布生圖**：
  > *「請用 Google Flow Nano Banana 2.1 生一張極簡日式庭園桌布」*
* **日常架構規劃與諮詢**：
  > *「請調用 gemini-web-agent 分析微服務架構中 Saga 模式與 TCC 模式的優缺點」*

---

## 🛠️ 安裝與使用

1. **外掛自包含安裝**：
   將本外掛軟連結或放置於 `~/.dsh/profiles/desktop/node_modules/dsh-gemini-web`。
2. **連線檢查**：
   啟動 DSH 桌面端，進入「設定 ➔ ✨ Gemini 網頁端 (Agent 調度中心)」完成連線檢查。
3. **日常交談直達**：
   在任何對話框直接以自然語言發問，宿主模型會依據意圖自動調用 `gemini-web-agent`，並自動解析模型意圖（如提到 Hydrogen 自動切換 Gemini 4 Hydrogen，提到 Flow 自動切換 Google Flow）。
4. **Antigravity CLI / Agent 調用整合**：
   * **Skill 穿透多帳號隔離**：執行 `python scripts/setup_skill.py --auto`，腳本會自動將技能軟連結至工作區根目錄的 `.agents/skills/gemini-web-agent`，確保無論 DSH 切換至哪個隔離帳號皆能 100% 探索到本技能。
   * **Tool 原生橋接**：若希望 Antigravity CLI 直接調用 DSH 註冊的 `gemini_web_agent` 工具，只需在 `cordis.patch.yml` 中將 `dsh-agy-link` 的 `mcpBridge` 設為 `true`。

---

## 📄 授權條款
MIT License.
致謝所有參與開源社群的開發者！
