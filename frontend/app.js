// =============================================
// app.js — Frontend Voice Agent Logic
// Handles STT, TTS, API calls, task rendering
// =============================================

const API_BASE = 'http://localhost:3000/api';

// ---- DOM Elements ----
const micBtn        = document.getElementById('mic-btn');
const micLabel      = document.getElementById('mic-label');
const micRings      = document.querySelector('.mic-rings');
const chatMessages  = document.getElementById('chat-messages');
const textInput     = document.getElementById('text-input');
const sendBtn       = document.getElementById('send-btn');
const tasksList     = document.getElementById('tasks-list');
const taskCount     = document.getElementById('task-count');
const memoryList    = document.getElementById('memory-list');
const memoryCount   = document.getElementById('memory-count');
const statusPill    = document.getElementById('status-pill');
const statusText    = document.getElementById('status-text');
const transcriptBar = document.getElementById('transcript-bar');
const transcriptTxt = document.getElementById('transcript-text');
const ttsToggle     = document.getElementById('tts-toggle');
const resetBtn      = document.getElementById('reset-btn');
const clearChatBtn  = document.getElementById('clear-chat-btn');
const toast         = document.getElementById('toast');

// ---- State ----
let isListening   = false;
let isSpeaking    = false;
let recognition   = null;
let memoryItems   = [];   // Local copy of stored memories

// =============================================
// STATUS HELPERS
// =============================================

function setStatus(state, label) {
  statusPill.className = `status-pill ${state}`;
  statusText.textContent = label;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// =============================================
// SPEECH-TO-TEXT (Web Speech API)
// =============================================

// Check browser support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micLabel.textContent = 'Speech not supported in this browser';
  micBtn.style.opacity = '0.4';
} else {
  recognition = new SpeechRecognition();
  recognition.continuous     = false;   // Stop after one utterance
  recognition.interimResults = true;    // Show live transcript
  recognition.lang           = 'en-US';

  // Live transcript update
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript   = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // Show live in transcript bar
    transcriptTxt.textContent = '🎤 ' + (finalTranscript || interimTranscript);
    transcriptBar.classList.add('active');

    // When final transcript is ready, send it
    if (finalTranscript) {
      stopListening();
      sendMessage(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    stopListening();
    setStatus('', 'Ready');
    if (event.error !== 'no-speech') {
      showToast(`Mic error: ${event.error}`);
    }
    transcriptTxt.textContent = '🎤 Press and hold the mic to speak...';
    transcriptBar.classList.remove('active');
  };

  recognition.onend = () => {
    if (isListening) stopListening();
  };
}

// Start listening
function startListening() {
  if (!recognition || isListening) return;
  try {
    recognition.start();
    isListening = true;
    micBtn.classList.add('listening');
    micLabel.textContent = '🔴 Listening... (speak now)';
    micLabel.classList.add('listening');
    micRings.querySelectorAll('.ring').forEach(r => r.style.animation = 'ringPulse 1.5s ease-out infinite');
    setStatus('listening', 'Listening');
    transcriptTxt.textContent = '🎤 Listening...';
    transcriptBar.classList.add('active');
  } catch (err) {
    console.error('Failed to start recognition:', err);
  }
}

// Stop listening
function stopListening() {
  if (!isListening) return;
  isListening = false;
  try { recognition.stop(); } catch(e) {}
  micBtn.classList.remove('listening');
  micLabel.textContent = 'Click to speak';
  micLabel.classList.remove('listening');
  micRings.querySelectorAll('.ring').forEach(r => r.style.animation = '');
}

// Toggle mic on click
micBtn.addEventListener('click', () => {
  if (isListening) {
    stopListening();
    setStatus('', 'Ready');
    transcriptTxt.textContent = '🎤 Press and hold the mic to speak...';
    transcriptBar.classList.remove('active');
  } else {
    startListening();
  }
});

// =============================================
// TEXT-TO-SPEECH (Web Speech Synthesis API)
// =============================================

function speakText(text) {
  if (!ttsToggle.checked) return;
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  // Clean up text for speaking (remove emojis and markdown)
  const cleanText = text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')  // Remove emojis
    .replace(/\*\*/g, '')                      // Remove bold
    .replace(/\*/g, '')                        // Remove italics
    .replace(/`/g, '')                         // Remove code
    .replace(/#+\s/g, '')                      // Remove headings
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate   = 1.05;   // Slightly faster
  utterance.pitch  = 1.0;
  utterance.volume = 1.0;

  // Pick a nice voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.includes('Samantha') ||
    v.name.includes('Google US English') ||
    v.name.includes('Microsoft Aria') ||
    v.name.includes('en-US')
  );
  if (preferred) utterance.voice = preferred;

  utterance.onstart = () => {
    isSpeaking = true;
    setStatus('speaking', 'Speaking');
  };
  utterance.onend = () => {
    isSpeaking = false;
    setStatus('', 'Ready');
  };

  window.speechSynthesis.speak(utterance);
}

// Load voices (some browsers load async)
window.speechSynthesis?.addEventListener('voiceschanged', () => {
  window.speechSynthesis.getVoices();
});

// =============================================
// CHAT — SEND MESSAGE
// =============================================

async function sendMessage(text) {
  if (!text || text.trim() === '') return;

  // Show user message
  appendMessage('user', text);
  textInput.value = '';
  transcriptTxt.textContent = '🎤 Press the mic to speak...';
  transcriptBar.classList.remove('active');

  // Show thinking indicator
  setStatus('thinking', 'Thinking...');
  const thinkingId = appendThinking();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    // Remove thinking indicator
    removeThinking(thinkingId);

    // Show AI reply
    appendMessage('assistant', data.reply, data.toolCalls);

    // Speak the reply
    speakText(data.reply);

    // Update task list
    if (data.tasks) renderTasks(data.tasks);

    // Check if memory was stored and update display
    if (data.toolCalls) {
      data.toolCalls.forEach(tc => {
        if (tc.tool === 'store_memory' && tc.result?.success) {
          addMemoryItem(tc.args.content);
          showToast('🧠 Memory stored!');
        }
        if (tc.tool === 'add_task') showToast('✅ Task added!');
        if (tc.tool === 'delete_task') showToast('🗑️ Task deleted!');
        if (tc.tool === 'complete_task') showToast('🎉 Task completed!');
      });
    }

    setStatus('', 'Ready');

  } catch (err) {
    removeThinking(thinkingId);
    console.error('Send error:', err);

    const errMsg = `Sorry, I couldn't connect to the server. Make sure the backend is running on port 3000.`;
    appendMessage('assistant', errMsg);
    speakText(errMsg);
    setStatus('', 'Error');
  }
}

// ---- Send via Enter key ----
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(textInput.value.trim());
  }
});

