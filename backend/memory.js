// =============================================
// memory.js - Smart Memory System
// Stores events/facts with date parsing
// Retrieves contextually relevant memories
// =============================================

const fs   = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, 'data', 'memory.json');

// ---- Helper: Read memories ----
function readMemories() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
      fs.writeFileSync(MEMORY_FILE, '[]', 'utf8');
    }
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading memories:', err);
    return [];
  }
}

// ---- Helper: Write memories ----
function writeMemories(memories) {
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing memories:', err);
  }
}

// ---- Migrate old memory entries to new schema ----
function migrateMemories() {
  const memories = readMemories();
  let changed = false;
  memories.forEach(mem => {
    if (!mem.category) {
      mem.category = detectCategory(mem.content || '');
      changed = true;
    }
    if (!mem.hasOwnProperty('event_date')) {
      mem.event_date = extractEventDate(mem.content || '');
      changed = true;
    }
    if (!mem.stored_at) {
      mem.stored_at = mem.timestamp || mem.date || new Date().toISOString();
      changed = true;
    }
  });
  if (changed) {
    writeMemories(memories);
    console.log(`🧠 Migrated ${memories.length} memory entries to new schema`);
  }
}

// ---- Helper: Try to extract a date from text ----
// Supports: "23 may", "may 23", "23rd may", "june 5", "5 june 2026", "tomorrow", "next monday"
function extractEventDate(text) {
  const now   = new Date();
  const lower = text.toLowerCase();

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  // "next <weekday>"
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const nextMatch = lower.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (nextMatch) {
    const targetDay = weekdays.indexOf(nextMatch[1]);
    const d = new Date(now);
    const diff = (targetDay - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  // Month names lookup
  const months = {
    jan:0, january:0, feb:1, february:1, mar:2, march:2,
    apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6,
    aug:7, august:7, sep:8, september:8, oct:9, october:9,
    nov:10, november:10, dec:11, december:11
  };

  // "<day> <month> [<year>]"  e.g. "23 may", "23rd may 2026"
  let m = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?/);
  if (m) {
    const day   = parseInt(m[1], 10);
    const month = months[m[2].slice(0, 3)];
    const year  = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    const d     = new Date(year, month, day);
    // If the date is already past this year, bump to next year
    if (d < now && !m[3]) d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }

  // "<month> <day>"  e.g. "may 23", "june 5th"
  m = lower.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/);
  if (m) {
    const month = months[m[1].slice(0, 3)];
    const day   = parseInt(m[2], 10);
    const year  = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    const d     = new Date(year, month, day);
    if (d < now && !m[3]) d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }

  // "DD/MM/YYYY" or "MM/DD/YYYY" (treat as DD/MM/YYYY)
  m = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    const day   = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year  = m[3] ? parseInt(m[3], 10) + (m[3].length === 2 ? 2000 : 0) : now.getFullYear();
    return new Date(year, month, day).toISOString().split('T')[0];
  }

  return null;
}

// ---- Helper: Detect category/type of memory ----
function detectCategory(text) {
  const lower = text.toLowerCase();
  if (/\bexam\b|\btest\b|\bquiz\b/.test(lower))           return 'exam';
  if (/\bmeeting\b|\binterview\b|\bcall\b/.test(lower))   return 'meeting';
  if (/\bdeadline\b|\bsubmit\b|\bdue\b/.test(lower))      return 'deadline';
  if (/\bbirthday\b|\banniversary\b/.test(lower))          return 'occasion';
  if (/\bappointment\b|\bdoctor\b|\bclinic\b/.test(lower))return 'appointment';
  if (/\btrip\b|\bflight\b|\btravel\b/.test(lower))       return 'travel';
  if (/\bclass\b|\blecture\b|\bcourse\b/.test(lower))      return 'class';
  return 'general';
}

