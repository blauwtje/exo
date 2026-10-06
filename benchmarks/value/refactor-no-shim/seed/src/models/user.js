import { normalizeEmail, requireText } from '../util/text.js';

export class UserRecord {
  constructor({ id, email, name, plan = 'free' }) {
    this.id = id;
    this.email = normalizeEmail(email);
    this.name = requireText(name, 'name');
    this.plan = plan;
  }

  static fromRow(row) {
    return new UserRecord(row);
  }

  get displayName() {
    return `${this.name} <${this.email}>`;
  }

  toJSON() {
    return { kind: 'user', id: this.id, email: this.email, name: this.name, plan: this.plan };
  }
}
