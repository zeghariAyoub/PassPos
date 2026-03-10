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

async function callGemini(messages, system, tools = null) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages,
    generationConfig: { maxOutputTokens: 2000 }
  }
  if (tools) body.tools = tools
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  return res.json()
}

// ─── Teacher Agent Tools ──────────────────────────────────────────────────────
const TEACHER_TOOLS = [{
  functionDeclarations: [
    {
      name: 'get_stats',
      description: 'Get statistics about students, sessions, quizzes and performance',
      parameters: { type: 'OBJECT', properties: { period: { type: 'STRING' } }, required: ['period'] }
    },
    {
      name: 'generate_quiz',
      description: 'Generate a quiz OR final exam with MCQ questions from a lesson. For exams: set mode to exam and hints_allowed to false.',
      parameters: {
        type: 'OBJECT',
        properties: {
          lesson_id: { type: 'STRING', description: 'The lesson ID to generate questions from' },
          title: { type: 'STRING', description: 'Title for the quiz or exam' },
          num_questions: { type: 'NUMBER', description: 'Number of questions to generate (default 5, max 10)' },
          mode: { type: 'STRING', description: 'quiz (hints allowed, for practice) or exam (no hints, for final assessment)' },
          hints_allowed: { type: 'BOOLEAN', description: 'true for quiz, false for exam' }
        },
        required: ['lesson_id', 'title', 'mode']
      }
    },
    {
      name: 'list_lessons',
      description: 'List all uploaded lessons',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'list_quizzes',
      description: 'List all quizzes and their status',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'publish_quiz',
      description: 'Publish a quiz so students can access it',
      parameters: { type: 'OBJECT', properties: { quiz_id: { type: 'STRING' } }, required: ['quiz_id'] }
    },
    {
      name: 'get_student_results',
      description: 'Get performance results for all students or a specific student',
      parameters: { type: 'OBJECT', properties: { student_name: { type: 'STRING', description: 'Optional: filter by student name' } } }
    },
    {
      name: 'send_instruction',
      description: 'Send a message or instruction to students',
      parameters: {
        type: 'OBJECT',
        properties: {
          message: { type: 'STRING' },
          target: { type: 'STRING' }
        },
        required: ['message', 'target']
      }
    }
  ]
}]

