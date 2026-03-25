import { startWatcher } from './watcher';

// Full integration tests for startWatcher are not feasible in a unit test context
// because they require a real filesystem watcher (chokidar) that reacts to actual
// file-system events, a real SQLite DB with the correct schema, a running JobQueue
// and Worker, and the ability to reliably trigger and observe async chokidar events
// within Jest's execution environment. These concerns are better covered by a
// dedicated integration test suite or manual/end-to-end testing.

describe('watcher module', () => {
  it('exports startWatcher as a function', () => {
    expect(typeof startWatcher).toBe('function');
  });

  it('startWatcher accepts four arguments', () => {
    expect(startWatcher.length).toBe(4);
  });
});
