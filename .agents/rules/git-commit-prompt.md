---
activation: always_on
---

# Commit prompt after each task

When you finish a task that changed files in this workspace:

1. Run `git status --short` and show me the list of changed files.
2. Ask me: "Commit these changes? (yes/no)". Do not commit before I answer.
3. If I say yes:
   - First check that nothing sensitive would be committed: .env files,
     API keys, credentials, node_modules, build output. If you see any,
     stop and tell me instead of committing.
   - Run `git add -A`, then `git commit -m "<message>"`.
   - Message: one line, under 72 characters, imperative mood, with a
     prefix (feat:, fix:, refactor:, docs:, chore:) describing what you
     did in this task.
4. If I say no, do nothing and don't ask again for this task.
5. Never run `git push`. Never amend or rewrite earlier commits.
6. If the task changed no files, or this folder is not a git
   repository, skip all of this silently.
