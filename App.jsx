import { useState, useRef, useEffect, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const TEACHER_CODE = import.meta.env.VITE_TEACHER_CODE || 'teacher123'
const PARENT_CODE = import.meta.env.VITE_PARENT_CODE || 'parent123'

async function callBackend({ messages, config, hintsUsed }) {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, config, hintsUsed }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Server error ${res.status}`) }
  return (await res.json()).reply
}

async function callAgent({ message, history }) {
  const res = await fetch(`${BACKEND_URL}/api/agent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `Server error ${res.status}`) }
  return res.json()
}

async function uploadDoc(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export default function App() {
  const path = window.location.pathname
  if (path === '/teacher') return <TeacherGate />
  if (path === '/parent') return <ParentGate />
  return <StudentChat />
}

function PasswordGate({ role, correctCode, children }) {
  const [code, setCode] = useState('')
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(`${role}_auth`) === 'true')
  const [error, setError] = useState('')
  const isTeacher = role === 'teacher'

  const check = () => {
    if (code === correctCode) { sessionStorage.setItem(`${role}_auth`, 'true'); setUnlocked(true) }
    else { setError('Incorrect code. Try again.'); setCode('') }
  }

  if (unlocked) return children

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isTeacher ? '#0F1117' : '#F7F3EC' }}>
      <div style={{ width: 380, animation: 'slideIn 0.4s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{isTeacher ? '👩‍🏫' : '👨‍👩‍👧'}</div>
          <h1 style={{ fontFamily: 'Lora, serif', fontSize: 28, color: isTeacher ? '#fff' : '#1A1612', marginBottom: 8 }}>{isTeacher ? 'Teacher Dashboard' : 'Parent Portal'}</h1>
          <p style={{ color: isTeacher ? '#6B7280' : '#7A6F67', fontSize: 14 }}>Enter your access code to continue</p>
        </div>
        <div style={{ background: isTeacher ? '#1C2030' : '#fff', border: `1px solid ${isTeacher ? '#252A3A' : '#DDD5CA'}`, borderRadius: 16, padding: 28 }}>
          <input type="password" value={code} onChange={e => { setCode(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && check()} placeholder="Enter access code"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, marginBottom: 8, border: `1.5px solid ${error ? '#F76F6F' : isTeacher ? '#252A3A' : '#DDD5CA'}`, background: isTeacher ? '#0F1117' : '#F7F3EC', color: isTeacher ? '#fff' : '#1A1612', fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, outline: 'none' }} />
          {error && <p style={{ color: '#F76F6F', fontSize: 12, marginBottom: 10 }}>{error}</p>}
          <button onClick={check} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: isTeacher ? '#4F8EF7' : '#1A1612', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Enter →</button>
        </div>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: isTeacher ? '#3D4460' : '#B8AFA6' }}>
          Students: <a href="/" style={{ color: isTeacher ? '#4F8EF7' : '#C4501A', textDecoration: 'none' }}>go to chat →</a>
        </p>
      </div>
    </div>
  )
}

function TeacherGate() { return <PasswordGate role="teacher" correctCode={TEACHER_CODE}><TeacherDashboard /></PasswordGate> }
function ParentGate() { return <PasswordGate role="parent" correctCode={PARENT_CODE}><ParentDashboard /></PasswordGate> }