// ---- Send via button ----
sendBtn.addEventListener('click', () => sendMessage(textInput.value.trim()));

// =============================================
// CHAT MESSAGE RENDERING
// =============================================

function appendMessage(role, text, toolCalls = []) {
  const msg = document.createElement('div');
  msg.className = `message message-${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const content = document.createElement('div');
  content.className = 'message-content';

  // Convert simple markdown to HTML
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  content.innerHTML = `<p>${formatted}</p>`;

  // Add tool call badges
  if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach(tc => {
      const badge = document.createElement('div');
      badge.className = 'tool-badge';
      const icons = {
        add_task: '➕',
        list_tasks: '📋',
        update_task: '✏️',
        delete_task: '🗑️',
        complete_task: '✅',
        store_memory: '🧠',
        retrieve_memories: '💭'
      };
      badge.textContent = `${icons[tc.tool] || '🔧'} ${tc.tool.replace(/_/g, ' ')}`;
      content.appendChild(badge);
    });
  }

  msg.appendChild(avatar);
  msg.appendChild(content);
  chatMessages.appendChild(msg);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Thinking animation
function appendThinking() {
  const id = 'thinking-' + Date.now();
  const msg = document.createElement('div');
  msg.className = 'message message-assistant';
  msg.id = id;
  msg.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="thinking-dots">
        <span>●</span><span>●</span><span>●</span>
      </div>
    </div>`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return id;
}

function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// =============================================
// TASK LIST RENDERING
// =============================================

function renderTasks(tasks) {
  taskCount.textContent = tasks.length;

  if (tasks.length === 0) {
    tasksList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📝</span>
        <p>No tasks yet. Say "Add a task" to get started!</p>
      </div>`;
    return;
  }

  tasksList.innerHTML = '';

  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `task-item ${task.status === 'completed' ? 'completed' : ''}`;
    item.setAttribute('data-id', task.id);

    const check = document.createElement('div');
    check.className = 'task-check';
    check.textContent = task.status === 'completed' ? '✓' : '';
    check.title = 'Mark as done';

    // Click to complete via voice command (or API)
    check.addEventListener('click', () => {
      sendMessage(`Mark "${task.title}" as completed`);
    });

    const info = document.createElement('div');
    info.style.flex = '1';
    info.style.minWidth = '0';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const meta = document.createElement('span');
    meta.className = 'task-meta';
    const date = new Date(task.created_at);
    meta.textContent = date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    info.appendChild(title);
    info.appendChild(meta);

    const status = document.createElement('div');
    status.className = `task-status ${task.status}`;
    status.textContent = task.status;

    item.appendChild(check);
    item.appendChild(info);
    item.appendChild(status);
    tasksList.appendChild(item);
  });
}

// =============================================
// MEMORY RENDERING
// =============================================

function addMemoryItem(content) {
  memoryItems.push({ content, time: new Date() });
  renderMemories();
}

function renderMemories() {
  memoryCount.textContent = memoryItems.length;

  if (memoryItems.length === 0) {
    memoryList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💭</span>
        <p>No memories stored yet.</p>
      </div>`;
    return;
  }

  memoryList.innerHTML = '';
  [...memoryItems].reverse().forEach(mem => {
    const item = document.createElement('div');
    item.className = 'memory-item';
    item.innerHTML = `
      <span>${mem.content}</span>
      <span class="mem-time">${mem.time.toLocaleTimeString()}</span>`;
    memoryList.appendChild(item);
  });
}

// =============================================
// CONTROLS: Reset & Clear
// =============================================

resetBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/reset`, { method: 'POST' });
    showToast('🔄 Conversation reset!');
  } catch(e) {}
});

clearChatBtn.addEventListener('click', () => {
  chatMessages.innerHTML = `
    <div class="message message-assistant">
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <p>Chat cleared! How can I help you?</p>
      </div>
    </div>`;
});

// =============================================
// INITIALIZATION
// =============================================

async function init() {
  try {
    // Load initial task list
    const res = await fetch(`${API_BASE}/tasks`);
    const data = await res.json();
    renderTasks(data.tasks || []);
    console.log('✅ Connected to ARIA backend');
  } catch (err) {
    console.warn('Backend not connected:', err.message);
    showToast('⚠️ Backend not running on port 3000');
    setStatus('', 'Offline');
  }
}

init();
