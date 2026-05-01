// =============================================
// app.js — Premium ARIA Frontend Logic
// =============================================

const API_BASE = 'http://localhost:3001/api';

// ---- DOM Elements ----
const micBtn         = document.getElementById('mic-btn');
const micLabel       = document.getElementById('mic-label');
const chatMessages   = document.getElementById('chat-messages');
const textInput      = document.getElementById('text-input');
const sendBtn        = document.getElementById('send-btn');
const tasksList      = document.getElementById('tasks-list');
const taskCount      = document.getElementById('task-count');
const memoryList     = document.getElementById('memory-list');
const memoryCount    = document.getElementById('memory-count');
const statusPill     = document.getElementById('status-pill');
const statusText     = document.getElementById('status-text');
const transcriptBar  = document.getElementById('transcript-bar');
const transcriptTxt  = document.getElementById('transcript-text');
const ttsToggle      = document.getElementById('tts-toggle');
const resetBtn       = document.getElementById('reset-btn');
const clearChatBtn   = document.getElementById('clear-chat-btn');
const toastContainer = document.getElementById('toast-container');
const quickTaskInput = document.getElementById('quick-task-input');
const quickTaskBtn   = document.getElementById('quick-task-btn');
const quickMemInput  = document.getElementById('quick-memory-input');
const quickMemBtn    = document.getElementById('quick-memory-btn');

// ---- State ----
let isListening = false;
let isSpeaking  = false;
let recognition = null;
let silenceTimer = null;

// =============================================
// UTILITIES & FEEDBACK
// =============================================

function setStatus(state, label) {
  statusPill.className = `status-pill ${state}`;
  statusText.textContent = label;
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '🔔';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Celebration effect (simple confetti)
function celebrate() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  // Note: Simplified for now, could integrate a library like canvas-confetti
  showToast('🎉 Goal Achieved!', 'success');
}

// =============================================
// API DIRECT ACTIONS
// =============================================

async function apiAction(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    
    // Update global lists if returned
    if (data.tasks) renderTasks(data.tasks);
    if (data.memories) renderMemories(data.memories);
    
    return data;
  } catch (err) {
    console.error(`API Action Failed (${endpoint}):`, err);
    showToast('Connection error', 'error');
    return null;
  }
}

// Direct task actions
async function addTask(title) {
  if (!title.trim()) return;
  const res = await apiAction('/tasks', 'POST', { title });
  if (res?.success) {
    showToast('Task added');
    quickTaskInput.value = '';
  }
}

async function completeTask(id) {
  const res = await apiAction(`/tasks/${id}/complete`, 'PUT');
  if (res?.success) {
    showToast('Task completed!', 'success');
    celebrate();
  }
}

async function deleteTask(id) {
  const res = await apiAction(`/tasks/${id}`, 'DELETE');
  if (res?.success) showToast('Task deleted');
}

// Direct memory actions
async function addMemory(content) {
  if (!content.trim()) return;
  const res = await apiAction('/memories', 'POST', { content });
  if (res?.success) {
    showToast('Memory stored', 'success');
    quickMemInput.value = '';
  }
}

async function deleteMemory(id) {
  const res = await apiAction(`/memories/${id}`, 'DELETE');
  if (res?.success) showToast('Memory forgotten');
}

// =============================================
// SPEECH-TO-TEXT
// =============================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }

    transcriptTxt.textContent = final || interim;
    
    if (final) {
      stopListening();
      sendMessage(final.trim());
    }
  };

  recognition.onerror = (event) => {
    console.error('STT Error:', event.error);
    stopListening();
    if (event.error !== 'no-speech') showToast(`Mic error: ${event.error}`, 'error');
  };

  recognition.onend = () => { if (isListening) stopListening(); };
}

function startListening() {
  if (!recognition || isListening) return;
  try {
    recognition.start();
    isListening = true;
    micBtn.classList.add('listening');
    if (micLabel) micLabel.textContent = 'Listening...';
    transcriptBar.classList.add('active');
    setStatus('listening', 'Listening');
  } catch (err) { console.error(err); }
}

