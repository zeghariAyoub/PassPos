import express from 'express'
import cors from 'cors'

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

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
5. Keep each response concise — 2 to 4 sentences.
6. Be warm and encouraging. Learning is hard. Celebrate effort.
`.trim()

app.post('/api/chat', async (req, res) => {
  const { messages, config, hintsUsed } = req.body

  if (!messages || !config) {
    return res.status(400).json({ error: 'Missing messages or config' })
  }

  try {
    const system = buildSystem({ ...config, hintsUsed: hintsUsed || 0 })

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
