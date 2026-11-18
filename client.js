/**
 * dsh-gemini-web browser client
 * Hand-written ModuleLoader bundle: 100% self-contained, no external runtime dependencies.
 * Full multi-language support (zh-TW, zh-CN, en-US) with dynamic DSH language auto-detection.
 */
window.__ModuleLoader__.load({
  id: 'dsh-gemini-web',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useState, useEffect } = React

    const NS = 'gemini-web'
    const PKG = 'dsh-gemini-web'

    // 1. 原創 Gemini 漸層風格樣式與白天/黑夜適配
    const STYLES = `
      .gw-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
      }
      .gw-dot-ok {
        background: #10b981;
        box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
      }
      .gw-dot-warn {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
      }
      .gw-dot-err {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
      }
      .gw-card {
        padding: 14px 16px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
        margin-bottom: 12px;
        font-size: 13px;
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .gw-card:hover {
        border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
      }
      .gw-title {
        font-weight: 600;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .gw-desc {
        color: var(--dsw-alias-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 12px;
        line-height: 1.5;
      }
      .gw-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 500;
        background: var(--dsw-alias-badge-bg, rgba(99, 102, 241, 0.15));
        color: var(--dsw-alias-badge-text, #818cf8);
        border: 1px solid rgba(99, 102, 241, 0.3);
      }
      .gw-badge-warn {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border-color: rgba(245, 158, 11, 0.3);
      }
      .gw-badge-err {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.3);
      }
      .gw-progress-bar {
        width: 100%;
        height: 6px;
        border-radius: 9999px;
        background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.1));
        overflow: hidden;
        margin: 6px 0;
      }
      .gw-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #10b981 0%, #34d399 50%, #6ee7b7 100%);
        border-radius: 9999px;
        transition: width 0.3s ease;
      }
      .gw-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        background: #4f46e5;
        color: #ffffff;
        transition: opacity 0.2s ease, transform 0.1s ease;
      }
      .gw-btn:hover {
        opacity: 0.9;
      }
      .gw-btn:active {
        transform: scale(0.98);
      }
      .gw-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .gw-btn-secondary {
        background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08));
        color: var(--dsw-alias-text-primary, #ffffff);
        border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12));
      }
      .gw-select, .gw-input {
        background: var(--dsw-alias-input-bg, #1e222b);
        color: var(--dsw-alias-text-primary, #f1f5f9);
        border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.16));
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 12px;
        outline: none;
      }
      .gw-select option, .gw-select optgroup {
        background-color: var(--dsw-alias-input-bg, #1e222b);
        color: var(--dsw-alias-text-primary, #f1f5f9);
      }
      .gw-select:focus, .gw-input:focus {
        border-color: #6366f1;
      }

      /* 白天主題專用適配 (Light Mode) */
      @media (prefers-color-scheme: light) {
        .gw-card {
          background: #ffffff !important;
          border-color: #e2e8f0 !important;
          color: #0f172a !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .gw-desc {
          color: #475569 !important;
        }
        .gw-title {
          color: #0f172a !important;
        }
        .gw-select, .gw-input {
          background: #f8fafc !important;
          color: #0f172a !important;
          border-color: #cbd5e1 !important;
        }
        .gw-select option, .gw-select optgroup {
          background-color: #ffffff !important;
          color: #0f172a !important;
        }
        .gw-btn-secondary {
          background: #f1f5f9 !important;
          color: #1e293b !important;
          border-color: #cbd5e1 !important;
        }
      }
      [data-theme="light"] .gw-card, .theme-light .gw-card, body.light-theme .gw-card {
        background: #ffffff !important;
        border-color: #e2e8f0 !important;
        color: #0f172a !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }
      [data-theme="light"] .gw-desc, .theme-light .gw-desc, body.light-theme .gw-desc {
        color: #475569 !important;
      }
      [data-theme="light"] .gw-title, .theme-light .gw-title, body.light-theme .gw-title {
        color: #0f172a !important;
      }
      [data-theme="light"] .gw-select, .theme-light .gw-select, body.light-theme .gw-select,
      [data-theme="light"] .gw-input, .theme-light .gw-input, body.light-theme .gw-input {
        background: #f8fafc !important;
        color: #0f172a !important;
        border-color: #cbd5e1 !important;
      }
      [data-theme="light"] .gw-select option, .theme-light .gw-select option, body.light-theme .gw-select option,
      [data-theme="light"] .gw-select optgroup, .theme-light .gw-select optgroup, body.light-theme .gw-select optgroup {
        background-color: #ffffff !important;
        color: #0f172a !important;
      }
      [data-theme="light"] .gw-btn-secondary, .theme-light .gw-btn-secondary, body.light-theme .gw-btn-secondary {
        background: #f1f5f9 !important;
        color: #1e293b !important;
        border-color: #cbd5e1 !important;
      }
    `

    const API_BASE = (() => {
      try { return new URL('api/gemini-web', document.baseURI).pathname } catch { return '/api/gemini-web' }
    })()

    async function api(path, options) {
      const { timeout = 25000, body, ...fetchOptions } = options ?? {}
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeout)
      try {
        const fullUrl = `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
        const res = await fetch(fullUrl, {
          ...fetchOptions,
          headers: { 'content-type': 'application/json', ...(fetchOptions.headers || {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        })
        return await res.json()
      } finally {
        clearTimeout(timer)
      }
    }

    // 2. 多語言字典 (i18n Dictionaries: zh-TW, zh-CN, en-US)
    const I18N = {
      'zh-TW': {
        title: '✨ Gemini 網頁端調度中心 (Agent 模式)',
        unauthed_title: '⚠️ Google 帳號尚未登入 / 狀態過期',
        unauthed_desc: '檢測到瀏覽器尚未登入 Google 或當前分頁被導向登入頁。請點擊下方按鈕登入後再使用：',
        unauthed_btn: '🔑 一鍵打開瀏覽器 Google 登入',
        bridge_title: '瀏覽器底層通訊通道 (Bridge)：',
        bridge_al_preferred: '🟢 AgentLimb 優先 (免彈窗)',
        bridge_cdp_mode: '🟡 CDP 模式 (備用)',
        bridge_disconnected: '🔴 未連線',
        route_al: '🚀 當前生效優先路由：通道 A (AgentLimb) ⚡ 完全靜默・零 Allow 彈窗・CDP 備用通道完全休眠',
        route_cdp: '⚠️ 當前生效優先路由：通道 B (CDP {port}) — 備用模式，每次連線需手動點擊瀏覽器 Allow 彈窗',
        route_none: '❌ 目前雙通道皆未連線，請參考下方配置指引完成連線',
        multi_instance_title: '⚠️ 偵測到多個開啟遠端偵錯的瀏覽器實例：',
        multi_instance_tip: '💡 建議關閉多餘的瀏覽器視窗以避免通訊衝突，或在下方「CDP 偵錯連接埠」指定您想使用的端口。',
        channel_a_title: '通道 A: AgentLimb (推薦)',
        channel_a_connected: '已連線 (零彈窗/永久授權)',
        channel_a_offline: '未在線',
        channel_b_title: '通道 B: Chromium CDP (備用)',
        channel_b_connected: '已連線 (需點擊 Allow)',
        channel_b_dormant: '已休眠 (零彈窗保護)',
        channel_b_offline: '未連線',
        status_prefix: '狀態：',
        port_prefix: '連接埠：',
        config_prefix: '配置：',
        browser_prefix: '瀏覽器：',
        probing: '探測中 (正輪詢 Gemini 與 Flow)...',
        probe_all_btn: '🔄 重新探測全部通道與站點',
        sending: '發送中...',
        test_al_btn: '⚡ 測試 AgentLimb (Say 側邊欄)',
        executing: 'Agent 執行中...',
        test_agent_btn: '🤖 測試 Agent 跑任務',
        clear_cache_btn: '🧹 清除快取',
        al_sending_msg: '⏳ 正在向 AgentLimb 側邊欄發送通知...',
        al_success_msg: '🎉 已向 Brave 側邊欄成功發送即時通知！請看 Brave 側邊欄',
        al_failed_prefix: '❌ 測試失敗：',
        agent_executing_msg: '⏳ 正在透過 AgentLimb/CDP 調度 AI Studio 執行任務...',
        agent_success_title: '✅ 任務完成 ({channel} 通道 · 模型: {model} · 耗時 {duration}ms){fallback}',
        agent_fallback_tag: ' [塞車自動降級]',
        agent_failed_prefix: '❌ 調度失敗：',
        guide_title: '📖 瀏覽器連線配置指引（依需求二選一）',
        guide_a_title: '🟢 方案 A（強烈推薦・100% 免彈窗）',
        guide_a_1: '1. 在常用 Chromium 瀏覽器（Brave/Chrome/Edge 等）安裝 AgentLimb 擴充。',
        guide_a_2: '2. 點擊擴充功能面板的「Pair」完成一次性本機配對。',
        guide_a_3: '3. 永久免彈窗、不改捷徑、重啟電腦直接可用！',
        guide_a_btn: '🔗 下載 AgentLimb 擴充套件',
        guide_b_title: '🟡 方案 B（免安裝擴充・本機內建偵錯）',
        guide_b_1: '1. 在現有 Chromium 瀏覽器網址列輸入：',
        guide_b_2: '2. 勾選啟用偵錯開關（或捷徑啟動時加上 --remote-debugging-port=9222）。',
        guide_b_3: '3. 點擊上方「重新探測通道」即可自動連接。',
        quota_title: '📊 即時網頁端免費額度大盤',
        quota_polling_tip: '⏳ 正在輪詢 Gemini 與 Google Flow 獨立點數...',
        quota_refresh_btn: '🔄 刷新額度 (含 Flow)',
        quota_refreshing: '探測中...',
        quota_isolated_badge: '3 大站點額度完全獨立・絕不扣款',
        aistudio_title: '🌐 Google AI Studio (aistudio.google.com)',
        aistudio_badge: 'key_off 免費層級',
        aistudio_desc: '• 免費無限輪詢層級：支援 1M Token 長輸出（Argon / Hydrogen / Flash），未掛載 API Key 時直接享受網頁免費無限額度，絕對不會扣除付費帳號額度！',
        gemini_title: '📈 Gemini 官網 5小時滾動池 ({plan})',
        gemini_plan_pro: 'PRO',
        gemini_plan_free: '免費版',
        gemini_plan_default: '一般方案',
        gemini_used_pct: '{pct}% 已使用',
        gemini_reset: '重置週期：{time} (獨立對話額度)',
        flow_title: '🎨 Google Flow (flow.google.com)',
        flow_connected_badge: '🟢 已連通',
        flow_pending_badge: '🟡 待刷新',
        flow_credits_unit: '{credits} 點 (生圖 0 點數)',
        flow_desc: '獨立點數池：Nano Banana 2.1 享 2K 高清生圖 0 點數消耗；Omni/Veo 生視頻享獨立免費點數。',
        flow_reset_suffix: ' (重置時間：{time})',
        routing_guide_title: '🧭 渠道自動路由與防扣款指南',
        routing_text_title: '💬 文字對話 / 複雜程式碼',
        routing_text_desc: '➔ 自動導向 AI Studio key_off 免費層級（長文本輸出）或 Gemini 網頁端。',
        routing_image_title: '🎨 2K 高清生圖 (Nano 2.1)',
        routing_image_desc: '➔ 自動導向 Google Flow 0 點數免費池 / AI Studio。',
        routing_video_title: '🎬 視頻生成 (Omni 1.2 / Veo)',
        routing_video_desc: '➔ 自動導向 Google Flow 視頻池 / AI Studio 專用模組。',
        routing_paid_title: '🔒 付費模型防扣款鎖',
        routing_paid_desc: '➔ 強制過濾並鎖定 Paid 標記條目（如 Carbon），預設完全避開，保護錢包！',
        settings_section_title: '⚙️ Agent 調度與瀏覽器通道設定',
        lang_label: '介面語言 (UI Language)：',
        lang_desc: '預設自動跟隨 DSH 系統語言，亦可在此手動指定',
        lang_auto: '🌐 自動 (跟隨 DSH 系統)',
        lang_zhtw: '🇹🇼 繁體中文',
        lang_zhcn: '🇨🇳 简体中文',
        lang_en: '🇺🇸 English',
        conn_strategy_title: '瀏覽器連線通道策略：',
        conn_strategy_desc: 'auto 模式優先走 AgentLimb，成功則完全不碰 CDP',
        conn_auto: '🌟 自動 (AgentLimb 優先)',
        conn_al: '⚡ 強制 AgentLimb (零彈窗)',
        conn_cdp: '🛠️ 強制 CDP (9222 端口)',
        default_model_title: 'Agent 預設首選模型：',
        sync_models_btn: '🔄 刷新網頁模型池',
        syncing: '同步中...',
        models_classified: '已分類 {count} 個模型（已鎖定多模態專用與付費項）',
        models_default_note: '已載入標準模型池（多模態專用模型已鎖定，由 AI 自動調用）',
        group_text: '💬 文字與推理對話池 (可選為聊天首選)',
        group_media: '🔒 多模態專用池（非日常聊天・AI自動調用）',
        group_paid: '🔒 付費模型池 (需綁付費Key・預設保護防扣款)',
        tag_media: '[多模態專用]',
        tag_paid: '[需付費Key]',
        fallback_title: '免費池塞車階梯降級切換：',
        fallback_strict_desc: '🛑 嚴格模式：嚴格保持所選模型，遇塞車立即中止並詢問用戶',
        fallback_ladder_desc: '🌟 智慧階梯：依序嘗試 (Argon ➔ Hydrogen ➔ Flash ➔ Flash Lite)，全滿時詢問用戶',
        fallback_ladder_opt: '🌟 智慧階梯降級 (推薦)',
        fallback_strict_opt: '🛑 嚴格模式 (不降級)',
        thinking_level_title: '推理思考等級 (Thinking Level)：',
        thinking_high: 'High (推薦默認)',
        thinking_extra_high: 'Extra High (深度推導)',
        thinking_medium: 'Medium (折衷)',
        thinking_low: 'Low (低思考速回)',
        timeout_title: '單次任務最大超時限制 (秒)：',
        cdp_port_title: 'CDP 偵錯連接埠 (僅 CDP 模式生效)：',
        save_btn: '💾 儲存並套用設定',
        saving: '儲存中...',
        save_success: '✅ 設定已儲存生效！',
        save_failed_prefix: '❌ 儲存失敗: ',
        links_title: '🔗 官方工作台直達',
        link_aistudio: '🌐 Google AI Studio',
        link_flow: '🎨 Google Flow',
        link_gemini: '📈 Gemini 額度大盤',
        link_accounts: '🔑 Google 帳號中心',
        safety_title: '🛡️ 運行機制與自用原則聲明',
        safety_item1: '• 🛡️ 不算反代，不導出 API，不抽 Cookie：純本機瀏覽器自動化 Agent，等同於讓 AI 替你打開本機已登入的 Chromium 瀏覽器（如 Brave / Chrome / Edge 等）。',
        safety_item2: '• 🌐 官方真實渲染：所有請求皆透過官方真實網頁打字與接收結果，相對更穩，完全繞開本地 Token 與模型限制。',
        safety_item3: '• ⚡ 頻率控制建議：日常自用建議保持合理調度頻率，避免極高頻並發刷網頁端；遇到高峰排隊塞車時，建議切換為 Flash Lite 備用。',
        safety_item4: '• 🔒 100% 迴環安全：所有通訊限制於本機 127.0.0.1 迴環，零憑證外洩風險。',
        nav_label: '✨ Gemini 網頁端 (Agent 調度中心)'
      },
      'zh-CN': {
        title: '✨ Gemini 网页端调度中心 (Agent 模式)',
        unauthed_title: '⚠️ Google 账号尚未登录 / 状态过期',
        unauthed_desc: '检测到浏览器尚未登录 Google 或当前标签页被重定向至登录页。请点击下方按钮登录后再使用：',
        unauthed_btn: '🔑 一键打开浏览器 Google 登录',
        bridge_title: '浏览器底层通信通道 (Bridge)：',
        bridge_al_preferred: '🟢 AgentLimb 优先 (免弹窗)',
        bridge_cdp_mode: '🟡 CDP 模式 (备用)',
        bridge_disconnected: '🔴 未连接',
        route_al: '🚀 当前生效优先路由：通道 A (AgentLimb) ⚡ 完全静默・零 Allow 弹窗・CDP 备用通道完全休眠',
        route_cdp: '⚠️ 当前生效优先路由：通道 B (CDP {port}) — 备用模式，每次连接需手动点击浏览器 Allow 弹窗',
        route_none: '❌ 目前双通道皆未连接，请参考下方配置指引完成连接',
        multi_instance_title: '⚠️ 检测到多个开启远程调试的浏览器实例：',
        multi_instance_tip: '💡 建议关闭多余的浏览器窗口以避免通信冲突，或在下方「CDP 调试端口」指定您想使用的端口。',
        channel_a_title: '通道 A: AgentLimb (推荐)',
        channel_a_connected: '已连接 (零弹窗/永久授权)',
        channel_a_offline: '未在线',
        channel_b_title: '通道 B: Chromium CDP (备用)',
        channel_b_connected: '已连接 (需点击 Allow)',
        channel_b_dormant: '已休眠 (零弹窗保护)',
        channel_b_offline: '未连接',
        status_prefix: '状态：',
        port_prefix: '端口：',
        config_prefix: '配置：',
        browser_prefix: '浏览器：',
        probing: '探测中 (正轮询 Gemini 与 Flow)...',
        probe_all_btn: '🔄 重新探测全部通道与站点',
        sending: '发送中...',
        test_al_btn: '⚡ 测试 AgentLimb (Say 侧边栏)',
        executing: 'Agent 执行中...',
        test_agent_btn: '🤖 测试 Agent 跑任务',
        clear_cache_btn: '🧹 清除缓存',
        al_sending_msg: '⏳ 正在向 AgentLimb 侧边栏发送通知...',
        al_success_msg: '🎉 已向 Brave 侧边栏成功发送即时通知！请看 Brave 侧边栏',
        al_failed_prefix: '❌ 测试失败：',
        agent_executing_msg: '⏳ 正在通过 AgentLimb/CDP 调度 AI Studio 执行任务...',
        agent_success_title: '✅ 任务完成 ({channel} 通道 · 模型: {model} · 耗时 {duration}ms){fallback}',
        agent_fallback_tag: ' [塞车自动降级]',
        agent_failed_prefix: '❌ 调度失败：',
        guide_title: '📖 浏览器连接配置指引（依需求二选一）',
        guide_a_title: '🟢 方案 A（强烈推荐・100% 免弹窗）',
        guide_a_1: '1. 在常用 Chromium 浏览器（Brave/Chrome/Edge 等）安装 AgentLimb 扩展。',
        guide_a_2: '2. 点击扩展功能面板的「Pair」完成一次性本机配对。',
        guide_a_3: '3. 永久免弹窗、不改快捷方式、重启电脑直接可用！',
        guide_a_btn: '🔗 下载 AgentLimb 扩展套件',
        guide_b_title: '🟡 方案 B（免安装扩展・本机内置调试）',
        guide_b_1: '1. 在现有 Chromium 浏览器地址栏输入：',
        guide_b_2: '2. 勾选启用调试开关（或快捷方式启动时加上 --remote-debugging-port=9222）。',
        guide_b_3: '3. 点击上方「重新探测通道」即可自动连接。',
        quota_title: '📊 实时网页端免费额度大盘',
        quota_polling_tip: '⏳ 正在轮询 Gemini 与 Google Flow 独立点数...',
        quota_refresh_btn: '🔄 刷新额度 (含 Flow)',
        quota_refreshing: '探测中...',
        quota_isolated_badge: '3 大站点额度完全独立・绝不扣款',
        aistudio_title: '🌐 Google AI Studio (aistudio.google.com)',
        aistudio_badge: 'key_off 免费层级',
        aistudio_desc: '• 免费无限轮询层级：支持 1M Token 长输出（Argon / Hydrogen / Flash），未挂载 API Key 时直接享受网页免费无限额度，绝对不会扣除付费账号额度！',
        gemini_title: '📈 Gemini 官网 5小时滚动池 ({plan})',
        gemini_plan_pro: 'PRO',
        gemini_plan_free: '免费版',
        gemini_plan_default: '一般方案',
        gemini_used_pct: '{pct}% 已使用',
        gemini_reset: '重置周期：{time} (独立对话额度)',
        flow_title: '🎨 Google Flow (flow.google.com)',
        flow_connected_badge: '🟢 已连通',
        flow_pending_badge: '🟡 待刷新',
        flow_credits_unit: '{credits} 点 (生图 0 点数)',
        flow_desc: '独立点数池：Nano Banana 2.1 享 2K 高清生图 0 点数消耗；Omni/Veo 生视频享独立免费点数。',
        flow_reset_suffix: ' (重置时间：{time})',
        routing_guide_title: '🧭 渠道自动路由与防扣款指南',
        routing_text_title: '💬 文字对话 / 复杂代码',
        routing_text_desc: '➔ 自动导向 AI Studio key_off 免费层级（长文本输出）或 Gemini 网页端。',
        routing_image_title: '🎨 2K 高清生图 (Nano 2.1)',
        routing_image_desc: '➔ 自动导向 Google Flow 0 点数免费池 / AI Studio。',
        routing_video_title: '🎬 视频生成 (Omni 1.2 / Veo)',
        routing_video_desc: '➔ 自动导向 Google Flow 视频池 / AI Studio 专用模块。',
        routing_paid_title: '🔒 付费模型防扣款锁',
        routing_paid_desc: '➔ 强制过滤并锁定 Paid 标记条目（如 Carbon），默认完全避开，保护钱包！',
        settings_section_title: '⚙️ Agent 调度与浏览器通道设置',
        lang_label: '界面语言 (UI Language)：',
        lang_desc: '默认自动跟随 DSH 系统语言，亦可在此手动指定',
        lang_auto: '🌐 自动 (跟随 DSH 系统)',
        lang_zhtw: '🇹🇼 繁體中文',
        lang_zhcn: '🇨🇳 简体中文',
        lang_en: '🇺🇸 English',
        conn_strategy_title: '浏览器连接通道策略：',
        conn_strategy_desc: 'auto 模式优先走 AgentLimb，成功则完全不碰 CDP',
        conn_auto: '🌟 自动 (AgentLimb 优先)',
        conn_al: '⚡ 强制 AgentLimb (零弹窗)',
        conn_cdp: '🛠️ 强制 CDP (9222 端口)',
        default_model_title: 'Agent 默认首选模型：',
        sync_models_btn: '🔄 刷新网页模型池',
        syncing: '同步中...',
        models_classified: '已分类 {count} 个模型（已锁定多模态专用与付费项）',
        models_default_note: '已加载标准模型池（多模态专用模型已锁定，由 AI 自动调用）',
        group_text: '💬 文字与推理对话池 (可选为聊天首选)',
        group_media: '🔒 多模态专用池（非日常聊天・AI自动调用）',
        group_paid: '🔒 付费模型池 (需绑付费Key・默认保护防扣款)',
        tag_media: '[多模态专用]',
        tag_paid: '[需付费Key]',
        fallback_title: '免费池塞车阶梯降级切换：',
        fallback_strict_desc: '🛑 严格模式：严格保持所选模型，遇塞车立即中止并询问用户',
        fallback_ladder_desc: '🌟 智能阶梯：依序尝试 (Argon ➔ Hydrogen ➔ Flash ➔ Flash Lite)，全满时询问用户',
        fallback_ladder_opt: '🌟 智能阶梯降级 (推荐)',
        fallback_strict_opt: '🛑 严格模式 (不降级)',
        thinking_level_title: '推理思考等级 (Thinking Level)：',
        thinking_high: 'High (推荐默认)',
        thinking_extra_high: 'Extra High (深度推导)',
        thinking_medium: 'Medium (折衷)',
        thinking_low: 'Low (低思考速回)',
        timeout_title: '单次任务最大超时限制 (秒)：',
        cdp_port_title: 'CDP 调试端口 (仅 CDP 模式生效)：',
        save_btn: '💾 保存并应用设置',
        saving: '保存中...',
        save_success: '✅ 设置已保存生效！',
        save_failed_prefix: '❌ 保存失败: ',
        links_title: '🔗 官方工作台直达',
        link_aistudio: '🌐 Google AI Studio',
        link_flow: '🎨 Google Flow',
        link_gemini: '📈 Gemini 额度大盘',
        link_accounts: '🔑 Google 账号中心',
        safety_title: '🛡️ 运行机制与自用原则声明',
        safety_item1: '• 🛡️ 不算反代，不导出 API，不抽 Cookie：纯本机浏览器自动化 Agent，等同于让 AI 替你打开本机已登录的 Chromium 浏览器（如 Brave / Chrome / Edge 等）。',
        safety_item2: '• 🌐 官方真实渲染：所有请求皆通过官方真实网页打字与接收结果，相对更稳，完全绕开本地 Token 与模型限制。',
        safety_item3: '• ⚡ 频率控制建议：日常自用建议保持合理调度频率，避免极高频并发刷网页端；遇到高峰排队塞车时，建议切换为 Flash Lite 备用。',
        safety_item4: '• 🔒 100% 回环安全：所有通信限制于本机 127.0.0.1 回环，零凭证外泄风险。',
        nav_label: '✨ Gemini 网页端 (Agent 调度中心)'
      },
      'en-US': {
        title: '✨ Gemini Web Orchestration (Agent Mode)',
        unauthed_title: '⚠️ Google Account Not Logged In / Session Expired',
        unauthed_desc: 'Browser has not logged in to Google or the active tab redirected to login page. Please log in before proceeding:',
        unauthed_btn: '🔑 Open Browser Google Login',
        bridge_title: 'Browser Communication Bridge:',
        bridge_al_preferred: '🟢 AgentLimb Preferred (Zero-Popup)',
        bridge_cdp_mode: '🟡 CDP Mode (Fallback)',
        bridge_disconnected: '🔴 Disconnected',
        route_al: '🚀 Active Primary Route: Channel A (AgentLimb) ⚡ Fully Silent · Zero Allow Popups · CDP Fallback Dormant',
        route_cdp: '⚠️ Active Primary Route: Channel B (CDP {port}) — Fallback Mode, requires clicking browser Allow prompt',
        route_none: '❌ Both channels disconnected. Please follow setup instructions below to connect.',
        multi_instance_title: '⚠️ Multiple Remote Debugging Browser Instances Detected:',
        multi_instance_tip: '💡 Recommended to close extra browser windows to avoid port conflicts, or specify your port below.',
        channel_a_title: 'Channel A: AgentLimb (Recommended)',
        channel_a_connected: 'Connected (Zero-Popup / Permanent Auth)',
        channel_a_offline: 'Offline',
        channel_b_title: 'Channel B: Chromium CDP (Fallback)',
        channel_b_connected: 'Connected (Requires Allow prompt)',
        channel_b_dormant: 'Dormant (Zero-Popup Guard)',
        channel_b_offline: 'Disconnected',
        status_prefix: 'Status: ',
        port_prefix: 'Port: ',
        config_prefix: 'Config: ',
        browser_prefix: 'Browser: ',
        probing: 'Probing (Polling Gemini & Flow)...',
        probe_all_btn: '🔄 Probe All Channels & Sites',
        sending: 'Sending...',
        test_al_btn: '⚡ Test AgentLimb (Sidebar Say)',
        executing: 'Agent Executing...',
        test_agent_btn: '🤖 Test Agent Task Execution',
        clear_cache_btn: '🧹 Clear Cache',
        al_sending_msg: '⏳ Sending notification to AgentLimb sidebar...',
        al_success_msg: '🎉 Successfully sent live notification to Brave sidebar! Check Brave sidebar.',
        al_failed_prefix: '❌ Test Failed: ',
        agent_executing_msg: '⏳ Orchestrating AI Studio task via AgentLimb/CDP...',
        agent_success_title: '✅ Task Completed ({channel} channel · Model: {model} · Elapsed: {duration}ms){fallback}',
        agent_fallback_tag: ' [Congestion Auto-Fallback]',
        agent_failed_prefix: '❌ Orchestration Failed: ',
        guide_title: '📖 Browser Connection Guide (Choose Either)',
        guide_a_title: '🟢 Option A (Highly Recommended · 100% Zero-Popup)',
        guide_a_1: '1. Install AgentLimb extension in your Chromium browser (Brave/Chrome/Edge).',
        guide_a_2: '2. Click "Pair" in the extension popup for a one-time local pairing.',
        guide_a_3: '3. Permanent zero-popup, no shortcut changes, survives reboots!',
        guide_a_btn: '🔗 Download AgentLimb Extension',
        guide_b_title: '🟡 Option B (No Extension · Built-in Debugging)',
        guide_b_1: '1. In your Chromium browser address bar, navigate to:',
        guide_b_2: '2. Check "Enable remote debugging" (or add --remote-debugging-port=9222 to shortcut).',
        guide_b_3: '3. Click "Probe Channels" above to connect automatically.',
        quota_title: '📊 Real-Time Web Free Quota Dashboard',
        quota_polling_tip: '⏳ Polling Gemini & Google Flow independent credits...',
        quota_refresh_btn: '🔄 Refresh Quota (incl. Flow)',
        quota_refreshing: 'Probing...',
        quota_isolated_badge: '3 Sites Quotas Isolated · Zero Charges',
        aistudio_title: '🌐 Google AI Studio (aistudio.google.com)',
        aistudio_badge: 'key_off Free Tier',
        aistudio_desc: '• Free Unlimited Polling Tier: Supports 1M token output (Argon / Hydrogen / Flash). Directly uses web free quota without API key, never charges paid accounts!',
        gemini_title: '📈 Gemini Web 5-Hour Rolling Pool ({plan})',
        gemini_plan_pro: 'PRO',
        gemini_plan_free: 'Free Tier',
        gemini_plan_default: 'Standard',
        gemini_used_pct: '{pct}% Used',
        gemini_reset: 'Reset Cycle: {time} (Independent chat quota)',
        flow_title: '🎨 Google Flow (flow.google.com)',
        flow_connected_badge: '🟢 Connected',
        flow_pending_badge: '🟡 Pending',
        flow_credits_unit: '{credits} Credits (Image Gen: 0 Credits)',
        flow_desc: 'Independent pool: Nano Banana 2.1 generates 2K HD images at 0 credits; Omni/Veo video uses separate free credits.',
        flow_reset_suffix: ' (Reset: {time})',
        routing_guide_title: '🧭 Automatic Routing & Billing Safety Guide',
        routing_text_title: '💬 Text Chat / Complex Code',
        routing_text_desc: '➔ Routed to AI Studio key_off free tier (1M output) or Gemini Web.',
        routing_image_title: '🎨 2K HD Image Gen (Nano 2.1)',
        routing_image_desc: '➔ Routed to Google Flow 0-credit pool or AI Studio.',
        routing_video_title: '🎬 Video Gen (Omni 1.2 / Veo)',
        routing_video_desc: '➔ Routed to Google Flow video pool or AI Studio dedicated module.',
        routing_paid_title: '🔒 Paid Model Safety Lock',
        routing_paid_desc: '➔ Automatically filters and locks Paid-tagged models (e.g. Carbon) to protect your wallet!',
        settings_section_title: '⚙️ Agent Orchestration & Channel Settings',
        lang_label: 'Interface Language (Language):',
        lang_desc: 'Default follows DSH system language, or choose manually here',
        lang_auto: '🌐 Auto (Follow DSH System)',
        lang_zhtw: '🇹🇼 繁體中文',
        lang_zhcn: '🇨🇳 简体中文',
        lang_en: '🇺🇸 English',
        conn_strategy_title: 'Browser Connection Strategy:',
        conn_strategy_desc: 'Auto mode prioritizes AgentLimb; if successful, leaves CDP dormant',
        conn_auto: '🌟 Auto (AgentLimb Preferred)',
        conn_al: '⚡ Force AgentLimb (Zero-Popup)',
        conn_cdp: '🛠️ Force CDP (Port 9222)',
        default_model_title: 'Agent Default Preferred Model:',
        sync_models_btn: '🔄 Refresh Web Models',
        syncing: 'Syncing...',
        models_classified: 'Classified {count} models (Multimodal & Paid models locked)',
        models_default_note: 'Standard model pool loaded (Multimodal models locked for AI invocation)',
        group_text: '💬 Text & Reasoning Models (Chat Preferred)',
        group_media: '🔒 Multimodal Dedicated Pool (Non-chat · AI Invoked)',
        group_paid: '🔒 Paid Models Pool (Requires Paid Key · Guarded)',
        tag_media: '[Multimodal Only]',
        tag_paid: '[Paid Key Required]',
        fallback_title: 'Free Pool Congestion Fallback Strategy:',
        fallback_strict_desc: '🛑 Strict Mode: Maintain selected model; abort immediately on congestion & ask user',
        fallback_ladder_desc: '🌟 Smart Ladder: Try sequentially (Argon ➔ Hydrogen ➔ Flash ➔ Flash Lite), ask user if all full',
        fallback_ladder_opt: '🌟 Smart Ladder Fallback (Recommended)',
        fallback_strict_opt: '🛑 Strict Mode (No Fallback)',
        thinking_level_title: 'Reasoning Thinking Level:',
        thinking_high: 'High (Recommended Default)',
        thinking_extra_high: 'Extra High (Deep Reasoning)',
        thinking_medium: 'Medium (Balanced)',
        thinking_low: 'Low (Fast Response)',
        timeout_title: 'Task Max Timeout (Seconds):',
        cdp_port_title: 'CDP Debug Port (CDP Mode Only):',
        save_btn: '💾 Save & Apply Settings',
        saving: 'Saving...',
        save_success: '✅ Settings saved and applied!',
        save_failed_prefix: '❌ Save failed: ',
        links_title: '🔗 Official Consoles Quick Access',
        link_aistudio: '🌐 Google AI Studio',
        link_flow: '🎨 Google Flow',
        link_gemini: '📈 Gemini Quota Dashboard',
        link_accounts: '🔑 Google Account Center',
        safety_title: '🛡️ Operational Mechanism & Fair-Use Statement',
        safety_item1: '• 🛡️ Not a proxy, no API export, no Cookie extraction: Pure local browser automation agent, equivalent to letting AI use your logged-in Chromium browser.',
        safety_item2: '• 🌐 Authentic official rendering: All requests are typed and rendered directly on official web pages, bypassing token limits.',
        safety_item3: '• ⚡ Rate limit recommendations: Keep a reasonable request frequency for daily personal use; switch to Flash Lite during peak congestion.',
        safety_item4: '• 🔒 100% Loopback Security: All communications are restricted to 127.0.0.1 loopback with zero credential exposure.',
        nav_label: '✨ Gemini Web (Agent Orchestration Center)'
      }
    }

    function resolveDshLanguage() {
      try {
        if (typeof document !== 'undefined' && document.documentElement?.lang) {
          const l = document.documentElement.lang.toLowerCase()
          if (l.includes('tw') || l.includes('hk') || l.includes('hant')) return 'zh-TW'
          if (l.includes('cn') || l.includes('hans') || l === 'zh') return 'zh-CN'
          if (l.startsWith('en')) return 'en-US'
        }
      } catch {}
      try {
        if (typeof navigator !== 'undefined' && navigator.language) {
          const l = navigator.language.toLowerCase()
          if (l.includes('tw') || l.includes('hk') || l.includes('hant')) return 'zh-TW'
          if (l.includes('cn') || l.includes('hans') || l === 'zh') return 'zh-CN'
          if (l.startsWith('en')) return 'en-US'
        }
      } catch {}
      return 'zh-TW'
    }

    // 3. 視覺化設定與控制主面板 (嵌入 DSH Settings)
    function SettingsPanel({ isModal, onClose }) {
      const [status, setStatus] = useState(null)
      const [usage, setUsage] = useState(null)
      const [config, setConfig] = useState({
        connectionMode: 'auto',
        defaultModel: 'gemini-3.5-flash-lite',
        autoFallback: true,
        thinkingLevel: 'high',
        timeoutSec: 180,
        port: 9222,
        preferredBrowser: 'auto',
        flowCount: 1,
      })
      const [loading, setLoading] = useState(false)
      const [saving, setSaving] = useState(false)
      const [testResult, setTestResult] = useState(null)
      const [alTestResult, setAlTestResult] = useState(null)
      const [saveNotice, setSaveNotice] = useState('')
      const [availableModels, setAvailableModels] = useState([])
      const [syncingModels, setSyncingModels] = useState(false)

      // 語言狀態管理 (支援 auto, zh-TW, zh-CN, en-US)
      const [langChoice, setLangChoice] = useState(() => {
        try {
          return localStorage.getItem('dsh_gemini_web_lang') || 'auto'
        } catch {
          return 'auto'
        }
      })
      const [dshLang, setDshLang] = useState(resolveDshLanguage)

      useEffect(() => {
        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
          const obs = new MutationObserver(() => {
            setDshLang(resolveDshLanguage())
          })
          obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
          return () => obs.disconnect()
        }
      }, [])

      const activeLang = langChoice === 'auto' ? dshLang : langChoice
      const dict = I18N[activeLang] || I18N['zh-TW']
      const t = (k, params) => {
        let text = dict[k] ?? I18N['zh-TW'][k] ?? k
        if (params) {
          for (const [pk, pv] of Object.entries(params)) {
            text = text.replaceAll(`{${pk}}`, String(pv))
          }
        }
        return text
      }

      const syncModels = async () => {
        setSyncingModels(true)
        try {
          const m = await api('/models', { timeout: 20000 })
          if (m?.ok && Array.isArray(m.models)) {
            setAvailableModels(m.models)
          }
        } catch (e) {
          console.error(e)
        } finally {
          setSyncingModels(false)
        }
      }

      const loadData = async () => {
        setLoading(true)
        setAlTestResult(null)
        try {
          const s = await api('/status')
          setStatus(s)
          if (s?.config) setConfig(s.config)
          const u = await api('/usage?force=1', { timeout: 25000 })
          setUsage(u)
          const m = await api('/models')
          if (m?.ok && Array.isArray(m.models)) {
            setAvailableModels(m.models)
          }
        } catch (e) {
          console.error(e)
        } finally {
          setLoading(false)
        }
      }

      const saveSettings = async () => {
        setSaving(true)
        setSaveNotice('')
        try {
          const res = await api('/config', { method: 'POST', body: config })
          if (res?.ok) {
            setSaveNotice(t('save_success'))
            loadData()
          }
        } catch (e) {
          setSaveNotice(t('save_failed_prefix') + e.message)
        } finally {
          setSaving(false)
        }
      }

      const clearCache = async () => {
        try {
          await api('/clear-cache', { method: 'POST' })
          loadData()
        } catch {}
      }

      const openUrl = (url) => {
        api('/open-url', { method: 'POST', body: { url } })
          .catch(() => {
            if (typeof window !== 'undefined') window.open(url, '_blank')
          })
      }

      const runAlTest = async () => {
        setAlTestResult({ testing: true })
        try {
          const res = await api('/test-agentlimb', { method: 'POST', timeout: 10000 })
          if (res?.ok) {
            setAlTestResult({ ok: true, message: t('al_success_msg') })
          } else {
            setAlTestResult({ ok: false, error: res?.error || 'AgentLimb error' })
          }
        } catch (err) {
          setAlTestResult({ ok: false, error: err.message })
        }
      }

      const runAgentTaskTest = async () => {
        setTestResult({ testing: true })
        try {
          const res = await api('/execute', {
            method: 'POST',
            body: { task: 'Please say hello in one sentence: Gemini Web Agent is operational!', model: config.defaultModel },
            timeout: (config.timeoutSec + 20) * 1000
          })
          if (res?.ok) {
            setTestResult({
              ok: true,
              duration: res.elapsedSec ? Math.round(res.elapsedSec * 1000) : 0,
              reply: res.output,
              model: res.model,
              fellBack: res.fellBack,
              channel: res.channel,
            })
          } else {
            setTestResult({ ok: false, error: res?.error || 'Task failed' })
          }
        } catch (err) {
          setTestResult({ ok: false, error: err.message })
        }
      }

      useEffect(() => {
        loadData()
      }, [])

      const alConnected = Boolean(status?.agentlimb?.ready || status?.dual?.agentlimb?.ready)
      const cdpConnected = Boolean(status?.cdp?.connected || status?.dual?.cdp?.connected)
      const isAnyConnected = alConnected || cdpConnected
      const activeChannel = status?.activeChannel || (alConnected ? 'agentlimb' : (cdpConnected ? 'cdp' : 'none'))
      const isUnauthed = usage?.status === 'unauthenticated' || (!usage?.geminiPlan && isAnyConnected && usage?.plan === null)

      return h('div', { style: { maxHeight: isModal ? '72vh' : 'none', overflowY: 'auto' } }, [
        // 標題欄
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 } }, [
          h('div', { style: { fontWeight: 600, fontSize: 16 } }, t('title')),
          isModal && h('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.7, color: 'inherit' }
          }, '✕')
        ]),

        // 登入狀態警告
        isUnauthed && h('div', {
          className: 'gw-card',
          style: { background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.4)' }
        }, [
          h('div', { className: 'gw-title', style: { color: '#f59e0b' } }, t('unauthed_title')),
          h('div', { className: 'gw-desc' }, t('unauthed_desc')),
          h('div', { style: { marginTop: 10 } }, [
            h('button', {
              className: 'gw-btn',
              style: { background: '#f59e0b', color: '#000' },
              onClick: () => openUrl('https://accounts.google.com')
            }, t('unauthed_btn'))
          ])
        ]),

        // 卡片 1: 雙通道智慧連線面板 (Dual-Channel Smart Bridge)
        h('div', { className: 'gw-card', style: { borderColor: alConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(99, 102, 241, 0.3)' } }, [
          h('div', { className: 'gw-title', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
              h('span', { className: `gw-dot ${alConnected ? 'gw-dot-ok' : (cdpConnected ? 'gw-dot-warn' : 'gw-dot-err')}` }),
              h('span', null, t('bridge_title')),
            ]),
            h('span', {
              className: alConnected ? 'gw-badge' : (cdpConnected ? 'gw-badge-warn' : 'gw-badge-err'),
              style: alConnected ? { background: '#059669', color: '#fff' } : (cdpConnected ? { background: '#d97706', color: '#fff' } : {})
            }, alConnected ? t('bridge_al_preferred') : (cdpConnected ? t('bridge_cdp_mode') : t('bridge_disconnected')))
          ]),

          // 優先路由提示條
          h('div', {
            style: {
              margin: '8px 0',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 11,
              background: alConnected ? 'rgba(16, 185, 129, 0.1)' : (cdpConnected ? 'rgba(217, 119, 6, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
              border: alConnected ? '1px solid rgba(16, 185, 129, 0.3)' : (cdpConnected ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'),
              color: alConnected ? '#34d399' : (cdpConnected ? '#fbbf24' : '#f87171')
            }
          }, alConnected
            ? t('route_al')
            : (cdpConnected ? t('route_cdp', { port: status?.cdp?.port || config.port }) : t('route_none'))),

          // 多實例衝突提示
          status?.cdp?.multipleInstances && h('div', {
            style: {
              margin: '8px 0',
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
              fontSize: 11,
              lineHeight: 1.6
            }
          }, [
            h('div', { style: { fontWeight: 600, marginBottom: 2 } }, t('multi_instance_title')),
            h('div', null, (status?.cdp?.instances || []).map((i) => `• ${i.name} (Port: ${i.port})`).join('  |  ')),
            h('div', { style: { opacity: 0.85, marginTop: 4 } }, t('multi_instance_tip'))
          ]),

          // 通道 A 與 通道 B 狀態明細網格
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 } }, [
            // 通道 A: AgentLimb
            h('div', {
              style: {
                padding: '8px 10px',
                borderRadius: 6,
                background: alConnected ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                border: alConnected ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)'
              }
            }, [
              h('div', { style: { fontWeight: 600, fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 } }, [
                h('span', null, alConnected ? '🟢' : '⚪'),
                h('span', null, t('channel_a_title'))
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.8, lineHeight: 1.5 } }, [
                h('div', null, `${t('status_prefix')}${alConnected ? t('channel_a_connected') : t('channel_a_offline')}`),
                h('div', null, `${t('port_prefix')}127.0.0.1:${status?.agentlimb?.port || status?.dual?.agentlimb?.port || 8765}`),
                alConnected && h('div', null, `${t('config_prefix')}v${status?.agentlimb?.version || status?.dual?.agentlimb?.version || '0.8.2'} (${status?.agentlimb?.activeProfile || status?.dual?.agentlimb?.activeProfile || 'Profile'})`),
              ])
            ]),

            // 通道 B: Chromium CDP
            h('div', {
              style: {
                padding: '8px 10px',
                borderRadius: 6,
                background: cdpConnected ? 'rgba(217, 119, 6, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                border: cdpConnected ? '1px solid rgba(217, 119, 6, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)'
              }
            }, [
              h('div', { style: { fontWeight: 600, fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 } }, [
                h('span', null, cdpConnected ? '🟡' : '⚪'),
                h('span', null, t('channel_b_title'))
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.8, lineHeight: 1.5 } }, [
                h('div', null, `${t('status_prefix')}${cdpConnected ? t('channel_b_connected') : (alConnected ? t('channel_b_dormant') : t('channel_b_offline'))}`),
                h('div', null, `${t('port_prefix')}127.0.0.1:${status?.cdp?.port || status?.dual?.cdp?.port || config.port}`),
                cdpConnected && h('div', null, `${t('browser_prefix')}${status?.cdp?.browserType || status?.dual?.cdp?.browserType || 'Brave'}`),
              ])
            ])
          ]),

          // 操作按鈕列
          h('div', { style: { marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
            h('button', { className: 'gw-btn', onClick: loadData, disabled: loading }, loading ? t('probing') : t('probe_all_btn')),
            alConnected && h('button', {
              className: 'gw-btn',
              style: { background: '#059669' },
              onClick: runAlTest,
              disabled: alTestResult?.testing
            }, alTestResult?.testing ? t('sending') : t('test_al_btn')),
            h('button', {
              className: 'gw-btn',
              style: { background: '#4f46e5' },
              onClick: runAgentTaskTest,
              disabled: !isAnyConnected || testResult?.testing
            }, testResult?.testing ? t('executing') : t('test_agent_btn')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: clearCache }, t('clear_cache_btn'))
          ]),

          alTestResult && h('div', {
            style: {
              marginTop: 8,
              padding: '6px 8px',
              borderRadius: 4,
              fontSize: 11,
              background: alTestResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: alTestResult.ok ? '#34d399' : '#f87171'
            }
          }, [
            alTestResult.testing && t('al_sending_msg'),
            alTestResult.ok && alTestResult.message,
            alTestResult.error && `${t('al_failed_prefix')}${alTestResult.error}`
          ]),

          testResult && h('div', {
            style: {
              marginTop: 8,
              padding: '6px 8px',
              borderRadius: 4,
              fontSize: 11,
              background: testResult.ok ? 'rgba(99, 102, 241, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.25)'
            }
          }, [
            testResult.testing && t('agent_executing_msg'),
            testResult.ok && h('div', null, [
              h('div', { style: { fontWeight: 600, color: '#818cf8', marginBottom: 2 } },
                t('agent_success_title', {
                  channel: testResult.channel.toUpperCase(),
                  model: testResult.model,
                  duration: testResult.duration,
                  fallback: testResult.fellBack ? t('agent_fallback_tag') : ''
                })),
              h('div', { style: { opacity: 0.9, whiteSpace: 'pre-wrap' } }, testResult.reply)
            ]),
            testResult.error && h('div', { style: { color: '#f87171' } }, `${t('agent_failed_prefix')}${testResult.error}`)
          ])
        ]),

        // 尚未連線時的配置與教學指引卡片
        !isAnyConnected && h('div', {
          className: 'gw-card',
          style: { background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(99, 102, 241, 0.3)' }
        }, [
          h('div', { className: 'gw-title', style: { color: '#818cf8', fontSize: 13 } }, t('guide_title')),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 } }, [
            // 方案 A
            h('div', { style: { padding: '10px 12px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' } }, [
              h('div', { style: { fontWeight: 600, color: '#34d399', fontSize: 12, marginBottom: 6 } }, t('guide_a_title')),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.6 } }, [
                h('div', null, t('guide_a_1')),
                h('div', null, t('guide_a_2')),
                h('div', null, t('guide_a_3')),
                h('div', { style: { marginTop: 8 } }, [
                  h('button', {
                    className: 'gw-btn',
                    style: { padding: '3px 8px', fontSize: 10, background: '#059669' },
                    onClick: () => openUrl('https://github.com/hooosberg/AgentLimb')
                  }, t('guide_a_btn'))
                ])
              ])
            ]),
            // 方案 B
            h('div', { style: { padding: '10px 12px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' } }, [
              h('div', { style: { fontWeight: 600, color: '#fbbf24', fontSize: 12, marginBottom: 6 } }, t('guide_b_title')),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.6 } }, [
                h('div', null, t('guide_b_1')),
                h('code', { style: { background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 3, display: 'inline-block', margin: '2px 0' } }, 'chrome://inspect/#remote-debugging'),
                h('div', null, t('guide_b_2')),
                h('div', null, t('guide_b_3'))
              ])
            ])
          ])
        ]),

        // 卡片 2: 即時額度大盤 (3 大站點額度完全獨立)
        h('div', { className: 'gw-card' }, [
          h('div', { className: 'gw-title', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
              h('span', null, t('quota_title')),
              loading && h('span', { style: { fontSize: 11, color: '#f59e0b', fontWeight: 400 } }, t('quota_polling_tip'))
            ]),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
              h('button', {
                className: 'gw-btn',
                style: { padding: '2px 8px', fontSize: 11, background: '#10b981' },
                onClick: loadData,
                disabled: loading
              }, loading ? t('quota_refreshing') : t('quota_refresh_btn')),
              h('span', { className: 'gw-badge' }, t('quota_isolated_badge'))
            ])
          ]),
          h('div', { className: 'gw-desc', style: { display: 'flex', flexDirection: 'column', gap: 10 } }, [
            // 站點 1: AI Studio
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } }, [
                h('span', { style: { fontWeight: 600, color: '#818cf8' } }, t('aistudio_title')),
                h('span', { className: 'gw-badge', style: { background: '#4f46e5', color: '#fff' } }, t('aistudio_badge'))
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.5 } }, t('aistudio_desc'))
            ]),

            // 站點 2: Gemini 官網
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 2 } }, [
                h('span', { style: { fontWeight: 600, color: '#34d399' } },
                  t('gemini_title', {
                    plan: usage?.geminiPlan
                      ? (usage.geminiPlan === 'PRO' ? t('gemini_plan_pro') : (usage.geminiPlan === 'FREE' ? t('gemini_plan_free') : usage.geminiPlan))
                      : t('gemini_plan_default')
                  })),
                h('span', { style: { fontWeight: 600 } }, t('gemini_used_pct', { pct: usage?.geminiUsedPct ?? 0 })),
              ]),
              h('div', { className: 'gw-progress-bar' }, [
                h('div', { className: 'gw-progress-fill', style: { width: `${100 - (usage?.geminiUsedPct ?? 0)}%` } })
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.7 } }, t('gemini_reset', { time: usage?.geminiResetTime || '即時更新' })),
            ]),

            // 站點 3: Flow
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
                  h('span', { style: { fontWeight: 600, color: '#fbbf24' } }, t('flow_title')),
                  h('span', {
                    className: 'gw-badge',
                    style: usage?.flowResetTime ? { background: '#059669', color: '#fff' } : { background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }
                  }, usage?.flowResetTime ? t('flow_connected_badge') : t('flow_pending_badge'))
                ]),
                h('span', { style: { fontWeight: 600, color: '#10b981' } },
                  t('flow_credits_unit', { credits: usage?.flowCredits !== undefined && usage?.flowCredits !== null ? usage.flowCredits : 1050 })),
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.8, marginTop: 4 } },
                t('flow_desc') + (usage?.flowResetTime ? t('flow_reset_suffix', { time: usage.flowResetTime }) : '')
              )
            ])
          ])
        ]),

        // 卡片 2.5: 渠道自動路由與防扣款指南 (Routing & Safety Guide)
        h('div', { className: 'gw-card', style: { borderColor: 'rgba(16, 185, 129, 0.3)' } }, [
          h('div', { className: 'gw-title', style: { color: '#34d399' } }, t('routing_guide_title')),
          h('div', { className: 'gw-desc', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 } }, [
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#818cf8', marginBottom: 2 } }, t('routing_text_title')),
              h('div', { opacity: 0.8 }, t('routing_text_desc'))
            ]),
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#10b981', marginBottom: 2 } }, t('routing_image_title')),
              h('div', { opacity: 0.8 }, t('routing_image_desc'))
            ]),
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#f59e0b', marginBottom: 2 } }, t('routing_video_title')),
              h('div', { opacity: 0.8 }, t('routing_video_desc'))
            ]),
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#ec4899', marginBottom: 2 } }, t('routing_paid_title')),
              h('div', { opacity: 0.8 }, t('routing_paid_desc'))
            ]),
          ])
        ]),

        // 卡片 3: 【全自訂調度參數設定項 (Configurable Settings)】
        h('div', { className: 'gw-card', style: { borderColor: 'rgba(99, 102, 241, 0.4)' } }, [
          h('div', { className: 'gw-title', style: { color: '#818cf8' } }, t('settings_section_title')),
          h('div', { className: 'gw-desc', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [

            // 設定 0: 介面語言選擇 (Language Selection)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('div', null, [
                h('div', { style: { fontWeight: 500 } }, t('lang_label')),
                h('div', { style: { fontSize: 11, opacity: 0.6 } }, t('lang_desc'))
              ]),
              h('select', {
                className: 'gw-select',
                style: { width: 190 },
                value: langChoice,
                onChange: (e) => {
                  const val = e.target.value
                  setLangChoice(val)
                  try { localStorage.setItem('dsh_gemini_web_lang', val) } catch {}
                }
              }, [
                h('option', { value: 'auto' }, `${t('lang_auto')} [${activeLang}]`),
                h('option', { value: 'zh-TW' }, t('lang_zhtw')),
                h('option', { value: 'zh-CN' }, t('lang_zhcn')),
                h('option', { value: 'en-US' }, t('lang_en')),
              ])
            ]),

            // 設定 1: 通道模式 (Connection Mode)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('div', null, [
                h('div', { style: { fontWeight: 500 } }, t('conn_strategy_title')),
                h('div', { style: { fontSize: 11, opacity: 0.6 } }, t('conn_strategy_desc'))
              ]),
              h('select', {
                className: 'gw-select',
                style: { width: 190 },
                value: config.connectionMode || 'auto',
                onChange: (e) => setConfig({ ...config, connectionMode: e.target.value })
              }, [
                h('option', { value: 'auto' }, t('conn_auto')),
                h('option', { value: 'agentlimb' }, t('conn_al')),
                h('option', { value: 'cdp' }, t('conn_cdp')),
              ])
            ]),

            // 設定 2: 預設調度模型 (Default Model) - 分類並鎖定非對話模型
            (() => {
              const isMediaModel = (id = '', name = '') => {
                const s = (id + ' ' + name).toLowerCase()
                return s.includes('nano') || s.includes('banana') || s.includes('omni') || s.includes('veo') ||
                       s.includes('lyria') || s.includes('music') || s.includes('tts') || s.includes('transcribe') ||
                       s.includes('生圖') || s.includes('視頻') || s.includes('音樂') || s.includes('配音') || s.includes('轉寫') ||
                       s.includes('生图') || s.includes('视频') || s.includes('音乐') || s.includes('转写')
              }
              const isPaidModel = (m) => {
                if (m.paid) return true
                const s = ((m.id || '') + ' ' + (m.name || '')).toLowerCase()
                return s.includes('paid') || s.includes('carbon') || s.includes('antigravity-preview')
              }

              let textGroup = []
              let mediaGroup = []
              let paidGroup = []

              if (availableModels.length > 0) {
                textGroup = availableModels.filter(m => !isMediaModel(m.id, m.name) && !isPaidModel(m))
                mediaGroup = availableModels.filter(m => isMediaModel(m.id, m.name) && !isPaidModel(m))
                paidGroup = availableModels.filter(m => isPaidModel(m))
              }

              return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                h('div', null, [
                  h('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 } }, [
                    h('span', null, t('default_model_title')),
                    h('button', {
                      className: 'gw-btn',
                      style: { padding: '2px 6px', fontSize: 10, background: '#4f46e5' },
                      onClick: syncModels,
                      disabled: syncingModels
                    }, syncingModels ? t('syncing') : t('sync_models_btn'))
                  ]),
                  h('div', { style: { fontSize: 11, opacity: 0.6 } },
                    availableModels.length > 0
                      ? t('models_classified', { count: availableModels.length })
                      : t('models_default_note'))
                ]),
                h('select', {
                  className: 'gw-select',
                  style: { width: 230 },
                  value: config.defaultModel || 'gemini-3.5-flash-lite',
                  onChange: (e) => setConfig({ ...config, defaultModel: e.target.value })
                }, availableModels.length > 0 ? [
                  h('optgroup', { label: t('group_text') },
                    textGroup.map((m) =>
                      h('option', { key: m.id, value: m.id }, `${m.name} ${m.new ? '🌟' : ''}`)
                    )
                  ),
                  mediaGroup.length > 0 && h('optgroup', { label: t('group_media') },
                    mediaGroup.map((m) =>
                      h('option', { key: m.id, value: m.id, disabled: true }, `🔒 ${m.name} ${t('tag_media')}`)
                    )
                  ),
                  paidGroup.length > 0 && h('optgroup', { label: t('group_paid') },
                    paidGroup.map((m) =>
                      h('option', { key: m.id, value: m.id, disabled: true }, `💰 ${m.name} ${t('tag_paid')}`)
                    )
                  ),
                ] : [
                  h('optgroup', { label: t('group_text') }, [
                    h('option', { key: 'fl', value: 'gemini-3.5-flash-lite' }, '⚡ 3.5 Flash Lite'),
                    h('option', { key: 'f', value: 'gemini-3.8-flash' }, '🚀 3.8 Flash'),
                    h('option', { key: 'h', value: 'gemini-4-hydrogen' }, '🧠 4 Hydrogen (1M)'),
                    h('option', { key: 'a', value: 'gemini-4-argon' }, '🏗️ 4 Argon'),
                  ]),
                  h('optgroup', { label: t('group_media') }, [
                    h('option', { key: 'nano', value: 'gemini-nano-banana-2.1', disabled: true }, `🔒 Nano Banana 2.1 ${t('tag_media')}`),
                    h('option', { key: 'omni', value: 'gemini-omni-1.2-flash', disabled: true }, `🔒 Gemini Omni 1.2 Flash ${t('tag_media')}`),
                    h('option', { key: 'lyria', value: 'lyria-3.5', disabled: true }, `🔒 Lyria 3.5 ${t('tag_media')}`),
                    h('option', { key: 'tts', value: 'gemini-3.8-flash-tts', disabled: true }, `🔒 3.8 Flash TTS ${t('tag_media')}`),
                  ]),
                  h('optgroup', { label: t('group_paid') }, [
                    h('option', { key: 'carbon', value: 'gemini-4-carbon', disabled: true }, `💰 Gemini 4 Carbon ${t('tag_paid')}`),
                  ])
                ])
              ])
            })(),

            // 設定 3: 塞車階梯降級策略 (Fallback Mode)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('div', null, [
                h('div', { style: { fontWeight: 500 } }, t('fallback_title')),
                h('div', { style: { fontSize: 11, opacity: 0.6 } },
                  (config.fallbackMode === 'strict' || config.autoFallback === false)
                    ? t('fallback_strict_desc')
                    : t('fallback_ladder_desc'))
              ]),
              h('select', {
                className: 'gw-select',
                style: { width: 190 },
                value: config.fallbackMode || (config.autoFallback !== false ? 'ladder' : 'strict'),
                onChange: (e) => setConfig({
                  ...config,
                  fallbackMode: e.target.value,
                  autoFallback: e.target.value === 'ladder'
                })
              }, [
                h('option', { value: 'ladder' }, t('fallback_ladder_opt')),
                h('option', { value: 'strict' }, t('fallback_strict_opt')),
              ])
            ]),

            // 設定 4: 思考等級 (Thinking Level)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('span', null, t('thinking_level_title')),
              h('select', {
                className: 'gw-select',
                style: { width: 160 },
                value: config.thinkingLevel || 'high',
                onChange: (e) => setConfig({ ...config, thinkingLevel: e.target.value })
              }, [
                h('option', { value: 'high' }, t('thinking_high')),
                h('option', { value: 'extra-high' }, t('thinking_extra_high')),
                h('option', { value: 'medium' }, t('thinking_medium')),
                h('option', { value: 'low' }, t('thinking_low')),
              ])
            ]),

            // 設定 5: 任務超時時間 (Timeout)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('span', null, t('timeout_title')),
              h('input', {
                type: 'number',
                className: 'gw-input',
                style: { width: 90 },
                value: config.timeoutSec || 180,
                onChange: (e) => setConfig({ ...config, timeoutSec: parseInt(e.target.value, 10) || 180 })
              })
            ]),

            // 設定 6: CDP 端口 (CDP Port)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('span', null, t('cdp_port_title')),
              h('input', {
                type: 'number',
                className: 'gw-input',
                style: { width: 90 },
                value: config.port || 9222,
                onChange: (e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 9222 })
              })
            ]),

            // 儲存按鈕
            h('div', { style: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 } }, [
              h('button', {
                className: 'gw-btn',
                style: { background: '#6366f1' },
                onClick: saveSettings,
                disabled: saving
              }, saving ? t('saving') : t('save_btn')),
              saveNotice && h('span', { style: { fontSize: 12, color: saveNotice.startsWith('✅') ? '#10b981' : '#ef4444' } }, saveNotice)
            ])
          ])
        ]),

        // 卡片 4: 快捷工作台
        h('div', { className: 'gw-card' }, [
          h('div', { className: 'gw-title' }, t('links_title')),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 } }, [
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://aistudio.google.com/prompts/new_chat') }, t('link_aistudio')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://flow.google.com') }, t('link_flow')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://gemini.google.com/usage') }, t('link_gemini')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://accounts.google.com') }, t('link_accounts'))
          ])
        ]),

        // 卡片 5: 原作者架構原則與透明宣告
        h('div', { className: 'gw-card', style: { background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.05)' } }, [
          h('div', { className: 'gw-title', style: { fontSize: 12, opacity: 0.9 } }, t('safety_title')),
          h('div', { className: 'gw-desc', style: { fontSize: 11, opacity: 0.7, lineHeight: 1.6 } }, [
            h('div', null, t('safety_item1')),
            h('div', null, t('safety_item2')),
            h('div', null, t('safety_item3')),
            h('div', null, t('safety_item4'))
          ])
        ])
      ])
    }

    const inject = ['slots', 'locale']

    // 4. 插件注入點應用 (DSH Apply)
    function apply(ctx) {
      // 注入自定義樣式
      if (typeof document !== 'undefined') {
        const styleEl = document.createElement('style')
        styleEl.id = 'dsh-gemini-web-styles'
        styleEl.textContent = STYLES
        document.head.appendChild(styleEl)
      }

      // 註冊多語言字典至 DSH ctx.locale (若支援)
      ctx.effect(() => {
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            return ctx.locale.register(NS, {
              'zh-TW': I18N['zh-TW'],
              'zh-CN': I18N['zh-CN'],
              'zh': I18N['zh-TW'],
              'en': I18N['en-US'],
              'en-US': I18N['en-US']
            })
          }
        } catch (e) {
          return () => {}
        }
      }, 'gemini-web: locale dictionaries')

      // 註冊設定主面板 (Settings 介面)
      ctx.effect(() => {
        try {
          return ctx.slots.inject('settings.section', () => {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'gemini-web-settings',
              order: 38,
              label: () => {
                const lang = resolveDshLanguage()
                return (I18N[lang] || I18N['zh-TW']).nav_label
              },
              locale: NS,
            }, () => h(SettingsPanel, { isModal: false }))
          })
        } catch (e) {
          console.warn('[dsh-gemini-web] slots.inject settings.section failed:', e)
          return () => {}
        }
      }, 'gemini-web: settings section')

      // 註冊外掛卡片配置面板 (Plugins 頁面卡片)
      ctx.effect(() => {
        try {
          return ctx.slots.inject('plugins.bundle.config', () => {
            return ctx.slots.register({
              name: 'plugins.bundle.config',
              key: PKG,
              locale: NS,
            }, (ownerProps) => {
              const lang = resolveDshLanguage()
              const title = (I18N[lang] || I18N['zh-TW']).nav_label
              return ownerProps?.view === 'summary' ? title : h(SettingsPanel, { isModal: false })
            })
          })
        } catch (e) {
          return () => {}
        }
      }, 'gemini-web: plugins config')
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = PKG
    exports.default = { apply, inject, name: PKG }
    return module.exports
  }
})
