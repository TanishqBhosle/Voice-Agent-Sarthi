// =============================================
// memory.js - JSON-Based Memory System
// Stores and retrieves important user facts
// =============================================

const fs = require('fs');
const path = require('path');

// Path to the memory data file
const MEMORY_FILE = path.join(__dirname, 'data', 'memory.json');

// ---- Helper: Read memories from file ----
function readMemories() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
      fs.writeFileSync(MEMORY_FILE, '[]', 'utf8');
    }
    const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading memories:', err);
    return [];
  }
}

// ---- Helper: Write memories to file ----
function writeMemories(memories) {
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing memories:', err);
  }
}

// ---- Store a new memory ----
function store_memory(content) {
  const memories = readMemories();

  const newMemory = {
    id: Date.now().toString(),
    content: content.trim(),
    timestamp: new Date().toISOString(),
    // Simple date tag for easier retrieval
    date: new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
  };

  memories.push(newMemory);

  // Keep only last 100 memories to avoid bloat
  if (memories.length > 100) {
    memories.splice(0, memories.length - 100);
  }

  writeMemories(memories);

  return {
    success: true,
    message: `Memory stored: "${content}"`,
    memory: newMemory
  };
}

// ---- Retrieve relevant memories ----
// Simple keyword-based retrieval (no vector DB needed)
function retrieve_memories(query = '') {
  const memories = readMemories();

  if (memories.length === 0) {
    return {
      success: true,
      message: 'No memories stored yet.',
      memories: []
    };
  }

  // If no query, return recent memories
  if (!query || query.trim() === '') {
    const recent = memories.slice(-10);
    return {
      success: true,
      message: `Found ${recent.length} recent memories.`,
      memories: recent
    };
  }

  // Keyword matching — split query into words and find matches
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = memories.map(mem => {
    const text = mem.content.toLowerCase();
    let score = 0;
    keywords.forEach(kw => {
      if (text.includes(kw)) score++;
    });
    return { ...mem, score };
  });

  // Filter memories that match at least one keyword, sort by score
  const relevant = scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // If nothing matched, return recent ones
  if (relevant.length === 0) {
    const recent = memories.slice(-5);
    return {
      success: true,
      message: `No specific matches found. Here are recent memories.`,
      memories: recent
    };
  }

  return {
    success: true,
    message: `Found ${relevant.length} relevant memories.`,
    memories: relevant
  };
}

// ---- Get a formatted summary of recent memories for context injection ----
function getMemoryContext() {
  const memories = readMemories();
  if (memories.length === 0) return '';

  const recent = memories.slice(-5);
  const lines = recent.map(m => `- [${m.date}] ${m.content}`);
  return `\n\n📝 Recent memories:\n${lines.join('\n')}`;
}

module.exports = { store_memory, retrieve_memories, getMemoryContext };
