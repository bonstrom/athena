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
    description: 'Reorder all sections (groups) by supplying the full desired order of group IDs.',
    parameters: {
      type: 'object',
      properties: {
        groupIds: { type: 'array', items: { type: 'string' }, description: 'The full desired order of group IDs.' },
      },
      required: ['groupIds'],
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
    description: 'Reorder the tasks within one section (group) by supplying the full desired order of item IDs.',
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'The short ID of the group whose items are reordered.' },
        itemIds: { type: 'array', items: { type: 'string' }, description: 'The full desired order of item IDs.' },
      },
      required: ['groupId', 'itemIds'],
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
];
