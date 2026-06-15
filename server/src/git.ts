import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", cwd, ...args], {
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout.trim();
}

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

export interface GitInfo {
  isRepo: boolean;
  repoRoot?: string;
  currentBranch?: string;
  branches?: string[];
}

/** Probe a directory for git repo status (used by the new-session modal). */
export async function gitInfo(dir: string): Promise<GitInfo> {
  try {
    const repoRoot = await git(dir, ["rev-parse", "--show-toplevel"]);
    let currentBranch: string | undefined;
    try {
      currentBranch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    } catch {
      /* detached HEAD or empty repo */
    }
    let branches: string[] = [];
    try {
      const out = await git(dir, ["branch", "--format=%(refname:short)"]);
      branches = out.split("\n").map((b) => b.trim()).filter(Boolean);
    } catch {
      /* ignore */
    }
    return { isRepo: true, repoRoot, currentBranch, branches };
  } catch {
    return { isRepo: false };
  }
}

/** Sanitize a session name into a valid git branch ref component. */
export function toBranchName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^A-Za-z0-9._/-]/g, "-")
      .replace(/^[-/.]+|[-/.]+$/g, "")
      .replace(/-+/g, "-") || "session"
  );
}

async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  try {
    await git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export interface WorktreeResult {
  path: string;
  branch: string;
  repoRoot: string;
}

/**
 * Create a new worktree off `base`, on a fresh `mc/<name>` branch (suffixed with
 * the short id if that branch already exists, to avoid collisions).
 */
export async function addWorktree(opts: {
  repoRoot: string;
  worktreePath: string;
  name: string;
  shortId: string;
  base?: string;
}): Promise<WorktreeResult> {
  const { repoRoot, worktreePath, shortId } = opts;
  let branch = `mc/${toBranchName(opts.name)}`;
  if (await branchExists(repoRoot, branch)) branch = `${branch}-${shortId}`;

  const args = ["worktree", "add", "-b", branch, worktreePath];
  if (opts.base) args.push(opts.base);
  await git(repoRoot, args);
  return { path: worktreePath, branch, repoRoot };
}

/** Whether a worktree has uncommitted (tracked or untracked) changes. */
export async function worktreeHasChanges(worktreePath: string): Promise<boolean> {
  try {
    const out = await git(worktreePath, ["status", "--porcelain"]);
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Remove a worktree (keeps its branch). Throws if dirty and not forced. */
export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
  force: boolean
): Promise<void> {
  const args = ["worktree", "remove", worktreePath];
  if (force) args.push("--force");
  await git(repoRoot, args);
}

export interface MergeRequestResult {
  branch: string;
  base: string;
  committed: number; // files committed (0 if nothing to commit)
  pushed: boolean;
  prCreated: boolean; // a PR was opened via gh
  url?: string; // PR url, or a compare url to open one manually
  localMergeCommand?: string; // fallback when there's no remote
  message: string;
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await exec(cmd, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/** Turn an origin remote URL into an https web base, or null if not parseable. */
function webBaseFromRemote(remote: string): string | null {
  let m = remote.match(/git@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  m = remote.match(/^https?:\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  return null;
}

/**
 * Prepare a merge request from `branch` into `base`:
 *  - commit any pending changes,
 *  - push the branch (if an `origin` remote exists),
 *  - open a PR with `gh` when available, else return a compare URL.
 * Degrades gracefully for local-only repos.
 */
export async function prepareMergeRequest(opts: {
  cwd: string;
  branch?: string;
  base?: string;
  title: string;
  body: string;
}): Promise<MergeRequestResult> {
  const { cwd } = opts;
  const branch =
    opts.branch || (await tryGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])) || "HEAD";

  // Pick a base branch.
  let base = opts.base;
  if (!base) {
    if (await tryGit(cwd, ["rev-parse", "--verify", "--quiet", "refs/heads/main"])) base = "main";
    else if (await tryGit(cwd, ["rev-parse", "--verify", "--quiet", "refs/heads/master"]))
      base = "master";
    else base = "main";
  }

  if (branch === base) {
    throw new Error(`Session is on '${branch}', the base branch — nothing to merge.`);
  }

  // 1) Commit pending work, if any.
  const status = (await tryGit(cwd, ["status", "--porcelain"])) ?? "";
  let committed = 0;
  if (status.trim()) {
    committed = status.split("\n").filter((l) => l.trim()).length;
    await git(cwd, ["add", "-A"]);
    await git(cwd, ["commit", "-m", opts.title]);
  }

  // 2) Is there a remote?
  const remote = await tryGit(cwd, ["remote", "get-url", "origin"]);
  if (!remote) {
    return {
      branch,
      base,
      committed,
      pushed: false,
      prCreated: false,
      localMergeCommand: `git merge ${branch}`,
      message:
        committed > 0
          ? `Committed ${committed} change(s) on '${branch}'. No 'origin' remote — merge locally with: git checkout ${base} && git merge ${branch}`
          : `Branch '${branch}' is ready. No 'origin' remote — merge locally with: git checkout ${base} && git merge ${branch}`,
    };
  }

  // 3) Push the branch.
  let pushed = false;
  try {
    await git(cwd, ["push", "-u", "origin", branch]);
    pushed = true;
  } catch (err: any) {
    return {
      branch,
      base,
      committed,
      pushed: false,
      prCreated: false,
      message: `Committed ${committed} change(s) but failed to push '${branch}': ${String(
        err?.message ?? err
      ).slice(0, 200)}`,
    };
  }

  // 4) Open a PR with gh if available.
  if (await commandExists("gh")) {
    try {
      const { stdout } = await exec(
        "gh",
        ["pr", "create", "--base", base, "--head", branch, "--title", opts.title, "--body", opts.body],
        { cwd }
      );
      const url = stdout.trim().split("\n").filter(Boolean).pop();
      return {
        branch,
        base,
        committed,
        pushed,
        prCreated: true,
        url,
        message: `Pull request opened: ${url ?? "(created)"}`,
      };
    } catch (err: any) {
      // gh failed (e.g. PR already exists) — fall through to a compare URL.
    }
  }

  // 5) Fallback: a compare URL to open the PR manually.
  const webBase = webBaseFromRemote(remote);
  const url = webBase ? `${webBase}/compare/${base}...${branch}?expand=1` : undefined;
  return {
    branch,
    base,
    committed,
    pushed,
    prCreated: false,
    url,
    message: url
      ? `Pushed '${branch}'. Open the merge request: ${url}`
      : `Pushed '${branch}' to origin. Open a merge request into '${base}' on your host.`,
  };
}
