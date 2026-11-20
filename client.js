/**
 * dsh-gemini-web browser client
 * Hand-written ModuleLoader bundle: 100% self-contained, no external runtime dependencies.
 * Full multi-language support (zh-CN first, zh-TW, en-US) with dynamic DSH language auto-detection.
 */
window.__ModuleLoader__.load({
  id: 'dsh-gemini-web',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useState, useEffect, useRef } = React

    const NS = 'gemini-web'
    const PKG = 'dsh-gemini-web'

    // 1. 原創 Gemini 漸層風格樣式與白天/黑夜適配 (針對 DSH 564px 設定欄寬度全面優化)
    const STYLES = `
      .gw-root {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 0;
        padding: 0 2px 24px 2px;
        container-type: inline-size;
      }
      .gw-root *, .gw-root *::before, .gw-root *::after {
        box-sizing: border-box;
      }
      .gw-header-split {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }
      .gw-grid-2 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 10px;
        margin-top: 8px;
      }
      .gw-grid-4 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 8px;
        margin-top: 8px;
      }
      .gw-btn-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .gw-code {
        background: rgba(0, 0, 0, 0.35);
        padding: 3px 6px;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        word-break: break-all;
        overflow-wrap: anywhere;
        max-width: 100%;
        display: inline-block;
        user-select: all;
      }
      .gw-setting-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 14px;
        padding: 10px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
        flex-wrap: wrap;
      }
      .gw-setting-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }
      .gw-setting-info {
        flex: 1 1 240px;
        min-width: 0;
      }
      .gw-setting-ctrl {
        flex: 0 1 auto;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        min-width: 160px;
        max-width: 100%;
      }

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
        box-sizing: border-box;
        width: 100%;
        padding: 14px 16px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
        margin-bottom: 12px;
        font-size: 13px;
        transition: border-color 0.2s ease, background 0.2s ease;
        overflow: hidden;
        word-break: break-word;
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
        white-space: nowrap;
        flex-shrink: 0;
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
        .gw-setting-row {
          border-bottom-color: #e2e8f0 !important;
        }
        .gw-code {
          background: #f1f5f9 !important;
          color: #0f172a !important;
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
      [data-theme="light"] .gw-setting-row, .theme-light .gw-setting-row, body.light-theme .gw-setting-row {
        border-bottom-color: #e2e8f0 !important;
      }
      [data-theme="light"] .gw-code, .theme-light .gw-code, body.light-theme .gw-code {
        background: #f1f5f9 !important;
        color: #0f172a !important;
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

    // 2. 多語言字典 (i18n: zh-CN, zh-TW, en-US)
    const I18N = {
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
        al_success_msg: '🎉 已向浏览器侧边栏成功发送即时通知！请看侧边栏',
        al_failed_prefix: '❌ 测试失败：',
        agent_executing_msg: '⏳ 正在通过 AgentLimb/CDP 调度 AI Studio 执行任务...',
        agent_success_title: '✅ 任务完成 ({channel} 通道 · 模型: {model} · 耗时 {duration}ms){fallback}',
        agent_fallback_tag: ' [塞车自动降级]',
        agent_failed_prefix: '❌ 调度失败：',
        guide_title: '📖 浏览器连接配置指引（依需求二选一）',
        guide_a_title: '🟢 方案 A（强烈推荐・100% 免弹窗）',
        guide_a_1: '1. 在常用 Chromium 浏览器（Chrome / Edge / Brave 等）安装 AgentLimb 扩展。',
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
        flow_offline_badge: '🔴 未连通',
        flow_credits_unit: '可用点数：{credits} 点（🎨 生图免扣点・完全免费）',
        flow_desc_p1: '• 点数用途：免费享有独立点数，专门用于 Veo / Omni 视频生成（每部视频仅消耗少量点数）。',
        flow_desc_p2: '• 生图特权：使用 Nano Banana 2.1 生成 2K 高清图片时“完全不扣除点数”（单张消耗 0 点，等同无限免费生图）！',
        flow_reset_label: '重置时间：',
        flow_desc_p3_daily: '• 额度重置：每日自动刷新（{text}）。',
        flow_desc_p3_monthly: '• 额度重置：每月自动补满（{text}）。',
        flow_desc_p3_generic: '• 额度重置：依方案自动刷新（{text}）。',
        flow_desc_p3_empty: '• 额度重置：依官方方案自动刷新。',
        probe_err_title: '浏览器通道探测失败 / 通信中断',
        probe_err_tip: '💡 提示：请确认 Chrome / Edge / Brave 浏览器是否已启动，且 AgentLimb 扩展功能处于连线状态，或 CDP 调试端口已开启。',
        probe_err_no_browser: '未检测到任何正在运行的浏览器实例 (请开启 Chrome / Edge / Brave 浏览器)',
        probe_err_failed: '额度探测失败，浏览器可能未响应或已关闭',
        probe_err_timeout: '探测超时 (15s)：浏览器未能在时限内响应，请检查浏览器是否卡住或已关闭',
        retry_btn: '🔄 重新探测',
        quota_offline_warning: '⚠️ 浏览器当前未连线：下方用量显示为离线预设值。请启动浏览器并点击重新探测。',
        settings_section_title: '⚙️ Agent 调度与浏览器通道设置',
        dispatch_mode_title: 'Agent 调度执行模式：',
        dispatch_mode_ask_first_desc: '🛡️ 先问后用（原作者推荐）：发包前呈现渠道与参数提案，待确认后执行；支持「例外直通」（指定直接发包直接跑）',
        dispatch_mode_fast_track_desc: '⚡ 极速直通：收到任务后第一步直接调用 gemini_web_agent 委派执行，跳过前置确认卡',
        dispatch_mode_ask_first: '🛡️ 先问后用模式 (原作者推荐・安全控费)',
        dispatch_mode_fast_track: '⚡ 极速直通模式 (Fast-Track・免确认)',
        lang_label: '界面语言 (Language)：',
        lang_desc: '默认自动跟随 DSH 系统语言，亦可在此手动指定',
        lang_auto: '🌐 自动 (跟随 DSH 系统)',
        lang_zhcn: '简体中文',
        lang_zhtw: '繁體中文',
        lang_en: 'English',
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
        group_paid: '🔒 付费模型池 (付费层级・默认保护防扣款)',
        tag_media: '[多模态专用]',
        tag_paid: '[付费层级]',
        thinking_policy_title: '思考阈值与降级策略：',
        thinking_policy_adaptive_desc: '🌟 智能自适应：复杂架构/算法任务自动给予 150s 思考 / 300s 总时；思维链心跳防杀；遇塞车阶梯备援',
        thinking_policy_custom_desc: '⏱️ 自定义超时：严格遵循下方设定的任务超时秒数；思维链心跳防杀；遇塞车阶梯备援',
        thinking_policy_strict_desc: '🛑 严格模式：坚守所选模型绝不降级；遇超时或塞车立即中止并提醒，绝不偷偷切换轻量模型',
        thinking_policy_adaptive_opt: '🌟 智能自适应模式 (推荐)',
        thinking_policy_custom_opt: '⏱️ 自定义超时模式',
        thinking_policy_strict_opt: '🛑 严格模式 (绝不降级)',
        fallback_ladder_title: '降级阶梯序列 (Fallback Ladder)：',
        fallback_ladder_badge: '1~5 级备援',
        fallback_ladder_desc: '🌟 遇排队拥塞时按此顺序自动降级尝试。可自由配置备选顺序，支持选用 gemini.google.com 兜底。',
        fallback_ladder_add_btn: '+ 添加备援',
        fallback_ladder_reset_btn: '恢复默认',
        ladder_tier_label: '第 {level} 级备援',
        ladder_move_up: '上移优先级 (升至前一级备援)',
        ladder_move_down: '下移优先级 (降至后一级备援)',
        ladder_remove_tip: '移除此级备援',
        thinking_level_title: '推理思考等级 (Thinking Level)：',
        thinking_high: 'High (推荐默认)',
        thinking_extra_high: 'Extra High (🔒 已上锁 - 免费池防 403)',
        thinking_medium: 'Medium (折衷)',
        thinking_low: 'Low (低思考速回)',
        timeout_title: '任务超时限制：',
        timeout_active_badge: '⏱️ 自定义模式生效中',
        timeout_adaptive_badge: '🌟 智能自适应基准',
        timeout_strict_badge: '🛑 严格模式基准',
        timeout_custom_hint: '⏱️ 自定义模式：思考与总任务超时严格遵循此设定值，不进行自适应放宽。',
        timeout_adaptive_hint: '🌟 基准为 180 秒；遇复杂架构/算法 (C++、红黑树等) 自动放宽至 300 秒。',
        timeout_strict_hint: '🛑 坚守所选模型，深度思考上限 150 秒，超时直接中止提醒。',
        sec_unit: '秒',
        auto_saved_tip: '✅ 已自动永久保存',
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
        safety_item1: '• 🛡️ 不算反代，不导出 API，不抽 Cookie：纯本机浏览器自动化 Agent，等同于让 AI 替你打开本机已登录的 Chromium 浏览器（如 Chrome / Edge / Brave 等）。',
        safety_item2: '• 🌐 官方真实渲染：所有请求皆通过官方真实网页打字与接收结果，相对更稳，完全绕开本地 Token 与模型限制。',
        safety_item3: '• ⚡ 频率控制建议：日常自用建议保持合理调度频率，避免极高频并发刷网页端；遇到高峰排队塞车时，建议切换为 Flash Lite 备用。',
        safety_item4: '• 🔒 100% 回环安全：所有通信限制于本机 127.0.0.1 回环，零凭证外泄风险。',
        nav_label: '✨ Gemini 网页端 (Agent 调度中心)'
      },
      'en-US': {
        title: '✨ Gemini Web Orchestration (Agent Mode)',
        unauthed_title: '⚠️ Google Account Not Logged In / Session Expired',
        unauthed_desc: 'Browser has not logged in to Google or active tab was redirected to login page. Please log in before proceeding:',
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
        al_success_msg: '🎉 Successfully sent live notification to browser sidebar! Check sidebar.',
        al_failed_prefix: '❌ Test Failed: ',
        agent_executing_msg: '⏳ Orchestrating AI Studio task via AgentLimb/CDP...',
        agent_success_title: '✅ Task Completed ({channel} channel · Model: {model} · Elapsed: {duration}ms){fallback}',
        agent_fallback_tag: ' [Congestion Auto-Fallback]',
        agent_failed_prefix: '❌ Orchestration Failed: ',
        guide_title: '📖 Browser Connection Guide (Choose Either)',
        guide_a_title: '🟢 Option A (Highly Recommended · 100% Zero-Popup)',
        guide_a_1: '1. Install AgentLimb extension in your Chromium browser (Chrome / Edge / Brave).',
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
        flow_offline_badge: '🔴 Disconnected',
        flow_credits_unit: 'Available: {credits} Credits (🎨 Images: 100% Free / 0 Cost)',
        flow_desc_p1: '• Credit Purpose: Free dedicated credits for Veo / Omni video generation (costs few credits per video).',
        flow_desc_p2: '• Free Image Gen: 2K HD image generation via Nano Banana 2.1 costs 0 credits (completely free, unlimited generation)!',
        flow_reset_label: 'Reset: ',
        flow_desc_p3_daily: '• Balance Reset: Daily auto-refresh ({text}).',
        flow_desc_p3_monthly: '• Balance Reset: Monthly auto-refresh ({text}).',
        flow_desc_p3_generic: '• Balance Reset: Replenished according to plan ({text}).',
        flow_desc_p3_empty: '• Balance Reset: Automatically refreshed according to plan.',
        probe_err_title: 'Browser Channel Probe Failed / Communication Lost',
        probe_err_tip: '💡 Tip: Please ensure Chrome / Edge / Brave is running, and AgentLimb extension is paired/connected, or CDP debugging port is active.',
        probe_err_no_browser: 'No running browser instance detected (please launch Chrome / Edge / Brave)',
        probe_err_failed: 'Quota probe failed; browser might not be responding or is closed',
        probe_err_timeout: 'Probe timeout (15s): Browser did not respond in time; please verify browser status',
        retry_btn: '🔄 Retry Probe',
        quota_offline_warning: '⚠️ Browser currently offline: Quotas below show default offline values. Launch browser and retry.',
        settings_section_title: '⚙️ Agent Orchestration & Channel Settings',
        dispatch_mode_title: 'Agent Dispatch Mode:',
        dispatch_mode_ask_first_desc: '🛡️ Ask-Before-Dispatch (Author Recommended): Presents proposal before execution; bypasses on explicit direct request',
        dispatch_mode_fast_track_desc: '⚡ Fast-Track: Directly calls gemini_web_agent upon task arrival without confirmation card',
        dispatch_mode_ask_first: '🛡️ Ask-Before-Dispatch (Author Recommended)',
        dispatch_mode_fast_track: '⚡ Fast-Track Mode (Direct Execution)',
        lang_label: 'Interface Language (Language):',
        lang_desc: 'Default follows DSH system language, or choose manually here',
        lang_auto: '🌐 Auto (Follow DSH System)',
        lang_zhcn: 'Simplified Chinese',
        lang_zhtw: 'Traditional Chinese',
        lang_en: 'English',
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
        group_paid: '🔒 Paid Models Pool (Paid Tier · Guarded)',
        tag_media: '[Multimodal Only]',
        tag_paid: '[Paid Tier]',
        thinking_policy_title: 'Thinking Threshold & Fallback Policy:',
        thinking_policy_adaptive_desc: '🌟 Smart Adaptive: Auto-allocates 150s thinking / 300s total for complex architecture/algorithms; liveness heartbeat; ladder fallback on congestion',
        thinking_policy_custom_desc: '⏱️ Custom Timeout: Strictly follows the timeout seconds specified below; liveness heartbeat; ladder fallback on congestion',
        thinking_policy_strict_desc: '🛑 Strict Mode: Strictly maintains requested model; aborts immediately on timeout or congestion without falling back to lightweight models',
        thinking_policy_adaptive_opt: '🌟 Smart Adaptive Mode (Recommended)',
        thinking_policy_custom_opt: '⏱️ Custom Timeout Mode',
        thinking_policy_strict_opt: '🛑 Strict Mode (No Fallback)',
        fallback_ladder_title: 'Fallback Ladder Sequence:',
        fallback_ladder_badge: '1~5 Tiers',
        fallback_ladder_desc: '🌟 Sequentially falls back on congestion. Reorder or customize freely, choose gemini.google.com as safety net.',
        fallback_ladder_add_btn: '+ Add Tier',
        fallback_ladder_reset_btn: 'Reset',
        ladder_tier_label: 'Tier #{level}',
        ladder_move_up: 'Move up priority',
        ladder_move_down: 'Move down priority',
        ladder_remove_tip: 'Remove tier',
        thinking_level_title: 'Reasoning Thinking Level:',
        thinking_high: 'High (Recommended Default)',
        thinking_extra_high: 'Extra High (🔒 Locked - Free Tier Safe)',
        thinking_medium: 'Medium (Balanced)',
        thinking_low: 'Low (Fast Response)',
        timeout_title: 'Task Timeout Limit:',
        timeout_active_badge: '⏱️ Custom Mode Active',
        timeout_adaptive_badge: '🌟 Adaptive Base',
        timeout_strict_badge: '🛑 Strict Base',
        timeout_custom_hint: '⏱️ Custom mode: Thinking and total task timeout will strictly obey this value without scaling.',
        timeout_adaptive_hint: '🌟 Base is 180s; automatically relaxed to 300s for complex architecture/algorithms.',
        timeout_strict_hint: '🛑 Maintains target model; thinking cap 150s, aborts immediately on timeout.',
        sec_unit: 'sec',
        auto_saved_tip: '✅ Auto-saved permanently',
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
        safety_item1: '• 🛡️ Not a proxy, no API export, no Cookie extraction: Pure local browser automation agent, equivalent to letting AI use your logged-in Chromium browser (Chrome / Edge / Brave, etc.).',
        safety_item2: '• 🌐 Authentic official rendering: All requests are typed and rendered directly on official web pages, bypassing token limits.',
        safety_item3: '• ⚡ Rate limit recommendations: Keep a reasonable request frequency for daily personal use; switch to Flash Lite during peak congestion.',
        safety_item4: '• 🔒 100% Loopback Security: All communications are restricted to 127.0.0.1 loopback with zero credential exposure.',
        nav_label: '✨ Gemini Web (Agent Orchestration Center)'
      }
    }

    function resolveDshLanguage() {
      try {
        const l = ((typeof document !== 'undefined' && document.documentElement?.lang) || (typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase()
        if (l.startsWith('en')) return 'en-US'
      } catch {}
      return 'zh-CN'
    }

    // 3. 視覺化設定與控制主面板 (嵌入 DSH Settings)
    function SettingsPanel({ isModal, onClose }) {
      const [status, setStatus] = useState(null)
      const [usage, setUsage] = useState(null)

      const DEFAULT_LOCAL_CONFIG = {
        connectionMode: 'auto',
        defaultModel: 'gemini-3.5-flash-lite',
        autoFallback: true,
        fallbackMode: 'ladder',
        fallbackLadder: [
          'gemini-4-hydrogen',
          'gemini-3.8-flash',
          'gemini-3.5-flash-lite',
          'gemini.google.com',
        ],
        thinkingPolicy: 'adaptive',
        thinkingLevel: 'high',
        timeoutSec: 180,
        port: 9222,
        preferredBrowser: 'auto',
        flowCount: 1,
      }

      // 优先从 localStorage 读取已保存设定，首帧即载入用户选择，杜绝刷新倒退回 flash lite
      const [config, setConfig] = useState(() => {
        try {
          const cached = localStorage.getItem('dsh_gemini_web_config')
          if (cached) {
            const parsed = JSON.parse(cached)
            return {
              ...DEFAULT_LOCAL_CONFIG,
              ...parsed,
              fallbackLadder: Array.isArray(parsed.fallbackLadder) && parsed.fallbackLadder.length > 0
                ? parsed.fallbackLadder
                : DEFAULT_LOCAL_CONFIG.fallbackLadder
            }
          }
        } catch {}
        return DEFAULT_LOCAL_CONFIG
      })

      const [loading, setLoading] = useState(false)
      const [saving, setSaving] = useState(false)
      const [testResult, setTestResult] = useState(null)
      const [alTestResult, setAlTestResult] = useState(null)
      const [saveNotice, setSaveNotice] = useState('')
      const [availableModels, setAvailableModels] = useState([])
      const [syncingModels, setSyncingModels] = useState(false)
      const [probeError, setProbeError] = useState(null)

      // 即時設定寫死器：更新 React State 同步寫入 localStorage 並背景 POST 後端永久保存
      const updateConfig = (patch) => {
        setConfig((prev) => {
          const next = { ...prev, ...patch }
          try {
            localStorage.setItem('dsh_gemini_web_config', JSON.stringify(next))
          } catch {}
          api('/config', { method: 'POST', body: next })
            .then((res) => {
              if (res?.ok) {
                setSaveNotice(t('auto_saved_tip'))
                setTimeout(() => setSaveNotice(''), 2500)
              }
            })
            .catch(() => {})
          return next
        })
      }

      // 語言狀態管理 (支援 auto, zh-CN, zh-TW, en-US)
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
      const dict = I18N[activeLang] || I18N['zh-CN']
      const t = (k, params) => {
        let text = dict[k] ?? I18N['zh-CN'][k] ?? k
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
        setProbeError(null)
        setAlTestResult(null)
        try {
          const s = await api('/status', { timeout: 8000 })
          setStatus(s)
          let localCfg = {}
          try {
            const cached = localStorage.getItem('dsh_gemini_web_config')
            if (cached) localCfg = JSON.parse(cached)
          } catch {}
          if (s?.config) {
            // 用户本地主动选取的配置优先于后端未设定之默认值，杜绝刷新回落
            const merged = { ...s.config, ...localCfg }
            if (!Array.isArray(merged.fallbackLadder) || merged.fallbackLadder.length === 0) {
              merged.fallbackLadder = DEFAULT_LOCAL_CONFIG.fallbackLadder
            }
            setConfig(merged)
            if (JSON.stringify(merged) !== JSON.stringify(s.config)) {
              api('/config', { method: 'POST', body: merged }).catch(() => {})
            }
          } else if (Object.keys(localCfg).length > 0) {
            setConfig(prev => ({ ...prev, ...localCfg }))
          }

          // 通道状态校验：若 AgentLimb 与 CDP 皆未就绪（浏览器未开或死掉），快速报错，绝不阻塞盲等
          const hasLiveChannel = Boolean(s?.agentlimb?.ready || s?.cdp?.connected || s?.dual?.agentlimb?.ready || s?.dual?.cdp?.connected)
          if (!hasLiveChannel) {
            const detail = s?.agentlimb?.error || s?.cdp?.error || s?.dual?.agentlimb?.error || s?.dual?.cdp?.error || t('probe_err_no_browser')
            setProbeError(detail)
            setUsage({ ok: false, error: detail })
            return
          }

          const u = await api('/usage?force=1', { timeout: 16000 })
          setUsage(u)
          if (!u?.ok) {
            setProbeError(u?.error || t('probe_err_failed'))
          }

          const m = await api('/models', { timeout: 10000 })
          if (m?.ok && Array.isArray(m.models)) {
            setAvailableModels(m.models)
          }
        } catch (e) {
          console.error(e)
          const errText = e.name === 'AbortError'
            ? t('probe_err_timeout')
            : (e.message || String(e))
          setProbeError(errText)
        } finally {
          setLoading(false)
        }
      }

      const saveSettings = async () => {
        setSaving(true)
        setSaveNotice('')
        try {
          try {
            localStorage.setItem('dsh_gemini_web_config', JSON.stringify(config))
          } catch {}
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

      const rootRef = useRef(null)
      const [containerWidth, setContainerWidth] = useState(560)

      useEffect(() => {
        if (!rootRef.current) return
        const updateWidth = () => {
          if (rootRef.current) {
            const w = rootRef.current.getBoundingClientRect().width
            if (w > 0) setContainerWidth(w)
          }
        }
        updateWidth()
        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
              if (entry.contentRect.width > 0) {
                setContainerWidth(entry.contentRect.width)
              }
            }
          })
          ro.observe(rootRef.current)
          return () => ro.disconnect()
        }
      }, [])

      const alConnected = Boolean(status?.agentlimb?.ready || status?.dual?.agentlimb?.ready)
      const cdpConnected = Boolean(status?.cdp?.connected || status?.dual?.cdp?.connected)
      const isAnyConnected = alConnected || cdpConnected
      const activeChannel = status?.activeChannel || (alConnected ? 'agentlimb' : (cdpConnected ? 'cdp' : 'none'))
      const isUnauthed = usage?.status === 'unauthenticated' || (!usage?.geminiPlan && isAnyConnected && usage?.plan === null)

      // 模型筛选函数与分类
      const isMediaModel = (id = '', name = '') => {
        const s = (id + ' ' + name).toLowerCase()
        return s.includes('nano') || s.includes('banana') || s.includes('omni') || s.includes('veo') ||
               s.includes('lyria') || s.includes('music') || s.includes('tts') || s.includes('transcribe') ||
               s.includes('生图') || s.includes('视频') || s.includes('音乐') || s.includes('配音') || s.includes('转写')
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

      const selectableLadderModels = textGroup.length > 0 ? textGroup.map(m => ({ id: m.id, name: m.name })) : [
        { id: 'gemini-4-argon', name: 'Gemini 4 Argon' },
        { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen' },
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
        { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
      ]
      if (!selectableLadderModels.some(m => m.id === 'gemini.google.com')) {
        selectableLadderModels.push({ id: 'gemini.google.com', name: 'gemini.google.com' })
      }

      return h('div', {
        ref: rootRef,
        className: 'gw-root',
        style: {
          maxHeight: isModal ? '72vh' : 'none',
          overflowY: 'auto'
        }
      }, [
        // 標題欄
        h('div', { className: 'gw-header-split', style: { marginBottom: 14 } }, [
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
            h('span', { style: { fontWeight: 600, fontSize: 16 } }, t('title')),
            h('span', {
              style: {
                fontSize: 11,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontWeight: 500,
              }
            }, 'v0.2.1'),
          ]),
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

        // 探測異常或瀏覽器斷線報錯機制 (Probe Error Banner)
        probeError && h('div', {
          className: 'gw-card',
          style: {
            background: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.45)',
            marginBottom: 10
          }
        }, [
          h('div', { className: 'gw-title', style: { color: '#f87171', display: 'flex', alignItems: 'center', gap: 6 } }, [
            h('span', null, '❌'),
            h('span', null, t('probe_err_title'))
          ]),
          h('div', { className: 'gw-desc', style: { color: '#fca5a5', lineHeight: 1.6 } }, probeError),
          h('div', { style: { fontSize: 11, opacity: 0.85, marginTop: 4, color: '#fecaca' } }, t('probe_err_tip')),
          h('div', { style: { marginTop: 10, display: 'flex', gap: 8 } }, [
            h('button', {
              className: 'gw-btn',
              style: { background: '#ef4444', color: '#fff' },
              onClick: loadData,
              disabled: loading
            }, loading ? t('probing') : t('retry_btn')),
            h('button', {
              className: 'gw-btn gw-btn-secondary',
              onClick: () => openUrl('https://accounts.google.com')
            }, t('unauthed_btn'))
          ])
        ]),

        // 卡片 1: 雙通道智慧連線面板 (Dual-Channel Smart Bridge)
        h('div', { className: 'gw-card', style: { borderColor: alConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(99, 102, 241, 0.3)' } }, [
          h('div', { className: 'gw-title gw-header-split' }, [
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
          h('div', { className: 'gw-grid-2' }, [
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
                cdpConnected && h('div', null, `${t('browser_prefix')}${status?.cdp?.browserType || status?.dual?.cdp?.browserType || 'Chrome'}`),
              ])
            ]),
          ]),

          // 操作按鈕列
          h('div', { className: 'gw-btn-row', style: { marginTop: 12 } }, [
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
          h('div', { className: 'gw-grid-2' }, [
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
                h('code', { className: 'gw-code', style: { margin: '4px 0' } }, 'chrome://inspect/#remote-debugging'),
                h('div', null, t('guide_b_2')),
                h('div', null, t('guide_b_3'))
              ])
            ]),
          ])
        ]),

        // 卡片 2: 即時額度大盤 (3 大站點額度完全獨立)
        h('div', { className: 'gw-card' }, [
          h('div', { className: 'gw-title gw-header-split' }, [
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
            !isAnyConnected && h('div', {
              style: {
                padding: '6px 10px',
                borderRadius: 5,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: 11,
                lineHeight: 1.5,
              }
            }, t('quota_offline_warning')),
            // 站點 1: AI Studio
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' } }, [
              h('div', { className: 'gw-header-split', style: { marginBottom: 4 } }, [
                h('span', { style: { fontWeight: 600, color: '#818cf8', whiteSpace: 'nowrap' } }, t('aistudio_title')),
                h('span', { className: 'gw-badge', style: { background: '#4f46e5', color: '#fff' } }, t('aistudio_badge'))
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.5 } }, t('aistudio_desc'))
            ]),

            // 站點 2: Gemini 官網
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' } }, [
              h('div', { className: 'gw-header-split', style: { marginBottom: 2 } }, [
                h('span', { style: { fontWeight: 600, color: '#34d399', whiteSpace: 'nowrap' } },
                  t('gemini_title', {
                    plan: usage?.geminiPlan
                      ? (usage.geminiPlan === 'PRO' ? t('gemini_plan_pro') : (usage.geminiPlan === 'FREE' ? t('gemini_plan_free') : usage.geminiPlan))
                      : t('gemini_plan_default')
                  })),
                h('span', { style: { fontWeight: 600, whiteSpace: 'nowrap' } }, t('gemini_used_pct', { pct: usage?.geminiUsedPct ?? 0 })),
              ]),
              h('div', { className: 'gw-progress-bar' }, [
                h('div', { className: 'gw-progress-fill', style: { width: `${100 - (usage?.geminiUsedPct ?? 0)}%` } })
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.7 } }, t('gemini_reset', { time: usage?.geminiResetTime || '即時更新' })),
            ]),

            // 站點 3: Flow (分行優化：行 1 標題+狀態，行 2 獨立點數與免扣點特權)
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' } }, [
              // 行 1: 標題與連通狀態徽章 (左右分開，永不擠壓換行)
              h('div', { className: 'gw-header-split', style: { marginBottom: 6 } }, [
                h('span', { style: { fontWeight: 600, color: '#fbbf24', whiteSpace: 'nowrap' } }, t('flow_title')),
                h('span', {
                  className: 'gw-badge',
                  style: (usage?.flowResetTime || (usage?.flowCredits !== undefined && usage?.flowCredits !== null))
                    ? { background: '#059669', color: '#fff' }
                    : (isAnyConnected ? { background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' } : { background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' })
                }, (usage?.flowResetTime || (usage?.flowCredits !== undefined && usage?.flowCredits !== null))
                  ? t('flow_connected_badge')
                  : (isAnyConnected ? t('flow_pending_badge') : t('flow_offline_badge')))
              ]),
              // 行 2: 獨立一行的可用點數與免扣點特權標籤 (單獨佔一行，空間充裕絕不截斷)
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 9px',
                  borderRadius: 5,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.22)',
                  marginBottom: 8
                }
              }, [
                h('span', { style: { fontWeight: 600, color: '#10b981', fontSize: 12, lineHeight: 1.4, whiteSpace: 'nowrap' } },
                  t('flow_credits_unit', { credits: usage?.flowCredits !== undefined && usage?.flowCredits !== null ? usage.flowCredits : 50 }))
              ]),
              // 行 3: 額度用途與重置時間詳細說明
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.6 } }, [
                h('div', null, t('flow_desc_p1')),
                h('div', { style: { color: '#10b981', fontWeight: 500 } }, t('flow_desc_p2')),
                h('div', { style: { opacity: 0.8 } }, (() => {
                  const resetText = usage?.flowResetTime
                  const period = usage?.flowResetPeriod
                  if (resetText) {
                    const hasPrompt = /refresh|resets?|将于|將於|时间|時間|提示/i.test(resetText)
                    const label = hasPrompt ? resetText : `${t('flow_reset_label')}${resetText}`
                    if (period === 'daily') {
                      return t('flow_desc_p3_daily', { text: label })
                    }
                    if (period === 'monthly') {
                      return t('flow_desc_p3_monthly', { text: label })
                    }
                    return t('flow_desc_p3_generic', { text: label })
                  }
                  return t('flow_desc_p3_empty')
                })())
              ])
            ]),
          ])
        ]),

        // 卡片 3: 【全自訂調度參數設定項 (Configurable Settings)】
        h('div', { className: 'gw-card', style: { borderColor: 'rgba(99, 102, 241, 0.4)' } }, [
          h('div', { className: 'gw-title', style: { color: '#818cf8' } }, t('settings_section_title')),
          h('div', { className: 'gw-desc', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [

            // 設定 0: 介面語言選擇 (Language Selection: 簡體中文排第一位，無國旗)
            h('div', { className: 'gw-setting-row' }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500 } }, t('lang_label')),
                h('div', { style: { fontSize: 11, opacity: 0.6 } }, t('lang_desc'))
              ]),
              h('div', { className: 'gw-setting-ctrl' }, [
                h('select', {
                  className: 'gw-select',
                  style: { minWidth: 160 },
                  value: langChoice,
                  onChange: (e) => {
                    const val = e.target.value
                    setLangChoice(val)
                    try { localStorage.setItem('dsh_gemini_web_lang', val) } catch {}
                  }
                }, [
                  h('option', { value: 'auto' }, `${t('lang_auto')} [${activeLang}]`),
                  h('option', { value: 'zh-CN' }, t('lang_zhcn')),
                  h('option', { value: 'en-US' }, t('lang_en')),
                ])
              ])
            ]),

            // 設定 1: 通道模式 (Connection Mode)
            h('div', { className: 'gw-setting-row' }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500 } }, t('conn_strategy_title')),
                h('div', { style: { fontSize: 11, opacity: 0.6 } }, t('conn_strategy_desc'))
              ]),
              h('div', { className: 'gw-setting-ctrl' }, [
                h('select', {
                  className: 'gw-select',
                  style: { minWidth: 160 },
                  value: config.connectionMode || 'auto',
                  onChange: (e) => updateConfig({ connectionMode: e.target.value })
                }, [
                  h('option', { value: 'auto' }, t('conn_auto')),
                  h('option', { value: 'agentlimb' }, t('conn_al')),
                  h('option', { value: 'cdp' }, t('conn_cdp')),
                ])
              ])
            ]),

            // 设定 2: 预设调度模型 (Default Model) - 即选即写死永久保存
            h('div', { className: 'gw-setting-row' }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } }, [
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
              h('div', { className: 'gw-setting-ctrl' }, [
                h('select', {
                  className: 'gw-select',
                  style: { width: '100%', minWidth: 170, maxWidth: 220 },
                  value: config.defaultModel || 'gemini-3.5-flash-lite',
                  onChange: (e) => updateConfig({ defaultModel: e.target.value })
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
            ]),

            // 設定 3: 思考閾值與降級策略 (Thinking Policy)
            h('div', { className: 'gw-setting-row' }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500 } }, t('thinking_policy_title')),
                h('div', { style: { fontSize: 11, opacity: 0.6 } },
                  (config.thinkingPolicy === 'strict' || config.fallbackMode === 'strict')
                    ? t('thinking_policy_strict_desc')
                    : (config.thinkingPolicy === 'custom'
                        ? t('thinking_policy_custom_desc')
                        : t('thinking_policy_adaptive_desc')))
              ]),
              h('div', { className: 'gw-setting-ctrl' }, [
                h('select', {
                  className: 'gw-select',
                  style: { minWidth: 160 },
                  value: config.thinkingPolicy || (config.fallbackMode === 'strict' ? 'strict' : 'adaptive'),
                  onChange: (e) => {
                    const policy = e.target.value;
                    updateConfig({
                      thinkingPolicy: policy,
                      fallbackMode: policy === 'strict' ? 'strict' : 'ladder',
                      autoFallback: policy !== 'strict'
                    });
                  }
                }, [
                  h('option', { value: 'adaptive' }, t('thinking_policy_adaptive_opt')),
                  h('option', { value: 'custom' }, t('thinking_policy_custom_opt')),
                  h('option', { value: 'strict' }, t('thinking_policy_strict_opt')),
                ])
              ])
            ]),

            // 設定 3.1: 任務超時時間調整框（僅在自定義超時模式時顯式展開，其餘智慧與嚴格模式隱藏以防困惑）
            config.thinkingPolicy === 'custom' ? h('div', {
              className: 'gw-setting-row',
              style: {
                background: 'rgba(99, 102, 241, 0.08)',
                borderLeft: '3px solid #6366f1',
                paddingLeft: '12px',
                borderRadius: '4px',
                marginTop: '-4px',
                marginBottom: '4px'
              }
            }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' } }, [
                  h('span', null, t('timeout_title')),
                  h('span', { style: { fontSize: 10, background: '#6366f1', color: '#fff', padding: '1px 6px', borderRadius: 4 } }, t('timeout_active_badge'))
                ]),
                h('div', { style: { fontSize: 11, opacity: 0.6 } }, t('timeout_custom_hint'))
              ]),
              h('div', { className: 'gw-setting-ctrl', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                h('input', {
                  type: 'number',
                  className: 'gw-input',
                  style: { width: 85, borderColor: '#6366f1' },
                  value: config.timeoutSec || 180,
                  onChange: (e) => updateConfig({ timeoutSec: parseInt(e.target.value, 10) || 180 })
                }),
                h('span', { style: { fontSize: 12, opacity: 0.7 } }, t('sec_unit'))
              ])
            ]) : null,

            // 设定 3.2: 降级阶梯序列 (Fallback Ladder) — 自适应与自定义超时模式皆启用展开 (严格模式绝不降级自动隐藏)
            (config.thinkingPolicy !== 'strict') ? h('div', {
              className: 'gw-setting-row',
              style: {
                background: 'rgba(99, 102, 241, 0.08)',
                borderLeft: '3px solid #6366f1',
                padding: '12px 14px',
                borderRadius: '6px',
                marginTop: '-4px',
                marginBottom: '6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '10px'
              }
            }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } }, [
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                  h('span', { style: { fontWeight: 500, fontSize: 13 } }, t('fallback_ladder_title')),
                  h('span', {
                    style: {
                      fontSize: 10,
                      background: '#6366f1',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontWeight: 600
                    }
                  }, `${(config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder).length} / 5`)
                ]),
                h('div', { style: { display: 'flex', gap: '6px' } }, [
                  (config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder).length < 5 && h('button', {
                    className: 'gw-btn',
                    style: { padding: '2px 8px', fontSize: 11, background: '#10b981', color: '#fff' },
                    onClick: () => {
                      const current = config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder
                      if (current.length < 5) {
                        const candidate = selectableLadderModels.find(m => !current.includes(m.id))?.id || 'gemini.google.com'
                        updateConfig({ fallbackLadder: [...current, candidate] })
                      }
                    }
                  }, t('fallback_ladder_add_btn')),
                  h('button', {
                    className: 'gw-btn gw-btn-secondary',
                    style: { padding: '2px 8px', fontSize: 11 },
                    onClick: () => {
                      updateConfig({ fallbackLadder: [...DEFAULT_LOCAL_CONFIG.fallbackLadder] })
                    }
                  }, t('fallback_ladder_reset_btn')),
                ])
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.65, lineHeight: 1.4 } }, t('fallback_ladder_desc')),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' } },
                (config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder).map((modelId, index, arr) => {
                  return h('div', {
                    key: index,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      background: 'rgba(0, 0, 0, 0.12)',
                      padding: '5px 10px',
                      borderRadius: '5px',
                    }
                  }, [
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12 } }, [
                      h('span', { style: { opacity: 0.5, fontWeight: 700, minWidth: 24 } }, `#${index + 1}`),
                      h('span', { style: { fontSize: 11, color: '#818cf8', fontWeight: 500 } },
                        t('ladder_tier_label', { level: index + 1 })
                      )
                    ]),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                      h('select', {
                        className: 'gw-select',
                        style: { minWidth: 155, maxWidth: 195, fontSize: 12, padding: '3px 6px' },
                        value: modelId,
                        onChange: (e) => {
                          const newLadder = [...(config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder)]
                          newLadder[index] = e.target.value
                          updateConfig({ fallbackLadder: newLadder })
                        }
                      }, selectableLadderModels.map(m =>
                        h('option', { key: m.id, value: m.id }, m.name)
                      )),
                      // 上移优先级按钮 ↑
                      h('button', {
                        className: 'gw-btn gw-btn-secondary',
                        style: {
                          padding: '2px 6px',
                          fontSize: 12,
                          lineHeight: '16px',
                          minWidth: 24,
                          opacity: index === 0 ? 0.3 : 1,
                          cursor: index === 0 ? 'not-allowed' : 'pointer'
                        },
                        disabled: index === 0,
                        title: t('ladder_move_up'),
                        onClick: () => {
                          if (index > 0) {
                            const newLadder = [...(config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder)]
                            const temp = newLadder[index - 1]
                            newLadder[index - 1] = newLadder[index]
                            newLadder[index] = temp
                            updateConfig({ fallbackLadder: newLadder })
                          }
                        }
                      }, '↑'),
                      // 下移优先级按钮 ↓
                      h('button', {
                        className: 'gw-btn gw-btn-secondary',
                        style: {
                          padding: '2px 6px',
                          fontSize: 12,
                          lineHeight: '16px',
                          minWidth: 24,
                          opacity: index === arr.length - 1 ? 0.3 : 1,
                          cursor: index === arr.length - 1 ? 'not-allowed' : 'pointer'
                        },
                        disabled: index === arr.length - 1,
                        title: t('ladder_move_down'),
                        onClick: () => {
                          if (index < arr.length - 1) {
                            const newLadder = [...(config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder)]
                            const temp = newLadder[index + 1]
                            newLadder[index + 1] = newLadder[index]
                            newLadder[index] = temp
                            updateConfig({ fallbackLadder: newLadder })
                          }
                        }
                      }, '↓'),
                      // 移除按钮 ✕
                      h('button', {
                        className: 'gw-btn',
                        style: {
                          padding: '2px 6px',
                          fontSize: 12,
                          lineHeight: '16px',
                          minWidth: 24,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          cursor: arr.length <= 1 ? 'not-allowed' : 'pointer',
                          opacity: arr.length <= 1 ? 0.3 : 1
                        },
                        disabled: arr.length <= 1,
                        title: t('ladder_remove_tip'),
                        onClick: () => {
                          if (arr.length > 1) {
                            const newLadder = (config.fallbackLadder || DEFAULT_LOCAL_CONFIG.fallbackLadder).filter((_, i) => i !== index)
                            updateConfig({ fallbackLadder: newLadder })
                          }
                        }
                      }, '✕')
                    ])
                  ])
                })
              )
            ]) : null,

            // 設定 4: 思考等級 (Thinking Level)
            h('div', { className: 'gw-setting-row' }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500 } }, t('thinking_level_title'))
              ]),
              h('div', { className: 'gw-setting-ctrl' }, [
                h('select', {
                  className: 'gw-select',
                  style: { minWidth: 160 },
                  value: config.thinkingLevel || 'high',
                  onChange: (e) => updateConfig({ thinkingLevel: e.target.value })
                }, [
                  h('option', { value: 'high' }, t('thinking_high')),
                  h('option', { value: 'medium' }, t('thinking_medium')),
                  h('option', { value: 'low' }, t('thinking_low')),
                ])
              ])
            ]),

            // 設定 5: CDP 端口 (CDP Port)
            h('div', { className: 'gw-setting-row' }, [
              h('div', { className: 'gw-setting-info' }, [
                h('div', { style: { fontWeight: 500 } }, t('cdp_port_title'))
              ]),
              h('div', { className: 'gw-setting-ctrl' }, [
                h('input', {
                  type: 'number',
                  className: 'gw-input',
                  style: { width: 90 },
                  value: config.port || 9222,
                  onChange: (e) => updateConfig({ port: parseInt(e.target.value, 10) || 9222 })
                })
              ])
            ]),

            // 儲存按鈕
            h('div', { className: 'gw-btn-row', style: { marginTop: 14 } }, [
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
          h('div', { className: 'gw-btn-row', style: { marginTop: 8 } }, [
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://aistudio.google.com/prompts/new_chat') }, t('link_aistudio')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://flow.google.com') }, t('link_flow')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://gemini.google.com/usage') }, t('link_gemini')),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://accounts.google.com') }, t('link_accounts'))
          ])
        ]),

        // 卡片 5: 原作者架構原則與透明宣告 (順序優化為 Chrome / Edge / Brave 等)
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
              'zh-CN': I18N['zh-CN'],
              'zh-TW': I18N['zh-CN'],
              'zh': I18N['zh-CN'],
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
                return (I18N[lang] || I18N['zh-CN']).nav_label
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
              const title = (I18N[lang] || I18N['zh-CN']).nav_label
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
