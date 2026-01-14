# Contributing to Akamai MCP Server

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain professional communication

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git
- Akamai API credentials (for testing)

### Development Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/akamai-mcp-server.git
cd akamai-mcp-server
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your Akamai credentials
```

4. **Run tests to verify setup**

```bash
npm test
```

5. **Build the project**

```bash
npm run build
```

## Project Structure

```
akamai-mcp-server/
├── src/
│   ├── auth/           # Authentication (EdgeGrid client)
│   ├── errors/         # Custom error classes
│   ├── tools/          # MCP tool implementations
│   │   ├── property-manager.ts
│   │   ├── fast-purge.ts
│   │   ├── edgeworkers.ts
│   │   ├── dns.ts
│   │   ├── health.ts
│   │   └── types.ts
│   ├── utils/          # Utilities (config, logger, retry, validation)
│   └── index.ts        # Server entry point
├── tests/
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── setup.ts        # Test setup
├── docs/               # Documentation
├── .github/            # GitHub Actions workflows
└── package.json
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write code following our [Code Style](#code-style) guidelines
- Add tests for new functionality
- Update documentation as needed
- Keep commits atomic and focused

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Type check
npm run lint

# Format code
npm run format
```

### 4. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Feature
git commit -m "feat: add cache warming tool"

# Bug fix
git commit -m "fix: correct retry logic for 429 errors"

# Documentation
git commit -m "docs: update API examples"

# Tests
git commit -m "test: add validation tests"

# Refactor
git commit -m "refactor: simplify error handling"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Testing

### Writing Tests

- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Use descriptive test names
- Test both success and failure cases
- Mock external dependencies (Akamai APIs)

### Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something specific', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe('expected');
  });

  it('should handle errors gracefully', () => {
    expect(() => myFunction(null)).toThrow(ValidationError);
  });
});
```

### Mocking Guidelines

```typescript
import { vi } from 'vitest';
import nock from 'nock';

// Mock Akamai API responses
nock('https://akaa-host.luna.akamaiapis.net')
  .get('/endpoint')
  .reply(200, { data: 'response' });

// Mock internal dependencies
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));
```

## Code Style

### TypeScript Guidelines

- Use explicit types for function parameters and return values
- Avoid `any` types (use `unknown` if necessary)
- Use interfaces for object shapes
- Export types alongside implementations

### Error Handling

Always use custom error classes:

```typescript
import { ValidationError, ApiError } from '../errors/index.js';

// Validation errors
if (!input) {
  throw new ValidationError('Input is required');
}

// API errors
if (response.status >= 500) {
  throw new ApiError('Server error', response.status, response.data);
}
```

### Input Validation

Use Zod schemas for all tool inputs:

```typescript
import { z } from 'zod';
import { validateInput } from '../utils/validation.js';

const schema = z.object({
  propertyId: z.string().regex(/^prp_\d+$/),
  version: z.number().int().positive(),
});

export const handler: ToolHandler = async (args) => {
  const validated = validateInput(schema, args);
  // Use validated inputs
};
```

### Logging

Use the Winston logger for all logging:

```typescript
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

logger.info('Operation started', { propertyId: 'prp_123' });
logger.error('Operation failed', { error: error.message });
```

### Async/Await

- Always use async/await (no raw promises)
- Handle errors with try/catch
- Use retry logic for transient failures

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    const validated = validateInput(schema, args);
    const result = await performOperation(validated);
    return formatSuccess(result);
  } catch (error) {
    return formatError(error);
  }
};
```

## Submitting Changes

### Pull Request Guidelines

1. **Title**: Use conventional commit format
   - `feat: Add cache warming tool`
   - `fix: Correct retry backoff calculation`

2. **Description**: Include
   - What changed and why
   - Testing performed
   - Related issues
   - Breaking changes (if any)

3. **Checklist**
   - [ ] Tests pass
   - [ ] Code is formatted
   - [ ] Documentation updated
   - [ ] No type errors
   - [ ] Follows code style

### Review Process

1. Automated checks must pass (CI)
2. At least one maintainer approval
3. All conversations resolved
4. No merge conflicts

### After Merge

- Delete your feature branch
- Pull latest changes from main
- Update your fork

## Release Process

Releases are automated through GitHub Actions:

1. **Version Bump**
```bash
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

2. **Push Tag**
```bash
git push origin main --tags
```

3. **GitHub Actions** will automatically:
   - Run tests
   - Build project
   - Create GitHub release
   - Publish to npm (if configured)

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/YOUR_ORG/akamai-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_ORG/akamai-mcp-server/discussions)
- **Documentation**: Check the `docs/` folder

## Recognition

Contributors will be recognized in:
- Release notes
- README contributors section
- Project documentation

Thank you for contributing! 🎉
