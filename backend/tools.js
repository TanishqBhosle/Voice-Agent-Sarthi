// =============================================
// tools.js - To-Do Tool Implementations
// All task operations: add, list, update, delete
// Tasks are persisted to a local JSON file
// =============================================

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Path to the tasks data file
const TASKS_FILE = path.join(__dirname, 'data', 'tasks.json');

// ---- Helper: Read tasks from file ----
function readTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
      fs.writeFileSync(TASKS_FILE, '[]', 'utf8');
    }
    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading tasks:', err);
    return [];
  }
}

// ---- Helper: Write tasks to file ----
function writeTasks(tasks) {
  try {
    fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing tasks:', err);
  }
}

// ---- Tool: Add a new task ----
function add_task(title) {
  const tasks = readTasks();

  // Create a new task object
  const newTask = {
    id: uuidv4(),            // Unique ID
    title: title.trim(),     // Task text
    status: 'pending',       // Default status
    created_at: new Date().toISOString()  // Timestamp
  };

  tasks.push(newTask);
  writeTasks(tasks);

  return {
    success: true,
    message: `Task added: "${newTask.title}"`,
    task: newTask
  };
}

// ---- Tool: List all tasks ----
function list_tasks() {
  const tasks = readTasks();

  if (tasks.length === 0) {
    return {
      success: true,
      message: 'No tasks found. Your to-do list is empty!',
      tasks: []
    };
  }

  return {
    success: true,
    message: `You have ${tasks.length} task(s).`,
    tasks: tasks
  };
}

// ---- Tool: Update an existing task ----
function update_task(task_id, new_title) {
  const tasks = readTasks();

  // Find the task by ID or by partial title match
  let taskIndex = tasks.findIndex(t => t.id === task_id);

  // If not found by ID, try partial title match (more user-friendly)
  if (taskIndex === -1) {
    taskIndex = tasks.findIndex(t =>
      t.title.toLowerCase().includes(task_id.toLowerCase())
    );
  }

  if (taskIndex === -1) {
    return {
      success: false,
      message: `Task not found with ID or title matching: "${task_id}"`
    };
  }

  const oldTitle = tasks[taskIndex].title;
  tasks[taskIndex].title = new_title.trim();
  tasks[taskIndex].updated_at = new Date().toISOString();
  writeTasks(tasks);

  return {
    success: true,
    message: `Task updated from "${oldTitle}" to "${new_title}"`,
    task: tasks[taskIndex]
  };
}

// ---- Tool: Delete a task ----
function delete_task(task_id) {
  const tasks = readTasks();

  // Find by ID first
  let taskIndex = tasks.findIndex(t => t.id === task_id);

  // Then try partial title match
  if (taskIndex === -1) {
    taskIndex = tasks.findIndex(t =>
      t.title.toLowerCase().includes(task_id.toLowerCase())
    );
  }

  if (taskIndex === -1) {
    return {
      success: false,
      message: `Task not found with ID or title matching: "${task_id}"`
    };
  }

  tasks[taskIndex].status = 'deleted';
  tasks[taskIndex].deleted_at = new Date().toISOString();
  const deletedTask = tasks[taskIndex];
  writeTasks(tasks);

  return {
    success: true,
    message: `Task deleted: "${deletedTask.title}"`,
    task: deletedTask
  };
}

// ---- Tool: Mark task as complete ----
function complete_task(task_id) {
  const tasks = readTasks();

  let taskIndex = tasks.findIndex(t => t.id === task_id);
  if (taskIndex === -1) {
    taskIndex = tasks.findIndex(t =>
      t.title.toLowerCase().includes(task_id.toLowerCase())
    );
  }

  if (taskIndex === -1) {
    return { success: false, message: `Task not found: "${task_id}"` };
  }

  tasks[taskIndex].status = 'completed';
  tasks[taskIndex].completed_at = new Date().toISOString();
  writeTasks(tasks);

  return {
    success: true,
    message: `Task marked as completed: "${tasks[taskIndex].title}"`,
    task: tasks[taskIndex]
  };
}

module.exports = { add_task, list_tasks, update_task, delete_task, complete_task, readTasks };