// ─── Teacher Dashboard ────────────────────────────────────────────────────────
function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState('agent')
  const [config, setConfig] = useState({ maxHints: 4, revealAnswer: false, hintType: 'socratic', difficulty: 'medium' })
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  // Agent state
  const [agentMessages, setAgentMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your teaching assistant 🤖 I can help you upload course materials, check student stats, and send instructions to students. What would you like to do?" }
  ])
  const [agentInput, setAgentInput] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState('')
  const agentBottomRef = useRef()

  useEffect(() => { agentBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [agentMessages, agentLoading])

  const sendAgent = async () => {
    const text = agentInput.trim()
    if (!text || agentLoading) return
    setAgentInput(''); setAgentError('')
    const userMsg = { role: 'user', content: text }
    const next = [...agentMessages, userMsg]
    setAgentMessages(next)
    setAgentLoading(true)
    try {
      const history = next.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      const { reply, toolsUsed } = await callAgent({ message: text, history })
      const withBadge = toolsUsed?.length ? `${reply}\n\n*🔧 Actions taken: ${toolsUsed.join(', ')}*` : reply
      setAgentMessages(prev => [...prev, { role: 'assistant', content: withBadge }])
    } catch (e) { setAgentError(e.message) }
    finally { setAgentLoading(false) }
  }

  const saveConfig = () => {
    localStorage.setItem('passpos_config', JSON.stringify(config))
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true); setUploadResult(null); setUploadError('')
    try { setUploadResult(await uploadDoc(file)) }
    catch (e) { setUploadError(e.message) }
    finally { setUploading(false) }
  }

  const tabs = [
    { id: 'agent', label: '🤖 AI Assistant' },
    { id: 'config', label: '⚙️ Configuration' },
    { id: 'docs', label: '📄 Documents' },
    { id: 'stats', label: '📊 Analytics' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0F1117', fontFamily: 'Outfit, sans-serif', color: '#E8EAF0' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1C2030', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🦉</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 20, fontWeight: 600 }}>PassPos</span>
          <span style={{ color: '#3D4460', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>teacher dashboard</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #252A3A', color: '#7A8099', fontSize: 12, textDecoration: 'none' }}>← Student View</a>
          <a href="/parent" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #252A3A', color: '#7A8099', fontSize: 12, textDecoration: 'none' }}>Parent Portal →</a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #1C2030', padding: '0 32px', display: 'flex', gap: 4 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            color: activeTab === tab.id ? '#4F8EF7' : '#7A8099',
            borderBottom: `2px solid ${activeTab === tab.id ? '#4F8EF7' : 'transparent'}`,
            transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: 32 }}>

        {/* Agent Tab */}
        {activeTab === 'agent' && (
          <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #252A3A' }}>
              <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 4 }}>🤖 Teacher Agent</h2>
              <p style={{ color: '#7A8099', fontSize: 13 }}>Talk to your AI assistant in plain English — it can upload docs, check stats, and message students</p>
            </div>

            {/* Suggestions */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #1A1F2E', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                'How many documents are in the knowledge base?',
                'Send a reminder to students about tomorrow\'s quiz',
                'What stats do we have so far?',
              ].map(s => (
                <button key={s} onClick={() => setAgentInput(s)} style={{
                  padding: '6px 12px', borderRadius: 20, border: '1px solid #252A3A',
                  background: 'transparent', color: '#7A8099', fontSize: 11, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>{s}</button>
              ))}
            </div>

            {/* Messages */}
            <div style={{ height: 360, overflowY: 'auto', padding: '20px 24px' }}>
              {agentMessages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  {m.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1E2E4A', border: '1px solid #4F8EF7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🤖</div>
                  )}
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: m.role === 'user' ? '#4F8EF7' : '#151820',
                    border: m.role === 'user' ? 'none' : '1px solid #252A3A',
                    color: m.role === 'user' ? '#fff' : '#E8EAF0', fontSize: 13, lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>{m.content}</div>
                </div>
              ))}
              {agentLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1E2E4A', border: '1px solid #4F8EF7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🤖</div>
                  <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: '#151820', border: '1px solid #252A3A', borderRadius: '14px 14px 14px 4px' }}>
                    {[0, 0.18, 0.36].map((d, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F8EF7', animation: `blink 1.1s ease-in-out ${d}s infinite` }} />)}
                  </div>
                </div>
              )}
              {agentError && <div style={{ padding: 10, borderRadius: 8, background: '#2E1A1A', color: '#F76F6F', fontSize: 12 }}>⚠️ {agentError}</div>}
              <div ref={agentBottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid #252A3A', display: 'flex', gap: 10 }}>
              <input value={agentInput} onChange={e => setAgentInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendAgent()}
                placeholder="e.g. Upload my notes, check stats, send message to students..."
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #252A3A', background: '#151820', color: '#E8EAF0', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none' }} />
              <button onClick={sendAgent} disabled={agentLoading || !agentInput.trim()} style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: agentLoading || !agentInput.trim() ? '#252A3A' : '#4F8EF7',
                color: agentLoading || !agentInput.trim() ? '#3D4460' : '#fff',
                fontSize: 13, fontWeight: 600, cursor: agentLoading || !agentInput.trim() ? 'not-allowed' : 'pointer',
              }}>Send →</button>
            </div>
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28, maxWidth: 480 }}>
            <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 6 }}>⚙️ Hint Configuration</h2>
            <p style={{ color: '#7A8099', fontSize: 13, marginBottom: 24 }}>Controls how the AI tutors your students</p>

            <TLabel>Max Hints: <span style={{ color: '#4F8EF7' }}>{config.maxHints}</span></TLabel>
            <input type="range" min={1} max={8} value={config.maxHints} onChange={e => setConfig(p => ({ ...p, maxHints: +e.target.value }))} style={{ width: '100%', accentColor: '#4F8EF7', marginBottom: 20 }} />

            <TLabel>Reveal answer after max hints?</TLabel>
            <TToggle value={config.revealAnswer} options={[{ label: 'Never reveal', value: false }, { label: 'Reveal answer', value: true }]} onChange={v => setConfig(p => ({ ...p, revealAnswer: v }))} />

            <TLabel style={{ marginTop: 16 }}>Hint Style</TLabel>
            <TToggle value={config.hintType} options={[{ label: 'Socratic', value: 'socratic' }, { label: 'Step-by-step', value: 'stepwise' }]} onChange={v => setConfig(p => ({ ...p, hintType: v }))} />

            <TLabel style={{ marginTop: 16 }}>Difficulty</TLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {['easy', 'medium', 'hard'].map(d => (
                <button key={d} onClick={() => setConfig(p => ({ ...p, difficulty: d }))} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${config.difficulty === d ? '#4F8EF7' : '#252A3A'}`, background: config.difficulty === d ? '#1E2E4A' : 'transparent', color: config.difficulty === d ? '#4F8EF7' : '#7A8099', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{d}</button>
              ))}
            </div>

            <button onClick={saveConfig} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: saved ? '#3DD68C' : '#4F8EF7', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.3s' }}>{saved ? '✓ Saved!' : 'Save Configuration'}</button>
          </div>
        )}

        {/* Docs Tab */}
        {activeTab === 'docs' && (
          <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28, maxWidth: 480 }}>
            <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 6 }}>📄 Knowledge Base</h2>
            <p style={{ color: '#7A8099', fontSize: 13, marginBottom: 24 }}>Upload course materials for RAG-powered hints</p>

            <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? '#4F8EF7' : '#252A3A'}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#1E2E4A' : 'transparent', transition: 'all 0.2s', marginBottom: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
              <p style={{ color: '#7A8099', fontSize: 14 }}>Drag & drop a .txt file here</p>
              <p style={{ color: '#3D4460', fontSize: 12, marginTop: 4 }}>or click to browse</p>
              <input ref={fileRef} type="file" accept=".txt,.md" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
            {uploading && <div style={{ padding: 12, borderRadius: 8, background: '#1E2E4A', color: '#4F8EF7', fontSize: 13, textAlign: 'center' }}>⏳ Processing...</div>}
            {uploadResult && <div style={{ padding: 12, borderRadius: 8, background: '#1A2E25', color: '#3DD68C', fontSize: 13 }}>✅ Uploaded! {uploadResult.chunks} knowledge chunks created.</div>}
            {uploadError && <div style={{ padding: 12, borderRadius: 8, background: '#2E1A1A', color: '#F76F6F', fontSize: 13 }}>⚠️ {uploadError}</div>}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
            <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 6 }}>📊 Analytics</h2>
            <p style={{ color: '#7A8099', fontSize: 13, marginBottom: 24 }}>Connect Mixpanel to unlock live student analytics</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {[
                { label: 'Active Students', value: '—', icon: '👩‍🎓' },
                { label: 'Sessions Today', value: '—', icon: '💬' },
                { label: 'Avg Hints Used', value: '—', icon: '💡' },
                { label: 'Docs in KB', value: '—', icon: '📄' },
              ].map(stat => (
                <div key={stat.label} style={{ background: '#151820', border: '1px solid #252A3A', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: '#4F8EF7' }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: '#7A8099', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: '#151820', border: '1px solid #252A3A' }}>
              <p style={{ color: '#7A8099', fontSize: 12, lineHeight: 1.6 }}>
                💡 <strong style={{ color: '#E8EAF0' }}>Next step:</strong> Add Mixpanel tracking to see real-time student sessions, hint usage patterns, and struggling topics.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TLabel({ children, style }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A8099', marginBottom: 8, ...style }}>{children}</div>
}
function TToggle({ value, options, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onChange(opt.value)} style={{ flex: 1, padding: '9px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${value === opt.value ? '#4F8EF7' : '#252A3A'}`, background: value === opt.value ? '#1E2E4A' : 'transparent', color: value === opt.value ? '#4F8EF7' : '#7A8099', transition: 'all 0.15s' }}>{opt.label}</button>
      ))}
    </div>
  )
}

