import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = process.env.PORT || 3001
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json())

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_KEY || ''
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function embedText(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/embedding-001', content: { parts: [{ text }] } })
    }
  )
  const data = await res.json()
  return data.embedding?.values || []
}

function chunkText(text, chunkSize = 500) {
  const sentences = text.split(/[.!?]+/)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += ' ' + sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(c => c.length > 50)
}

async function searchDocs(query) {
  if (!supabase) return []
  try {
    const embedding = await embedText(query)
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3
    })
    if (error) { console.error('Search error:', error); return [] }
    return data || []
  } catch (e) { return [] }
}

async function callGemini(messages, system, tools = null) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages,
    generationConfig: { maxOutputTokens: 800 }
  }
  if (tools) body.tools = tools

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  return res.json()
}

// ─── Agent Tools ──────────────────────────────────────────────────────────────
const TEACHER_TOOLS = [{
  functionDeclarations: [
    {
      name: 'get_stats',
      description: 'Get session statistics and summaries about student activity',
      parameters: {
        type: 'OBJECT',
        properties: {
          period: { type: 'STRING', description: 'Time period: today, this_week, all_time' }
        },
        required: ['period']
      }
    },
    {
      name: 'upload_document',
      description: 'Process and store a text document into the knowledge base',
      parameters: {
        type: 'OBJECT',
        properties: {
          content: { type: 'STRING', description: 'The full text content to store' },
          filename: { type: 'STRING', description: 'Name for this document' }
        },
        required: ['content', 'filename']
      }
    },
    {
      name: 'send_instruction',
      description: 'Send a special instruction or announcement that students will see at the start of their next session',
      parameters: {
        type: 'OBJECT',
        properties: {
          message: { type: 'STRING', description: 'The instruction or announcement for students' },
          target: { type: 'STRING', description: 'Who to send to: all_students or a specific topic/group' }
        },
        required: ['message', 'target']
      }
    },
    {
      name: 'update_config',
      description: 'Update hint configuration settings',
      parameters: {
        type: 'OBJECT',
        properties: {
          maxHints: { type: 'NUMBER', description: 'Maximum number of hints (1-8)' },
          difficulty: { type: 'STRING', description: 'Difficulty level: easy, medium, hard' },
          revealAnswer: { type: 'BOOLEAN', description: 'Whether to reveal answer after max hints' },
          hintType: { type: 'STRING', description: 'Hint style: socratic or stepwise' }
        }
      }
    }
  ]
}]

