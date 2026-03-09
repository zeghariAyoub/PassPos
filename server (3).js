import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = process.env.PORT || 3001
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function embedText(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/embedding-001',
        content: { parts: [{ text }] }
      })
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
  const embedding = await embedText(query)
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 3
  })
  if (error) { console.error('Search error:', error); return [] }
  return data || []
}

const buildSystem = ({ maxHints, hintsUsed, revealAnswer, hintType, difficulty, context }) => `
You are a warm, patient Socratic tutor. Your role is to guide students toward understanding — never to give direct answers.

${context ? `RELEVANT COURSE MATERIAL:\n${context}\n\nBase your hints on this material when relevant.` : ''}

Current session state:
- Hints given so far: ${hintsUsed} of ${maxHints} allowed
- Hint style: ${hintType === 'stepwise' ? 'break problems into smaller concrete steps' : 'ask probing Socratic questions that spark insight'}
- Difficulty: ${difficulty}
- Reveal answer when hints exhausted: ${revealAnswer ? 'YES' : 'NO'}

Rules:
1. NEVER give the direct answer unless hints are exhausted AND revealAnswer is YES.
2. Each hint must start with exactly "💡 Hint ${hintsUsed + 1}:" — this is parsed by the UI.
3. If ${hintsUsed} >= ${maxHints} and revealAnswer is NO: warmly tell the student they have used all hints.
4. If ${hintsUsed} >= ${maxHints} and revealAnswer is YES: provide the full answer with clear explanation.
5. Keep each response concise — 2 to 4 sentences.
6. Be warm and encouraging.
`.trim()

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const text = req.file.buffer.toString('utf-8')
    const chunks = chunkText(text)
    let count = 0
    for (const chunk of chunks) {
      const embedding = await embedText(chunk)
      const { error } = await supabase.from('documents').insert({
        content: chunk,
        embedding,
        metadata: { filename: req.file.originalname }
      })
      if (!error) count++
    }
    res.json({ success: true, chunks: count })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

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

    const system = buildSystem({ ...config, hintsUsed: hintsUsed || 0, context })
    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: 600 }
        })
      }
    )

    const data = await response.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, something went wrong.'
    res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_, res) => res.json({ status: 'ok' }))
app.listen(port, () => console.log(`PassPos backend running on port ${port}`))
