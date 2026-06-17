import type { SessionDTO } from "../types";

export function sessionBreadcrumbs(session: SessionDTO): string[] {
  const base = session.worktree?.repoRoot ?? session.cwd;
  const parts = base.split("/").filter(Boolean);
  const crumbs: string[] = [];

  if (parts.length >= 2) crumbs.push(parts[parts.length - 2]);
  crumbs.push(parts[parts.length - 1] ?? base);

  if (session.worktree) crumbs.push(session.worktree.branch);
  crumbs.push(session.name);

  return crumbs;
}