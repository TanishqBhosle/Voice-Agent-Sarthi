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
Use this to calculate days remaining and time until events.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE CAPABILITIES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. TASK MANAGEMENT: Use add_task, update_task, complete_task, delete_task, or list_tasks.
2. MEMORY SYSTEM: Use store_memory to save facts/dates and retrieve_memories to find them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL CALLING RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• You MUST use the provided tools to manage tasks and memory.
• To add/remember something:
    - If it's a "to-do" or "action" (e.g., "buy milk"), use add_task.
    - If it's a "fact" or "event" (e.g., "exam on Friday"), use store_memory.
• PROACTIVELY use retrieve_memories before answering questions about upcoming events or study plans.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE GUIDELINES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Confirm actions briefly (e.g., "Done! I've added that to your list.").
• Never list IDs — use titles.
• Be warm, helpful, and concise.

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
  let assistantMessage = null;
  let response;
  try {
    // First LLM call (may return tool calls)
    response = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    messages,
      tools:       TOOLS,
      tool_choice: 'auto',
      max_tokens:  1024,
      temperature: 0.1 // Lower temperature for more stable tool calling
    });
  } catch (err) {
    console.error('🔍 Caught Groq API error:', JSON.stringify(err, null, 2));
    // Handle cases where the model generates a tool call in a format Groq rejects
    if (err.error && err.error.code === 'tool_use_failed') {
      console.log('⚠️ Groq API rejected tool call format');
      assistantMessage = {
        role: 'assistant',
        content: err.error.failed_generation || 'I attempted to use a tool but something went wrong. Let me try to answer directly.'
      };
    } else if (err.message && err.message.includes('tool_use_failed')) {
      // Fallback for when error structure is flattened in message
      console.log('⚠️ Groq API rejected tool call format (detected in message)');
      try {
        const parsed = JSON.parse(err.message.substring(err.message.indexOf('{')));
        assistantMessage = {
          role: 'assistant',
          content: parsed.error.failed_generation || 'I attempted to use a tool but something went wrong.'
        };
      } catch (e) {
        throw err;
      }
    } else {
      throw err; // Re-throw if it's a different error
    }
  }

  if (!assistantMessage && response) {
    assistantMessage = response.choices[0].message;
  }

  // Fallback: Check if model outputted <function> tags in content instead of tool_calls
  if (!assistantMessage.tool_calls && assistantMessage.content && (assistantMessage.content.includes('<function') || assistantMessage.content.includes('function('))) {
    console.log('⚠️ Detected string-based tool call fallback');
    // Matches: <function=name{...}>, <function(name){...}>, function=name{...}
    const toolRegex = /(?:<function[=\(]?)(\w+)(?:\)?\s*)({.*?})(?:\s*\/?>|<\/function>)?/g;
    const matches = [...assistantMessage.content.matchAll(toolRegex)];
    
    if (matches.length > 0) {
      assistantMessage.tool_calls = matches.map((match, idx) => ({
        id: `call_fallback_${Date.now()}_${idx}`,
        type: 'function',
        function: {
          name: match[1],
          arguments: match[2].replace(/\\"/g, '"') // Handle escaped quotes if present
        }
      }));
    }
  }

  // Handle tool calls
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      let toolArgs;
      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error(`Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments);
        toolArgs = {};
      }

      let result;
      try {
        result = executeTool(toolName, toolArgs);
      } catch (e) {
        console.error(`Tool execution failed for ${toolName}:`, e);
        result = { success: false, message: `Internal error executing ${toolName}` };
      }

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
