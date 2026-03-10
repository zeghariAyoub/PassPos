import { useState, useRef, useEffect, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const TEACHER_CODE = import.meta.env.VITE_TEACHER_CODE || 'teacher123'
const PARENT_CODE = import.meta.env.VITE_PARENT_CODE || 'parent123'

// ─── API ──────────────────────────────────────────────────────────────────────
const api = {
  chat: (body) => fetch(`${BACKEND_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  agent: (body) => fetch(`${BACKEND_URL}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  quizzes: () => fetch(`${BACKEND_URL}/api/quizzes`).then(r => r.json()),
  quiz: (id) => fetch(`${BACKEND_URL}/api/quiz/${id}`).then(r => r.json()),
  students: () => fetch(`${BACKEND_URL}/api/students`).then(r => r.json()),
  analytics: () => fetch(`${BACKEND_URL}/api/analytics`).then(r => r.json()),
  startSession: (b) => fetch(`${BACKEND_URL}/api/session/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  saveAnswer: (b) => fetch(`${BACKEND_URL}/api/session/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  completeSession: (b) => fetch(`${BACKEND_URL}/api/session/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  upload: (formData) => fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: formData }).then(r => r.json()),
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function App() {
  const path = window.location.pathname
  if (path === '/teacher') return <TeacherGate />
  if (path === '/parent') return <ParentGate />
  return <StudentApp />
}

// ─── Gate ─────────────────────────────────────────────────────────────────────
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
      <div style={{ width: 380 }}>
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

// ─── TEACHER DASHBOARD ────────────────────────────────────────────────────────
function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState('agent')
  const tabs = [
    { id: 'agent', label: '🤖 AI Assistant' },
    { id: 'lessons', label: '📚 Lessons' },
    { id: 'quizzes', label: '📝 Quizzes' },
    { id: 'analytics', label: '📊 Analytics' },
  ]
  return (
    <div style={{ minHeight: '100vh', background: '#0F1117', fontFamily: 'Outfit, sans-serif', color: '#E8EAF0' }}>
      <div style={{ borderBottom: '1px solid #1C2030', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🦉</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 20, fontWeight: 600 }}>PassPos</span>
          <span style={{ color: '#3D4460', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>teacher dashboard</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #252A3A', color: '#7A8099', fontSize: 12, textDecoration: 'none' }}>← Student View</a>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid #1C2030', padding: '0 32px', display: 'flex', gap: 4 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: activeTab === tab.id ? '#4F8EF7' : '#7A8099', borderBottom: `2px solid ${activeTab === tab.id ? '#4F8EF7' : 'transparent'}`, transition: 'all 0.15s' }}>{tab.label}</button>
        ))}
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}>
        {activeTab === 'agent' && <TeacherAgent />}
        {activeTab === 'lessons' && <LessonsTab />}
        {activeTab === 'quizzes' && <QuizzesTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  )
}

// ─── Agent Tab ────────────────────────────────────────────────────────────────
function TeacherAgent() {
  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hi! I'm your teaching assistant 🤖\n\nHere's what I can do:\n• 📚 List your uploaded lessons\n• 📝 Generate a quiz from any lesson\n• 🚀 Publish quizzes for students\n• 📊 Show student performance\n• 📢 Send messages to students\n\nWhat would you like to do?" }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const suggestions = [
    'List all my lessons',
    'Generate a quiz from my first lesson',
    'Show me student results',
    'List all quizzes',
  ]

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    setLoading(true)
    try {
      const history = next.slice(1, -1)
      const { reply, toolsUsed, toolResults } = await api.agent({ message: msg, history })

      // Build a rich reply if agent just said Done
      let finalReply = reply || ''

      if ((!finalReply || finalReply === '✅ Done!') && toolResults) {
        const parts = []

        if (toolResults.list_lessons) {
          const lessons = toolResults.list_lessons.lessons || []
          if (lessons.length === 0) {
            parts.push('📚 No lessons uploaded yet. Go to the Lessons tab to upload your first lesson.')
          } else {
            parts.push('📚 **Your Lessons:**')
            lessons.forEach(l => parts.push(`• ${l.title} (${l.subject})
  ID: \`${l.id}\``))
          }
        }

        if (toolResults.list_quizzes) {
          const quizzes = toolResults.list_quizzes.quizzes || []
          if (quizzes.length === 0) {
            parts.push('📝 No quizzes created yet.')
          } else {
            parts.push('📝 **Your Quizzes:**')
            quizzes.forEach(q => parts.push(`• ${q.title} [${q.mode.toUpperCase()}] ${q.is_published ? '🟢 Published' : '🔴 Draft'}
  ID: \`${q.id}\``))
          }
        }

        if (toolResults.generate_quiz) {
          const r = toolResults.generate_quiz
          if (r.error) {
            parts.push(`⚠️ Failed to generate quiz: ${r.error}`)
          } else {
            parts.push(`✅ Quiz created successfully!`)
            parts.push(`📝 Title: ${r.title}`)
            parts.push(`🔢 Questions: ${r.questions_created}`)
            parts.push(`🎯 Mode: ${r.mode} | Hints: ${r.hints_allowed ? 'allowed' : 'not allowed'}`)
            parts.push(`🆔 Quiz ID: \`${r.quiz_id}\``)
            parts.push(`
👉 Say: "publish quiz ${r.quiz_id}" to make it live for students!`)
          }
        }

        if (toolResults.publish_quiz) {
          const r = toolResults.publish_quiz
          parts.push(r.error ? `⚠️ ${r.error}` : `🚀 "${r.published}" is now live for students!`)
        }

        if (toolResults.get_stats) {
          const r = toolResults.get_stats
          parts.push(`📊 **Platform Stats:**`)
          parts.push(`👩‍🎓 Students: ${r.students}`)
          parts.push(`✅ Completed sessions: ${r.completed_sessions}`)
          parts.push(`📝 Quizzes: ${r.quizzes}`)
          parts.push(`📄 Documents in knowledge base: ${r.documents}`)
        }

        if (toolResults.get_student_results) {
          const results = toolResults.get_student_results.results || []
          if (results.length === 0) {
            parts.push('📊 No student results yet. Students need to complete quizzes first.')
          } else {
            parts.push('📊 **Student Results:**')
            results.forEach(s => {
              const score = s.avg_score_pct || 0
              const emoji = score >= 75 ? '🟢' : score >= 50 ? '🟡' : '🔴'
              parts.push(`${emoji} ${s.student_name}: ${score}% avg (${s.total_sessions} sessions, ${s.total_hints_used} hints used)`)
            })
          }
        }

        if (toolResults.send_instruction) {
          const r = toolResults.send_instruction
          parts.push(r.error ? `⚠️ ${r.error}` : `📢 Message sent to students: "${r.message}"`)
        }

        finalReply = parts.join('
') || '✅ Done!'
      }

      setMessages(prev => [...prev, { role: 'assistant', content: finalReply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error: ' + e.message }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #252A3A' }}>
        <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 4 }}>🤖 Teacher Agent</h2>
        <p style={{ color: '#7A8099', fontSize: 13 }}>Manage your class in plain English</p>
      </div>
      <div style={{ padding: '10px 24px', borderBottom: '1px solid #1A1F2E', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {suggestions.map(s => (
          <button key={s} onClick={() => send(s)} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #252A3A', background: 'transparent', color: '#7A8099', fontSize: 11, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <div style={{ height: 400, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            {m.role === 'assistant' && <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1E2E4A', border: '1px solid #4F8EF7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🤖</div>}
            <div style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? '#4F8EF7' : '#151820', border: m.role === 'user' ? 'none' : '1px solid #252A3A', color: m.role === 'user' ? '#fff' : '#E8EAF0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1E2E4A', border: '1px solid #4F8EF7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🤖</div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: '#151820', border: '1px solid #252A3A', borderRadius: '14px 14px 14px 4px', alignItems: 'center' }}>
              {[0, 0.18, 0.36].map((d, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F8EF7', animation: `blink 1.1s ease-in-out ${d}s infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '12px 24px', borderTop: '1px solid #252A3A', display: 'flex', gap: 10 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="e.g. Generate a quiz from my biology lesson..."
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #252A3A', background: '#151820', color: '#E8EAF0', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none' }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: loading || !input.trim() ? '#252A3A' : '#4F8EF7', color: loading || !input.trim() ? '#3D4460' : '#fff', fontSize: 13, fontWeight: 600, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer' }}>Send →</button>
      </div>
    </div>
  )
}

// ─── Lessons Tab ──────────────────────────────────────────────────────────────
function LessonsTab() {
  const [lessons, setLessons] = useState([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const load = async () => {
    try {
      const { reply } = await api.agent({ message: 'List all my lessons', history: [] })
      // Load via direct API
    } catch {}
  }

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true); setResult(null); setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title || file.name.replace('.txt', ''))
      formData.append('subject', subject || 'General')
      const res = await api.upload(formData)
      if (res.error) throw new Error(res.error)
      setResult(res)
      setTitle(''); setSubject('')
    } catch (e) { setError(e.message) }
    finally { setUploading(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
        <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 6 }}>📚 Upload Lesson</h2>
        <p style={{ color: '#7A8099', fontSize: 13, marginBottom: 20 }}>Upload .txt lesson notes — AI will index them for RAG and quiz generation</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Lesson title (optional)"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 10, border: '1px solid #252A3A', background: '#151820', color: '#E8EAF0', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none' }} />
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject (e.g. Biology, Math)"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 16, border: '1px solid #252A3A', background: '#151820', color: '#E8EAF0', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none' }} />
        <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${dragOver ? '#4F8EF7' : '#252A3A'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#1E2E4A' : 'transparent', transition: 'all 0.2s', marginBottom: 16 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
          <p style={{ color: '#7A8099', fontSize: 13 }}>Drag & drop .txt file here</p>
          <p style={{ color: '#3D4460', fontSize: 11, marginTop: 4 }}>or click to browse</p>
          <input ref={fileRef} type="file" accept=".txt,.md" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </div>
        {uploading && <div style={{ padding: 12, borderRadius: 8, background: '#1E2E4A', color: '#4F8EF7', fontSize: 13, textAlign: 'center' }}>⏳ Processing & embedding lesson...</div>}
        {result && <div style={{ padding: 12, borderRadius: 8, background: '#1A2E25', color: '#3DD68C', fontSize: 13 }}>✅ Lesson "{result.title}" uploaded! {result.chunks} knowledge chunks created.<br/><span style={{ color: '#7A8099', fontSize: 11 }}>Lesson ID: {result.lesson_id}</span></div>}
        {error && <div style={{ padding: 12, borderRadius: 8, background: '#2E1A1A', color: '#F76F6F', fontSize: 13 }}>⚠️ {error}</div>}
      </div>

      <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
        <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 6 }}>💡 How to use lessons</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {[
            { step: '1', text: 'Upload your lesson notes as .txt files', icon: '📄' },
            { step: '2', text: 'Go to 🤖 AI Assistant and say "Generate a quiz from my [lesson name] lesson"', icon: '🤖' },
            { step: '3', text: 'Review and say "publish quiz [quiz_id]" to make it live', icon: '🚀' },
            { step: '4', text: 'Students take the quiz at pass-pos.vercel.app', icon: '🎓' },
            { step: '5', text: 'Check 📊 Analytics to see who struggled where', icon: '📊' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1E2E4A', border: '1px solid #4F8EF7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#4F8EF7', flexShrink: 0 }}>{s.step}</div>
              <p style={{ color: '#B0B8D0', fontSize: 13, lineHeight: 1.5, paddingTop: 4 }}>{s.icon} {s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Quizzes Tab ──────────────────────────────────────────────────────────────
function QuizzesTab() {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.quizzes().then(d => { setQuizzes(d.quizzes || []); setLoading(false) })
  }, [])

  return (
    <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
      <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 6 }}>📝 Published Quizzes</h2>
      <p style={{ color: '#7A8099', fontSize: 13, marginBottom: 24 }}>Quizzes visible to students. Use the AI Assistant to create and publish new ones.</p>
      {loading ? (
        <p style={{ color: '#7A8099', fontSize: 13 }}>Loading...</p>
      ) : quizzes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #252A3A', borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
          <p style={{ color: '#7A8099', fontSize: 14 }}>No quizzes published yet</p>
          <p style={{ color: '#3D4460', fontSize: 12, marginTop: 6 }}>Go to 🤖 AI Assistant and say "Generate a quiz from my lesson"</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {quizzes.map(q => (
            <div key={q.id} style={{ background: '#151820', border: '1px solid #252A3A', borderRadius: 12, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{q.title}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: q.mode === 'exam' ? '#2E1A3A' : '#1E2E4A', color: q.mode === 'exam' ? '#B07DD8' : '#4F8EF7' }}>{q.mode === 'exam' ? '🎓 EXAM' : '📝 QUIZ'}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: q.hints_allowed ? '#1A2E25' : '#2E1A1A', color: q.hints_allowed ? '#3DD68C' : '#F76F6F' }}>{q.hints_allowed ? '💡 Hints ON' : '🚫 No hints'}</span>
                </div>
                <div style={{ color: '#7A8099', fontSize: 11 }}>{q.lessons?.subject} · {q.lessons?.title} · ID: {q.id.slice(0, 8)}...</div>
              </div>
              <a href={`/?quiz=${q.id}`} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #4F8EF7', color: '#4F8EF7', fontSize: 12, textDecoration: 'none' }}>Preview →</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aiRecs, setAiRecs] = useState('')
  const [loadingRecs, setLoadingRecs] = useState(false)

  useEffect(() => {
    api.analytics().then(d => { setData(d); setLoading(false) })
  }, [])

  const getRecommendations = async () => {
    setLoadingRecs(true)
    const summary = JSON.stringify(data?.performance || [])
    const { reply } = await api.agent({
      message: `Based on these student results: ${summary}\n\nGive me specific recommendations for each student — what they should focus on, who needs extra help, and suggested next steps. Be concrete and actionable.`,
      history: []
    })
    setAiRecs(reply)
    setLoadingRecs(false)
  }

  if (loading) return <div style={{ color: '#7A8099', padding: 20 }}>Loading analytics...</div>

  const perf = data?.performance || []
  const hardQ = data?.hardest_questions || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Student Performance */}
      <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
        <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 20 }}>👩‍🎓 Student Performance</h2>
        {perf.length === 0 ? (
          <p style={{ color: '#7A8099', fontSize: 13 }}>No sessions completed yet. Students need to take quizzes first.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {perf.map(s => {
              const score = s.avg_score_pct || 0
              const color = score >= 75 ? '#3DD68C' : score >= 50 ? '#F7C948' : '#F76F6F'
              return (
                <div key={s.student_id} style={{ background: '#151820', border: '1px solid #252A3A', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#1C2030', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{s.student_name}</span>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 700, color }}>{score}%</span>
                    </div>
                    <div style={{ height: 6, background: '#252A3A', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                      <span style={{ color: '#7A8099', fontSize: 11 }}>💬 {s.total_sessions} sessions</span>
                      <span style={{ color: '#7A8099', fontSize: 11 }}>💡 {s.total_hints_used} hints used</span>
                      <span style={{ color: '#7A8099', fontSize: 11 }}>📝 {s.quizzes_attempted} quizzes</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Hardest Questions */}
      {hardQ.length > 0 && (
        <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 20 }}>🧩 Hardest Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hardQ.map(q => (
              <div key={q.question_id} style={{ background: '#151820', border: '1px solid #252A3A', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <p style={{ color: '#E8EAF0', fontSize: 13, flex: 1 }}>{q.question}</p>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 700, color: '#F76F6F', flexShrink: 0 }}>{q.success_rate_pct}% correct</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <span style={{ color: '#7A8099', fontSize: 11 }}>📌 {q.topic}</span>
                  <span style={{ color: '#7A8099', fontSize: 11 }}>💡 avg {q.avg_hints_per_attempt} hints</span>
                  <span style={{ color: '#7A8099', fontSize: 11 }}>👥 {q.total_attempts} attempts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Recommendations */}
      <div style={{ background: '#1C2030', border: '1px solid #252A3A', borderRadius: 16, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: 'Lora, serif', fontSize: 18, marginBottom: 4 }}>🧠 AI Recommendations</h2>
            <p style={{ color: '#7A8099', fontSize: 13 }}>Get personalized suggestions for each student based on their results</p>
          </div>
          <button onClick={getRecommendations} disabled={loadingRecs || perf.length === 0} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: loadingRecs || perf.length === 0 ? '#252A3A' : '#4F8EF7', color: loadingRecs || perf.length === 0 ? '#3D4460' : '#fff', fontSize: 13, fontWeight: 600, cursor: loadingRecs || perf.length === 0 ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            {loadingRecs ? '⏳ Analyzing...' : '✨ Generate Recommendations'}
          </button>
        </div>
        {aiRecs ? (
          <div style={{ background: '#151820', border: '1px solid #252A3A', borderRadius: 12, padding: 18, color: '#E8EAF0', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{aiRecs}</div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 20px', border: '2px dashed #252A3A', borderRadius: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🧠</div>
            <p style={{ color: '#7A8099', fontSize: 13 }}>{perf.length === 0 ? 'Complete some sessions first to get recommendations' : 'Click "Generate Recommendations" to get AI-powered insights'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── STUDENT APP ──────────────────────────────────────────────────────────────
function StudentApp() {
  const params = new URLSearchParams(window.location.search)
  const quizId = params.get('quiz')
  const [student, setStudent] = useState(() => {
    const saved = localStorage.getItem('passpos_student')
    return saved ? JSON.parse(saved) : null
  })

  if (!student) return <StudentLogin onLogin={s => { localStorage.setItem('passpos_student', JSON.stringify(s)); setStudent(s) }} />
  if (quizId) return <QuizMode quizId={quizId} student={student} onExit={() => window.location.href = '/'} />
  return <StudentHome student={student} onLogout={() => { localStorage.removeItem('passpos_student'); setStudent(null) }} />
}

function StudentLogin({ onLogin }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.students().then(d => { setStudents(d.students || []); setLoading(false) })
  }, [])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
      <div style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🦉</div>
          <h1 style={{ fontFamily: 'Lora, serif', fontSize: 28, color: 'var(--ink)', marginBottom: 8 }}>Welcome to PassPos</h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 14 }}>Select your name to get started</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          {loading ? <p style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Loading...</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {students.map(s => (
                <button key={s.id} onClick={() => onLogin(s)} style={{ padding: '14px 18px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--cream)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>{s.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{s.class_name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--ink-faint)' }}>
          <a href="/teacher" style={{ color: 'var(--rust)', textDecoration: 'none' }}>Teacher login →</a>
        </p>
      </div>
    </div>
  )
}

function StudentHome({ student, onLogout }) {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('quizzes') // 'quizzes' | 'chat'

  useEffect(() => {
    api.quizzes().then(d => { setQuizzes(d.quizzes || []); setLoading(false) })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🦉</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>PassPos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Hi, <strong>{student.name}</strong> 👋</span>
          <button onClick={onLogout} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-muted)', fontSize: 12, cursor: 'pointer' }}>Switch</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 32 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
          {[{ id: 'quizzes', label: '📝 My Quizzes & Exams' }, { id: 'chat', label: '💬 Free Chat' }].map(t => (
            <button key={t.id} onClick={() => setMode(t.id)} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: mode === t.id ? 'var(--ink)' : 'transparent', color: mode === t.id ? '#fff' : 'var(--ink-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>{t.label}</button>
          ))}
        </div>

        {mode === 'quizzes' && (
          <div>
            {loading ? <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading quizzes...</p>
              : quizzes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 16 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <p style={{ color: 'var(--ink-muted)', fontSize: 14 }}>No quizzes available yet</p>
                  <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 6 }}>Your teacher will publish quizzes here soon</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {quizzes.map(q => (
                    <div key={q.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{q.title}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: q.mode === 'exam' ? '#F3E8FF' : '#EFF6FF', color: q.mode === 'exam' ? '#7C3AED' : '#2563EB' }}>{q.mode === 'exam' ? '🎓 EXAM' : '📝 QUIZ'}</span>
                          {q.hints_allowed && <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, background: '#F0FDF4', color: '#16A34A', fontWeight: 700 }}>💡 Hints</span>}
                        </div>
                        <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{q.lessons?.subject} · {q.lessons?.title}</div>
                      </div>
                      <a href={`/?quiz=${q.id}`} style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Start →</a>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {mode === 'chat' && <StudentChat student={student} />}
      </div>
    </div>
  )
}

// ─── Quiz Mode ────────────────────────────────────────────────────────────────
function QuizMode({ quizId, student, onExit }) {
  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [hint, setHint] = useState('')
  const [loadingHint, setLoadingHint] = useState(false)
  const [answers, setAnswers] = useState([])
  const [done, setDone] = useState(false)
  const [hintMessages, setHintMessages] = useState([])

  useEffect(() => {
    const load = async () => {
      const data = await api.quiz(quizId)
      setQuiz(data.quiz)
      setQuestions(data.questions || [])
      const { session } = await api.startSession({ student_id: student.id, quiz_id: quizId })
      setSessionId(session.id)
    }
    load()
  }, [quizId])

  const getHint = async () => {
    if (!quiz?.hints_allowed) return
    setLoadingHint(true)
    const q = questions[current]
    const msgs = [
      ...hintMessages,
      { role: 'user', content: `I'm stuck on: "${q.question}". The options are A) ${q.option_a}, B) ${q.option_b}, C) ${q.option_c}, D) ${q.option_d}` }
    ]
    const data = await api.chat({
      messages: msgs,
      config: { maxHints: 3, revealAnswer: false, hintType: 'socratic', difficulty: 'medium' },
      hintsUsed,
      quiz_context: { question: q.question }
    })
    const newHintMessages = [...msgs, { role: 'assistant', content: data.reply }]
    setHintMessages(newHintMessages)
    setHint(data.reply)
    setHintsUsed(h => h + 1)
    setShowHint(true)
    setLoadingHint(false)
  }

  const submitAnswer = async () => {
    if (!selected) return
    const q = questions[current]
    const isCorrect = selected === q.correct_answer
    await api.saveAnswer({ session_id: sessionId, question_id: q.id, student_answer: selected, is_correct: isCorrect, hints_used: hintsUsed })
    setAnswers(prev => [...prev, { question_id: q.id, is_correct: isCorrect, hints_used: hintsUsed }])
    setSubmitted(true)
  }

  const nextQuestion = () => {
    if (current + 1 >= questions.length) {
      const score = [...answers, { is_correct: selected === questions[current].correct_answer }].filter(a => a.is_correct).length
      api.completeSession({ session_id: sessionId, score, total_questions: questions.length, hints_used: answers.reduce((a, b) => a + (b.hints_used || 0), 0) })
      setDone(true)
    } else {
      setCurrent(c => c + 1); setSelected(null); setSubmitted(false); setShowHint(false); setHint(''); setHintsUsed(0); setHintMessages([])
    }
  }

  if (!quiz || questions.length === 0) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)', color: 'var(--ink-muted)', fontFamily: 'Outfit, sans-serif' }}>Loading quiz...</div>

  if (done) {
    const score = answers.filter(a => a.is_correct).length
    const pct = Math.round(score / questions.length * 100)
    const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪'
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)', fontFamily: 'Outfit, sans-serif' }}>
        <div style={{ width: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>{emoji}</div>
          <h1 style={{ fontFamily: 'Lora, serif', fontSize: 28, color: 'var(--ink)', marginBottom: 8 }}>Quiz Complete!</h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 15, marginBottom: 28 }}>You scored</p>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginBottom: 20 }}>
            <div style={{ fontSize: 56, fontWeight: 800, fontFamily: 'IBM Plex Mono, monospace', color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#CA8A04' : '#DC2626' }}>{pct}%</div>
            <div style={{ color: 'var(--ink-muted)', fontSize: 15, marginTop: 4 }}>{score} out of {questions.length} correct</div>
          </div>
          <button onClick={onExit} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Back to Home</button>
        </div>
      </div>
    )
  }

  const q = questions[current]
  const opts = [{ key: 'A', val: q.option_a }, { key: 'B', val: q.option_b }, { key: 'C', val: q.option_c }, { key: 'D', val: q.option_d }]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🦉</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{quiz.title}</span>
          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: quiz.mode === 'exam' ? '#F3E8FF' : '#EFF6FF', color: quiz.mode === 'exam' ? '#7C3AED' : '#2563EB' }}>{quiz.mode === 'exam' ? '🎓 EXAM' : '📝 QUIZ'}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>Q {current + 1}/{questions.length}</span>
          <button onClick={onExit} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-muted)', fontSize: 12, cursor: 'pointer' }}>Exit</button>
        </div>
      </div>

      {/* Progress */}
      <div style={{ height: 4, background: 'var(--border)' }}>
        <div style={{ height: '100%', width: `${(current / questions.length) * 100}%`, background: 'var(--ink)', transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 32 }}>
        {/* Question */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginBottom: 16 }}>
          {q.topic && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>{q.topic}</div>}
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 24 }}>{q.question}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {opts.map(opt => {
              let bg = 'var(--cream)', border = 'var(--border)', color = 'var(--ink)'
              if (selected === opt.key && !submitted) { bg = '#EFF6FF'; border = '#2563EB'; color = '#1D4ED8' }
              if (submitted) {
                if (opt.key === q.correct_answer) { bg = '#F0FDF4'; border = '#16A34A'; color = '#15803D' }
                else if (opt.key === selected) { bg = '#FEF2F2'; border = '#DC2626'; color = '#B91C1C' }
              }
              return (
                <button key={opt.key} onClick={() => !submitted && setSelected(opt.key)} style={{ padding: '13px 18px', borderRadius: 12, border: `1.5px solid ${border}`, background: bg, color, fontSize: 14, textAlign: 'left', cursor: submitted ? 'default' : 'pointer', display: 'flex', gap: 12, alignItems: 'center', transition: 'all 0.15s' }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 12 }}>{opt.key}</span>
                  <span>{opt.val}</span>
                  {submitted && opt.key === q.correct_answer && <span style={{ marginLeft: 'auto' }}>✓</span>}
                  {submitted && opt.key === selected && opt.key !== q.correct_answer && <span style={{ marginLeft: 'auto' }}>✗</span>}
                </button>
              )
            })}
          </div>
          {submitted && q.explanation && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#F0FDF4', border: '1px solid #86EFAC', color: '#15803D', fontSize: 13, lineHeight: 1.6 }}>
              💡 <strong>Explanation:</strong> {q.explanation}
            </div>
          )}
        </div>

        {/* Hint section */}
        {quiz.hints_allowed && !submitted && (
          <div style={{ marginBottom: 16 }}>
            {showHint && hint && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: 16, marginBottom: 10, fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>{hint}</div>
            )}
            <button onClick={getHint} disabled={loadingHint || hintsUsed >= 3} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: loadingHint || hintsUsed >= 3 ? 'var(--cream-dark)' : '#fff', color: loadingHint || hintsUsed >= 3 ? 'var(--ink-faint)' : 'var(--ink)', fontSize: 13, cursor: loadingHint || hintsUsed >= 3 ? 'not-allowed' : 'pointer' }}>
              {loadingHint ? '⏳ Getting hint...' : hintsUsed >= 3 ? '💡 Max hints reached' : `💡 Get hint (${3 - hintsUsed} left)`}
            </button>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          {!submitted ? (
            <button onClick={submitAnswer} disabled={!selected} style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: selected ? 'var(--ink)' : 'var(--cream-dark)', color: selected ? '#fff' : 'var(--ink-faint)', fontSize: 15, fontWeight: 600, cursor: selected ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>Submit Answer</button>
          ) : (
            <button onClick={nextQuestion} style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              {current + 1 >= questions.length ? 'See Results 🎉' : 'Next Question →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Free Chat ────────────────────────────────────────────────────────────────
function StudentChat({ student }) {
  const config = JSON.parse(localStorage.getItem('passpos_config') || 'null') || { maxHints: 4, revealAnswer: false, hintType: 'socratic', difficulty: 'medium' }
  const [hintsUsed, setHintsUsed] = useState(0)
  const [messages, setMessages] = useState([{ role: 'assistant', content: `Hi ${student?.name || 'there'}! I'm your Socratic tutor 🦉 What topic are you revising today?` }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next); setLoading(true)
    try {
      const data = await api.chat({ messages: next.map(m => ({ role: m.role, content: m.content })), config, hintsUsed })
      if (data.reply?.includes('💡 Hint')) setHintsUsed(h => h + 1)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e) { setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error: ' + e.message }]) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ height: 400, overflowY: 'auto', padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            {m.role === 'assistant' && <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginRight: 8, background: 'var(--cream-dark)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🦉</div>}
            <div style={{ maxWidth: '76%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? 'var(--ink)' : 'var(--cream)', border: m.role === 'user' ? 'none' : '1px solid var(--border)', color: m.role === 'user' ? '#fff' : 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6 }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--cream-dark)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🦉</div>
          <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', alignItems: 'center' }}>
            {[0, 0.18, 0.36].map((d, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-faint)', animation: `blink 1.1s ${d}s infinite` }} />)}
          </div>
        </div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 10 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask anything about your lessons..."
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--cream)', color: 'var(--ink)', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none' }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: loading || !input.trim() ? 'var(--cream-dark)' : 'var(--ink)', color: loading || !input.trim() ? 'var(--ink-faint)' : '#fff', fontSize: 13, fontWeight: 600, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer' }}>→</button>
      </div>
    </div>
  )
}

// ─── Parent Portal ────────────────────────────────────────────────────────────
function ParentDashboard() {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F3EC', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ borderBottom: '1px solid #DDD5CA', padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>🦉</span>
          <span style={{ fontFamily: 'Lora, serif', fontSize: 18, fontWeight: 600, color: '#1A1612' }}>PassPos</span>
          <span style={{ color: '#B8AFA6', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>parent portal</span>
        </div>
        <a href="/" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #DDD5CA', color: '#7A6F67', fontSize: 12, textDecoration: 'none' }}>← Student View</a>
      </div>
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontFamily: 'Lora, serif', fontSize: 22, color: '#1A1612', marginBottom: 8 }}>Parent Analytics</h2>
        <p style={{ color: '#7A6F67', fontSize: 14 }}>Full analytics coming soon with Mixpanel integration.</p>
      </div>
    </div>
  )
}
