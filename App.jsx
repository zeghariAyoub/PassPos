import { useState, useRef, useEffect, useCallback } from 'react'

// ─── System prompt factory ────────────────────────────────────────────────────
const buildSystem = ({ maxHints, hintsUsed, revealAnswer, hintType, difficulty }) => `
You are a warm, patient Socratic tutor. Your role is to guide students toward understanding — never to give direct answers.

Current session state:
- Hints given so far: ${hintsUsed} of ${maxHints} allowed
- Hint style: ${hintType === 'stepwise' ? 'break problems into smaller concrete steps' : 'ask probing Socratic questions that spark insight'}
- Difficulty: ${difficulty} (${difficulty === 'easy' ? 'simple language, lots of encouragement' : difficulty === 'hard' ? 'assume solid background, push deeper thinking' : 'balanced language and challenge'})
- Reveal answer when hints exhausted: ${revealAnswer ? 'YES' : 'NO'}

Rules:
1. NEVER give the direct answer unless hints are exhausted AND revealAnswer is YES.
2. Each hint must start with exactly "💡 Hint ${hintsUsed + 1}:" — this is parsed by the UI.
3. If ${hintsUsed} >= ${maxHints} and revealAnswer is NO: warmly tell the student they've used all hints, encourage them to try once more or ask their teacher.
4. If ${hintsUsed} >= ${maxHints} and revealAnswer is YES: provide the full answer with clear explanation.
5. Keep each response concise — 2 to 4 sentences. Students lose focus with walls of text.
6. Be warm and encouraging. Learning is hard. Celebrate effort.
7. If the student seems frustrated, acknowledge it before giving the hint.
`.trim()

// ─── API call ─────────────────────────────────────────────────────────────────
async function callClaude({ apiKey, messages, system }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system,
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }
  const data = await res.json()
  return data.content?.map(b => b.text || '').join('') || ''
}

// ─── Components ───────────────────────────────────────────────────────────────

function ApiKeyGate({ onSubmit }) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!key.trim().startsWith('sk-')) return setErr('Key should start with sk-ant-...')
    setLoading(true); setErr('')
    try {
      await callClaude({ apiKey: key.trim(), messages: [{ role: 'user', content: 'ping' }], system: 'Reply with only the word: pong' })
      onSubmit(key.trim())
    } catch (e) {
      setErr('Could not verify key: ' + e.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, animation: 'slideIn 0.4s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🦉</div>
          <h1 style={{ fontFamily: 'Lora, serif', fontSize: 32, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
            Socratic Tutor
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 15, lineHeight: 1.6 }}>
            An AI that guides students to answers —<br />never just hands them out.
          </p>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 32, boxShadow: '0 4px 24px var(--shadow)' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 8 }}>
            Anthropic API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="sk-ant-..."
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              border: `1.5px solid ${err ? 'var(--rust)' : 'var(--border)'}`,
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 14,
              background: 'var(--cream)', color: 'var(--ink)', outline: 'none',
              transition: 'border-color 0.2s', marginBottom: 6,
            }}
          />
          {err && <p style={{ color: 'var(--rust)', fontSize: 12, marginBottom: 12 }}>{err}</p>}
          <p style={{ color: 'var(--ink-faint)', fontSize: 11, marginBottom: 20 }}>
            Your key is never stored — it lives only in this browser session.
          </p>
          <button
            onClick={handleSubmit}
            disabled={loading || !key.trim()}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 10,
              background: loading || !key.trim() ? 'var(--border)' : 'var(--ink)',
              color: loading || !key.trim() ? 'var(--ink-faint)' : '#fff',
              border: 'none', fontSize: 15, fontWeight: 600, cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', letterSpacing: '0.02em',
            }}
          >
            {loading ? 'Verifying…' : 'Start Session →'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--ink-faint)', fontSize: 12 }}>
          Get a key at <span style={{ color: 'var(--rust)', fontFamily: 'IBM Plex Mono, monospace' }}>console.anthropic.com</span>
        </p>
      </div>
    </div>
  )
}

