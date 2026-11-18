/**
 * dsh-gemini-web browser client
 * Hand-written ModuleLoader bundle: 100% self-contained, no external runtime dependencies.
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

    // 1. 原創 Gemini 漸層風格樣式
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
        color: var(--dsw-alias-label-primary, inherit);
      }
      .gw-desc {
        color: var(--dsw-alias-label-secondary, inherit);
        opacity: 0.9;
        line-height: 1.5;
        font-size: 12px;
      }
      .gw-btn {
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        background: #3b82f6;
        color: #fff;
        border: none;
        transition: opacity 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .gw-btn:hover {
        opacity: 0.9;
      }
      .gw-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .gw-btn-secondary {
        background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.1));
        color: var(--dsw-alias-label-primary, inherit);
        border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
      }
      .gw-input, .gw-select {
        background: var(--dsw-specific-input-major, #1e222b);
        border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2));
        color: var(--dsw-alias-label-primary, #f1f5f9);
        padding: 5px 8px;
        border-radius: 6px;
        font-size: 12px;
        outline: none;
      }
      .gw-input:focus, .gw-select:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 1px #6366f1;
      }
      .gw-select option, .gw-select optgroup {
        background: #1e222b;
        color: #f1f5f9;
      }
      .gw-select optgroup {
        font-weight: bold;
        color: #94a3b8;
      }
      .gw-progress-bar {
        height: 6px;
        border-radius: 3px;
        background: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1));
        overflow: hidden;
        margin: 6px 0;
      }
      .gw-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #10b981, #3b82f6);
        border-radius: 3px;
      }
      .gw-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
      }
      .gw-badge-warn {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }
      .gw-badge-err {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      /* 白天/明亮模式自適應 (Light Mode Adaptive) */
      @media (prefers-color-scheme: light) {
        .gw-card {
          background: #ffffff;
          border-color: #e2e8f0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .gw-card:hover {
          border-color: #cbd5e1;
        }
        .gw-title {
          color: #0f172a;
        }
        .gw-desc {
          color: #334155;
          opacity: 1;
        }
        .gw-input, .gw-select {
          background: #ffffff;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .gw-select option, .gw-select optgroup {
          background: #ffffff;
          color: #0f172a;
        }
        .gw-select optgroup {
          color: #64748b;
        }
        .gw-btn-secondary {
          background: #f8fafc;
          color: #1e293b;
          border: 1px solid #cbd5e1;
        }
        .gw-progress-bar {
          background: #e2e8f0;
        }
      }

      /* DSH 淺色主題 Class / 屬性支援 */
      [data-theme="light"] .gw-card, .theme-light .gw-card, body.light-theme .gw-card {
        background: #ffffff !important;
        border-color: #e2e8f0 !important;
      }
      [data-theme="light"] .gw-title, .theme-light .gw-title, body.light-theme .gw-title {
        color: #0f172a !important;
      }
      [data-theme="light"] .gw-desc, .theme-light .gw-desc, body.light-theme .gw-desc {
        color: #334155 !important;
        opacity: 1 !important;
      }
      [data-theme="light"] .gw-input, [data-theme="light"] .gw-select,
      .theme-light .gw-input, .theme-light .gw-select,
      body.light-theme .gw-input, body.light-theme .gw-select {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        color: #0f172a !important;
      }
      [data-theme="light"] .gw-select option, [data-theme="light"] .gw-select optgroup,
      .theme-light .gw-select option, .theme-light .gw-select optgroup,
      body.light-theme .gw-select option, body.light-theme .gw-select optgroup {
        background: #ffffff !important;
        color: #0f172a !important;
      }
      [data-theme="light"] .gw-btn-secondary,
      .theme-light .gw-btn-secondary,
      body.light-theme .gw-btn-secondary {
        background: #f8fafc !important;
        color: #1e293b !important;
        border-color: #cbd5e1 !important;
      }
    `

    const API_BASE = (() => {
      try { return new URL('api/gemini-web', document.baseURI).pathname } catch { return '/api/gemini-web' }
    })()

    async function api(path, options) {
      const { timeout = 8000, body, ...fetchOptions } = options ?? {}
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

    // 2. 視覺化設定與控制主面板 (嵌入 DSH Settings)
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

      const syncModels = async () => {
        setSyncingModels(true)
        try {
          const m = await api('/models', { timeout: 15000 })
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
          const u = await api('/usage')
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
            setSaveNotice('✅ 設定已儲存生效！')
            loadData()
          }
        } catch (e) {
          setSaveNotice('❌ 儲存失敗: ' + e.message)
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
            setAlTestResult({ ok: true, message: '🎉 已向 Brave 側邊欄成功發送即時通知！請看 Brave 側邊欄' })
          } else {
            setAlTestResult({ ok: false, error: res?.error || 'AgentLimb 通道測試失敗' })
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
            body: { task: '請用繁體中文用一句話打招呼：Gemini Web Agent 運作正常！', model: config.defaultModel },
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
            setTestResult({ ok: false, error: res?.error || 'Agent 任務調度失敗' })
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
          h('div', { style: { fontWeight: 600, fontSize: 16 } }, '✨ Gemini 網頁端調度中心 (Agent 模式)'),
          isModal && h('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.7, color: 'inherit' }
          }, '✕')
        ]),

        // 登入狀態警告 (未登入時亮眼提示)
        isUnauthed && h('div', {
          className: 'gw-card',
          style: { background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.4)' }
        }, [
          h('div', { className: 'gw-title', style: { color: '#f59e0b' } }, '⚠️ Google 帳號尚未登入 / 狀態過期'),
          h('div', { className: 'gw-desc' }, '檢測到瀏覽器尚未登入 Google 或當前分頁被導向登入頁。請點擊下方按鈕登入後再使用：'),
          h('div', { style: { marginTop: 10 } }, [
            h('button', {
              className: 'gw-btn',
              style: { background: '#f59e0b', color: '#000' },
              onClick: () => openUrl('https://accounts.google.com')
            }, '🔑 一鍵打開瀏覽器 Google 登入')
          ])
        ]),

        // 卡片 1: 雙通道智慧連線面板 (Dual-Channel Smart Bridge)
        h('div', { className: 'gw-card', style: { borderColor: alConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(99, 102, 241, 0.3)' } }, [
          h('div', { className: 'gw-title', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
              h('span', { className: `gw-dot ${alConnected ? 'gw-dot-ok' : (cdpConnected ? 'gw-dot-warn' : 'gw-dot-err')}` }),
              h('span', null, '瀏覽器連線通道狀態：'),
            ]),
            h('span', {
              className: alConnected ? 'gw-badge' : (cdpConnected ? 'gw-badge-warn' : 'gw-badge-err'),
              style: alConnected ? { background: '#059669', color: '#fff' } : (cdpConnected ? { background: '#d97706', color: '#fff' } : {})
            }, alConnected ? '🟢 AgentLimb 優先 (免彈窗)' : (cdpConnected ? '🟡 CDP 模式 (備用)' : '🔴 未連線'))
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
            ? '🚀 當前生效優先路由：通道 A (AgentLimb) ⚡ 完全靜默・零 Allow 彈窗・CDP 備用通道完全休眠'
            : (cdpConnected ? `⚠️ 當前生效優先路由：通道 B (CDP ${status?.cdp?.port || config.port}) — 備用模式，每次連線需手動點擊瀏覽器 Allow 彈窗` : '❌ 目前雙通道皆未連線，請參考下方配置指引完成連線')),

          // 多實例衝突提示 (當檢測到多個 Chromium 開啟偵錯時)
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
            h('div', { style: { fontWeight: 600, marginBottom: 2 } }, '⚠️ 偵測到多個開啟遠端偵錯的瀏覽器實例：'),
            h('div', null, (status?.cdp?.instances || []).map((i) => `• ${i.name} (Port: ${i.port})`).join('  |  ')),
            h('div', { style: { opacity: 0.85, marginTop: 4 } }, '💡 建議關閉多餘的瀏覽器視窗以避免通訊衝突，或在下方「CDP 偵錯連接埠」指定您想使用的端口。')
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
                h('span', null, '通道 A: AgentLimb (推薦)')
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.8, lineHeight: 1.5 } }, [
                h('div', null, `狀態：${alConnected ? '已連線 (零彈窗/永久授權)' : '未在線'}`),
                h('div', null, `連接埠：127.0.0.1:${status?.agentlimb?.port || status?.dual?.agentlimb?.port || 8765}`),
                alConnected && h('div', null, `配置：v${status?.agentlimb?.version || status?.dual?.agentlimb?.version || '0.8.2'} (${status?.agentlimb?.activeProfile || status?.dual?.agentlimb?.activeProfile || 'Profile'})`),
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
                h('span', null, '通道 B: Chromium CDP (備用)')
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.8, lineHeight: 1.5 } }, [
                h('div', null, `狀態：${cdpConnected ? '已連線 (需點擊 Allow)' : (alConnected ? '已休眠 (零彈窗保護)' : '未連線')}`),
                h('div', null, `連接埠：127.0.0.1:${status?.cdp?.port || status?.dual?.cdp?.port || config.port}`),
                cdpConnected && h('div', null, `瀏覽器：${status?.cdp?.browserType || status?.dual?.cdp?.browserType || 'Brave'}`),
              ])
            ])
          ]),

          // 操作按鈕列
          h('div', { style: { marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
            h('button', { className: 'gw-btn', onClick: loadData, disabled: loading }, loading ? '探測中...' : '🔄 重新探測通道'),
            alConnected && h('button', {
              className: 'gw-btn',
              style: { background: '#059669' },
              onClick: runAlTest,
              disabled: alTestResult?.testing
            }, alTestResult?.testing ? '發送中...' : '⚡ 測試 AgentLimb (Say 側邊欄)'),
            h('button', {
              className: 'gw-btn',
              style: { background: '#4f46e5' },
              onClick: runAgentTaskTest,
              disabled: !isAnyConnected || testResult?.testing
            }, testResult?.testing ? 'Agent 執行中...' : '🤖 測試 Agent 跑任務'),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: clearCache }, '🧹 清除快取')
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
            alTestResult.testing && '⏳ 正在向 AgentLimb 側邊欄發送通知...',
            alTestResult.ok && alTestResult.message,
            alTestResult.error && `❌ 測試失敗：${alTestResult.error}`
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
            testResult.testing && '⏳ 正在透過 AgentLimb/CDP 調度 AI Studio 執行任務...',
            testResult.ok && h('div', null, [
              h('div', { style: { fontWeight: 600, color: '#818cf8', marginBottom: 2 } },
                `✅ 任務完成 (${testResult.channel.toUpperCase()} 通道 · 模型: ${testResult.model} · 耗時 ${testResult.duration}ms)${testResult.fellBack ? ' [塞車自動降級]' : ''}`),
              h('div', { style: { opacity: 0.9, whiteSpace: 'pre-wrap' } }, testResult.reply)
            ]),
            testResult.error && h('div', { style: { color: '#f87171' } }, `❌ 調度失敗：${testResult.error}`)
          ])
        ]),

        // 尚未連線時的配置與教學指引卡片
        !isAnyConnected && h('div', {
          className: 'gw-card',
          style: { background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(99, 102, 241, 0.3)' }
        }, [
          h('div', { className: 'gw-title', style: { color: '#818cf8', fontSize: 13 } }, '📖 瀏覽器連線配置指引（依需求二選一）'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 } }, [
            // 方案 A
            h('div', { style: { padding: '10px 12px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' } }, [
              h('div', { style: { fontWeight: 600, color: '#34d399', fontSize: 12, marginBottom: 6 } }, '🟢 方案 A（強烈推薦・100% 免彈窗）'),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.6 } }, [
                h('div', null, '1. 在常用 Chromium 瀏覽器（Brave/Chrome/Edge 等）安裝 AgentLimb 擴充。'),
                h('div', null, '2. 點擊擴充功能面板的「Pair」完成一次性本機配對。'),
                h('div', null, '3. 永久免彈窗、不改捷徑、重啟電腦直接可用！'),
                h('div', { style: { marginTop: 8 } }, [
                  h('button', {
                    className: 'gw-btn',
                    style: { padding: '3px 8px', fontSize: 10, background: '#059669' },
                    onClick: () => openUrl('https://github.com/hooosberg/AgentLimb')
                  }, '🔗 下載 AgentLimb 擴充套件')
                ])
              ])
            ]),
            // 方案 B
            h('div', { style: { padding: '10px 12px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' } }, [
              h('div', { style: { fontWeight: 600, color: '#fbbf24', fontSize: 12, marginBottom: 6 } }, '🟡 方案 B（免安裝擴充・本機內建偵錯）'),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.6 } }, [
                h('div', null, '1. 在現有 Chromium 瀏覽器網址列輸入：'),
                h('code', { style: { background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 3, display: 'inline-block', margin: '2px 0' } }, 'chrome://inspect/#remote-debugging'),
                h('div', null, '2. 勾選啟用偵錯開關（或捷徑啟動時加上 --remote-debugging-port=9222）。'),
                h('div', null, '3. 點擊上方「重新探測通道」即可自動連接。')
              ])
            ])
          ])
        ]),

        // 卡片 2: 即時額度大盤 (3 大站點額度完全獨立)
        h('div', { className: 'gw-card' }, [
          h('div', { className: 'gw-title', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            h('span', null, '📊 即時網頁端免費額度大盤'),
            h('span', { className: 'gw-badge' }, '3 大站點額度完全獨立・絕不扣款')
          ]),
          h('div', { className: 'gw-desc', style: { display: 'flex', flexDirection: 'column', gap: 10 } }, [
            // 站點 1: AI Studio
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } }, [
                h('span', { style: { fontWeight: 600, color: '#818cf8' } }, '🌐 Google AI Studio (aistudio.google.com)'),
                h('span', { className: 'gw-badge', style: { background: '#4f46e5', color: '#fff' } }, 'key_off 免費層級')
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.5 } },
                '• 免費無限輪詢層級：支援 1M Token 長輸出（Argon / Hydrogen / Flash），未掛載 API Key 時直接享受網頁免費無限額度，絕對不會扣除付費帳號額度！'
              )
            ]),

            // 站點 2: Gemini 官網
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 2 } }, [
                h('span', { style: { fontWeight: 600, color: '#34d399' } }, `📈 Gemini 官網 5小時滾動池 (${usage?.geminiPlan ? (usage.geminiPlan === 'PRO' ? 'PRO' : (usage.geminiPlan === 'FREE' ? '免費版' : usage.geminiPlan)) : '一般方案'})`),
                h('span', { style: { fontWeight: 600 } }, `${usage?.geminiUsedPct ?? 0}% 已使用`),
              ]),
              h('div', { className: 'gw-progress-bar' }, [
                h('div', { className: 'gw-progress-fill', style: { width: `${100 - (usage?.geminiUsedPct ?? 0)}%` } })
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.7 } }, `重置週期：${usage?.geminiResetTime || '即時更新'} (獨立對話額度)`),
            ]),

            // 站點 3: Flow
            h('div', { style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                h('span', { style: { fontWeight: 600, color: '#fbbf24' } }, '🎨 Google Flow (flow.google.com)'),
                h('span', { style: { fontWeight: 600, color: '#10b981' } }, `${usage?.flowCredits !== undefined && usage?.flowCredits !== null ? usage.flowCredits : 1050} 點 (生圖 0 點數)`),
              ]),
              h('div', { style: { fontSize: 11, opacity: 0.8, marginTop: 4 } },
                `獨立點數池：Nano Banana 2.1 享 2K 高清生圖 0 點數消耗；Omni/Veo 生視頻享獨立免費點數。${usage?.flowResetTime ? ` (重置時間：${usage.flowResetTime})` : ''}`
              )
            ])
          ])
        ]),

        // 卡片 2.5: 渠道自動路由與防扣款指南 (Routing & Safety Guide)
        h('div', { className: 'gw-card', style: { borderColor: 'rgba(16, 185, 129, 0.3)' } }, [
          h('div', { className: 'gw-title', style: { color: '#34d399' } }, '🧭 渠道自動路由與防扣款指南'),
          h('div', { className: 'gw-desc', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 } }, [
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#818cf8', marginBottom: 2 } }, '💬 文字對話 / 複雜程式碼'),
              h('div', { opacity: 0.8 }, '➔ 自動導向 AI Studio key_off 免費層級（長文本輸出）或 Gemini 網頁端。')
            ]),
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#10b981', marginBottom: 2 } }, '🎨 2K 高清生圖 (Nano 2.1)'),
              h('div', { opacity: 0.8 }, '➔ 自動導向 Google Flow 0 點數免費池 / AI Studio。')
            ]),
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#f59e0b', marginBottom: 2 } }, '🎬 視頻生成 (Omni 1.2 / Veo)'),
              h('div', { opacity: 0.8 }, '➔ 自動導向 Google Flow 視頻池 / AI Studio 專用模組。')
            ]),
            h('div', { style: { padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)' } }, [
              h('div', { style: { fontWeight: 600, color: '#ec4899', marginBottom: 2 } }, '🔒 付費模型防扣款鎖'),
              h('div', { opacity: 0.8 }, '➔ 強制過濾並鎖定 Paid 標記條目（如 Carbon），預設完全避開，保護錢包！')
            ]),
          ])
        ]),

        // 卡片 3: 【全自訂調度參數設定項 (Configurable Settings)】
        h('div', { className: 'gw-card', style: { borderColor: 'rgba(99, 102, 241, 0.4)' } }, [
          h('div', { className: 'gw-title', style: { color: '#818cf8' } }, '⚙️ Agent 調度與瀏覽器通道設定'),
          h('div', { className: 'gw-desc', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [

            // 設定 1: 通道模式 (Connection Mode)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('div', null, [
                h('div', { style: { fontWeight: 500 } }, '瀏覽器連線通道策略：'),
                h('div', { style: { fontSize: 11, opacity: 0.6 } }, 'auto 模式優先走 AgentLimb，成功則完全不碰 CDP')
              ]),
              h('select', {
                className: 'gw-select',
                style: { width: 170 },
                value: config.connectionMode || 'auto',
                onChange: (e) => setConfig({ ...config, connectionMode: e.target.value })
              }, [
                h('option', { value: 'auto' }, '🌟 自動 (AgentLimb 優先)'),
                h('option', { value: 'agentlimb' }, '⚡ 強制 AgentLimb (零彈窗)'),
                h('option', { value: 'cdp' }, '🛠️ 強制 CDP (9222 端口)'),
              ])
            ]),

            // 設定 2: 預設調度模型 (Default Model) - 分類並鎖定非對話模型
            (() => {
              const isMediaModel = (id = '', name = '') => {
                const s = (id + ' ' + name).toLowerCase()
                return s.includes('nano') || s.includes('banana') || s.includes('omni') || s.includes('veo') ||
                       s.includes('lyria') || s.includes('music') || s.includes('tts') || s.includes('transcribe') ||
                       s.includes('生圖') || s.includes('視頻') || s.includes('音樂') || s.includes('配音') || s.includes('轉寫')
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
                    h('span', null, 'Agent 預設首選模型：'),
                    h('button', {
                      className: 'gw-btn',
                      style: { padding: '2px 6px', fontSize: 10, background: '#4f46e5' },
                      onClick: syncModels,
                      disabled: syncingModels
                    }, syncingModels ? '同步中...' : '🔄 刷新網頁模型池')
                  ]),
                  h('div', { style: { fontSize: 11, opacity: 0.6 } },
                    availableModels.length > 0
                      ? `已分類 ${availableModels.length} 個模型（已鎖定多模態專用與付費項）`
                      : '已載入標準模型池（多模態專用模型已鎖定，由 AI 自動調用）')
                ]),
                h('select', {
                  className: 'gw-select',
                  style: { width: 220 },
                  value: config.defaultModel || 'gemini-3.5-flash-lite',
                  onChange: (e) => setConfig({ ...config, defaultModel: e.target.value })
                }, availableModels.length > 0 ? [
                  h('optgroup', { label: '💬 文字與推理對話池 (可選為聊天首選)' },
                    textGroup.map((m) =>
                      h('option', { key: m.id, value: m.id }, `${m.name} ${m.new ? '🌟' : ''}`)
                    )
                  ),
                  mediaGroup.length > 0 && h('optgroup', { label: '🔒 多模態專用池（非日常聊天・AI自動調用）' },
                    mediaGroup.map((m) =>
                      h('option', { key: m.id, value: m.id, disabled: true }, `🔒 ${m.name} [多模態專用]`)
                    )
                  ),
                  paidGroup.length > 0 && h('optgroup', { label: '🔒 付費模型池 (需綁付費Key・預設保護防扣款)' },
                    paidGroup.map((m) =>
                      h('option', { key: m.id, value: m.id, disabled: true }, `💰 ${m.name} [需付費Key]`)
                    )
                  ),
                ] : [
                  h('optgroup', { label: '💬 文字與推理對話池 (可選為聊天首選)' }, [
                    h('option', { key: 'fl', value: 'gemini-3.5-flash-lite' }, '⚡ 3.5 Flash Lite (極速/塞車率最低)'),
                    h('option', { key: 'f', value: 'gemini-3.8-flash' }, '🚀 3.8 Flash (高智慧/主力)'),
                    h('option', { key: 'h', value: 'gemini-4-hydrogen' }, '🧠 4 Hydrogen (1M長輸出/高階推理)'),
                    h('option', { key: 'a', value: 'gemini-4-argon' }, '🏗️ 4 Argon (深度架構規劃)'),
                  ]),
                  h('optgroup', { label: '🔒 多模態專用池（非日常聊天・AI自動調用）' }, [
                    h('option', { key: 'nano', value: 'gemini-nano-banana-2.1', disabled: true }, '🔒 Nano Banana 2.1 (生圖專用)'),
                    h('option', { key: 'omni', value: 'gemini-omni-1.2-flash', disabled: true }, '🔒 Gemini Omni 1.2 Flash (視頻專用)'),
                    h('option', { key: 'lyria', value: 'lyria-3.5', disabled: true }, '🔒 Lyria 3.5 (音樂專用)'),
                    h('option', { key: 'tts', value: 'gemini-3.8-flash-tts', disabled: true }, '🔒 3.8 Flash TTS (語音專用)'),
                  ]),
                  h('optgroup', { label: '🔒 付費模型池 (需綁付費Key・預設保護防扣款)' }, [
                    h('option', { key: 'carbon', value: 'gemini-4-carbon', disabled: true }, '💰 Gemini 4 Carbon [需付費Key]'),
                  ])
                ])
              ])
            })(),

            // 設定 3: 塞車階梯降級策略 (Fallback Mode)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('div', null, [
                h('div', { style: { fontWeight: 500 } }, '免費池塞車階梯降級切換：'),
                h('div', { style: { fontSize: 11, opacity: 0.6 } },
                  (config.fallbackMode === 'strict' || config.autoFallback === false)
                    ? '🛑 嚴格模式：嚴格保持所選模型，遇塞車立即中止並詢問用戶'
                    : '🌟 智慧階梯：依序嘗試 (Argon ➔ Hydrogen ➔ Flash ➔ Flash Lite)，全滿時詢問用戶')
              ]),
              h('select', {
                className: 'gw-select',
                style: { width: 185 },
                value: config.fallbackMode || (config.autoFallback !== false ? 'ladder' : 'strict'),
                onChange: (e) => setConfig({
                  ...config,
                  fallbackMode: e.target.value,
                  autoFallback: e.target.value === 'ladder'
                })
              }, [
                h('option', { value: 'ladder' }, '🌟 智慧階梯降級 (推薦)'),
                h('option', { value: 'strict' }, '🛑 嚴格模式 (不降級)'),
              ])
            ]),

            // 設定 4: 思考等級 (Thinking Level)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('span', null, '推理思考等級 (Thinking Level)：'),
              h('select', {
                className: 'gw-select',
                style: { width: 140 },
                value: config.thinkingLevel || 'high',
                onChange: (e) => setConfig({ ...config, thinkingLevel: e.target.value })
              }, [
                h('option', { value: 'high' }, 'High (推薦默認)'),
                h('option', { value: 'extra-high' }, 'Extra High (深度推導)'),
                h('option', { value: 'medium' }, 'Medium (折衷)'),
                h('option', { value: 'low' }, 'Low (低思考速回)'),
              ])
            ]),

            // 設定 5: 任務超時時間 (Timeout)
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              h('span', null, '單次任務最大超時限制 (秒)：'),
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
              h('span', null, 'CDP 偵錯連接埠 (僅 CDP 模式生效)：'),
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
              }, saving ? '儲存中...' : '💾 儲存並套用設定'),
              saveNotice && h('span', { style: { fontSize: 12, color: saveNotice.startsWith('✅') ? '#10b981' : '#ef4444' } }, saveNotice)
            ])
          ])
        ]),

        // 卡片 4: 快捷工作台
        h('div', { className: 'gw-card' }, [
          h('div', { className: 'gw-title' }, '🔗 官方工作台直達'),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 } }, [
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://aistudio.google.com/prompts/new_chat') }, '🌐 Google AI Studio'),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://flow.google.com') }, '🎨 Google Flow'),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://gemini.google.com/usage') }, '📈 Gemini 額度大盤'),
            h('button', { className: 'gw-btn gw-btn-secondary', onClick: () => openUrl('https://accounts.google.com') }, '🔑 Google 帳號中心')
          ])
        ]),

        // 卡片 5: 原作者架構原則與透明宣告
        h('div', { className: 'gw-card', style: { background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.05)' } }, [
          h('div', { className: 'gw-title', style: { fontSize: 12, opacity: 0.9 } }, '🛡️ 運行機制與自用原則聲明'),
          h('div', { className: 'gw-desc', style: { fontSize: 11, opacity: 0.7, lineHeight: 1.6 } }, [
            h('div', null, '• 🛡️ 不算反代，不導出 API，不抽 Cookie：純本機瀏覽器自動化 Agent，等同於讓 AI 替你打開本機已登入的 Chromium 瀏覽器（如 Brave / Chrome / Edge 等）。'),
            h('div', null, '• 🌐 官方真實渲染：所有請求皆透過官方真實網頁打字與接收結果，相對更穩，完全繞開本地 Token 與模型限制。'),
            h('div', null, '• ⚡ 頻率控制建議：日常自用建議保持合理調度頻率，避免極高頻並發刷網頁端；遇到高峰排隊塞車時，建議切換為 Flash Lite 備用。'),
            h('div', null, '• 🔒 100% 迴環安全：所有通訊限制於本機 127.0.0.1 迴環，零憑證外洩風險。')
          ])
        ])
      ])
    }

    const inject = ['slots']

    // 3. 插件注入點應用
    function apply(ctx) {
      // 注入自定義樣式
      if (typeof document !== 'undefined') {
        const styleEl = document.createElement('style')
        styleEl.id = 'dsh-gemini-web-styles'
        styleEl.textContent = STYLES
        document.head.appendChild(styleEl)
      }

      // 注意：已依要求移除頂部 HeaderBadge 膠囊 (Pill)，保持主介面純粹乾淨

      // 註冊設定主面板 (Settings 介面)
      ctx.effect(() => {
        try {
          return ctx.slots.inject('settings.section', () => {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'gemini-web-settings',
              order: 38,
              label: () => '✨ Gemini 網頁端 (Agent 調度中心)',
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
            }, (ownerProps) => ownerProps?.view === 'summary' ? 'Gemini 網頁端 (Agent 調度中心)' : h(SettingsPanel, { isModal: false }))
          })
        } catch (e) {
          return () => {}
        }
      }, 'gemini-web: plugins config')

      // 註冊外掛清單列摘要
      ctx.effect(() => {
        try {
          return ctx.slots.inject('plugins.row.config', () => {
            return ctx.slots.register({
              name: 'plugins.row.config',
              key: PKG,
              locale: NS,
            }, (ownerProps) => ownerProps?.view === 'summary' ? null : h(SettingsPanel, { isModal: false }))
          })
        } catch (e) {
          return () => {}
        }
      }, 'gemini-web: plugins row')
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = PKG
    return module.exports
  }
})
