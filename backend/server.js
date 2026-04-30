// =============================================
// server.js - Express Backend Entry Point
// =============================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { runAgent }       = require('./agent');
const { readTasks, add_task, update_task, delete_task, complete_task } = require('./tools');
const { getAllMemories, store_memory, delete_memory } = require('./memory');

const app  = express();
const PORT = process.env.PORT || 3001;

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// ---- In-memory conversation history (single session) ----
let conversationHistory = [];

// ---- POST /api/chat — Main agent endpoint ----
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }

  console.log(`\n👤 User: ${message}`);

  try {
    const result = await runAgent(message, conversationHistory);

    // Keep last 20 messages to avoid token overflow
    conversationHistory = result.updatedHistory.slice(-20);

    console.log(`🤖 ARIA: ${result.reply}`);

    res.json({
      reply:     result.reply,
      toolCalls: result.toolCalls,
      tasks:     readTasks(),
      memories:  getAllMemories()
    });

  } catch (err) {
    console.error('Agent error:', err);
    res.status(500).json({
      error:   'Something went wrong with the AI agent.',
      details: err.message
    });
  }
});

// ---- GET /api/tasks — Get all tasks ----
app.get('/api/tasks', (req, res) => {
  res.json({ tasks: readTasks() });
});

// ---- POST /api/tasks — Add a task directly ----
app.post('/api/tasks', (req, res) => {
  const { title } = req.body;
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  const result = add_task(title);
  res.json({ ...result, tasks: readTasks() });
});

// ---- PUT /api/tasks/:id — Update a task title ----
app.put('/api/tasks/:id', (req, res) => {
  const { title } = req.body;
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  const result = update_task(req.params.id, title);
  res.json({ ...result, tasks: readTasks() });
});

// ---- PUT /api/tasks/:id/complete — Mark task as completed ----
app.put('/api/tasks/:id/complete', (req, res) => {
  const result = complete_task(req.params.id);
  res.json({ ...result, tasks: readTasks() });
});

// ---- DELETE /api/tasks/:id — Delete a task ----
app.delete('/api/tasks/:id', (req, res) => {
  const result = delete_task(req.params.id);
  res.json({ ...result, tasks: readTasks() });
});

// ---- GET /api/memories — Get all stored memories ----
app.get('/api/memories', (req, res) => {
  res.json({ memories: getAllMemories() });
});

// ---- POST /api/memories — Store a memory directly ----
app.post('/api/memories', (req, res) => {
  const { content } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required' });
  }
  const result = store_memory(content);
  res.json({ ...result, memories: getAllMemories() });
});

// ---- DELETE /api/memories/:id — Delete a memory by ID ----
app.delete('/api/memories/:id', (req, res) => {
  const result = delete_memory(req.params.id);
  res.json({ ...result, memories: getAllMemories() });
});

// ---- POST /api/reset — Reset conversation ----
app.post('/api/reset', (req, res) => {
  conversationHistory = [];
  res.json({ message: 'Conversation reset successfully.' });
});

// ---- GET /api/health ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ARIA Voice Agent is running 🎤' });
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`\n🚀 ARIA Voice Agent backend running on http://localhost:${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  console.log(`📝 API endpoints:`);
  console.log(`   POST   /api/chat         — Send a message`);
  console.log(`   GET    /api/tasks        — Get all tasks`);
  console.log(`   GET    /api/memories     — Get all memories`);
  console.log(`   DELETE /api/memories/:id — Delete a memory`);
  console.log(`   POST   /api/reset        — Reset conversation\n`);
});
