import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = process.env.PORT || 3001
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json())

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function embedText(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/embedding-001', content: { parts: [{ text }] } }) }
  )
  return (await res.json()).embedding?.values || []
}

function chunkText(text, chunkSize = 500) {
  const sentences = text.split(/[.!?]+/)
  const chunks = []
  let current = ''
  for (const s of sentences) {
    if ((current + s).length > chunkSize && current) { chunks.push(current.trim()); current = s }
    else current += ' ' + s
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(c => c.length > 50)
}

async function searchDocs(query) {
  if (!supabase) return []
  try {
    const embedding = await embedText(query)
    const { data } = await supabase.rpc('match_documents', { query_embedding: embedding, match_threshold: 0.7, match_count: 3 })
    return data || []
  } catch { return [] }
}

async function callGemini(messages, system) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages,
        generationConfig: { maxOutputTokens: 2000 }
      })
    }
  )
  return res.json()
}

async function generateQuizFromLesson(lessonId, title, numQ, mode, hintsAllowed) {
  const { data: lesson } = await supabase.from('lessons').select('*').eq('id', lessonId).single()
  if (!lesson) return { error: 'Lesson not found. Use "List all lessons" to get the correct ID.' }

  const prompt = `Generate exactly ${numQ} multiple choice questions from this lesson.

Return ONLY a raw JSON array. No markdown, no backticks, no explanation, no text before or after.

Each object must have EXACTLY these fields:
- question: string
- option_a: string
- option_b: string
- option_c: string
- option_d: string
- correct_answer: exactly one of: A, B, C, or D
- explanation: string
- topic: string
- difficulty: exactly one of: easy, medium, or hard

Lesson content:
${lesson.content.slice(0, 4000)}`

  const data = await callGemini(
    [{ role: 'user', parts: [{ text: prompt }] }],
    'You are a quiz generator. Output ONLY a valid JSON array with no extra text.'
  )

  let questions = []
  try {
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    // Aggressively clean the response
    let clean = raw.trim()
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
    clean = clean.replace(/\s*```$/i, '')
    // Find the array start/end
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1)
    questions = JSON.parse(clean)
    if (!Array.isArray(questions)) return { error: 'AI did not return an array' }
  } catch (e) {
    console.error('JSON parse error:', e.message)
    return { error: 'AI returned invalid JSON. Please try again.' }
  }

  // Sanitize each question to only include valid DB fields
  const sanitized = questions.map(q => ({
    question: String(q.question || ''),
    option_a: String(q.option_a || q.optionA || q.a || ''),
    option_b: String(q.option_b || q.optionB || q.b || ''),
    option_c: String(q.option_c || q.optionC || q.c || ''),
    option_d: String(q.option_d || q.optionD || q.d || ''),
    correct_answer: String(q.correct_answer || q.correctAnswer || q.answer || 'A').toUpperCase().charAt(0),
    explanation: String(q.explanation || ''),
    topic: String(q.topic || ''),
    difficulty: ['easy','medium','hard'].includes(q.difficulty) ? q.difficulty : 'medium'
  })).filter(q => q.question && q.option_a && q.option_b)

  if (sanitized.length === 0) return { error: 'No valid questions generated. Please try again.' }

  // Create the quiz first
  const { data: quiz, error: quizErr } = await supabase.from('quizzes').insert({
    title, lesson_id: lessonId, mode, hints_allowed: hintsAllowed, is_published: false
  }).select().single()

  if (quizErr || !quiz) return { error: 'Failed to create quiz: ' + (quizErr?.message || 'unknown error') }

  // Insert questions with error checking
  const toInsert = sanitized.map(q => ({ ...q, quiz_id: quiz.id }))
  const { error: qErr } = await supabase.from('questions').insert(toInsert)

  if (qErr) {
    console.error('Questions insert error:', qErr)
    // Try one by one as fallback
    let count = 0
    for (const q of toInsert) {
      const { error: e } = await supabase.from('questions').insert(q)
      if (!e) count++
    }
    if (count === 0) return { error: 'Failed to save questions: ' + qErr.message }
    return { quiz_id: quiz.id, title: quiz.title, questions_created: count, mode, hints_allowed: hintsAllowed }
  }

  return { quiz_id: quiz.id, title: quiz.title, questions_created: sanitized.length, mode, hints_allowed: hintsAllowed }
}

// ─── Teacher Agent (intent-based, no Gemini tool calling) ─────────────────────
app.post('/api/agent', async (req, res) => {
  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Missing message' })

  const msg = message.toLowerCase()
  let reply = ''

  // Extract context from conversation history
  // This lets agent remember UUIDs and context from previous messages
  const fullConversation = history.map(m => m.content || '').join(' ')
  const allText = fullConversation + ' ' + message

  // Find any UUID mentioned in history OR current message
  const uuidFromHistory = allText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []
  const lastUuid = uuidFromHistory[uuidFromHistory.length - 1] || null

  try {
    if (!supabase) {
      return res.json({ reply: 'Database not connected. Please check your Supabase environment variables in Railway.' })
    }

    // LIST LESSONS
    if ((msg.includes('list') || msg.includes('show') || msg.includes('my')) && msg.includes('lesson')) {
      const { data: lessons } = await supabase.from('lessons').select('id, title, subject, created_at').order('created_at', { ascending: false })
      const list = lessons || []
      if (list.length === 0) {
        reply = '📚 No lessons uploaded yet.\n\nGo to the Lessons tab and upload a .txt file to get started!'
      } else {
        reply = '📚 Your Lessons (' + list.length + ' total):\n\n' +
          list.map((l, i) => (i + 1) + '. ' + l.title + ' (' + l.subject + ')\n   ID: ' + l.id).join('\n\n') +
          '\n\n💡 To generate a quiz say:\n"Generate a quiz from lesson [ID] titled My Quiz"'
      }
    }

    // LIST QUIZZES
    else if ((msg.includes('list') || msg.includes('show') || msg.includes('my')) && msg.includes('quiz')) {
      const { data: quizzes } = await supabase.from('quizzes').select('id, title, mode, hints_allowed, is_published, created_at').order('created_at', { ascending: false })
      const list = quizzes || []
      if (list.length === 0) {
        reply = '📝 No quizzes yet.\n\nSay "Generate a quiz from lesson [ID] titled My Quiz" to create one!'
      } else {
        reply = '📝 Your Quizzes (' + list.length + ' total):\n\n' +
          list.map((q, i) =>
            (i + 1) + '. ' + q.title + ' [' + q.mode.toUpperCase() + '] ' + (q.is_published ? '🟢 Published' : '🔴 Draft') +
            '\n   ID: ' + q.id
          ).join('\n\n')
      }
    }

    // GENERATE QUIZ OR EXAM
    else if (msg.includes('generate') || (msg.includes('create') && (msg.includes('quiz') || msg.includes('exam')))) {
      const uuidMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const lessonId = uuidMatch ? uuidMatch[0] : lastUuid
      if (!lessonId) {
        const { data: lessons } = await supabase.from('lessons').select('id, title, subject')
        const list = lessons || []
        if (list.length === 0) {
          reply = '⚠️ No lessons found. Please upload a lesson first in the Lessons tab.'
        } else {
          reply = '⚠️ Please include the lesson ID in your message.\n\nYour lessons:\n\n' +
            list.map((l, i) => (i + 1) + '. ' + l.title + '\n   ID: ' + l.id).join('\n\n') +
            '\n\nExample:\n"Generate a 5 question quiz from lesson ' + list[0].id + ' titled Photosynthesis Quiz"'
        }
      } else {
        const isExam = msg.includes('exam')
        const titleMatch = message.match(/titled? ([^,\n]+)/i) || message.match(/called ([^,\n]+)/i)
        const title = titleMatch ? titleMatch[1].trim() : (isExam ? 'Final Exam' : 'Practice Quiz')
        const numMatch = message.match(/(\d+) question/i)
        const numQ = numMatch ? parseInt(numMatch[1]) : 5

        const result = await generateQuizFromLesson(lessonId, title, numQ, isExam ? 'exam' : 'quiz', !isExam)
        if (result.error) {
          reply = '⚠️ ' + result.error
        } else {
          reply = '✅ Quiz created successfully!\n\n' +
            '📝 Title: ' + result.title + '\n' +
            '🔢 Questions: ' + result.questions_created + '\n' +
            '🎯 Mode: ' + result.mode + '\n' +
            '💡 Hints: ' + (result.hints_allowed ? 'Allowed' : 'Not allowed') + '\n' +
            '🆔 Quiz ID: ' + result.quiz_id + '\n\n' +
            '👉 To publish for students, say:\n"Publish quiz ' + result.quiz_id + '"'
        }
      }
    }

    // PUBLISH QUIZ
    else if (msg.includes('publish')) {
      const uuidMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const quizId = uuidMatch ? uuidMatch[0] : lastUuid
      if (!quizId) {
        const { data: quizzes } = await supabase.from('quizzes').select('id, title').eq('is_published', false)
        const drafts = quizzes || []
        if (drafts.length === 0) {
          reply = '✅ All quizzes are already published!'
        } else {
          reply = '⚠️ Please include the quiz ID.\n\nDraft quizzes:\n\n' +
            drafts.map((q, i) => (i + 1) + '. ' + q.title + '\n   ID: ' + q.id).join('\n\n') +
            '\n\nSay: "Publish quiz [ID]"'
        }
      } else {
        const { data: updated } = await supabase.from('quizzes').update({ is_published: true }).eq('id', quizId).select('title').single()
        if (!updated) {
          reply = '⚠️ Quiz not found. Use "List all quizzes" to find the correct ID.'
        } else {
          reply = '🚀 "' + updated.title + '" is now LIVE for students!\n\nStudents can access it at pass-pos.vercel.app'
        }
      }
    }

    // STUDENT RESULTS / STATS
    else if (msg.includes('result') || msg.includes('performance') || msg.includes('score') || msg.includes('student') || msg.includes('stat') || msg.includes('how many') || msg.includes('overview')) {
      const [{ data: perf }, { count: s }, { count: se }, { count: q }, { count: d }] = await Promise.all([
        supabase.from('student_performance').select('*').order('avg_score_pct', { ascending: false }),
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('completed', true),
        supabase.from('quizzes').select('*', { count: 'exact', head: true }),
        supabase.from('documents').select('*', { count: 'exact', head: true }),
      ])

      reply = '📊 Platform Overview:\n👩‍🎓 ' + s + ' students | ✅ ' + se + ' completed sessions | 📝 ' + q + ' quizzes | 📄 ' + d + ' documents\n\n'
      const results = perf || []
      if (results.length === 0) {
        reply += 'No student results yet — students need to complete quizzes first.'
      } else {
        reply += 'Student Performance:\n\n' + results.map(st => {
          const score = st.avg_score_pct || 0
          const emoji = score >= 75 ? '🟢' : score >= 50 ? '🟡' : '🔴'
          return emoji + ' ' + st.student_name + ': ' + score + '% avg | ' + st.total_sessions + ' sessions | ' + st.total_hints_used + ' hints used'
        }).join('\n')
      }
    }

    // AI RECOMMENDATIONS
    else if (msg.includes('recommend') || msg.includes('suggest') || msg.includes('advice') || msg.includes('help each')) {
      const { data: results } = await supabase.from('student_performance').select('*')
      const list = results || []
      if (list.length === 0) {
        reply = '🧠 No data yet. Students need to complete quizzes first!'
      } else {
        const summary = list.map(s => s.student_name + ': ' + (s.avg_score_pct || 0) + '% avg, ' + s.total_hints_used + ' hints, ' + s.total_sessions + ' sessions').join('; ')
        const data = await callGemini(
          [{ role: 'user', parts: [{ text: 'Student results: ' + summary + '\n\nGive specific, actionable recommendations for each student. Who needs extra help? What topics should they review? What are suggested next steps? Be encouraging and concrete. Format clearly per student.' }] }],
          'You are an experienced teacher giving personalized learning recommendations based on student quiz performance data.'
        )
        reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '🧠 Could not generate recommendations right now.'
      }
    }

    // SEND MESSAGE TO STUDENTS
    else if (msg.includes('send') || msg.includes('announce') || msg.includes('tell student')) {
      const quoteMatch = message.match(/"([^"]+)"/) || message.match(/'([^']+)'/)
      const colonMatch = message.match(/(?:send|message|announce|tell students?)[:\s]+(.+)/i)
      const instruction = quoteMatch ? quoteMatch[1] : colonMatch ? colonMatch[1].trim() : message
      await supabase.from('instructions').insert({ message: instruction, target: 'all_students', active: true })
      reply = '📢 Message sent to all students!\n\n"' + instruction + '"\n\nStudents will see this at the start of their next session.'
    }

    // FALLBACK
    else {
      reply = 'Hi! Here is what I can do:\n\n' +
        '📚 "List all my lessons" — see uploaded lessons\n' +
        '📝 "Generate a quiz from lesson [ID] titled My Quiz" — create a practice quiz\n' +
        '🎓 "Generate an exam from lesson [ID] titled Final Exam" — create a no-hints exam\n' +
        '🚀 "Publish quiz [ID]" — make it live for students\n' +
        '📊 "Show student results" — see performance\n' +
        '🧠 "Give me recommendations" — AI advice per student\n' +
        '📢 "Send message: your text here" — announce to students\n\n' +
        'What would you like to do?'
    }

    res.json({ reply })
  } catch (err) {
    console.error('Agent error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Upload lesson
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const text = req.file.buffer.toString('utf-8')
    const title = req.body.title || req.file.originalname.replace('.txt', '').replace('.md', '')
    const subject = req.body.subject || 'General'

    const { data: lesson } = await supabase.from('lessons').insert({ title, subject, content: text }).select().single()
    const chunks = chunkText(text)
    let count = 0
    for (const chunk of chunks) {
      const embedding = await embedText(chunk)
      const { error } = await supabase.from('documents').insert({ content: chunk, embedding, metadata: { filename: req.file.originalname, lesson_id: lesson.id, title } })
      if (!error) count++
    }
    res.json({ success: true, lesson_id: lesson.id, title, chunks: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get ALL quizzes (teacher view)
app.get('/api/quizzes/all', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data } = await supabase.from('quizzes').select('*, lessons(title, subject)').order('created_at', { ascending: false })
  res.json({ quizzes: data || [] })
})

// Get published quizzes
app.get('/api/quizzes', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data } = await supabase.from('quizzes').select('*, lessons(title, subject)').eq('is_published', true).order('created_at', { ascending: false })
  res.json({ quizzes: data || [] })
})

// Get quiz with questions
app.get('/api/quiz/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data: quiz } = await supabase.from('quizzes').select('*, lessons(title, subject)').eq('id', req.params.id).single()
  const { data: questions } = await supabase.from('questions').select('*').eq('quiz_id', req.params.id)
  res.json({ quiz, questions: questions || [] })
})

// Start session
app.post('/api/session/start', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { student_id, quiz_id } = req.body
  const { data: quiz } = await supabase.from('quizzes').select('mode').eq('id', quiz_id).single()
  const { data: session } = await supabase.from('sessions').insert({ student_id, quiz_id, mode: quiz?.mode || 'quiz', completed: false }).select().single()
  res.json({ session })
})

// Save answer
app.post('/api/session/answer', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { session_id, question_id, student_answer, is_correct, hints_used, time_spent_seconds } = req.body
  const { data } = await supabase.from('answers').insert({ session_id, question_id, student_answer, is_correct, hints_used, time_spent_seconds }).select().single()
  res.json({ answer: data })
})

// Complete session
app.post('/api/session/complete', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { session_id, score, total_questions, hints_used, time_spent_seconds } = req.body
  const { data } = await supabase.from('sessions').update({ score, total_questions, hints_used, time_spent_seconds, completed: true, completed_at: new Date().toISOString() }).eq('id', session_id).select().single()
  res.json({ session: data })
})

// Analytics
app.get('/api/analytics', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const [{ data: performance }, { data: difficulty }, { data: recent }] = await Promise.all([
    supabase.from('student_performance').select('*').order('avg_score_pct', { ascending: false }),
    supabase.from('question_difficulty').select('*').order('success_rate_pct', { ascending: true }).limit(5),
    supabase.from('sessions').select('*, students(name), quizzes(title)').eq('completed', true).order('completed_at', { ascending: false }).limit(10)
  ])
  res.json({ performance: performance || [], hardest_questions: difficulty || [], recent_sessions: recent || [] })
})

// Students list
app.get('/api/students', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data } = await supabase.from('students').select('*').order('name')
  res.json({ students: data || [] })
})

// Student chat with RAG
app.post('/api/chat', async (req, res) => {
  const { messages, config, hintsUsed, quiz_context } = req.body
  if (!messages || !config) return res.status(400).json({ error: 'Missing messages or config' })
  try {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    let context = ''
    if (lastUserMessage) {
      const docs = await searchDocs(lastUserMessage.content)
      context = docs.map(d => d.content).join('\n\n')
    }

    let instruction = ''
    if (supabase && messages.length <= 2) {
      const { data } = await supabase.from('instructions').select('message').eq('active', true).limit(1).catch(() => ({ data: null }))
      if (data?.[0]) instruction = '\nSPECIAL TEACHER INSTRUCTION: ' + data[0].message + '\n'
    }

    const quizCtx = quiz_context ? '\nYou are helping a student with a QUIZ question: "' + quiz_context.question + '". Do NOT reveal the answer. Give Socratic hints only.\n' : ''
    const system = 'You are a warm, patient Socratic tutor.' + quizCtx + instruction +
      (context ? '\nRELEVANT COURSE MATERIAL:\n' + context + '\n\nBase your hints on this material.' : '') +
      '\n\nHints given: ' + (hintsUsed || 0) + ' of ' + config.maxHints + ' allowed' +
      '\nHint style: ' + (config.hintType === 'stepwise' ? 'step-by-step' : 'Socratic questions') +
      '\nDifficulty: ' + config.difficulty +
      '\nReveal answer: ' + (config.revealAnswer ? 'YES after max hints' : 'NO') +
      '\n\nRules:\n1. NEVER give the direct answer unless hints exhausted AND revealAnswer YES.\n2. Start each hint with exactly "💡 Hint ' + ((hintsUsed || 0) + 1) + ':"\n3. Keep responses to 2-4 sentences. Be warm and encouraging.'

    const data = await callGemini(
      messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      system
    )
    res.json({ reply: data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, something went wrong.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_, res) => res.json({ status: 'ok', supabase: !!supabase, gemini: !!process.env.GEMINI_API_KEY }))
app.listen(port, () => console.log('PassPos backend running on port ' + port))
