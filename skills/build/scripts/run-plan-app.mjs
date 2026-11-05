import fs from 'node:fs';
import { killTree, startDetached, waitForUrl, withoutRunVariables } from '#process-tree';
import { clip } from './run-report.mjs';
import { isFileOnDisk } from './run-session-claude.mjs';
import { lastLine } from './run-plan-preflight.mjs';

let appPid = null;

export function killApp() {
  if (appPid !== null) killTree(appPid);
}

export async function ensureApp(ctx) {
  const { app, root, appLog, appDeadlineMs, say } = ctx;
  if (app === null || (ctx.appIsReady && !ctx.appHandle.exited())) return true;
  if (ctx.appHandle === null || ctx.appHandle.exited()) {
    say(`app start: ${clip(app.start, 80)}`);
    ctx.appHandle = startDetached(app.start, { cwd: root, env: withoutRunVariables(), log: appLog });
    appPid = ctx.appHandle.pid ?? null;
  }
  ctx.appIsReady = app.ready !== null && await waitForUrl(app.ready, { deadlineMs: appDeadlineMs, app: ctx.appHandle });
  if (ctx.appIsReady) say(`app ready: ${app.ready}`);
  return ctx.appIsReady;
}

export function appTail(ctx) {
  return clip(lastLine(isFileOnDisk(ctx.appLog) ? fs.readFileSync(ctx.appLog, 'utf8') : '') || 'empty', 80);
}
