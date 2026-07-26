import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, transition, COLUMNS, type Column } from './state-machine.ts';

describe('COLUMNS', () => {
  it('exports the six canonical column names', () => {
    assert.deepEqual(COLUMNS, [
      'BACKLOG',
      'TODO',
      'IN_PROGRESS',
      'NEEDS_HUMAN_REVIEW',
      'NEEDS_AGENT_REVIEW',
      'DONE',
    ]);
  });
});

describe('canTransition — valid moves', () => {
  const valid: [Column, Column][] = [
    ['BACKLOG', 'TODO'],
    ['TODO', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'NEEDS_HUMAN_REVIEW'],
    ['IN_PROGRESS', 'NEEDS_AGENT_REVIEW'],
    ['IN_PROGRESS', 'TODO'],
    ['IN_PROGRESS', 'DONE'],
    ['NEEDS_HUMAN_REVIEW', 'DONE'],
    ['NEEDS_HUMAN_REVIEW', 'IN_PROGRESS'],
    ['NEEDS_HUMAN_REVIEW', 'TODO'],
    ['NEEDS_AGENT_REVIEW', 'DONE'],
    ['NEEDS_AGENT_REVIEW', 'IN_PROGRESS'],
    ['NEEDS_AGENT_REVIEW', 'TODO'],
  ];

  for (const [from, to] of valid) {
    it(`allows ${from} → ${to}`, () => {
      assert.equal(canTransition(from, to), true);
    });
  }
});

describe('canTransition — invalid moves', () => {
  const invalid: [Column, Column][] = [
    ['BACKLOG', 'IN_PROGRESS'],
    ['BACKLOG', 'NEEDS_HUMAN_REVIEW'],
    ['BACKLOG', 'NEEDS_AGENT_REVIEW'],
    ['BACKLOG', 'DONE'],
    ['TODO', 'BACKLOG'],
    ['TODO', 'NEEDS_HUMAN_REVIEW'],
    ['TODO', 'DONE'],
    ['IN_PROGRESS', 'BACKLOG'],
    ['NEEDS_HUMAN_REVIEW', 'BACKLOG'],
    ['NEEDS_HUMAN_REVIEW', 'NEEDS_AGENT_REVIEW'],
    ['NEEDS_AGENT_REVIEW', 'BACKLOG'],
    ['NEEDS_AGENT_REVIEW', 'NEEDS_HUMAN_REVIEW'],
    ['DONE', 'BACKLOG'],
    ['DONE', 'TODO'],
    ['DONE', 'IN_PROGRESS'],
    ['DONE', 'NEEDS_HUMAN_REVIEW'],
    ['DONE', 'NEEDS_AGENT_REVIEW'],
  ];

  for (const [from, to] of invalid) {
    it(`rejects ${from} → ${to}`, () => {
      assert.equal(canTransition(from, to), false);
    });
  }
});

describe('canTransition — same-column moves', () => {
  for (const col of COLUMNS) {
    it(`rejects ${col} → ${col} (no-op)`, () => {
      assert.equal(canTransition(col, col), false);
    });
  }
});

describe('transition', () => {
  it('returns new column on valid transition', () => {
    assert.equal(transition('BACKLOG', 'TODO'), 'TODO');
  });

  it('throws on invalid transition', () => {
    assert.throws(
      () => transition('BACKLOG', 'DONE'),
      (err: Error) => {
        assert.match(err.message, /invalid transition/i);
        return true;
      }
    );
  });

  it('includes from/to columns in error message', () => {
    assert.throws(
      () => transition('TODO', 'NEEDS_HUMAN_REVIEW'),
      (err: Error) => {
        assert.ok(err.message.includes('TODO'));
        assert.ok(err.message.includes('NEEDS_HUMAN_REVIEW'));
        return true;
      }
    );
  });
});