async function executeTool(name, args) {
  switch (name) {
    case 'get_stats': {
      if (!supabase) return { error: 'DB not connected' }
      const [{ count: studentCount }, { count: sessionCount }, { count: quizCount }, { count: docCount }] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('completed', true),
        supabase.from('quizzes').select('*', { count: 'exact', head: true }),
        supabase.from('documents').select('*', { count: 'exact', head: true }),
      ])
      const { data: perf } = await supabase.from('student_performance').select('*')
      return { students: studentCount, completed_sessions: sessionCount, quizzes: quizCount, documents: docCount, top_performers: perf?.slice(0,3) }
    }
    case 'list_lessons': {
      if (!supabase) return { error: 'DB not connected' }
      const { data } = await supabase.from('lessons').select('id, title, subject, created_at').order('created_at', { ascending: false })
      return { lessons: data || [] }
    }
    case 'list_quizzes': {
      if (!supabase) return { error: 'DB not connected' }
      const { data } = await supabase.from('quizzes').select('id, title, mode, hints_allowed, is_published, created_at').order('created_at', { ascending: false })
      return { quizzes: data || [] }
    }
    case 'publish_quiz': {
      if (!supabase) return { error: 'DB not connected' }
      const { data } = await supabase.from('quizzes').update({ is_published: true }).eq('id', args.quiz_id).select('title').single()
      return { success: true, published: data?.title }
    }
    case 'get_student_results': {
      if (!supabase) return { error: 'DB not connected' }
      let query = supabase.from('student_performance').select('*')
      if (args.student_name) query = query.ilike('student_name', `%${args.student_name}%`)
      const { data } = await query
      return { results: data || [], count: data?.length }
    }
    case 'send_instruction': {
      if (!supabase) return { error: 'DB not connected' }
      await supabase.from('instructions').insert({ message: args.message, target: args.target, active: true })
      return { success: true, message: args.message }
    }
    case 'generate_quiz': {
      if (!supabase) return { error: 'DB not connected' }
      // Get lesson content
      const { data: lesson } = await supabase.from('lessons').select('*').eq('id', args.lesson_id).single()
      if (!lesson) return { error: 'Lesson not found' }

      const numQ = args.num_questions || 5

      // Ask Gemini to generate MCQ questions
      const genRes = await callGemini([{
        role: 'user',
        parts: [{ text: `Generate exactly ${numQ} multiple choice questions from this lesson content. Return ONLY valid JSON array, no markdown, no explanation.

Format: [{"question": "...", "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", "correct_answer": "A|B|C|D", "explanation": "...", "topic": "...", "difficulty": "easy|medium|hard"}]

Lesson content:
${lesson.content}` }]
      }], 'You are a teacher creating quiz questions. Return only valid JSON.')

      let questions = []
      try {
        const raw = genRes.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
        const clean = raw.replace(/```json|```/g, '').trim()
        questions = JSON.parse(clean)
      } catch (e) {
        return { error: 'Failed to parse questions: ' + e.message }
      }

      // Create quiz
      const { data: quiz } = await supabase.from('quizzes').insert({
        title: args.title,
        lesson_id: args.lesson_id,
        mode: args.mode || 'quiz',
        hints_allowed: args.hints_allowed !== false,
        is_published: false
      }).select().single()

      // Insert questions
      const questionsWithQuizId = questions.map(q => ({ ...q, quiz_id: quiz.id }))
      await supabase.from('questions').insert(questionsWithQuizId)

      return {
        success: true,
        quiz_id: quiz.id,
        title: quiz.title,
        questions_created: questions.length,
        mode: quiz.mode,
        hints_allowed: quiz.hints_allowed,
        note: `Quiz created but NOT published yet. Tell me "publish quiz ${quiz.id}" to make it live for students.`
      }
    }
    default: return { error: 'Unknown tool' }
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Teacher Agent
app.post('/api/agent', async (req, res) => {
  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Missing message' })

  const system = `You are a helpful teaching assistant for PassPos, an AI tutoring platform.
You help teachers:
- Upload and manage lesson materials
- Generate quizzes and exams from lesson content
- Publish quizzes for students
- View student performance and analytics
- Send instructions to students
- Get recommendations based on student results

Be concise, friendly and action-oriented. Always confirm what you did clearly.
When listing items, use simple bullet points.
When you generate a quiz, tell the teacher the quiz ID and ask if they want to publish it.`

  try {
    const messages = [
      ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ]

    let data = await callGemini(messages, system, TEACHER_TOOLS)
    let candidate = data.candidates?.[0]
    let reply = ''
    let toolsUsed = []
    let toolResults = {}

    const maxSteps = 5
    let steps = 0
    while (candidate?.content?.parts?.some(p => p.functionCall) && steps < maxSteps) {
      steps++
      const results = []
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          const result = await executeTool(part.functionCall.name, part.functionCall.args)
          toolsUsed.push(part.functionCall.name)
          toolResults[part.functionCall.name] = result
          results.push({ functionResponse: { name: part.functionCall.name, response: result } })
        }
      }
      messages.push({ role: 'model', parts: candidate.content.parts })
      messages.push({ role: 'user', parts: results })
      data = await callGemini(messages, system, TEACHER_TOOLS)
      candidate = data.candidates?.[0]
    }

    reply = candidate?.content?.parts?.map(p => p.text || '').join('').trim()
    if (!reply && toolsUsed.length > 0) {
      reply = `✅ Done! Completed: ${toolsUsed.map(t => t.replace(/_/g, ' ')).join(', ')}.`
    }
    if (!reply) reply = '✅ Done!'

    res.json({ reply, toolsUsed, toolResults })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Upload lesson
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const text = req.file.buffer.toString('utf-8')
    const title = req.body.title || req.file.originalname.replace('.txt', '')
    const subject = req.body.subject || 'General'

    // Save to lessons table
    const { data: lesson } = await supabase.from('lessons').insert({
      title, subject, content: text
    }).select().single()

    // Also chunk and embed for RAG
    const chunks = chunkText(text)
    let count = 0
    for (const chunk of chunks) {
      const embedding = await embedText(chunk)
      const { error } = await supabase.from('documents').insert({
        content: chunk, embedding,
        metadata: { filename: req.file.originalname, lesson_id: lesson.id, title }
      })
      if (!error) count++
    }

    res.json({ success: true, lesson_id: lesson.id, title, chunks: count })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Get published quizzes
app.get('/api/quizzes', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data } = await supabase.from('quizzes').select('*, lessons(title, subject)').eq('is_published', true).order('created_at', { ascending: false })
  res.json({ quizzes: data || [] })
})

