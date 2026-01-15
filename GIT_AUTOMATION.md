# Git Automation Setup

## Automatic GitHub Push

Git hooks have been configured to automatically push commits to GitHub.

### What's Automated

**Post-Commit Hook** (`.git/hooks/post-commit`):
- Automatically pushes to GitHub after every commit on `main` branch
- Shows success/failure status
- Only runs on main branch (feature branches must be pushed manually)

**Pre-Push Hook** (`.git/hooks/pre-push`):
- Fetches latest changes from GitHub before pushing
- Automatically rebases if remote has new commits
- Prevents push failures due to being behind origin

### How It Works

```bash
# You just commit as normal:
git add file.txt
git commit -m "Update file"

# Hooks automatically run:
# 1. post-commit: Pushes to GitHub
# 2. If conflicts, pre-push: Pulls and rebases first
```

### Example Output

```
[main abc1234] Update file
 1 file changed, 10 insertions(+)
🚀 Auto-pushing to GitHub...
   To https://github.com/schwarztim/akamai-mcp-server.git
      def5678..abc1234  main -> main
✅ Pushed to GitHub successfully
```

### Disable Auto-Push

If you need to disable auto-push temporarily:

```bash
# Rename the hook to disable it
mv .git/hooks/post-commit .git/hooks/post-commit.disabled

# Re-enable later
mv .git/hooks/post-commit.disabled .git/hooks/post-commit
```

### Manual Push

The automation doesn't prevent manual pushes:

```bash
# Still works as usual
git push origin main
```

### Benefits

- ✅ **Never forget to push** - Happens automatically
- ✅ **Always backed up** - Every commit is on GitHub
- ✅ **Conflict prevention** - Pre-push hook handles rebasing
- ✅ **CI/CD ready** - Automated systems see changes immediately
- ✅ **Team sync** - Others always have latest code

### Safety Features

1. **Main branch only**: Only auto-pushes the main branch
2. **Conflict handling**: Pre-push hook attempts automatic rebase
3. **Manual fallback**: If automation fails, you can push manually
4. **No force push**: Never uses `--force`, safe for collaboration

### Troubleshooting

**Push fails with "rejected"**:
```bash
# Manually pull and push
git pull --rebase origin main
git push origin main
```

**Disable hooks temporarily**:
```bash
git commit --no-verify -m "message"  # Skips hooks
```

**Check hook status**:
```bash
ls -la .git/hooks/ | grep -E "(pre-push|post-commit)"
```
# Automation Test
