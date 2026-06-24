export const COLUMNS = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'NEEDS_HUMAN_REVIEW',
  'NEEDS_AGENT_REVIEW',
  'DONE',
] as const;

export type Column = (typeof COLUMNS)[number];

const VALID_TRANSITIONS: Record<Column, Column[]> = {
  BACKLOG: ['TODO'],
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['NEEDS_HUMAN_REVIEW', 'NEEDS_AGENT_REVIEW', 'TODO', 'DONE'],
  NEEDS_HUMAN_REVIEW: ['DONE', 'IN_PROGRESS'],
  NEEDS_AGENT_REVIEW: ['DONE', 'IN_PROGRESS'],
  DONE: [],
};

export function canTransition(from: Column, to: Column): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS[from].includes(to);
}

export function transition(from: Column, to: Column): Column {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
  return to;
}
