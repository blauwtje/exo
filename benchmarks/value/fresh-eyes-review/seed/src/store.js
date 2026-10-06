import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export class NotFoundError extends Error {
  constructor(id) {
    super(`no task #${id}`);
    this.name = 'NotFoundError';
    this.id = id;
  }
}

const FORMAT_VERSION = 1;

export class TaskStore {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
    this.records = new Map();
  }

  static load(path, options) {
    const store = new TaskStore(options);
    if (!existsSync(path)) return store;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data.version !== FORMAT_VERSION) {
      throw new Error(`unsupported data file version ${data.version}`);
    }
    for (const task of data.tasks) store.records.set(task.id, task);
    return store;
  }

  save(path) {
    const data = { version: FORMAT_VERSION, tasks: this.list() };
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  nextId() {
    const tasks = this.list();
    return tasks.length === 0 ? 1 : tasks[tasks.length - 1].id + 1;
  }

  create({ title, tags = [], dueAt = null }) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new TypeError('title is required');
    }
    const at = this.now();
    const task = {
      id: this.nextId(),
      title: title.trim(),
      tags: [...tags],
      status: 'open',
      dueAt,
      createdAt: at,
      updatedAt: at,
    };
    this.records.set(task.id, task);
    return { ...task };
  }

  get(id) {
    const task = this.records.get(id);
    if (!task) throw new NotFoundError(id);
    return { ...task };
  }

  update(id, changes) {
    const task = this.records.get(id);
    if (!task) throw new NotFoundError(id);
    Object.assign(task, changes, { id, updatedAt: this.now() });
    return { ...task };
  }

  delete(id) {
    if (!this.records.delete(id)) throw new NotFoundError(id);
  }

  list({ status } = {}) {
    return [...this.records.values()]
      .filter((task) => status === undefined || task.status === status)
      .sort((a, b) => a.id - b.id)
      .map((task) => ({ ...task }));
  }

  count() {
    return this.records.size;
  }
}
