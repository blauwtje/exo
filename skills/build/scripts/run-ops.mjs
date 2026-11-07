import { appendOp } from './run-state.mjs';
import { gitResult } from '#git';

export function snapshotRefs(root) {
  const refs = new Map();
  const listed = gitResult(root, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']);
  for (const line of listed.text.split('\n').filter(Boolean)) {
    const [ref, sha] = line.split(' ');
    refs.set(ref, sha);
  }
  const head = gitResult(root, ['symbolic-ref', '-q', 'HEAD']);
  return { refs, head: head.ok ? head.text : null };
}

export function recordRefDiff(root, id, before, label) {
  const after = snapshotRefs(root);
  const names = [...new Set([...before.refs.keys(), ...after.refs.keys()])].sort();
  for (const ref of names) {
    const was = before.refs.get(ref) ?? null;
    const now = after.refs.get(ref) ?? null;
    if (was !== now) appendOp(root, id, { kind: 'ref', label, ref, before: was, after: now });
  }
  if (before.head !== after.head) appendOp(root, id, { kind: 'head', label, root, before: before.head, after: after.head });
}

export function recordWorktree(root, id, label, worktree, branch) {
  appendOp(root, id, { kind: 'worktree', label, path: worktree, branch });
}

export function recordPush(root, id, label, remote, ref, sha) {
  appendOp(root, id, { kind: 'push', label, remote, ref, sha });
}
