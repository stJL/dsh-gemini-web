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
  - 免安裝額外擴充套件，全自動動態遍歷掃描本機 Chromium 家族瀏覽器（Brave、Chrome、Edge、Vivaldi 等）的 DevToolsActivePort，並具備多實例防衝突機制。

### 2. 三大站點額度獨立與付費防扣款保護
* **AI Studio (`aistudio.google.com`)**：
  - 默認工作於 **`key_off` 免費無限輪詢層級**（左上角未綁定付費 API Key），支援 1M Token 超長上下文輸出。
  - **付費防護鐵律**：本外掛與原作者一致，強制過濾並鎖定所有標記為 `Paid` 的付費模型（如 `gemini-4-carbon`），非用戶顯式要求付費時絕不誤調，守護用戶錢包！
* **Gemini 官網 (`gemini.google.com`)**：
  - 獨立 5 小時滾動免費/會員對話池，探測完畢立即關閉分頁，零垃圾分頁殘留。
* **Google Flow (`flow.google.com`)**：
  - 獨立點數池：Nano Banana 2.1 享 2K 高清生圖 0 點數消耗；Omni 1.2 / Veo 享視頻生成專用免費點數。

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

### 6. DSH 會話生命週期無感綁定
* **同一話題無感延續**：自動綁定 DSH 會話 ID，連續追問時複用瀏覽器上下文，不重複開新分頁。
* **全新話題乾淨重置**：當用戶開啟新話題或輸入斜槓命令 `/gw --new` 時，自動開啟乾淨會話。

---

## 🛠️ 安裝與使用

1. 將本外掛軟連結或放置於 `~/.dsh/profiles/desktop/node_modules/dsh-gemini-web`。
2. 啟動 DSH 桌面端，進入「設定 ➔ ✨ Gemini 網頁端 (Agent 調度中心)」完成連線檢查。
3. 在任何對話中，DeepSeek Agent 會在需要時自動調用 `gemini_web_agent`，或直接輸入斜槓指令 `/gw <任務>`。

---

## 📄 授權條款
MIT License.
致謝所有參與開源社群的開發者！
