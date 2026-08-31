import { LlmTool } from './llmService';

/**
 * Tool definitions for checklist editing. Groups and items are referenced by
 * their shortened IDs, which are exposed to the LLM in the checklist state
 * injected into the system prompt (see ChecklistStore.applyLlmEdit).
 */

export const ADD_CHECKLIST_GROUP_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'add_checklist_group',
    description: 'Add a new titled section (group) to the checklist, optionally with initial items.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The heading for the new section.' },
        items: {
          type: 'array',
          description: 'Optional initial tasks for the new section.',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'The task text.' },
              details: { type: 'string', description: 'Optional extra note.' },
            },
            required: ['content'],
          },
        },
      },
      required: ['title'],
    },
  },
};

export const RENAME_CHECKLIST_GROUP_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'rename_checklist_group',
    description: 'Rename an existing section (group).',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the group.' },
        title: { type: 'string', description: 'The new heading.' },
      },
      required: ['groupId', 'title'],
    },
  },
};

export const DELETE_CHECKLIST_GROUP_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'delete_checklist_group',
    description: 'Delete a section (group) and all its tasks.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the group to delete.' },
      },
      required: ['groupId'],
    },
  },
};

export const REORDER_CHECKLIST_GROUPS_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'reorder_checklist_groups',
    description: 'Move one section (group) to a zero-based position in the checklist.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the group to move.' },
        toIndex: { type: 'integer', description: 'The zero-based destination position.' },
      },
      required: ['groupId', 'toIndex'],
    },
  },
};

export const ADD_CHECKLIST_ITEM_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'add_checklist_item',
    description: 'Add a new task to a section (group).',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the target group.' },
        content: { type: 'string', description: 'The task text.' },
        details: { type: 'string', description: 'Optional extra note.' },
      },
      required: ['groupId', 'content'],
    },
  },
};

export const UPDATE_CHECKLIST_ITEM_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'update_checklist_item',
    description: 'Update a task — its text, details, or checked state.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'The short ID of the item.' },
        content: { type: 'string', description: 'Optional new task text.' },
        details: { type: 'string', description: 'Optional new details note.' },
        checked: { type: 'boolean', description: 'Optional checked/unchecked state.' },
      },
      required: ['itemId'],
    },
  },
};

export const DELETE_CHECKLIST_ITEM_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'delete_checklist_item',
    description: 'Remove a task from its section.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'The short ID of the item to delete.' },
      },
      required: ['itemId'],
    },
  },
};

export const REORDER_CHECKLIST_ITEMS_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'reorder_checklist_items',
    description: 'Move one task to a zero-based position within its current section (group).',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'The short ID of the task to move.' },
        toIndex: { type: 'integer', description: "The zero-based destination position within the task's current group." },
      },
      required: ['itemId', 'toIndex'],
    },
  },
};

export const SET_CHECKLIST_ITEM_ORDER_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'set_checklist_item_order',
    description:
      'Set the full order of every task in a section (group) in a single call, for example to sort them. Provide every task ID of the group, in the desired order.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the group to reorder.' },
        itemIds: { type: 'array', items: { type: 'string' }, description: 'All task IDs in the group, in the desired order.' },
      },
      required: ['groupId', 'itemIds'],
    },
  },
};

export const ADD_CHECKLIST_ITEMS_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'add_checklist_items',
    description: 'Add several new tasks to an existing section (group) in a single call.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the target group.' },
        items: {
          type: 'array',
          description: 'The tasks to add.',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'The task text.' },
              details: { type: 'string', description: 'Optional extra note.' },
            },
            required: ['content'],
          },
        },
      },
      required: ['groupId', 'items'],
    },
  },
};

export const DELETE_CHECKLIST_ITEMS_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'delete_checklist_items',
    description: 'Remove several tasks at once.',
    parameters: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' }, description: 'The short IDs of the tasks to delete.' },
      },
      required: ['itemIds'],
    },
  },
};

export const CHECKLIST_TOOLS: LlmTool[] = [
  ADD_CHECKLIST_GROUP_TOOL,
  RENAME_CHECKLIST_GROUP_TOOL,
  DELETE_CHECKLIST_GROUP_TOOL,
  REORDER_CHECKLIST_GROUPS_TOOL,
  ADD_CHECKLIST_ITEM_TOOL,
  UPDATE_CHECKLIST_ITEM_TOOL,
  DELETE_CHECKLIST_ITEM_TOOL,
  REORDER_CHECKLIST_ITEMS_TOOL,
  SET_CHECKLIST_ITEM_ORDER_TOOL,
  ADD_CHECKLIST_ITEMS_TOOL,
  DELETE_CHECKLIST_ITEMS_TOOL,
];