function HintDots({ used, max, exhausted, revealed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Hints</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: i < used
              ? (exhausted && !revealed ? 'var(--rust)' : 'var(--amber)')
              : 'var(--border)',
            transition: 'background 0.3s, transform 0.2s',
            transform: i === used - 1 ? 'scale(1.2)' : 'scale(1)',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>{used}/{max}</span>
      {exhausted && (
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 99,
          background: revealed ? 'var(--sage-soft)' : 'var(--rust-soft)',
          color: revealed ? 'var(--sage)' : 'var(--rust)',
        }}>
          {revealed ? 'Answer unlocked' : 'Max reached'}
        </span>
      )}
    </div>
  )
}

function Bubble({ msg, isNew }) {
  const isUser = msg.role === 'user'
  const isHint = msg.content?.includes('💡 Hint')
  const isAnswer = msg.content?.startsWith('📖')

  let bg = '#fff', border = '1px solid var(--border)', color = 'var(--ink-soft)'
  if (isUser) { bg = 'var(--ink)'; border = 'none'; color = '#fff' }
  else if (isHint) { bg = 'var(--amber-soft)'; border = '1px solid #E8C97A'; color = 'var(--ink-soft)' }
  else if (isAnswer) { bg = 'var(--sage-soft)'; border = '1px solid #8DC99E'; color = 'var(--ink-soft)' }

  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14, animation: isNew ? 'fadeUp 0.3s ease' : 'none',
    }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginRight: 10, marginTop: 2,
          background: 'var(--cream-dark)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>🦉</div>
      )}
      <div style={{
        maxWidth: '76%', padding: '11px 16px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: bg, border, color,
        fontSize: 14, lineHeight: 1.7, fontFamily: 'Outfit, sans-serif',
        boxShadow: isHint || isAnswer ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: 'var(--cream-dark)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
      }}>🦉</div>
      <div style={{ display: 'flex', gap: 5, padding: '12px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px' }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: 'var(--ink-faint)',
            animation: `blink 1.1s ease-in-out ${delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

function ConfigDrawer({ config, setConfig, onClose }) {
  const [local, setLocal] = useState(config)
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(26,22,18,0.4)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        width: 340, background: 'var(--cream)', borderLeft: '1px solid var(--border)',
        padding: 32, overflowY: 'auto', animation: 'slideIn 0.25s ease',
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Lora, serif', fontSize: 20, color: 'var(--ink)' }}>Configure Session</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-muted)' }}>✕</button>
        </div>

        <ConfigSection label={`Max Hints: ${local.maxHints}`}>
          <input type="range" min={1} max={8} value={local.maxHints} onChange={e => set('maxHints', +e.target.value)}
            style={{ width: '100%', accentColor: 'var(--rust)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
            <span>1 hint</span><span>8 hints</span>
          </div>
        </ConfigSection>

        <ConfigSection label="Reveal answer after max hints?">
          <SegmentedControl
            value={local.revealAnswer}
            options={[{ label: 'Never reveal', value: false }, { label: 'Reveal answer', value: true }]}
            onChange={v => set('revealAnswer', v)}
          />
        </ConfigSection>

        <ConfigSection label="Hint style">
          <SegmentedControl
            value={local.hintType}
            options={[{ label: 'Socratic', value: 'socratic' }, { label: 'Step-by-step', value: 'stepwise' }]}
            onChange={v => set('hintType', v)}
          />
        </ConfigSection>

        <ConfigSection label="Difficulty">
          <SegmentedControl
            value={local.difficulty}
            options={[{ label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]}
            onChange={v => set('difficulty', v)}
          />
        </ConfigSection>

        <button
          onClick={() => { setConfig(local); onClose() }}
          style={{
            padding: '13px 0', borderRadius: 10, background: 'var(--ink)', color: '#fff',
            border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 'auto',
          }}
        >Save Configuration</button>
      </div>
    </div>
  )
}

function ConfigSection({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>{label}</label>
      {children}
    </div>
  )
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onChange(opt.value)} style={{
          flex: 1, padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          border: `1.5px solid ${value === opt.value ? 'var(--ink)' : 'var(--border)'}`,
          background: value === opt.value ? 'var(--ink)' : 'transparent',
          color: value === opt.value ? '#fff' : 'var(--ink-muted)',
          transition: 'all 0.15s',
        }}>{opt.label}</button>
      ))}
    </div>
  )
}

// ─── Main chat view ───────────────────────────────────────────────────────────
function ChatView({ apiKey, onReset }) {
  const [config, setConfig] = useState({ maxHints: 4, revealAnswer: false, hintType: 'socratic', difficulty: 'medium' })
  const [hintsUsed, setHintsUsed] = useState(0)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your Socratic tutor 🦉 Tell me what you're working on — I'll guide you toward the answer rather than just giving it to you. What are you stuck on?" }
  ])
  const [newMsgIdx, setNewMsgIdx] = useState(new Set([0]))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const exhausted = hintsUsed >= config.maxHints

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError('')

    const userMsg = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setNewMsgIdx(new Set([nextMessages.length - 1]))
    setLoading(true)

    try {
      const apiMessages = nextMessages.map(m => ({ role: m.role, content: m.content }))
      const reply = await callClaude({
        apiKey,
        messages: apiMessages,
        system: buildSystem({ ...config, hintsUsed }),
      })

      const usedHint = reply.includes('💡 Hint')
      if (usedHint) setHintsUsed(h => Math.min(h + 1, config.maxHints))

      const withReply = [...nextMessages, { role: 'assistant', content: reply }]
      setMessages(withReply)
      setNewMsgIdx(new Set([withReply.length - 1]))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [input, loading, messages, apiKey, config, hintsUsed])

  const resetSession = () => {
    setMessages([{ role: 'assistant', content: "Fresh start! 🦉 What would you like to work through?" }])
    setHintsUsed(0)
    setNewMsgIdx(new Set([0]))
    setInput('')
    setError('')
  }

  const applyConfig = (c) => {
    setConfig(c)
    setHintsUsed(0)
    resetSession()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
      {showConfig && <ConfigDrawer config={config} setConfig={applyConfig} onClose={() => setShowConfig(false)} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🦉</span>
          <div>
            <span style={{ fontFamily: 'Lora, serif', fontWeight: 600, fontSize: 18, color: 'var(--ink)' }}>Socratic</span>
            <span style={{ color: 'var(--ink-faint)', fontSize: 12, marginLeft: 8, fontFamily: 'IBM Plex Mono, monospace' }}>tutor</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TopBtn onClick={resetSession}>↺ New session</TopBtn>
          <TopBtn onClick={() => setShowConfig(true)} accent>⚙ Configure</TopBtn>
          <TopBtn onClick={onReset}>Change key</TopBtn>
        </div>
      </div>

      {/* Hint meter */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <HintDots used={hintsUsed} max={config.maxHints} exhausted={exhausted} revealed={config.revealAnswer} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0 8px' }}>
        {messages.map((m, i) => <Bubble key={i} msg={m} isNew={newMsgIdx.has(i)} />)}
        {loading && <TypingIndicator />}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--rust-soft)', border: '1px solid #E8BFAF', color: 'var(--rust)', fontSize: 13, marginBottom: 12 }}>
            ⚠️ {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '12px 0 20px' }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14,
          padding: '10px 12px', boxShadow: '0 2px 12px var(--shadow)',
          transition: 'border-color 0.2s',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={exhausted && !config.revealAnswer ? "All hints used — try solving it now!" : "Ask a question or share what you're working on…"}
            rows={2}
            style={{
              flex: 1, border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'Outfit, sans-serif', fontSize: 14, color: 'var(--ink)',
              background: 'transparent', lineHeight: 1.6, caretColor: 'var(--rust)',
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
              background: loading || !input.trim() ? 'var(--cream-dark)' : 'var(--ink)',
              color: loading || !input.trim() ? 'var(--ink-faint)' : '#fff',
              fontSize: 16, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >→</button>
        </div>
        <p style={{ textAlign: 'center', marginTop: 8, color: 'var(--ink-faint)', fontSize: 11 }}>
          Enter to send · Shift+Enter for new line · <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>⚙ Configure</span> to set hint limits
        </p>
      </div>
    </div>
  )
}

function TopBtn({ onClick, accent, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
      border: `1px solid ${accent ? 'var(--ink)' : 'var(--border)'}`,
      background: accent ? 'var(--ink)' : 'transparent',
      color: accent ? '#fff' : 'var(--ink-muted)',
      transition: 'all 0.15s',
    }}>{children}</button>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('st_key') || '')

  const handleKey = (k) => {
    sessionStorage.setItem('st_key', k)
    setApiKey(k)
  }
  const handleReset = () => {
    sessionStorage.removeItem('st_key')
    setApiKey('')
  }

  return apiKey ? <ChatView apiKey={apiKey} onReset={handleReset} /> : <ApiKeyGate onSubmit={handleKey} />
}
