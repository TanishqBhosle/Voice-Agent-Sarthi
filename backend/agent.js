// =============================================
// agent.js - Core AI Agent with Groq + Tool Calling
// =============================================

const Groq = require('groq-sdk');
const { add_task, list_tasks, update_task, delete_task, complete_task } = require('./tools');
const { store_memory, retrieve_memories, getMemoryContext } = require('./memory');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---- Tool definitions ----
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Add a new task to the to-do list',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title/description' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List all tasks in the to-do list',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update/rename an existing task by ID or title keyword',
      parameters: {
        type: 'object',
        properties: {
          task_id:   { type: 'string', description: 'Task ID or keyword from title' },
          new_title: { type: 'string', description: 'New task title' }
        },
        required: ['task_id', 'new_title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task by ID or title keyword',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID or keyword from title' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark a task as completed',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID or keyword from title' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'store_memory',
      description: 'Store an important event, fact, deadline, exam date, appointment, or any personal information the user wants to remember. Always use this when user says "remember", "store", "note", "keep in mind", or mentions a specific date/event.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The full information to remember, including dates if mentioned' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'retrieve_memories',
      description: 'Search and retrieve stored memories relevant to a query. Use this PROACTIVELY when the user asks about upcoming events, study plans, preparation tips, schedules, or any topic that might relate to stored events.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords to search, or empty for recent memories' }
        },
        required: ['query']
      }
    }
  }
];

// ---- Execute a tool call ----
function executeTool(name, args) {
  console.log(`\n🔧 Executing tool: ${name}`, args);
  switch (name) {
    case 'add_task':          return add_task(args.title);
    case 'list_tasks':        return list_tasks();
    case 'update_task':       return update_task(args.task_id, args.new_title);
    case 'delete_task':       return delete_task(args.task_id);
    case 'complete_task':     return complete_task(args.task_id);
    case 'store_memory':      return store_memory(args.content);
    case 'retrieve_memories': return retrieve_memories(args.query);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

// ---- Build system prompt (injected with memory + current date) ----
function buildSystemPrompt() {
  const memoryContext = getMemoryContext();

  // Current date/time context
  const now        = new Date();
  const todayStr   = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr    = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return `You are ARIA — a smart, friendly personal AI assistant with voice, memory, and task management capabilities.

📅 TODAY IS: ${todayStr} at ${timeStr}
Use this to calculate days remaining, time until events, and give time-aware advice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK MANAGEMENT — You can ONLY perform these actions for the to-do list:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• add_task      → user says "add", "remind me to", "I need to", "don't forget"
• list_tasks    → user says "what tasks", "show my list", "what do I have"
• update_task   → user says "change", "rename", "edit", "update" a task
• delete_task   → user says "delete", "remove", "cancel" a task
• complete_task → user says "done", "finished", "completed", "mark as done"
You must NOT perform any other actions for the to-do list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEMORY SYSTEM — You can ONLY store & retrieve important events/facts:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• store_memory → user says "remember", "store", "note that", "I have [exam/meeting/event]", mentions any date+event
• retrieve_memories → ALWAYS call this first when user asks about:
    - Upcoming events, exams, deadlines, meetings
    - Study plans, preparation tips, schedules
    - Anything that might relate to a stored event (e.g., "how should I prepare", "tips for", "how many days until")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT-AWARE RESPONSES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user asks a question like "how to prepare for my exam" or "tips for my interview":
1. FIRST call retrieve_memories to find relevant stored events
2. Use the event_date from memory to compute EXACT days remaining (today is ${todayStr})
3. Give a PERSONALIZED answer: include the event name, exact date, days left, and tailored advice
4. Structure study/prep plans based on available time (e.g., if 7 days left → topic-wise daily plan)

Example: If memory has "exam on 23 May" and user asks "how to study for exam":
→ Say: "You have your exam on May 23rd, that's X days away. With X days to go, here's a day-by-day plan: Day 1: [topic]..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Keep responses natural and conversational (they will be spoken aloud)
• Never list task IDs — use titles only
• If user says hello, respond warmly without tools
• Confirm tool actions briefly after execution
• Be encouraging, helpful, and specific when giving personalized advice
${memoryContext}`;
}

// ---- Main agent function ----
async function runAgent(userMessage, conversationHistory = []) {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  let toolCallResults = [];

  // First LLM call (may return tool calls)
  const response = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    messages:    messages,
    tools:       TOOLS,
    tool_choice: 'auto',
    max_tokens:  1024,
    temperature: 0.7
  });

  const assistantMessage = response.choices[0].message;

  // Handle tool calls
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      const result   = executeTool(toolName, toolArgs);

      toolCallResults.push({ tool: toolName, args: toolArgs, result });

      messages.push({
        role:        'tool',
        tool_call_id: toolCall.id,
        content:     JSON.stringify(result)
      });
    }

    // Second LLM call: generate final response
    const finalResponse = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    messages,
      max_tokens:  768,
      temperature: 0.7
    });

    const finalMessage = finalResponse.choices[0].message.content;

    return {
      reply:          finalMessage,
      toolCalls:      toolCallResults,
      updatedHistory: [
        ...conversationHistory,
        { role: 'user',      content: userMessage   },
        { role: 'assistant', content: finalMessage  }
      ]
    };
  }

  // No tool calls: direct response
  const reply = assistantMessage.content;
  return {
    reply,
    toolCalls:      [],
    updatedHistory: [
      ...conversationHistory,
      { role: 'user',      content: userMessage },
      { role: 'assistant', content: reply        }
    ]
  };
}

module.exports = { runAgent };