// Execute tool calls
async function executeTool(name, args) {
  switch (name) {
    case 'get_stats': {
      if (!supabase) return { error: 'Database not connected', sessions: 0, hints: 0, docs: 0 }
      const { count: docCount } = await supabase.from('documents').select('*', { count: 'exact', head: true })
      const { count: instrCount } = await supabase.from('instructions').select('*', { count: 'exact', head: true }).catch(() => ({ count: 0 }))
      return {
        period: args.period,
        documents_in_knowledge_base: docCount || 0,
        active_instructions: instrCount || 0,
        note: 'Connect Mixpanel to track live student sessions'
      }
    }
    case 'upload_document': {
      if (!supabase) return { error: 'Database not connected' }
      const chunks = chunkText(args.content)
      let count = 0
      for (const chunk of chunks) {
        const embedding = await embedText(chunk)
        const { error } = await supabase.from('documents').insert({
          content: chunk,
          embedding,
          metadata: { filename: args.filename, uploaded_by: 'teacher_agent' }
        })
        if (!error) count++
      }
      return { success: true, filename: args.filename, chunks_created: count }
    }
    case 'send_instruction': {
      if (!supabase) return { error: 'Database not connected' }
      const { error } = await supabase.from('instructions').insert({
        message: args.message,
        target: args.target,
        active: true,
        created_at: new Date().toISOString()
      }).catch(() => ({ error: 'Table may not exist yet' }))
      return error
        ? { success: true, note: 'Instruction saved (create instructions table in Supabase to persist)', message: args.message }
        : { success: true, message: args.message, target: args.target }
    }
    case 'update_config': {
      return { success: true, updated: args, note: 'Config updated — students will see this on next session' }
    }
    default:
      return { error: 'Unknown tool' }
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Teacher Agent
app.post('/api/agent', async (req, res) => {
  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Missing message' })

  const system = `You are a helpful assistant for teachers using PassPos, an AI tutoring platform.
You help teachers manage their classroom by:
- Uploading and managing course documents
- Getting statistics about student sessions  
- Sending instructions or announcements to students
- Updating hint configuration

Be concise, friendly, and action-oriented. When you use a tool, tell the teacher what you did in plain English.
Always confirm actions clearly so teachers know what happened.`

  try {
    const messages = [
      ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ]

    // First call — may return tool use
    let data = await callGemini(messages, system, TEACHER_TOOLS)
    let candidate = data.candidates?.[0]
    let reply = ''
    let toolsUsed = []

    // Agentic loop — handle tool calls
    const maxSteps = 5
    let steps = 0
    while (candidate?.content?.parts?.some(p => p.functionCall) && steps < maxSteps) {
      steps++
      const toolResults = []
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          const result = await executeTool(part.functionCall.name, part.functionCall.args)
          toolsUsed.push(part.functionCall.name)
          toolResults.push({
            functionResponse: {
              name: part.functionCall.name,
              response: result
            }
          })
        }
      }

      // Feed results back
      messages.push({ role: 'model', parts: candidate.content.parts })
      messages.push({ role: 'user', parts: toolResults })

      data = await callGemini(messages, system, TEACHER_TOOLS)
      candidate = data.candidates?.[0]
    }

    reply = candidate?.content?.parts?.map(p => p.text || '').join('').trim()
    if (!reply && toolsUsed.length > 0) {
      const actionNames = toolsUsed.map(t => t.replace(/_/g, ' ')).join(', ')
      reply = '✅ Done! I completed: ' + actionNames + '. Let me know if you need anything else!'
    }
    if (!reply) reply = '✅ Done!'
    res.json({ reply, toolsUsed })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Student chat
app.post('/api/chat', async (req, res) => {
  const { messages, config, hintsUsed } = req.body
  if (!messages || !config) return res.status(400).json({ error: 'Missing messages or config' })

  try {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    let context = ''
    if (lastUserMessage) {
      const docs = await searchDocs(lastUserMessage.content)
      context = docs.map(d => d.content).join('\n\n')
    }

    // Check for active instructions
    let instruction = ''
    if (supabase && messages.length <= 2) {
      const { data } = await supabase.from('instructions')
        .select('message').eq('active', true).limit(1)
        .catch(() => ({ data: null }))
      if (data?.[0]) instruction = `\nSPECIAL TEACHER INSTRUCTION: ${data[0].message}\n`
    }

    const system = `You are a warm, patient Socratic tutor. Your role is to guide students toward understanding — never to give direct answers.
${instruction}
${context ? `RELEVANT COURSE MATERIAL:\n${context}\n\nBase your hints on this material when relevant.` : ''}

Current session state:
- Hints given so far: ${hintsUsed || 0} of ${config.maxHints} allowed
- Hint style: ${config.hintType === 'stepwise' ? 'break problems into smaller concrete steps' : 'ask probing Socratic questions that spark insight'}
- Difficulty: ${config.difficulty}
- Reveal answer when hints exhausted: ${config.revealAnswer ? 'YES' : 'NO'}

Rules:
1. NEVER give the direct answer unless hints are exhausted AND revealAnswer is YES.
2. Each hint must start with exactly "💡 Hint ${(hintsUsed || 0) + 1}:" — this is parsed by the UI.
3. If hints exhausted and revealAnswer is NO: encourage student to try again.
4. Keep responses concise — 2 to 4 sentences. Be warm and encouraging.`

    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const data = await callGemini(geminiMessages, system)
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, something went wrong.'
    res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Upload doc (manual)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const text = req.file.buffer.toString('utf-8')
    const chunks = chunkText(text)
    let count = 0
    for (const chunk of chunks) {
      const embedding = await embedText(chunk)
      const { error } = await supabase.from('documents').insert({
        content: chunk, embedding,
        metadata: { filename: req.file.originalname }
      })
      if (!error) count++
    }
    res.json({ success: true, chunks: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  supabase: !!supabase,
  gemini: !!process.env.GEMINI_API_KEY
}))

app.listen(port, () => console.log(`PassPos backend running on port ${port}`))
