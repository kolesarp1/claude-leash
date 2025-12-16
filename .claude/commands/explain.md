---
description: Explain how a specific part of the extension works
---

# Explain Extension Functionality

I'll help you understand how a specific part of Claude Leash works.

## What would you like explained?

Common topics:

### 1. Core Algorithms
- **Container Detection** (content.js:200-350)
  - Multi-strategy scoring system
  - Sidebar exclusion logic
  - Candidate ranking

- **Message Hiding** (content.js:800-900)
  - Height calculation (bottom-up)
  - Threshold comparison
  - CSS display:none application

- **Session Management** (content.js:600-700)
  - Session ID extraction
  - Cache structure
  - Cache validation

### 2. Architecture
- **Component Communication**
  - Popup ↔ Content Script
  - Content Script ↔ Background
  - Message passing protocol

- **State Management**
  - Chrome Storage API usage
  - Session cache (Map)
  - Per-tab state tracking

### 3. Performance Optimizations
- **React Hydration Handling**
  - requestIdleCallback timing
  - Why we wait before modifying DOM

- **Layout Thrashing Prevention**
  - Batched reads/writes
  - Cached selectors
  - Debouncing/throttling

- **Session Caching**
  - Why we cache
  - What we cache
  - When cache invalidates

### 4. Browser Integration
- **Chrome Extension APIs**
  - Manifest V3 structure
  - Content script injection
  - Storage API patterns

- **Navigation Detection**
  - History API hooks
  - popstate events
  - Polling fallback

## How to Ask

Be specific:
- ✅ "Explain how the container detection scoring system works in content.js:200-350"
- ✅ "Why do we use requestIdleCallback before hiding messages?"
- ✅ "How does the session cache prevent stale data?"

- ❌ "How does the extension work?" (too broad)

Please specify what you'd like explained, and I'll provide:
1. **Overview**: High-level explanation
2. **Implementation**: Code walkthrough with line numbers
3. **Why It Matters**: Design rationale
4. **Edge Cases**: Gotchas and special handling
5. **References**: Related architecture.md sections
