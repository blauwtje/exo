export class Spend {
  constructor(maxUsd) { this.maxUsd = maxUsd; this.reply = 0; this.judge = 0; }
  get total() { return this.reply + this.judge; }
  add(cost, kind = 'reply') {
    this[kind] += cost;
    if (this.total > this.maxUsd) throw new Error(`spend ${this.total.toFixed(4)} passed --max-usd ${this.maxUsd}`);
  }
  line() { return `cost_usd=${this.total.toFixed(4)} reply_cost_usd=${this.reply.toFixed(4)} judge_cost_usd=${this.judge.toFixed(4)}\n`; }
}