// Get quiz questions
app.get('/api/quiz/:id', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data: quiz } = await supabase.from('quizzes').select('*, lessons(title, subject)').eq('id', req.params.id).single()
  const { data: questions } = await supabase.from('questions').select('*').eq('quiz_id', req.params.id)
  res.json({ quiz, questions: questions || [] })
})

// Submit quiz answer + start session
app.post('/api/session/start', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { student_id, quiz_id } = req.body
  const { data: quiz } = await supabase.from('quizzes').select('mode, total_questions').eq('id', quiz_id).single()
  const { data: session } = await supabase.from('sessions').insert({
    student_id, quiz_id, mode: quiz?.mode || 'quiz', completed: false
  }).select().single()
  res.json({ session })
})

// Save answer
app.post('/api/session/answer', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { session_id, question_id, student_answer, is_correct, hints_used, time_spent_seconds } = req.body
  const { data } = await supabase.from('answers').insert({
    session_id, question_id, student_answer, is_correct, hints_used, time_spent_seconds
  }).select().single()
  res.json({ answer: data })
})

// Complete session
app.post('/api/session/complete', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { session_id, score, total_questions, hints_used, time_spent_seconds } = req.body
  const { data } = await supabase.from('sessions').update({
    score, total_questions, hints_used, time_spent_seconds,
    completed: true, completed_at: new Date().toISOString()
  }).eq('id', session_id).select().single()
  res.json({ session: data })
})

// Get analytics
app.get('/api/analytics', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const [{ data: performance }, { data: difficulty }, { data: recent }] = await Promise.all([
    supabase.from('student_performance').select('*').order('avg_score_pct', { ascending: false }),
    supabase.from('question_difficulty').select('*').order('success_rate_pct', { ascending: true }).limit(5),
    supabase.from('sessions').select('*, students(name), quizzes(title)').eq('completed', true).order('completed_at', { ascending: false }).limit(10)
  ])
  res.json({ performance: performance || [], hardest_questions: difficulty || [], recent_sessions: recent || [] })
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
      if (data?.[0]) instruction = `\nSPECIAL TEACHER INSTRUCTION: ${data[0].message}\n`
    }

    const quizCtx = quiz_context ? `\nYou are helping a student with a QUIZ question. The question is: "${quiz_context.question}". Do NOT reveal the answer directly. Guide them with hints.\n` : ''

    const system = `You are a warm, patient Socratic tutor.${quizCtx}${instruction}
${context ? `RELEVANT COURSE MATERIAL:\n${context}\n\nBase your hints on this material.` : ''}

Hints given: ${hintsUsed || 0} of ${config.maxHints} allowed
Hint style: ${config.hintType === 'stepwise' ? 'step-by-step' : 'Socratic questions'}
Difficulty: ${config.difficulty}
Reveal answer: ${config.revealAnswer ? 'YES after max hints' : 'NO'}

Rules:
1. NEVER give the direct answer unless hints exhausted AND revealAnswer YES.
2. Start each hint with exactly "💡 Hint ${(hintsUsed || 0) + 1}:"
3. Keep responses to 2-4 sentences. Be warm and encouraging.`

    const data = await callGemini(messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), system)
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, something went wrong.'
    res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Get students list
app.get('/api/students', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'DB not connected' })
  const { data } = await supabase.from('students').select('*').order('name')
  res.json({ students: data || [] })
})

app.get('/api/health', (_, res) => res.json({ status: 'ok', supabase: !!supabase, gemini: !!process.env.GEMINI_API_KEY }))
app.listen(port, () => console.log(`PassPos backend running on port ${port}`))
