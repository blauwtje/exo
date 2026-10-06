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

  // Every record, deleted ones included: the data file and id allocation need them.
  #everything() {
    return [...this.records.values()].sort((a, b) => a.id - b.id);
  }

  #live(id) {
    const task = this.records.get(id);
    if (!task || task.deletedAt !== undefined) throw new NotFoundError(id);
    return task;
  }

  save(path) {
    const data = { version: FORMAT_VERSION, tasks: this.#everything().map((task) => ({ ...task })) };
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  nextId() {
    const tasks = this.#everything();
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
    return { ...this.#live(id) };
  }

  update(id, changes) {
    const task = this.#live(id);
    Object.assign(task, changes, { id, updatedAt: this.now() });
    return { ...task };
  }

  delete(id) {
    this.#live(id).deletedAt = this.now();
  }

  list({ status } = {}) {
    return this.#everything()
      .filter((task) => task.deletedAt === undefined)
      .filter((task) => status === undefined || task.status === status)
      .map((task) => ({ ...task }));
  }

  count() {
    return this.list().length;
  }
}
