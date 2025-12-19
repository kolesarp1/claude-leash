---
description: Prepare extension for release with version bump and quality checks
---

# Release Preparation

Prepare Claude Leash for release by completing all quality gates.

## Pre-Release Checklist

### 1. Version Management
- [ ] Bump version in manifest.json
  - Patch: Bug fixes (3.4.10 → 3.4.11)
  - Minor: New features (3.4.10 → 3.5.0)
  - Major: Breaking changes (3.4.10 → 4.0.0)

### 2. Code Quality
- [ ] All files follow conventions.md
- [ ] No console errors in production mode
- [ ] Debug logs only when debugMode enabled
- [ ] JSDoc added for new public functions
- [ ] Comments explain complex logic

### 3. Testing
- [ ] Critical path tests passed (15-min suite)
- [ ] Regression tests passed
- [ ] Performance benchmarks met:
  - FPS: 50+ during scrolling
  - CPU: <20% during operation
  - No memory leaks

### 4. Documentation
- [ ] README.md updated with changes
- [ ] CONTEXT.md updated with implementation notes
- [ ] architecture.md updated if architecture changed
- [ ] Commit messages follow convention

### 5. Security
- [ ] No new permissions added (unless necessary)
- [ ] No inline scripts or eval()
- [ ] User input sanitized
- [ ] No external network requests

### 6. Browser Compatibility
- [ ] Tested on Chrome (latest stable)
- [ ] Tested on Edge (if available)
- [ ] Works on both claude.ai and code.anthropic.com

## Release Process

1. **Update Version**:
   ```bash
   # Edit manifest.json
   "version": "3.4.11"
   ```

2. **Update Documentation**:
   - README.md (add to changelog)
   - CONTEXT.md (technical notes)

3. **Commit Changes**:
   ```bash
   git add .
   git commit -m "chore: Release v3.4.11

   Changes:
   - Bug fix: [description]
   - Feature: [description]

   Closes #[issue-number]"
   ```

4. **Tag Release**:
   ```bash
   git tag v3.4.11
   git push origin main --tags
   ```

5. **Publish** (if on Chrome Web Store):
   - Create ZIP of extension files
   - Upload to Chrome Web Store Developer Dashboard
   - Update store listing if needed

## Post-Release

- [ ] Monitor for issues (first 24 hours)
- [ ] Update GitHub release notes
- [ ] Announce changes (if applicable)

Please guide me through the release process step-by-step.