// ---- Store a new memory ----
function store_memory(content) {
  const memories  = readMemories();
  const eventDate = extractEventDate(content);
  const category  = detectCategory(content);

  const newMemory = {
    id:         Date.now().toString(),
    content:    content.trim(),
    category,
    event_date: eventDate,   // ISO date string or null
    stored_at:  new Date().toISOString(),
    date:       new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
  };

  memories.push(newMemory);

  // Keep last 200 memories
  if (memories.length > 200) memories.splice(0, memories.length - 200);

  writeMemories(memories);

  const dateNote = eventDate ? ` (event date detected: ${eventDate})` : '';
  return {
    success: true,
    message: `Memory stored: "${content}"${dateNote}`,
    memory:  newMemory
  };
}

// ---- Delete a memory by keyword or ID ----
function delete_memory(query) {
  const memories = readMemories();
  const lower    = query.toLowerCase();

  // Try by ID first
  let idx = memories.findIndex(m => m.id === query);

  // Then keyword match
  if (idx === -1) {
    idx = memories.findIndex(m => m.content.toLowerCase().includes(lower));
  }

  if (idx === -1) {
    return { success: false, message: `No memory found matching: "${query}"` };
  }

  const removed = memories.splice(idx, 1)[0];
  writeMemories(memories);
  return { success: true, message: `Memory deleted: "${removed.content}"` };
}

// ---- Retrieve relevant memories ----
function retrieve_memories(query = '') {
  const memories = readMemories();

  if (memories.length === 0) {
    return { success: true, message: 'No memories stored yet.', memories: [] };
  }

  if (!query || query.trim() === '') {
    const recent = memories.slice(-10);
    return {
      success: true,
      message: `Found ${recent.length} recent memories.`,
      memories: recent
    };
  }

  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = memories.map(mem => {
    const text = (mem.content + ' ' + mem.category).toLowerCase();
    let score = 0;
    keywords.forEach(kw => { if (text.includes(kw)) score++; });
    return { ...mem, score };
  });

  const relevant = scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (relevant.length === 0) {
    const recent = memories.slice(-5);
    return {
      success: true,
      message: 'No specific matches found. Here are recent memories.',
      memories: recent
    };
  }

  return {
    success: true,
    message: `Found ${relevant.length} relevant memories.`,
    memories: relevant
  };
}

// ---- Get full memory list (for API) ----
function getAllMemories() {
  return readMemories();
}

// ---- Compute days remaining to an event date ----
function daysUntil(isoDateStr) {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// ---- Build enriched memory context for system prompt ----
function getMemoryContext() {
  const memories = readMemories();
  if (memories.length === 0) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lines = [];

  // --- Upcoming events (sorted by date) ---
  const upcoming = memories
    .filter(m => m.event_date)
    .map(m => ({ ...m, days: daysUntil(m.event_date) }))
    .filter(m => m.days >= 0)
    .sort((a, b) => a.days - b.days);

  if (upcoming.length > 0) {
    lines.push('\n📅 UPCOMING EVENTS (use these for context-aware answers):');
    upcoming.slice(0, 10).forEach(m => {
      const dayStr = m.days === 0 ? 'TODAY' : m.days === 1 ? 'TOMORROW' : `in ${m.days} days`;
      lines.push(`  • [${m.category.toUpperCase()}] ${m.content} → ${dayStr} (${m.event_date})`);
    });
  }

  // --- Past events ---
  const past = memories
    .filter(m => m.event_date && daysUntil(m.event_date) < 0)
    .slice(-3);
  if (past.length > 0) {
    lines.push('\n⏮ Past events:');
    past.forEach(m => {
      lines.push(`  • ${m.content} (was on ${m.event_date})`);
    });
  }

  // --- General facts (no date) ---
  const general = memories.filter(m => !m.event_date).slice(-5);
  if (general.length > 0) {
    lines.push('\n💡 Stored facts:');
    general.forEach(m => lines.push(`  • ${m.content}`));
  }

  return lines.length > 0 ? '\n\n🧠 YOUR MEMORY BANK:\n' + lines.join('\n') : '';
}

// Run migration on load
migrateMemories();

module.exports = {
  store_memory,
  delete_memory,
  retrieve_memories,
  getAllMemories,
  getMemoryContext,
  daysUntil
};
