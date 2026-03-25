import { JobQueue } from './job-queue';

describe('JobQueue', () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue();
  });

  describe('enqueue / dequeue', () => {
    it('dequeues in FIFO order', () => {
      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      expect(queue.dequeue()).toBe('a');
      expect(queue.dequeue()).toBe('b');
      expect(queue.dequeue()).toBe('c');
    });

    it('returns undefined when empty', () => {
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  describe('cancel', () => {
    it('removes a queued job and returns true', () => {
      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      expect(queue.cancel('b')).toBe(true);
      expect(queue.getQueue()).toEqual(['a', 'c']);
    });

    it('returns false if job not in queue', () => {
      queue.enqueue('a');
      expect(queue.cancel('z')).toBe(false);
    });
  });

  describe('getPosition', () => {
    it('returns 1-based position', () => {
      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      expect(queue.getPosition('a')).toBe(1);
      expect(queue.getPosition('b')).toBe(2);
      expect(queue.getPosition('c')).toBe(3);
    });

    it('returns -1 if not found', () => {
      expect(queue.getPosition('z')).toBe(-1);
    });
  });

  describe('active job', () => {
    it('defaults to null', () => {
      expect(queue.getActive()).toBeNull();
    });

    it('can be set and cleared', () => {
      queue.setActive('job-1');
      expect(queue.getActive()).toBe('job-1');
      queue.setActive(null);
      expect(queue.getActive()).toBeNull();
    });
  });

  describe('getQueue', () => {
    it('returns a snapshot (not a reference)', () => {
      queue.enqueue('a');
      const snapshot = queue.getQueue();
      queue.enqueue('b');
      expect(snapshot).toEqual(['a']);
    });
  });

  describe('size', () => {
    it('returns 0 when empty', () => {
      expect(queue.size()).toBe(0);
    });

    it('tracks enqueue and dequeue', () => {
      queue.enqueue('a');
      queue.enqueue('b');
      expect(queue.size()).toBe(2);
      queue.dequeue();
      expect(queue.size()).toBe(1);
    });
  });
});