function stopListening() {
  if (!isListening) return;
  isListening = false;
  try { recognition.stop(); } catch(e) {}
  micBtn.classList.remove('listening');
  if (micLabel) micLabel.textContent = 'Click to speak';
  transcriptBar.classList.remove('active');
  setStatus('', 'Ready');
}

micBtn.addEventListener('click', () => isListening ? stopListening() : startListening());

// =============================================
// TEXT-TO-SPEECH
// =============================================

function speakText(text) {
  if (!ttsToggle.checked || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  
  // Clean text of markdown
  const clean = text.replace(/[*#`_]/g, '').trim();
  utterance.text = clean;

  utterance.onstart = () => { isSpeaking = true; setStatus('speaking', 'Speaking'); };
  utterance.onend = () => { isSpeaking = false; setStatus('', 'Ready'); };

  window.speechSynthesis.speak(utterance);
}

// =============================================
// CHAT LOGIC
// =============================================

async function sendMessage(text) {
  if (!text || text.trim() === '') return;

  appendMessage('user', text);
  if (textInput) textInput.value = '';
  setStatus('thinking', 'Thinking...');

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    if (!response.ok) throw new Error('Server error');
    const data = await response.json();

    appendMessage('assistant', data.reply, data.toolCalls);
    speakText(data.reply);

    if (data.tasks) renderTasks(data.tasks);
    if (data.memories) renderMemories(data.memories);

    setStatus('', 'Ready');
  } catch (err) {
    console.error(err);
    appendMessage('assistant', "Sorry, I'm having trouble connecting to my brain right now.");
    setStatus('', 'Error');
  }
}

function appendMessage(role, text, toolCalls = []) {
  const msg = document.createElement('div');
  msg.className = `message message-${role}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.innerHTML = role === 'user' ? 
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' :
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

  const content = document.createElement('div');
  content.className = 'message-content';
  
  // Basic markdown-like formatting
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  
  content.innerHTML = `<p>${formatted}</p>`;
  
  if (toolCalls?.length > 0) {
    const toolsWrap = document.createElement('div');
    toolsWrap.style.display = 'flex';
    toolsWrap.style.flexWrap = 'wrap';
    toolsWrap.style.gap = '6px';
    toolsWrap.style.marginTop = '8px';
    
    toolCalls.forEach(tc => {
      const badge = document.createElement('span');
      badge.className = 'mem-badge';
      badge.style.background = 'rgba(124, 106, 247, 0.1)';
      badge.style.color = 'var(--accent-primary)';
      badge.textContent = `🔧 ${tc.tool.replace('_', ' ')}`;
      toolsWrap.appendChild(badge);
    });
    content.appendChild(toolsWrap);
  }

  msg.appendChild(avatar);
  msg.appendChild(content);
  if (chatMessages) {
    chatMessages.appendChild(msg);
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
  } else {
    // If there is no chat history UI, we still want to show the transcript or response
    if (transcriptTxt && role === 'assistant') {
      transcriptTxt.textContent = text;
    }
  }
}

// =============================================
// RENDERING
// =============================================

function renderTasks(tasks) {
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'deleted');
  if (taskCount) taskCount.textContent = activeTasks.length;
  tasksList.innerHTML = '';

  if (activeTasks.length === 0) {
    tasksList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-wrap"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>
        <p>No active tasks.</p>
      </div>`;
    return;
  }

  activeTasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `task-item ${task.status === 'completed' ? 'completed' : ''} ${task.status === 'deleted' ? 'deleted' : ''}`;
    
    let badgeHtml = '';
    if (task.status === 'deleted') {
      badgeHtml = `<span class="task-badge badge-deleted">Deleted</span>`;
    } else if (task.status === 'completed') {
      badgeHtml = `<span class="task-badge badge-completed">Completed</span>`;
    } else if (task.updated_at) {
      badgeHtml = `<span class="task-badge badge-updated">Updated</span>`;
    } else {
      badgeHtml = `<span class="task-badge badge-added">Added</span>`;
    }

    item.innerHTML = `
      <div class="task-check" title="Toggle completion"></div>
      <div class="task-info">
        <span class="task-title">${task.title}</span>
        <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
          ${badgeHtml}
          <span class="task-meta">Created ${new Date(task.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <button class="btn-delete" title="Delete task">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;

    const checkBtn = item.querySelector('.task-check');
    if (checkBtn) checkBtn.onclick = () => completeTask(task.id);
    
    const delBtn = item.querySelector('.btn-delete');
    if (delBtn) delBtn.onclick = () => deleteTask(task.id);
    
    tasksList.appendChild(item);
  });
}

function renderMemories(memories) {
  if (memoryCount) memoryCount.textContent = memories.length;
  memoryList.innerHTML = '';

  if (memories.length === 0) {
    memoryList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-wrap"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
        <p>Memory is empty.</p>
      </div>`;
    return;
  }

  // Sort: upcoming events first
  const sorted = [...memories].sort((a, b) => {
    if (a.event_date && !b.event_date) return -1;
    if (!a.event_date && b.event_date) return 1;
    if (a.event_date && b.event_date) return new Date(a.event_date) - new Date(b.event_date);
    return new Date(b.stored_at) - new Date(a.stored_at);
  });

  sorted.forEach(mem => {
    const item = document.createElement('div');
    item.className = 'memory-item';
    
    let daysHtml = '';
    if (mem.event_date) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const target = new Date(mem.event_date);
      target.setHours(0,0,0,0);
      const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
      
      let label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff < 0 ? 'Past' : `${diff}d left`;
      daysHtml = `<span class="days-left">${label}</span>`;
    }

    item.innerHTML = `
      <div class="mem-info">
        <span class="mem-content">${mem.content}</span>
        <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
          <span class="mem-badge">${mem.category || 'general'}</span>
          <span class="mem-meta">${new Date(mem.stored_at).toLocaleDateString()}</span>
        </div>
      </div>
      ${daysHtml}
      <button class="btn-delete" title="Delete memory">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    item.querySelector('.btn-delete').onclick = () => deleteMemory(mem.id);
    memoryList.appendChild(item);
  });
}

// =============================================
// INITIALIZATION & EVENTS
// =============================================

// Quick Add Events
quickTaskBtn.onclick = () => addTask(quickTaskInput.value);
quickTaskInput.onkeydown = (e) => { if (e.key === 'Enter') addTask(quickTaskInput.value); };

quickMemBtn.onclick = () => addMemory(quickMemInput.value);
quickMemInput.onkeydown = (e) => { if (e.key === 'Enter') addMemory(quickMemInput.value); };

// Chat Input
if (textInput) textInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(textInput.value); };
if (sendBtn) sendBtn.onclick = () => sendMessage(textInput.value);

// Header Actions
if (resetBtn) resetBtn.onclick = async () => {
  await apiAction('/reset', 'POST');
  showToast('Conversation reset');
  if (chatMessages) chatMessages.innerHTML = '';
};
if (clearChatBtn) clearChatBtn.onclick = () => {
  if (chatMessages) chatMessages.innerHTML = '';
  showToast('Chat cleared');
};

const taskQuickAddToggle = document.getElementById('quick-task-toggle');
const taskQuickAddWrap = document.getElementById('task-quick-add-wrap');
if (taskQuickAddToggle && taskQuickAddWrap) {
  taskQuickAddToggle.onclick = () => {
    taskQuickAddWrap.style.display = taskQuickAddWrap.style.display === 'none' ? 'flex' : 'none';
  };
}

// Initial Load
async function init() {
  const preloader = document.getElementById('preloader');
  
  try {
    const tasks = await apiAction('/tasks');
    const memories = await apiAction('/memories');
    
    if (tasks) renderTasks(tasks.tasks);
    if (memories) renderMemories(memories.memories);
    
    console.log('ARIA System Initialized');
  } catch (err) {
    console.error('Init failed:', err);
  } finally {
    // Smoothly fade out preloader
    setTimeout(() => {
      preloader.style.opacity = '0';
      setTimeout(() => preloader.style.display = 'none', 500);
    }, 800);
  }
}

init();
