# 🎤 ARIA — Voice-Enabled AI To-Do Agent

A premium, fully-local AI voice assistant that manages your to-do list, remembers important information, and responds via voice — powered by **Groq LLaMA 3.3 70B**.

---

Live Link - https://voice-agent-sarthi.vercel.app/

## ✨ Features

| Feature | Details |
|---------|---------|
| 🎤 Voice Input | Browser Web Speech API (no external STT service needed) |
| 🔊 Voice Output | Browser Web Speech Synthesis (TTS toggle in UI) |
| ✅ To-Do Tools | Add, List, Update, Delete, Complete tasks |
| 🧠 Memory | Stores & retrieves important events/facts |
| 🤖 AI Agent | Groq LLaMA 3.3 70B with function calling |
| 💾 Persistence | JSON file storage (tasks + memories survive restarts) |
| 🎨 Premium UI | Dark glassmorphism, animated mic, live transcript |

---

## 📁 Project Structure

```
voice agent/
├── backend/
│   ├── server.js      ← Express server (entry point)
│   ├── agent.js       ← Groq AI agent + tool calling
│   ├── tools.js       ← To-Do operations (CRUD)
│   ├── memory.js      ← Memory store + retrieval
│   ├── .env           ← API keys
│   ├── data/
│   │   ├── tasks.json   ← Persisted tasks
│   │   └── memory.json  ← Persisted memories
│   └── package.json
└── frontend/
    ├── index.html     ← Main UI
    ├── style.css      ← Premium dark styles
    └── app.js         ← STT, TTS, API integration
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```powershell
cd "c:\Users\ADMIN\OneDrive\Documents\Desktop\voice agent\backend"
npm install
```

### 2. Configure Environment

The `.env` file in `backend/` already has your API key:
```env
GROQ_API_KEY=your_key_here
PORT=3000
```

### 3. Start the Backend

```powershell
cd "c:\Users\ADMIN\OneDrive\Documents\Desktop\voice agent\backend"
node server.js
```

You should see:
```
🚀 ARIA Voice Agent backend running on http://localhost:3000
```

### 4. Open the Frontend

Open your browser and go to:
```
http://localhost:3000
```

> The Express server automatically serves the frontend files from the `../frontend` folder.

---

## 🗣️ Voice Commands — Examples

| Say... | What happens |
|--------|-------------|
| "Add buy milk" | `add_task("buy milk")` called |
| "Add homework for tomorrow" | Task created |
| "What tasks do I have?" | `list_tasks()` called, spoken aloud |
| "Delete the milk task" | `delete_task("milk")` called |
| "Change milk to groceries" | `update_task()` called |
| "Mark homework as done" | `complete_task()` called |
| "I have an exam on Monday" | `store_memory()` called |
| "What did I tell you earlier?" | `retrieve_memories()` called |
| "Hello!" | Casual response, no tool call |

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message to agent |
| `GET` | `/api/tasks` | Get all tasks |
| `POST` | `/api/reset` | Reset conversation history |
| `GET` | `/api/health` | Health check |

### Example chat request:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Add buy groceries"}'
```

---

## 📝 .env Example

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORT=3000
```

---

## 🔍 Troubleshooting

**"Backend not running on port 3000"**
- Make sure you started the backend with `node server.js`
- Check the console for any errors

**Mic not working?**
- Use Chrome or Edge (best Web Speech API support)
- Allow microphone access when prompted
- Must be on `http://localhost` (not file://)

**Speech recognition language**
- Default is `en-US` — change in `app.js` → `recognition.lang`

---

## 🛠️ Tech Stack

- **LLM**: Groq API — LLaMA 3.3 70B Versatile
- **Backend**: Node.js + Express
- **STT**: Web Speech API (browser-native)
- **TTS**: Web Speech Synthesis API (browser-native)
- **Storage**: JSON files (zero database setup)
- **Frontend**: Vanilla HTML/CSS/JS
