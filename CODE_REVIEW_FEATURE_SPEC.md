# Code Review Feature Specification

**Version:** 1.0
**Date:** 2026-01-09
**Status:** Draft (Ready for Implementation)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Code Review Iteration Flow](#3-code-review-iteration-flow--status-transitions)
4. [Code Review Prompt Customization](#4-code-review-prompt-customization)
5. [API Endpoints & Server Routes](#5-api-endpoints--server-routes)
6. [Agent Context Passing & Integration](#6-agent-context-passing--integration)
7. [Implementation Plan](#7-implementation-plan)

---

## 1. Overview

### 1.1 Feature Description

The Code Review feature introduces an automated code review step in the Kanban pipeline. After a feature is fully implemented (In Progress status), it moves to a Code Review stage where the configured AI agent performs a comprehensive review of the changes before proceeding to verification/approval.

The code review is:
- **Provider-Agnostic**: Uses the configured AI agent (Claude, Cursor, or other agents supported by the project)
- **Compliance-First**: Validates that implementation satisfies feature requirements before code quality review
- **Iterative**: If issues are found, the feature returns to In Progress for fixes (max 3 iterations)
- **Auditable**: Maintains full history of all reviews for transparency
- **Customizable**: Teams control review behavior entirely through the Code Review prompt in project settings
- **Required**: Code review is always required (not optional) between In Progress and final approval
- **Automatic**: Code review starts automatically after In Progress execution completes

### 1.2 Goals

1. **Validate Feature Compliance**: Ensure implementation actually satisfies the feature requirements
2. **Improve Code Quality**: Catch issues in code, tests, architecture, and performance
3. **Reduce Manual Review Burden**: AI handles initial comprehensive review
4. **Provide Actionable Feedback**: Give developers/agents clear, specific findings to fix
5. **Maintain Context**: Preserve full context across multiple review iterations
6. **Enable Full Automation**: Support fully automated pipelines without human intervention
7. **Create Audit Trail**: Track all reviews for compliance and learning

### 1.3 Review Scope (Customizable via Prompt)

The code review evaluates:

1. **Feature Compliance** (Primary): Does the implementation satisfy feature description and requirements?
2. **Code Quality**: Readability, maintainability, best practices
3. **Test Coverage**: Are changes properly tested?
4. **Architecture**: Is the design sound and consistent?
5. **Performance**: Are there performance concerns or optimizations needed?

Teams customize what aspects are reviewed and their severity through the Code Review prompt setting.

### 1.4 In Scope

- Automated code review generation using configured AI agent
- Code Review step in pipeline between In Progress and next configured status
- Multi-iteration support (up to 3 attempts)
- Full review history storage and retrieval
- Customizable code review prompts in project settings
- Agent context passing for fixing iterations
- Integration with AutoMode service and existing agent infrastructure
- WebSocket event streaming for review progress
- Intermediate git commits for clear diff tracking
- Project context file (CLAUDE.md) inclusion in reviews

### 1.5 Out of Scope

- Human code review UI (can happen separately after AI review)
- Pull request integration (changes exist in worktree at this stage)
- Custom admin interfaces for review criteria
- Performance metrics collection
- Comment-based code review

---

## 2. Data Model

### 2.1 Code Review Specification

Added to Feature type in `libs/types/src/feature.ts`:

```typescript
interface Feature {
  // ... existing fields ...

  codeReviewSpec?: CodeReviewSpec;
}

interface CodeReviewSpec {
  // Current review status
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'failed';

  // Iteration tracking
  currentIteration: number;        // 1, 2, or 3
  maxIterations: number;           // Always 3
  iterations: CodeReviewIteration[];
}

interface CodeReviewIteration {
  iterationNumber: number;          // 1, 2, 3

  // Review metadata
  reviewedAt: string;               // ISO timestamp when review completed
  reviewedByModel: string;          // Model used for review (e.g., 'claude-opus-4-5')
  reviewedByProvider: string;       // Provider name (e.g., 'anthropic')

  // Review result
  status: 'approved' | 'rejected' | 'failed';

  // Code changes reviewed
  gitCommitHash: string;            // Hash of the intermediate commit reviewed
  gitDiff: string;                  // Full diff that was reviewed

  // Findings from review
  findings: CodeReviewFinding[];
  overallSummary: string;           // Short summary of review (1-2 sentences)

  // If rejected: what to fix
  rejectionReason?: string;         // Why it was rejected (actionable feedback)

  // File references
  reviewFile: string;               // Path to code-review-iteration-N.md
}

interface CodeReviewFinding {
  category: 'compliance' | 'code' | 'test' | 'architecture' | 'performance';
  severity: 'info' | 'warning' | 'error';

  title: string;                    // Short title (e.g., "Missing error handling")
  description: string;              // Detailed explanation
  suggestion?: string;              // How to fix it (optional)

  file?: string;                    // Relative file path if applicable
  line?: number;                    // Line number if applicable
}
```

### 2.2 Feature Status Flow

```
backlog
  ↓ [execute feature]
in_progress (Agent 1)
  ↓ [execution completes, auto-commit]
code_review (Iteration 1)
  ├─ [AI review runs]
  ├─ [if approved] → waiting_approval OR verified (based on skipTests config)
  └─ [if rejected] → in_progress (with feedback context)
      ↓ [Agent 2 fixes]
      ↓ [auto-commit with iteration marker]
      ↓ [code_review (Iteration 2)]
      └─ [max 3 iterations, then either approved or fails]

waiting_approval / verified
  ↓
completed
```

### 2.3 Storage Structure

**Files created per feature:**

```
.automaker/features/{featureId}/
├── feature.json                          # Updated with codeReviewSpec
├── agent-output-iteration-1.md           # Agent 1's work
├── code-review-iteration-1.md            # Code review of iteration 1
├── agent-output-iteration-2.md           # Agent 2's fixes (if needed)
├── code-review-iteration-2.md            # Code review of iteration 2
└── ... (up to iteration 3)
```

**feature.json structure:**

```json
{
  "id": "feature-123",
  "title": "Add user authentication",
  "description": "...",
  "status": "code_review",
  "branchName": "feature/feature-123",
  "codeReviewSpec": {
    "status": "rejected",
    "currentIteration": 1,
    "maxIterations": 3,
    "iterations": [
      {
        "iterationNumber": 1,
        "reviewedAt": "2026-01-09T14:22:00Z",
        "reviewedByModel": "claude-opus-4-5-20251101",
        "reviewedByProvider": "anthropic",
        "status": "rejected",
        "gitCommitHash": "a1b2c3d4",
        "gitDiff": "[full diff here]",
        "findings": [
          {
            "category": "compliance",
            "severity": "error",
            "title": "Missing password validation",
            "description": "Empty passwords are accepted, violating spec requirement",
            "suggestion": "Add validation for minimum 8 characters",
            "file": "src/auth/validator.ts",
            "line": 45
          }
        ],
        "overallSummary": "Implementation lacks error handling and doesn't validate empty passwords.",
        "rejectionReason": "Feature compliance issue: Empty password validation missing. Code quality issue: Missing error handling in login flow.",
        "reviewFile": "code-review-iteration-1.md"
      }
    ]
  }
}
```

### 2.4 Code Review Markdown File Format

**File: `code-review-iteration-1.md`**

```markdown
# Code Review - Feature: Add user authentication
**Iteration 1 of 3**

**Status**: ❌ REJECTED

**Reviewed At**: 2026-01-09 14:22:00 UTC
**Reviewed By Model**: claude-opus-4-5-20251101

## Overall Summary
Implementation lacks error handling and doesn't validate empty passwords. Feature partially complies with requirements.

## Compliance Review
### ✓ Compliant
- User registration flow implemented
- Password encryption in place
- Database schema updated

### ❌ Non-Compliant / Incomplete
- Missing empty password validation
- No handling of duplicate email addresses
- Password reset flow not implemented (required by spec)

## Findings

### [ERROR] Compliance: Missing Password Validation (src/auth/validator.ts:45)
**File**: src/auth/validator.ts
**Line**: 45

Empty passwords are accepted, violating spec requirement "passwords must be 8+ characters".

**Current Code**:
\`\`\`typescript
if (!password) {
  return true; // WRONG: allows empty
}
\`\`\`

**Suggestion**:
\`\`\`typescript
if (!password || password.length < 8) {
  throw new ValidationError('Password must be at least 8 characters');
}
\`\`\`

---

### [ERROR] Code Quality: Missing Error Handling (src/auth/login.ts:78)
**File**: src/auth/login.ts
**Line**: 78

Database query has no error handling for connection failures.

**Suggestion**: Wrap in try-catch and return appropriate HTTP error.

---

### [WARNING] Test Coverage: Login edge cases
No tests for failed login attempts or locked accounts. Consider adding test coverage.

---

### [INFO] Architecture: Consider using middleware
Could extract validation into middleware for reuse across endpoints.

---

## Action Required
Fix the compliance issues (password validation, duplicate email handling, password reset) and code quality issues before next review.
```

---

## 3. Code Review Iteration Flow & Status Transitions

### 3.1 Status Transition Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    KANBAN PIPELINE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  backlog                                                          │
│    │                                                              │
│    └──→ in_progress [Iteration 1]                               │
│           │ (agent executes feature)                             │
│           │                                                       │
│           └──→ [auto-commit intermediate]                        │
│                 ↓                                                 │
│              code_review [Iteration 1]                           │
│                 │ (AI reviews code + compliance)                 │
│                 │                                                 │
│                 ├─→ [APPROVED] ──→ waiting_approval/verified    │
│                 │                     (next status based config) │
│                 │                                                 │
│                 └─→ [REJECTED] ──→ in_progress [Iteration 2]     │
│                       │                │ (agent fixes issues)    │
│                       │                │                         │
│                       │                └──→ [auto-commit]        │
│                       │                     ↓                    │
│                       └─→ code_review [Iteration 2]             │
│                            │                                     │
│                            ├─→ [APPROVED] → (next status)       │
│                            │                                     │
│                            └─→ [REJECTED] → in_progress [Iter 3]│
│                                  │                 │             │
│                                  │                 └─→ [commit]  │
│                                  │                     ↓         │
│                                  └─→ code_review [Iteration 3]  │
│                                       │                         │
│                                       ├─→ [APPROVED]            │
│                                       │   → (next status)       │
│                                       │                         │
│                                       └─→ [FAILED/REJECTED]    │
│                                           → in_progress         │
│                                           (manual intervention)  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Detailed Workflow

#### **Phase 1: In Progress Completion & Commit**

1. Agent finishes feature implementation
2. Feature status: `in_progress` → `code_review`
3. **AutoMode service automatically:**
   - Stages all changes: `git add -A`
   - Creates intermediate commit: `feat: {title}\n\nImplemented by Automaker auto-mode - Code Review Iteration 1`
   - Retrieves commit hash
   - Stores hash in `codeReviewSpec.iterations[0].gitCommitHash`
   - Calculates full git diff: `git diff HEAD~1 HEAD`
   - Stores diff in `codeReviewSpec.iterations[0].gitDiff`

#### **Phase 2: Code Review Generation**

1. Status: `code_review`
2. Code Review service:
   - Loads feature, codeReviewSpec, and diff
   - Loads project context files (CLAUDE.md, etc.)
   - Retrieves customizable code review prompt from settings
   - Creates review request to AI agent with:
     - Feature description
     - Original specification/requirements
     - Full diff of changes
     - Previous review findings (if iteration > 1)
     - Code review prompt template
     - Project context
   - Streams review response

3. Review Output:
   - Parses AI response into findings (structured extraction)
   - Determines if approved or rejected based on findings
   - Generates markdown file: `code-review-iteration-{n}.md`
   - Updates `codeReviewSpec.iterations[n]`

#### **Phase 3A: If Approved**

1. Generate approval event
2. Update status: `code_review` → next configured status
   - If `skipTests === true`: → `waiting_approval`
   - If `skipTests === false`: → `verified`
   - If custom pipeline exists: → first step of pipeline
3. Update feature.json with approved findings
4. Feature ready for human review or completion

#### **Phase 3B: If Rejected (Iterations 1-2)**

1. Generate rejection event with findings
2. Update status: `code_review` → `in_progress`
3. **Store rejection context:**
   - `rejectionReason` in current iteration
   - All findings saved in iteration
4. Next agent cycle:
   - Load feature with `codeReviewSpec`
   - Load `code-review-iteration-{n}.md` as context
   - Load all previous reviews for context
   - Agent sees findings and implements fixes
   - Loop back to Phase 1 (commit & review)

#### **Phase 3C: If Rejected (Iteration 3)**

1. Max iterations reached
2. Status: `code_review` → `in_progress` (requires manual intervention)
3. Feature paused - no automatic retry
4. User/team must manually:
   - Review all 3 review iterations
   - Decide on approach
   - Resume feature manually or mark as backlog

### 3.3 Event Streaming

Code review operations emit events streamed via WebSocket:

```
feature:code-review-started
  { featureId, iterationNumber }

feature:code-review-progress
  { featureId, iterationNumber, message }

feature:code-review-completed
  { featureId, iterationNumber, status, findings, summary }

feature:code-review-approved
  { featureId, nextStatus }

feature:code-review-rejected
  { featureId, iterationNumber, rejectionReason }

feature:code-review-failed
  { featureId, error }

feature:code-review-max-iterations
  { featureId }
```

### 3.4 Commit Message Format

Each intermediate commit follows pattern:

**Iteration 1:**
```
feat: {feature-title}

Implemented by Automaker auto-mode - Code Review Iteration 1
```

**Iterations 2+:**
```
feat: {feature-title}

Implemented by Automaker auto-mode - Code Review Iteration {N}
Fixes from review iteration {N-1}
```

This allows clear git log tracing of review/fix cycles before final merge.

### 3.5 Integration with Pipeline Configuration

Code review respects project pipeline configuration:

- **Comes after**: Always after `in_progress` completes
- **Goes to**: Determined by existing `skipTests` and custom pipeline settings
  - If no custom pipeline: → `waiting_approval` or `verified`
  - If custom pipeline: → `waiting_approval`, then custom steps, then `verified`

**Not configurable:**
- Code review cannot be disabled
- Cannot be moved to different position
- Always required between implementation and approval/verification

---

## 4. Code Review Prompt Customization

### 4.1 Settings Integration

Code Review prompts are customizable in project settings, following the same pattern as existing prompt customization (Auto Mode, Agent, Backlog Plan, Enhancement).

**Settings Storage:**
- Global: `{DATA_DIR}/settings.json` → `settings.promptCustomization.codeReview`
- UI: Settings View → Prompts tab → "Code Review" (new tab)
- Per-project overrides: `.automaker/settings.json`

### 4.2 Customizable Prompts

```typescript
interface CodeReviewPrompts {
  // System prompt for code review agent
  reviewSystemPrompt?: CustomPrompt;

  // Template for constructing the review request
  reviewPromptTemplate?: CustomPrompt;
}

interface CustomPrompt {
  enabled: boolean;      // Use custom or default?
  value: string;         // The custom prompt text
}
```

### 4.3 Default Code Review Prompts

**System Prompt (reviewSystemPrompt):**

```
You are an expert code reviewer. Your role is to review code implementations for compliance,
quality, and architecture.

## Review Process

1. **Feature Compliance (FIRST PRIORITY)**
   - Does the implementation actually satisfy the feature description and requirements?
   - Are all acceptance criteria met?
   - Are there missing implementations or incomplete features?

2. **Code Quality**
   - Is the code readable and maintainable?
   - Are there best practices being followed?
   - Are there obvious bugs or error handling issues?

3. **Test Coverage**
   - Are changes properly tested?
   - Are edge cases covered?
   - Are tests meaningful (not just mocking)?

4. **Architecture & Design**
   - Is the design sound and consistent with existing patterns?
   - Are there performance concerns?
   - Is the solution scalable?

## Output Format

Return your review as a structured response. Start with an APPROVAL DECISION:

**[APPROVED]** - if the implementation satisfies requirements and passes quality checks
**[REJECTED]** - if there are compliance issues, critical bugs, or quality problems that need fixing

After the decision, provide:

### Issues Found
List each issue as:
- **[CATEGORY]** - {severity}: {title}
  - Description: {details}
  - File: {path} (optional)
  - Line: {number} (optional)
  - Suggestion: {how to fix} (optional)

Categories: COMPLIANCE, CODE, TEST, ARCHITECTURE, PERFORMANCE

### Summary
Brief explanation of the decision (1-2 sentences).

If REJECTED, explain what must be fixed before next review.
```

**Review Prompt Template (reviewPromptTemplate):**

```
# Code Review Request

## Feature
Title: {featureTitle}
Description: {featureDescription}

## Code Changes

\`\`\`diff
{gitDiff}
\`\`\`

## Task
Review the code changes above according to your instructions.
Start with compliance assessment, then code quality.

Provide your review with the APPROVAL/REJECTED decision and findings.
```

### 4.4 Customization in UI

**Location:** Settings View → Prompts Tab → Code Review Tab

**Interface:**
- Two text areas (one per customizable prompt)
- Each with:
  - Toggle: "Use Custom / Use Default"
  - Read-only view when toggled OFF (shows default)
  - Editable text area when toggled ON
  - Character count
  - "Reset to Default" button
- "Reset All Code Review Prompts" button at bottom

**User Experience:**
- Teams can adjust review criteria entirely through these prompts
- No need to modify code or create custom admin interfaces
- Changes apply immediately to all new code reviews
- Can be overridden per-project in `.automaker/settings.json`

### 4.5 Template Variables

The `reviewPromptTemplate` supports these variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `{featureTitle}` | Feature title | "Add user authentication" |
| `{featureDescription}` | Full feature description | "Implement JWT-based auth..." |
| `{gitDiff}` | Full unified diff of changes | `--- a/src/auth.ts...` |
| `{featureSpec}` | Original feature spec (if exists) | Markdown spec text |

These are substituted at runtime when generating the review request.

### 4.6 Integration with Context

Code review prompts include project context files, similar to agent execution:

**Context Loading:**
- Project-specific rules from `.automaker/context/` are loaded and included
- CLAUDE.md and other context files are automatically appended to system prompt
- This ensures code review respects project guidelines

**Context Inclusion Pattern:**
```
[reviewSystemPrompt from settings]

---

## Project Context

[CLAUDE.md content]
[Other context files from .automaker/context/]
```

This allows reviews to be aware of project-specific patterns, architecture decisions, and conventions.

### 4.7 Service Architecture

Code review is integrated into `AutoModeService` rather than a separate service because:
- Part of the feature execution pipeline (not a standalone operation)
- Shares infrastructure: event streaming, AI providers, logging, file handling
- Seamless integration with status transitions and worktree management
- Avoids service proliferation

**New AutoModeService Methods:**
```typescript
async generateCodeReview(
  projectPath: string,
  featureId: string,
  iterationNumber: number,
  worktreePath?: string
): Promise<CodeReviewResult>

private async parseCodeReviewResponse(
  agentResponse: string,
  iterationNumber: number
): Promise<CodeReviewIteration>

private async saveCodeReviewMarkdown(
  featureDir: string,
  iterationNumber: number,
  review: CodeReviewIteration
): Promise<void>
```

---

## 5. API Endpoints & Server Routes

### 5.1 Code Review Generation Endpoint

**Route:** `POST /api/code-review/generate-review`

**Purpose:** Generate a code review for a feature in the `code_review` status

**Request Body:**
```json
{
  "projectPath": "/path/to/project",
  "featureId": "feature-123",
  "iterationNumber": 1,
  "worktreePath": "/path/to/.worktrees/feature-123"
}
```

**Response:**
```json
{
  "success": true,
  "featureId": "feature-123",
  "iterationNumber": 1,
  "status": "approved"
}
```

**Process:**
1. Load feature from `.automaker/features/{featureId}/feature.json`
2. Validate status is `code_review`
3. Retrieve git commit hash from `codeReviewSpec.iterations[n].gitCommitHash`
4. Calculate git diff: `git diff HEAD~1 HEAD` (current iteration vs previous)
5. Load project context files (CLAUDE.md, etc.)
6. Load customizable code review prompts from settings
7. Merge system prompt with project context
8. Call configured AI agent with:
   - System prompt (reviewSystemPrompt + context)
   - Feature description + requirements
   - Git diff
   - Previous review findings (if iteration > 1)
   - All previous iterations' findings (for verification)
9. Stream response via WebSocket events
10. Parse response into structured findings
11. Generate `code-review-iteration-{n}.md` file
12. Update `codeReviewSpec` in feature.json
13. Emit appropriate event (approved/rejected/failed)
14. If approved: update feature status to next configured step
15. If rejected: update feature status to `in_progress`

**WebSocket Events Emitted:**
```
feature:code-review-started
feature:code-review-progress
feature:code-review-completed
feature:code-review-approved
feature:code-review-rejected
feature:code-review-failed
```

### 5.2 Server Route Structure

**File Organization:**
```
apps/server/src/routes/code-review/
├── index.ts                    # Route definitions & exports
├── routes/
│   └── generate-review.ts      # POST /generate-review
└── helpers/
    ├── review-parser.ts        # Parse agent response into findings
    ├── review-storage.ts       # Save review to markdown file
    └── review-diff.ts          # Generate diff for review
```

### 5.3 Integration with AutoMode Service

Code review is integrated into `AutoModeService`:

**Called from:**
- `executeFeature()` after In Progress completes
- Automatically when feature status transitions to `code_review`

**Execution Context:**
- Has access to all AutoMode infrastructure (logging, events, AI providers)
- Uses same event emitter pattern as feature execution
- Respects model/provider configuration from feature or settings
- Streams responses via existing WebSocket mechanism

---

## 6. Agent Context Passing & Integration

### 6.1 Code Review → In Progress Transition

When code review rejects a feature, the next agent must receive full context about:
1. What was reviewed
2. What findings were identified
3. What specific issues need fixing
4. All previous review iterations (for cumulative verification)

**Context Structure:**

The next agent receives:
```
[Feature description from spec]

[Original implementation prompt]

## Previous Code Review Findings

### Iteration 1 Findings
[All findings from code-review-iteration-1.md]

### Iteration 2 Findings (if applicable)
[All findings from code-review-iteration-2.md]

## Current Code Review Findings from Iteration {N}

### Issues to Fix
[List of all findings with:
  - Category (COMPLIANCE, CODE, TEST, ARCHITECTURE, PERFORMANCE)
  - Severity (error, warning, info)
  - Title
  - Description
  - Suggestion (if provided)
  - File/line (if provided)
]

### Summary from Reviewer
{overallSummary}

### Rejection Reason
{rejectionReason}

## Previous Agent Work

[agent-output-iteration-{N}.md content]

## Task
Address all the code review findings above, especially the errors and warnings.
Make the necessary fixes to the feature implementation.
Verify that all findings from previous iterations have been resolved.
```

### 6.2 Integration in Feature Prompt

**File:** `apps/server/src/services/auto-mode-service.ts`

When a feature transitions from `code_review` back to `in_progress`:

1. **Feature Prompt Building** (in `buildFeaturePrompt()`)
   - Load feature description
   - Load all code review findings if `codeReviewSpec` exists
   - Include all iterations for verification context
   - Construct prompt with review feedback section
   - Append previous agent output

2. **Previous Context Loading** (in `executeFeature()`)
   - Load `agent-output-iteration-{N}.md`
   - Check for `codeReviewSpec` and current iteration
   - If iteration > 1, append all code review findings and previous iterations to prompt

**Example Prompt Structure:**

```
# Feature: Add user authentication

Implement JWT-based user authentication system with:
- User registration endpoint
- Login endpoint with email/password
- JWT token generation and validation
- Password hashing and validation
- Error handling for edge cases

[Feature specification details...]

## Previous Code Review Findings

### Review Iteration 1 - Status: REJECTED
[All findings from code-review-iteration-1.md]

## Current Code Review Findings from Iteration 2

### ❌ Errors
1. [COMPLIANCE] Missing password validation
   - Empty passwords are currently accepted
   - Spec requires minimum 8 characters
   - File: src/auth/validator.ts:45
   - Suggestion: Add length check before acceptance

2. [CODE] Missing error handling
   - Database query on login has no error handling
   - File: src/auth/login.ts:78
   - Suggestion: Wrap in try-catch, return HTTP 500

### ⚠️ Warnings
1. [TEST] Missing edge case tests
   - No tests for failed login attempts
   - No tests for account locking

### Summary
Implementation is missing password validation (critical compliance issue)
and lacks error handling in the login flow.

## Previous Agent Work

[Full agent-output-iteration-1.md content]

## Task
Fix all the issues identified in the code review above.
Pay special attention to the COMPLIANCE errors which block approval.
Verify that all findings from the previous review iteration have been resolved.
```

### 6.3 Agent Execution Flow with Reviews

**Complete Flow:**

```
1. executeFeature() [Iteration 1]
   - Agent develops feature
   - Changes made to worktree (uncommitted)
   - agent-output-iteration-1.md written

2. Auto-commit:
   - git add -A
   - git commit (WIP: Iteration 1)

3. generateCodeReview() [Iteration 1]
   - Load commit hash and diff
   - Load customizable prompts
   - Load CLAUDE.md and context files
   - Call AI agent to review
   - Save findings to feature.json
   - Save review to code-review-iteration-1.md
   - Emit event with findings

4a. IF APPROVED:
    - Update feature status to next configured step
    - Done with code review

4b. IF REJECTED (iteration 1-2):
    - Update feature status → in_progress

5. executeFeature() [Iteration 2]
   - Load feature with codeReviewSpec
   - Build prompt with ALL code review findings (iteration 1 + 2)
   - Load code-review-iteration-1.md and code-review-iteration-2.md as context
   - Load agent-output-iteration-1.md as previous context
   - Agent makes fixes based on review findings
   - agent-output-iteration-2.md written

6. Auto-commit:
   - git add -A
   - git commit (WIP: Iteration 2, fixes from review iteration 1)

7. generateCodeReview() [Iteration 2]
   - Same as step 3 but for iteration 2
   - Includes findings from iteration 1 for comparison
   - Verifies all iteration 1 findings are addressed

[Loops until approved or max iterations reached]
```

### 6.4 Context Files in Code Review

**CLAUDE.md Inclusion:**

Code review automatically includes project context:

```
[System prompt from settings]

---

## Project Context from CLAUDE.md

[Full CLAUDE.md content - up to 5000 chars]

[Other context files as applicable]
```

This ensures the reviewing agent understands:
- Project architecture patterns
- Technology stack
- Conventions and standards
- Testing requirements
- Any project-specific guidelines

### 6.5 Agent Model & Provider

Code review uses the same model configuration as the feature:

- If feature specifies `model`: Use that model for review
- If not specified: Use default model from settings
- Model resolution via `resolveModelString()` from `@automaker/model-resolver`
- Provider resolution via `ProviderFactory.getProviderNameForModel()`

This ensures consistency: if a feature was implemented by Opus, it's reviewed by Opus.

---

## 7. Implementation Plan

### 7.1 Files to Create

#### New Type Definitions

**File:** `libs/types/src/code-review.ts` (NEW)

```typescript
export interface CodeReviewSpec {
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'failed';
  currentIteration: number;
  maxIterations: number;
  iterations: CodeReviewIteration[];
}

export interface CodeReviewIteration {
  iterationNumber: number;
  reviewedAt: string;
  reviewedByModel: string;
  reviewedByProvider: string;
  status: 'approved' | 'rejected' | 'failed';
  gitCommitHash: string;
  gitDiff: string;
  findings: CodeReviewFinding[];
  overallSummary: string;
  rejectionReason?: string;
  reviewFile: string;
}

export interface CodeReviewFinding {
  category: 'compliance' | 'code' | 'test' | 'architecture' | 'performance';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  suggestion?: string;
  file?: string;
  line?: number;
}
```

#### Update Feature Type

**File:** `libs/types/src/feature.ts`

Add to Feature interface:
```typescript
codeReviewSpec?: CodeReviewSpec;
```

Import: `import type { CodeReviewSpec } from './code-review';`

#### New Prompts Types

**File:** `libs/types/src/prompts.ts`

Add to PromptCustomization interface:
```typescript
codeReview?: CodeReviewPrompts;

interface CodeReviewPrompts {
  reviewSystemPrompt?: CustomPrompt;
  reviewPromptTemplate?: CustomPrompt;
}
```

#### New Prompts Library

**File:** `libs/prompts/src/code-review.ts` (NEW)

```typescript
export const DEFAULT_CODE_REVIEW_SYSTEM_PROMPT = `[system prompt from Section 4.3]`;

export const DEFAULT_CODE_REVIEW_PROMPT_TEMPLATE = `[prompt template from Section 4.3]`;

export const DEFAULT_CODE_REVIEW_PROMPTS = {
  reviewSystemPrompt: {
    enabled: false,
    value: DEFAULT_CODE_REVIEW_SYSTEM_PROMPT,
  },
  reviewPromptTemplate: {
    enabled: false,
    value: DEFAULT_CODE_REVIEW_PROMPT_TEMPLATE,
  },
};

export function mergeCodeReviewPrompts(
  custom: CodeReviewPrompts | undefined,
  defaults = DEFAULT_CODE_REVIEW_PROMPTS
): Required<CodeReviewPrompts> {
  return {
    reviewSystemPrompt: {
      enabled: custom?.reviewSystemPrompt?.enabled ?? defaults.reviewSystemPrompt.enabled,
      value: custom?.reviewSystemPrompt?.enabled
        ? custom.reviewSystemPrompt.value
        : defaults.reviewSystemPrompt.value,
    },
    reviewPromptTemplate: {
      enabled: custom?.reviewPromptTemplate?.enabled ?? defaults.reviewPromptTemplate.enabled,
      value: custom?.reviewPromptTemplate?.enabled
        ? custom.reviewPromptTemplate.value
        : defaults.reviewPromptTemplate.value,
    },
  };
}
```

#### Update Prompts Index

**File:** `libs/prompts/src/index.ts`

Export: `export * from './code-review';`

#### Update Prompts Merge

**File:** `libs/prompts/src/merge.ts`

Add to mergeAllPrompts():
```typescript
codeReview: mergeCodeReviewPrompts(
  custom?.codeReview,
  DEFAULT_CODE_REVIEW_PROMPTS
),
```

#### Server Routes

**File:** `apps/server/src/routes/code-review/index.ts` (NEW)

```typescript
import { Router } from 'express';
import { generateReview } from './routes/generate-review';

const router = Router();

router.post('/generate-review', generateReview);

export default router;
```

**File:** `apps/server/src/routes/code-review/routes/generate-review.ts` (NEW)

Route handler that:
- Validates request (projectPath, featureId, iterationNumber)
- Calls `AutoModeService.generateCodeReview()`
- Returns success/error response
- Streams events via WebSocket

#### UI Components

**File:** `apps/ui/src/components/views/settings-view/prompts/code-review-section.tsx` (NEW)

New settings section with:
- reviewSystemPrompt text area
- reviewPromptTemplate text area
- Enabled toggles for each
- Reset buttons
- Character counts

**File:** `apps/ui/src/components/views/board-view/components/code-review-panel.tsx` (NEW)

Display code review findings and status in a visual panel when feature is in code_review status.

### 7.2 Files to Modify

#### Type Definitions

**File:** `libs/types/src/feature.ts`
- Add import: `import type { CodeReviewSpec } from './code-review';`
- Add field: `codeReviewSpec?: CodeReviewSpec;`

**File:** `libs/types/src/prompts.ts`
- Import CodeReviewPrompts type from code-review.ts
- Add `codeReview?: CodeReviewPrompts;` to PromptCustomization interface

**File:** `libs/types/src/settings.ts`
- Add PromptCustomization import if not already present

#### Prompts Library

**File:** `libs/prompts/src/defaults.ts`
- Import from code-review.ts
- Add `codeReview: DEFAULT_CODE_REVIEW_PROMPTS` to DEFAULT_PROMPTS

**File:** `libs/prompts/src/merge.ts`
- Import mergeCodeReviewPrompts
- Import CodeReviewPrompts type
- Add codeReview to mergeAllPrompts() return type
- Add codeReview merge logic to mergeAllPrompts()

#### Server Service

**File:** `apps/server/src/services/auto-mode-service.ts`

Add methods:
```typescript
// Main code review generation
async generateCodeReview(
  projectPath: string,
  featureId: string,
  iterationNumber: number,
  worktreePath?: string
): Promise<{
  status: 'approved' | 'rejected' | 'failed';
  summary: string;
}>;

// Parse agent response into structured findings
private async parseCodeReviewResponse(
  agentResponse: string,
  iterationNumber: number
): Promise<CodeReviewIteration>;

// Save review to markdown file
private async saveCodeReviewMarkdown(
  featureDir: string,
  review: CodeReviewIteration
): Promise<void>;

// Load previous review findings for context
private async getPreviousReviewFindings(
  featureDir: string,
  iterationNumber: number
): Promise<CodeReviewIteration[]>;

// Build code review prompt with context
private buildCodeReviewPrompt(
  feature: Feature,
  diff: string,
  previousFindings: CodeReviewIteration[]
): string;
```

**Modifications to existing methods:**

- `executeFeature()` (around lines 416-662):
  - After execution completes, check feature status
  - Call auto-commit if needed
  - Call `generateCodeReview()` automatically
  - Handle code review result (status transition)

- `buildFeaturePrompt()`:
  - If feature has codeReviewSpec with findings:
    - Load all code-review-iteration-{N}.md files
    - Append to prompt as "Code Review Findings" section
    - Include all iterations for verification context

- `updateFeatureStatus()`:
  - After feature completes In Progress, transition to `code_review`
  - Handle status transitions from code_review (to approved status or back to in_progress)

#### Server Routes

**File:** `apps/server/src/routes/index.ts` (or main route file)

Add:
```typescript
import codeReviewRoutes from './code-review';
router.use('/code-review', codeReviewRoutes);
```

#### Server Lib

**File:** `apps/server/src/lib/settings-helpers.ts`

Update `getPromptCustomization()` if needed to ensure codeReview is included in merged prompts.

#### UI Store

**File:** `apps/ui/src/store/app-store.ts`

Ensure `promptCustomization` state includes codeReview field (should be automatic if settings sync works).

#### UI Settings View

**File:** `apps/ui/src/components/views/settings-view/prompts/prompt-customization-section.tsx`

Add new tab: "Code Review"
- Import CodeReviewSection component
- Add to tabbed interface
- Add reset handler for code review prompts

#### UI Board View

**File:** `apps/ui/src/components/views/board-view/hooks/use-board-actions.ts`

Add handling for code_review status:
- Display code review findings
- Show approval/rejection status
- Handle manual review viewing

**File:** `apps/ui/src/components/views/board-view/constants.ts`

Add `code_review` to status constants and column definitions.

**File:** `apps/ui/src/components/views/board-view/kanban-board.tsx`

Add column for code_review status in kanban display.

### 7.3 Implementation Sequence

#### Phase 1: Core Data Structures (Weeks 1-2)

1. Create `libs/types/src/code-review.ts` with all types
2. Update `libs/types/src/feature.ts` to include codeReviewSpec
3. Update `libs/types/src/prompts.ts` for CodeReviewPrompts
4. Update `libs/types/src/settings.ts` if needed

**Validation:** Type definitions compile, no circular imports

#### Phase 2: Prompts & Settings (Weeks 2-3)

1. Create `libs/prompts/src/code-review.ts` with defaults
2. Update `libs/prompts/src/defaults.ts` to include code review defaults
3. Update `libs/prompts/src/merge.ts` to merge code review prompts
4. Update `libs/prompts/src/index.ts` exports

**Validation:** Prompts library builds, merging works correctly

#### Phase 3: Server Implementation (Weeks 3-5)

1. Create `apps/server/src/routes/code-review/index.ts` and routes
2. Add methods to `AutoModeService`:
   - `generateCodeReview()`
   - `parseCodeReviewResponse()`
   - `saveCodeReviewMarkdown()`
   - `getPreviousReviewFindings()`
   - `buildCodeReviewPrompt()`
3. Modify `executeFeature()` to call code review automatically
4. Modify `buildFeaturePrompt()` to include review findings
5. Update settings-helpers if needed
6. Register routes in main route file

**Validation:**
- Code review endpoint accepts requests
- Review generation works with mock agent
- Findings are saved to feature.json and markdown
- Status transitions happen correctly

#### Phase 4: UI Implementation (Weeks 4-6)

1. Create code review settings section component
2. Add code_review to kanban board constants
3. Add code_review column to kanban display
4. Create code review panel component
5. Update board actions hook
6. Update settings view to include code review tab

**Validation:**
- Settings can be customized
- UI displays code review status
- Code review findings are visible
- Board shows code review column

#### Phase 5: Integration & Testing (Weeks 6-7)

1. E2E tests:
   - Feature execution → automatic code review
   - Rejected review → back to in progress
   - Multiple iterations
   - Max iterations handling
2. Integration tests:
   - Code review event streaming
   - Prompt customization affects output
   - Context passing to fixing agent
3. Manual testing:
   - Full workflow with UI
   - Settings customization
   - Multiple parallel features

**Validation:** All tests pass, full workflow works end-to-end

### 7.4 Key Integration Points

**AutoModeService.executeFeature():**
- After agent completes and changes are staged:
  ```typescript
  // Auto-commit
  const commitHash = await this.commitFeature(projectPath, featureId, worktreePath);

  // Auto-start code review
  const reviewResult = await this.generateCodeReview(
    projectPath,
    featureId,
    iterationNumber,
    worktreePath
  );

  // Handle result
  if (reviewResult.status === 'approved') {
    // Transition to next status
    await this.updateFeatureStatus(..., nextStatus);
  } else if (reviewResult.status === 'rejected') {
    // Go back to in_progress for fixes
    await this.updateFeatureStatus(..., 'in_progress');
    // Feature will be picked up in next auto loop
  }
  ```

**Feature Prompt Building:**
- Check if feature has codeReviewSpec with findings:
  ```typescript
  if (feature.codeReviewSpec?.iterations.length > 0) {
    // Load all review files for context
    const reviewFiles = [];
    for (const iteration of feature.codeReviewSpec.iterations) {
      const reviewContent = await loadFile(
        path.join(featureDir, iteration.reviewFile)
      );
      reviewFiles.push(reviewContent);
    }

    // Append all reviews to prompt
    prompt += `\n\n## Code Review Findings\n\n${reviewFiles.join('\n\n---\n\n')}`;
  }
  ```

### 7.5 Testing Strategy

**Unit Tests:**
- Code review prompt building
- Finding parsing from agent response
- Markdown file generation
- Status transitions

**Integration Tests:**
- Full code review flow
- Event emission
- Multi-iteration handling
- Prompt customization

**E2E Tests:**
- Create feature → In Progress → Code Review → Approved
- Create feature → Code Review → Rejected → In Progress → Code Review → Approved
- Max iterations reached handling
- Multiple parallel features with code review

### 7.6 Backward Compatibility

- Feature.codeReviewSpec is optional
- Features without codeReviewSpec will work normally
- Pipeline status `code_review` only appears for new features
- Existing features can be updated to use code review without breaking

---

## 8. Summary

The Code Review feature introduces an automated, AI-powered code review step into the Automaker pipeline. Key characteristics:

- **Automated**: Runs automatically after In Progress completes
- **Provider-Agnostic**: Works with any configured AI agent
- **Compliance-First**: Validates requirements before code quality
- **Iterative**: Supports up to 3 review/fix cycles
- **Customizable**: Fully configurable through prompt settings
- **Auditable**: Maintains complete history of all reviews
- **Context-Preserving**: Full context passed between iterations
- **Integrated**: Seamlessly integrated into AutoMode service and existing pipelines

This feature enables fully automated feature development with quality gates, reducing manual review burden while maintaining code quality standards.

---

**Document Version History:**
- v1.0 (2026-01-09): Initial specification - Ready for implementation