// ─── Parent Dashboard ─────────────────────────────────────────────────────────
function ParentDashboard() {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F3EC', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ borderBottom: '1px solid #DDD5CA', padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🦉</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 20, fontWeight: 600, color: '#1A1612' }}>PassPos</span>
          <span style={{ color: '#B8AFA6', fontSize: 12, marginLeft: 6, fontFamily: 'IBM Plex Mono, monospace' }}>parent portal</span>
        </div>
        <a href="/" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #DDD5CA', color: '#7A6F67', fontSize: 12, textDecoration: 'none' }}>← Student Chat</a>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
        <div style={{ background: '#fff', border: '1px solid #DDD5CA', borderRadius: 16, padding: 32, textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h2 style={{ fontFamily: 'Lora, serif', fontSize: 22, color: '#1A1612', marginBottom: 8 }}>Your Child's Progress</h2>
          <p style={{ color: '#7A6F67', fontSize: 14, lineHeight: 1.6 }}>Full analytics coming soon! Once Mixpanel is connected, you'll see session history, hint usage, topics struggled with, and weekly progress reports here.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[{ label: 'Sessions This Week', value: '—', icon: '💬', color: '#C4501A' }, { label: 'Avg Hints Per Session', value: '—', icon: '💡', color: '#B07D1A' }, { label: 'Topics Explored', value: '—', icon: '📚', color: '#3A6B4A' }].map(stat => (
            <div key={stat.label} style={{ background: '#fff', border: '1px solid #DDD5CA', borderRadius: 12, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: '#B8AFA6', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Student Chat ─────────────────────────────────────────────────────────────
function HintDots({ used, max, exhausted, revealed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Hints</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < used ? (exhausted && !revealed ? 'var(--rust)' : 'var(--amber)') : 'var(--border)', transition: 'background 0.3s, transform 0.2s', transform: i === used - 1 ? 'scale(1.2)' : 'scale(1)' }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>{used}/{max}</span>
      {exhausted && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99, background: revealed ? 'var(--sage-soft)' : 'var(--rust-soft)', color: revealed ? 'var(--sage)' : 'var(--rust)' }}>{revealed ? 'Answer unlocked' : 'Max reached'}</span>}
    </div>
  )
}

function Bubble({ msg, isNew }) {
  const isUser = msg.role === 'user'
  const isHint = msg.content?.includes('💡 Hint')
  let bg = '#fff', border = '1px solid var(--border)', color = 'var(--ink-soft)'
  if (isUser) { bg = 'var(--ink)'; border = 'none'; color = '#fff' }
  else if (isHint) { bg = 'var(--amber-soft)'; border = '1px solid #E8C97A'; color = 'var(--ink-soft)' }
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 14, animation: isNew ? 'fadeUp 0.3s ease' : 'none' }}>
      {!isUser && <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginRight: 10, marginTop: 2, background: 'var(--cream-dark)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🦉</div>}
      <div style={{ maxWidth: '76%', padding: '11px 16px', borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: bg, border, color, fontSize: 14, lineHeight: 1.7 }}>{msg.content}</div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'var(--cream-dark)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🦉</div>
      <div style={{ display: 'flex', gap: 5, padding: '12px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px' }}>
        {[0, 0.18, 0.36].map((d, i) => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink-faint)', animation: `blink 1.1s ease-in-out ${d}s infinite` }} />)}
      </div>
    </div>
  )
}

function StudentChat() {
  const savedConfig = JSON.parse(localStorage.getItem('passpos_config') || 'null')
  const [config] = useState(savedConfig || { maxHints: 4, revealAnswer: false, hintType: 'socratic', difficulty: 'medium' })
  const [hintsUsed, setHintsUsed] = useState(0)
  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hi! I'm your Socratic tutor 🦉 Tell me what you're working on — I'll guide you toward the answer rather than just giving it to you. What are you stuck on?" }])
  const [newMsgIdx, setNewMsgIdx] = useState(new Set([0]))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  const exhausted = hintsUsed >= config.maxHints
  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput(''); setError('')
    const userMsg = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages); setNewMsgIdx(new Set([nextMessages.length - 1])); setLoading(true)
    try {
      const reply = await callBackend({ messages: nextMessages.map(m => ({ role: m.role, content: m.content })), config, hintsUsed })
      if (reply.includes('💡 Hint')) setHintsUsed(h => Math.min(h + 1, config.maxHints))
      const withReply = [...nextMessages, { role: 'assistant', content: reply }]
      setMessages(withReply); setNewMsgIdx(new Set([withReply.length - 1]))
    } catch (e) { setError(e.message) }
    finally { setLoading(false); setTimeout(() => textareaRef.current?.focus(), 50) }
  }, [input, loading, messages, config, hintsUsed])

  const reset = () => { setMessages([{ role: 'assistant', content: "Fresh start! 🦉 What would you like to work through?" }]); setHintsUsed(0); setNewMsgIdx(new Set([0])); setInput(''); setError('') }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🦉</span>
          <div>
            <span style={{ fontFamily: 'Lora, serif', fontWeight: 600, fontSize: 18, color: 'var(--ink)' }}>PassPos</span>
            <span style={{ color: 'var(--ink-faint)', fontSize: 12, marginLeft: 8, fontFamily: 'IBM Plex Mono, monospace' }}>socratic tutor</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reset} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-muted)' }}>↺ New session</button>
          <a href="/teacher" style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, border: '1px solid var(--border)', color: 'var(--ink-muted)', textDecoration: 'none' }}>Teacher →</a>
        </div>
      </div>
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <HintDots used={hintsUsed} max={config.maxHints} exhausted={exhausted} revealed={config.revealAnswer} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0 8px' }}>
        {messages.map((m, i) => <Bubble key={i} msg={m} isNew={newMsgIdx.has(i)} />)}
        {loading && <TypingIndicator />}
        {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--rust-soft)', border: '1px solid #E8BFAF', color: 'var(--rust)', fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ flexShrink: 0, padding: '12px 0 20px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, padding: '10px 12px', boxShadow: '0 2px 12px var(--shadow)' }}>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={exhausted && !config.revealAnswer ? "All hints used — try solving it now!" : "Ask a question or share what you're working on…"}
            rows={2} style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontFamily: 'Outfit, sans-serif', fontSize: 14, color: 'var(--ink)', background: 'transparent', lineHeight: 1.6, caretColor: 'var(--rust)' }} />
          <button onClick={send} disabled={loading || !input.trim()} style={{ width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0, background: loading || !input.trim() ? 'var(--cream-dark)' : 'var(--ink)', color: loading || !input.trim() ? 'var(--ink-faint)' : '#fff', fontSize: 16, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>→</button>
        </div>
        <p style={{ textAlign: 'center', marginTop: 8, color: 'var(--ink-faint)', fontSize: 11 }}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
