// =============================================
// server.js - Express Backend Entry Point
// =============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runAgent } = require('./agent');
const { readTasks } = require('./tools');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors());                          // Allow frontend requests
app.use(express.json());                  // Parse JSON bodies
app.use(express.static('../frontend'));   // Serve frontend files

// ---- In-memory conversation history per session ----
// Simple single-session approach (no auth needed for local use)
let conversationHistory = [];

// ---- POST /api/chat — Main agent endpoint ----
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }

  console.log(`\n👤 User: ${message}`);

  try {
    // Run the AI agent
    const result = await runAgent(message, conversationHistory);

    // Update conversation history (keep last 20 messages to avoid token overflow)
    conversationHistory = result.updatedHistory.slice(-20);

    console.log(`🤖 ARIA: ${result.reply}`);

    res.json({
      reply: result.reply,
      toolCalls: result.toolCalls,
      tasks: readTasks()  // Always send fresh task list
    });

  } catch (err) {
    console.error('Agent error:', err);
    res.status(500).json({
      error: 'Something went wrong with the AI agent.',
      details: err.message
    });
  }
});

// ---- GET /api/tasks — Get current task list ----
app.get('/api/tasks', (req, res) => {
  res.json({ tasks: readTasks() });
});

// ---- GET /api/reset — Reset conversation history ----
app.post('/api/reset', (req, res) => {
  conversationHistory = [];
  res.json({ message: 'Conversation reset successfully.' });
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ARIA Voice Agent is running 🎤' });
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`\n🚀 ARIA Voice Agent backend running on http://localhost:${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  console.log(`📝 API endpoints:`);
  console.log(`   POST /api/chat   — Send a message`);
  console.log(`   GET  /api/tasks  — Get all tasks`);
  console.log(`   POST /api/reset  — Reset conversation\n`);
});
