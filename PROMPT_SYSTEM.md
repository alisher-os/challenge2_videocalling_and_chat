# Prompt Management System

## What We've Created

This repository now has a comprehensive documentation system designed to improve AI assistant effectiveness and team collaboration.

## Documentation Files

### 1. `.cursorrules` (AI Assistant Guidelines)
**Purpose**: Project-specific rules for AI coding assistants (Cursor, GitHub Copilot, etc.)

**Contents**:
- Project overview and tech stack
- Architecture patterns (backend & frontend)
- Code standards and conventions
- Common pitfalls and solutions
- File naming conventions
- Testing checklist
- When adding new features (step-by-step)
- Performance considerations
- Mobile considerations

**How it helps AI**:
- Understands project-specific patterns
- Knows common issues and how to avoid them
- Follows established conventions automatically
- Generates code that matches existing style

### 2. `ARCHITECTURE.md` (System Design)
**Purpose**: Deep dive into system architecture, data flow, and technical decisions

**Contents**:
- High-level architecture diagram
- Backend architecture (Axum, DashMap, WebSocket lifecycle)
- Frontend architecture (React, state management, component hierarchy)
- Data flow examples with diagrams
- WebRTC signaling flow
- File sharing implementation
- Mobile considerations
- Performance optimization strategies
- Deployment guide
- Technology choices and rationale

**How it helps AI**:
- Understands the "why" behind design decisions
- Knows how data flows through the system
- Can make architecture-aligned suggestions
- Provides context for complex features (WebRTC, WebSocket)

### 3. `CONTRIBUTING.md` (Code Standards)
**Purpose**: Coding guidelines, best practices, and examples

**Contents**:
- Code style examples (good vs bad)
- Message handling patterns
- Logging standards
- Testing procedures
- Component structure guidelines
- State update patterns
- CSS standards
- WebRTC best practices
- Step-by-step feature addition guide
- PR checklist
- Common mistakes to avoid

**How it helps AI**:
- Generates code following team standards
- Shows concrete examples of patterns
- Knows what NOT to do (anti-patterns)
- Follows consistent style

### 4. Enhanced `README.md`
**Purpose**: Quick start guide with links to all documentation

**Added**:
- Emoji indicators for better scanning
- Links to all documentation files
- AI assistant instructions section
- Troubleshooting guide
- Updated feature list

## How to Use This System

### For AI Assistants (like Cursor)

When you ask an AI assistant to implement a feature:

**Before (without system)**:
```
"Add a feature to let users react to messages with emoji"
```
❌ AI might:
- Not know your tech stack
- Use wrong patterns (class components instead of hooks)
- Miss mobile considerations
- Not handle WebSocket correctly
- Forget to update both backend and frontend

**After (with system)**:
```
"Following our .cursorrules and CONTRIBUTING.md patterns, add emoji reactions to messages"
```
✅ AI will:
- Check `.cursorrules` for patterns
- Follow `CONTRIBUTING.md` for code style
- Reference `ARCHITECTURE.md` for message flow
- Update both backend (Rust enum) and frontend (React component)
- Include mobile-responsive CSS
- Add proper logging
- Handle errors correctly

### For Team Members

1. **New to project?** Read `README.md` → `ARCHITECTURE.md` → `CONTRIBUTING.md`
2. **Adding a feature?** Check `CONTRIBUTING.md` "Adding New Features" section
3. **Debugging?** Check `.cursorrules` "Common Pitfalls & Solutions"
4. **Mobile issues?** See `MOBILE_SETUP.md` and `.cursorrules` mobile sections
5. **Code review?** Use `CONTRIBUTING.md` checklists

## Testing the System

### Example: Ask AI to Add "Last Seen" Timestamp

**Prompt**:
```
Following our .cursorrules, add a "last seen" indicator that shows 
when offline users were last online. It should appear in the user 
list and update in real-time.
```

**Expected AI Behavior**:
1. ✅ Checks `.cursorrules` for message handling pattern
2. ✅ Notes that `User` struct already has `last_seen` field
3. ✅ Updates backend to send last_seen in UserOffline message
4. ✅ Updates frontend to display relative time ("5 min ago")
5. ✅ Adds mobile-responsive CSS
6. ✅ Includes proper logging
7. ✅ Follows existing code style

## Benefits

### For AI Assistants
- 🎯 **Context-aware**: Understands your specific project
- 📐 **Pattern-following**: Uses established conventions
- 🐛 **Bug-avoiding**: Knows common pitfalls
- 🏗️ **Architecture-aligned**: Makes design-consistent suggestions
- 📱 **Mobile-conscious**: Always considers responsive design

### For Team
- 📖 **Onboarding**: New developers get up to speed faster
- 🤝 **Consistency**: Everyone follows same patterns
- 🔍 **Discoverability**: Easy to find how things work
- 🧠 **Knowledge base**: Documents tribal knowledge
- ✅ **Quality**: Reduces bugs from inconsistency

## Maintenance

### Keep Documentation Updated
When adding features:
1. Update `.cursorrules` if you discover new patterns
2. Add to `ARCHITECTURE.md` if architecture changes
3. Update `CONTRIBUTING.md` with new standards
4. Keep `README.md` feature list current

### Regular Reviews
- Quarterly: Review all docs for accuracy
- After major features: Update architecture diagrams
- When onboarding: Note what was confusing, improve docs

## Integration with Tools

### Cursor
- Place `.cursorrules` in project root (auto-detected)
- Reference in prompts: "Following .cursorrules..."

### GitHub Copilot
- Add as comments in files:
```javascript
// See .cursorrules for WebSocket message handling patterns
```

### Code Reviews
- Use `CONTRIBUTING.md` checklist
- Reference specific sections in review comments
- "This doesn't follow our state update pattern from CONTRIBUTING.md section X"

## Metrics of Success

A good prompt system should:
- ✅ Reduce back-and-forth clarifications
- ✅ Generate code that rarely needs style corrections
- ✅ Handle mobile considerations automatically
- ✅ Follow established patterns without being told
- ✅ Include proper error handling and logging
- ✅ Reduce onboarding time for new developers

## Example: Complete Feature Implementation

See `FEATURE_PLAN.md` for a sample feature plan following this system.

When asking AI to implement, provide:
1. **User story**: "As a user, I want to..."
2. **Reference docs**: "Following .cursorrules and CONTRIBUTING.md..."
3. **Acceptance criteria**: "Should work on mobile, include logging..."

The AI will then reference the documentation and implement following all established patterns!

