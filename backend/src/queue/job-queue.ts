export class JobQueue {
  private queue: string[] = [];
  private activeJobId: string | null = null;

  enqueue(jobId: string): void {
    this.queue.push(jobId);
  }

  dequeue(): string | undefined {
    return this.queue.shift();
  }

  cancel(jobId: string): boolean {
    const index = this.queue.indexOf(jobId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  getPosition(jobId: string): number {
    const index = this.queue.indexOf(jobId);
    return index === -1 ? -1 : index + 1;
  }

  setActive(jobId: string | null): void {
    this.activeJobId = jobId;
  }

  getActive(): string | null {
    return this.activeJobId;
  }

  getQueue(): string[] {
    return [...this.queue];
  }

  size(): number {
    return this.queue.length;
  }
}
