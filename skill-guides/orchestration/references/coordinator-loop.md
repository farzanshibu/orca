# Coordinator loop

Load this reference for expanded DAG waves, per-invocation launch preferences,
same-terminal reuse, or review ownership. The compact guide remains the source
of truth for the loop order and completion boundary.

## Ready waves

Create independent Tasks before the first wait. Encode only real dependencies,
then use the ready view as external memory:

```text
ORCA orchestration task-create --spec "<dependent work>" --deps <json_array> --json
ORCA orchestration task-list --ready --brief --json
```

`--brief` collapses whitespace and caps echoed specs at 160 characters;
`spec_truncated` identifies shortened rows. Omit it when full specs are needed or
when an older CLI rejects the flag. A nested worker must respect
`nested_worker_depth_exceeded`; creating another Run does not reset depth.

## Launch preferences

For a fresh Claude, Codex, Cursor, Antigravity, or Muse terminal, `--model`
accepts an opaque provider model ID. Pass it only when the user named a model;
otherwise omit it so the worker inherits the user's configured agent default.
Add `--effort` only when that model supports it:

```text
ORCA orchestration worker-start --task <task_id> --worktree current --agent claude --model opus --effort high --json
ORCA orchestration worker-start --task <task_id> --worktree current --agent muse --model muse-spark-1.3 --json
```

Other agents, including `opencode`, reject `--model`; they run the model set in
their own config, so a coordinator wanting a same-model opencode worker relies
on that config.

`--effort` requires `--model`; neither option combines with `--terminal`. A
connected worker server must advertise launch-preference support before Orca
forwards either field. Compare `launch.requested` with `launch.effective`; never
claim a model or effort from requested arguments alone.

## Reuse after settlement

Choose the terminal's next owner before acknowledging the Delivery. When the
same exact agent has immediate follow-up work, recover the proven handle and
transfer cleanup ownership to the new Dispatch:

```text
ORCA orchestration worker-show --dispatch <dispatch_id> --json
ORCA orchestration worker-start --task <next_task_id> --terminal <agent_terminal_handle> --json
```

Otherwise explicitly retain or release the settled worker. Do not leave it live
only to inspect output; archived output remains available through `worker-read`.

## Review ownership

A review-only `worker_done` authorizes synthesis of findings, not coordinator
file edits. Dispatch or hand off fixes unless the user explicitly assigned them
to the coordinator. If the user's plan names a next owner, post-review fixes and
PR preparation remain with that owner; the coordinator routes and synthesizes.

## Team manager

A standing team (`ORCA team show --team <team> --json`) is a per-repository
roster of named role agents that share one Run. When you are its manager, Orca
binds you as that Run's coordinator when it starts you; if a restart lost the
binding, run `ORCA orchestration run-use --id <team_run_id>`.

- A goal arrives as a queued `GOAL <ref>:` message. Plan it into tasks with one
  owner each, and let Orca dispatch them:
  `ORCA team task add --team <team> --goal <goal_ref> --title <title> --spec <spec> --assignee <slug> [--deps <ref,ref>] --json`.
  Orca starts each task in its owner's own terminal once its `--deps` are done
  and the owner is free, one task per member at a time; tasks with no
  dependency between them run in parallel. Do not `worker-start` them.
- Give an existing task an owner, or a failed one another try:
  `ORCA team task assign --team <team> --task <ref> --member <slug> --json`.
  The result's `waiting` says why a task has not started; Orca starts it when
  that clears. A start that fails is retried after 1 and then 5 minutes; after
  the third failure Orca escalates to your mailbox and waits for you to assign
  the task again.
- In a git repository each member works in its own worktree and branch; in a
  folder project every member shares one folder, so split work by path and
  name the paths in each spec. `team show` lists each member's `worktree_id`,
  `current_task`, `waiting_reason`, and the team's `goals` with their progress.
- When every task of a goal is done, Orca sends you one `REVIEW GOAL <ref>:`
  message. Review, then merge the members' branches (your git host's pull or
  merge requests, or a local merge) or, in a folder project, check the pieces
  fit together. File another task under the goal if something is missing, then:
  `ORCA team goal close --team <team> --goal <goal_ref> --summary <text> --json`.
  `--cancel` stops a goal and cancels its tasks that have not started.
- Raw `worker-start` still works for work outside a goal, but a member's
  terminal lives in its own worktree, so pass both:
  `ORCA orchestration worker-start --task <task_id> --terminal <member_handle> --worktree id:<member_worktree_id> --json`.
  A member already working a task refuses it.
- Address mail by role or name: `--to @role:<role>` or `--to @member:<slug>`;
  members reach you at `@role:manager`. Mail reaches a member whether it is
  working or idle. A stopped member comes back as a `recipient_unreachable`
  warning with nothing delivered; one Orca cannot reach right now gets the same
  warning and its mail waits for it.
- Members may message each other the same way. Once two of them have traded 6
  replies in one thread, Orca holds the next message and sends it to you as one
  escalation; decide what they need and tell them.
- A paused member or a paused team refuses new dispatches. Do not route around a
  pause; tell the human instead.
- Steer a busy member without a new task:
  `ORCA team member send --team <team> --member <slug> --text <text>`.
  Only the human may interrupt a member.
- You cannot hire. Propose it and keep working; the human decides:
  `ORCA team hire-propose --team <team> --slug <slug> --role <role> --agent <agent> --rationale <why>`.
- Keep the shared plan in the board file your brief names (one copy under the
  repository's main checkout, shared by every member); members read it first.
- Outside work arrives as queued `[mission:…]`, `[webhook]`, or `ENRICH TASK:`
  messages. File each as a task with `team task add --assignee`, or group
  larger work under a goal of your own:
  `ORCA team goal create --team <team> --title <title> --json`.
