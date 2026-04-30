// =============================================
// agent.js - Core AI Agent with Groq + Tool Calling
// Handles intent detection, tool dispatch, memory injection
// =============================================

const Groq = require('groq-sdk');
const { add_task, list_tasks, update_task, delete_task, complete_task } = require('./tools');
const { store_memory, retrieve_memories, getMemoryContext } = require('./memory');

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---- Tool definitions for Groq function calling ----
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Add a new task to the user\'s to-do list',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The title or description of the task to add'
          }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List all tasks in the user\'s to-do list',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update or rename an existing task by its ID or title',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'The task ID or a keyword from the task title to identify it'
          },
          new_title: {
            type: 'string',
            description: 'The new title for the task'
          }
        },
        required: ['task_id', 'new_title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task from the to-do list by its ID or title keyword',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'The task ID or a keyword from the task title to identify it'
          }
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
          task_id: {
            type: 'string',
            description: 'The task ID or a keyword from the task title'
          }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'store_memory',
      description: 'Store an important piece of information the user mentions (events, reminders, facts)',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The important information to remember'
          }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'retrieve_memories',
      description: 'Retrieve stored memories relevant to a query or all recent memories',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search for in memories, or empty string for recent memories'
          }
        },
        required: ['query']
      }
    }
  }
];

// ---- Execute a tool call by name ----
function executeTool(name, args) {
  console.log(`\n🔧 Executing tool: ${name}`, args);
  switch (name) {
    case 'add_task':        return add_task(args.title);
    case 'list_tasks':      return list_tasks();
    case 'update_task':     return update_task(args.task_id, args.new_title);
    case 'delete_task':     return delete_task(args.task_id);
    case 'complete_task':   return complete_task(args.task_id);
    case 'store_memory':    return store_memory(args.content);
    case 'retrieve_memories': return retrieve_memories(args.query);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}

// ---- Build the system prompt with memory context ----
function buildSystemPrompt() {
  const memoryContext = getMemoryContext();

  return `You are ARIA — a smart, friendly personal AI assistant with voice capabilities, memory, and task management powers.

Your responsibilities:
- Manage the user's To-Do list using the provided tools
- Remember important user information using store_memory
- Retrieve memories when user asks about past conversations
- Speak naturally, warmly, and concisely (your replies will be read aloud)

Rules:
- ALWAYS use add_task when user says "add", "remind me to", "don't forget to", or similar
- ALWAYS use list_tasks when user asks "what tasks", "what do I have", "show my list", etc.
- ALWAYS use delete_task when user says "delete", "remove", "cancel" a task
- ALWAYS use update_task when user says "change", "rename", "update" a task
- ALWAYS use complete_task when user says "done", "finished", "completed" a task
- ALWAYS use store_memory for important events: meetings, exams, appointments, deadlines
- ALWAYS use retrieve_memories when user asks "what did I tell you", "do you remember", "remind me what I said"
- Keep responses SHORT and NATURAL — they will be spoken aloud
- Never list full task IDs in spoken responses — use titles only
- If user says hello or chats casually, respond warmly without using any tools
- After tool calls, give a brief spoken confirmation${memoryContext}`;
}

// ---- Main agent function: processes user message ----
async function runAgent(userMessage, conversationHistory = []) {
  // Build messages array with system prompt + history + new message
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  let toolCallResults = [];

  // ---- First LLM call: may return tool calls ----
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: messages,
    tools: TOOLS,
    tool_choice: 'auto',   // Let the model decide when to use tools
    max_tokens: 1024,
    temperature: 0.7
  });

  const assistantMessage = response.choices[0].message;

  // ---- Check if model wants to call tools ----
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    // Add assistant's tool-calling message to history
    messages.push(assistantMessage);

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      const result = executeTool(toolName, toolArgs);

      toolCallResults.push({ tool: toolName, args: toolArgs, result });

      // Add tool result back to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    // ---- Second LLM call: generate final response after tool results ----
    const finalResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 512,
      temperature: 0.7
    });

    const finalMessage = finalResponse.choices[0].message.content;

    return {
      reply: finalMessage,
      toolCalls: toolCallResults,
      updatedHistory: [
        ...conversationHistory,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: finalMessage }
      ]
    };
  }

  // ---- No tool calls: direct conversational response ----
  const reply = assistantMessage.content;

  return {
    reply: reply,
    toolCalls: [],
    updatedHistory: [
      ...conversationHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: reply }
    ]
  };
}

module.exports = { runAgent };
