# GitHub Repository Setup Guide

This guide will help you create a GitHub repository and push your Akamai MCP Server code.

## Option 1: Using GitHub CLI (Recommended)

### Install GitHub CLI

```bash
# macOS
brew install gh

# Linux
sudo apt install gh

# Windows
winget install GitHub.cli
```

### Create Repository and Push

```bash
# 1. Authenticate with GitHub
gh auth login

# 2. Create repository
gh repo create akamai-mcp-server \
  --public \
  --description "Production-ready Model Context Protocol server for Akamai APIs with EdgeGrid authentication" \
  --source=. \
  --push

# That's it! Your repository is created and code is pushed.
```

### Verify

```bash
# View repository
gh repo view --web

# Check status
git remote -v
```

---

## Option 2: Using GitHub Web Interface

### Step 1: Create Repository on GitHub

1. Go to https://github.com/new
2. Fill in repository details:
   - **Repository name**: `akamai-mcp-server`
   - **Description**: `Production-ready Model Context Protocol server for Akamai APIs with EdgeGrid authentication`
   - **Visibility**: Public (or Private if preferred)
   - **⚠️ Do NOT initialize**: Don't add README, .gitignore, or license (we already have them)
3. Click "Create repository"

### Step 2: Push Existing Repository

GitHub will show you commands. Use these:

```bash
# Add GitHub as remote origin
git remote add origin https://github.com/YOUR_USERNAME/akamai-mcp-server.git

# Push to GitHub
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 3: Verify

Visit your repository: `https://github.com/YOUR_USERNAME/akamai-mcp-server`

---

## Option 3: Using SSH (More Secure)

### Step 1: Setup SSH Key (if not already done)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Start SSH agent
eval "$(ssh-agent -s)"

# Add key to agent
ssh-add ~/.ssh/id_ed25519

# Copy public key
cat ~/.ssh/id_ed25519.pub
```

### Step 2: Add SSH Key to GitHub

1. Go to https://github.com/settings/keys
2. Click "New SSH key"
3. Paste your public key
4. Click "Add SSH key"

### Step 3: Create Repository and Push

```bash
# Create repository on GitHub (using GitHub CLI or web interface)
gh repo create akamai-mcp-server --public

# Add remote using SSH
git remote add origin git@github.com:YOUR_USERNAME/akamai-mcp-server.git

# Push
git push -u origin main
```

---

## Post-Creation Setup

### 1. Repository Settings

#### Topics (Tags)
Add relevant topics to help others discover your repository:
```
akamai, mcp, model-context-protocol, cdn, edgegrid, typescript, api, claude
```

Add via web: Go to repository → About (gear icon) → Topics

#### Description
```
Production-ready Model Context Protocol server for Akamai APIs with EdgeGrid authentication, TOGAF architecture, Docker support
```

#### Website
Link to Akamai or MCP documentation:
```
https://modelcontextprotocol.io
```

### 2. Branch Protection

Protect the main branch:

1. Go to Settings → Branches
2. Add rule for `main` branch:
   - ✅ Require pull request reviews
   - ✅ Require status checks
   - ✅ Require branches to be up to date
   - ✅ Include administrators

### 3. Add Badges to README

Add these badges to the top of your README.md:

```markdown
# Akamai MCP Server

[![GitHub license](https://img.shields.io/github/license/YOUR_USERNAME/akamai-mcp-server)](https://github.com/YOUR_USERNAME/akamai-mcp-server/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/YOUR_USERNAME/akamai-mcp-server)](https://github.com/YOUR_USERNAME/akamai-mcp-server/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/YOUR_USERNAME/akamai-mcp-server)](https://github.com/YOUR_USERNAME/akamai-mcp-server/issues)
[![Docker Image](https://img.shields.io/badge/docker-available-blue)](https://github.com/YOUR_USERNAME/akamai-mcp-server/pkgs/container/akamai-mcp-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
```

### 4. GitHub Actions (CI/CD)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Lint (if configured)
      run: npm run lint || true

  docker:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Build Docker image
      run: docker build -t akamai-mcp-server:test .

    - name: Test Docker image
      run: docker run --rm akamai-mcp-server:test node --version
```

### 5. Issue Templates

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure with '...'
2. Call tool '...'
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Environment:**
 - OS: [e.g. macOS, Linux]
 - Node.js version: [e.g. 18.17.0]
 - Server version: [e.g. 1.0.0]

**Logs**
```
Paste relevant logs here
```

**Additional context**
Add any other context about the problem here.
```

### 6. Contributing Guide

Create `CONTRIBUTING.md`:

```markdown
# Contributing to Akamai MCP Server

Thank you for your interest in contributing!

## Development Setup

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Make your changes
5. Build: `npm run build`
6. Test your changes
7. Commit with clear message
8. Push to your fork
9. Create Pull Request

## Code Style

- Follow existing TypeScript conventions
- Use meaningful variable names
- Add comments for complex logic
- Update documentation if needed

## Pull Request Process

1. Update README.md with details of changes if needed
2. Update documentation in `docs/` if architecture changes
3. Ensure Docker build succeeds
4. Get approval from maintainer
5. Squash commits if requested

## Code of Conduct

- Be respectful
- Be collaborative
- Be constructive
```

---

## Verification Checklist

After pushing to GitHub, verify:

- [ ] Repository is accessible
- [ ] All files are present
- [ ] README.md renders correctly
- [ ] Badges display properly (if added)
- [ ] Docker configuration is visible
- [ ] Documentation files are readable
- [ ] Examples are accessible
- [ ] License file is present
- [ ] .gitignore is working (no node_modules, .env, etc.)

---

## Common Issues

### Issue: Permission Denied

```bash
# Check authentication
gh auth status

# Or check SSH key
ssh -T git@github.com
```

### Issue: Remote Already Exists

```bash
# Remove existing remote
git remote remove origin

# Add correct remote
git remote add origin https://github.com/YOUR_USERNAME/akamai-mcp-server.git
```

### Issue: Branch Name Mismatch

```bash
# Rename local branch to main
git branch -m master main

# Push to main
git push -u origin main
```

### Issue: Large Files

If you accidentally added large files:

```bash
# Remove from git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/large/file' \
  --prune-empty --tag-name-filter cat -- --all

# Push with force
git push origin --force --all
```

---

## Next Steps

After pushing to GitHub:

1. ⭐ **Star your own repository** (shows up in your profile)
2. 📝 **Add comprehensive README badges**
3. 🏷️ **Add topics** for discoverability
4. 🔒 **Enable security features** (Dependabot, code scanning)
5. 📊 **Set up GitHub Actions** for CI/CD
6. 📢 **Share on social media** or relevant communities
7. 📖 **Write a blog post** about your project
8. 🐳 **Publish to Docker Hub** (optional)

---

## Publishing to Docker Hub (Optional)

```bash
# Login to Docker Hub
docker login

# Tag image
docker tag akamai-mcp-server:latest YOUR_DOCKERHUB_USERNAME/akamai-mcp-server:latest
docker tag akamai-mcp-server:latest YOUR_DOCKERHUB_USERNAME/akamai-mcp-server:1.0.0

# Push
docker push YOUR_DOCKERHUB_USERNAME/akamai-mcp-server:latest
docker push YOUR_DOCKERHUB_USERNAME/akamai-mcp-server:1.0.0
```

---

## Need Help?

- GitHub Docs: https://docs.github.com
- GitHub CLI Docs: https://cli.github.com/manual/
- Git Documentation: https://git-scm.com/doc

---

**You're all set!** 🚀

Your Akamai MCP Server is now on GitHub and ready to share with the world.
