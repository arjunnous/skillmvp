# Skill Assessment Platform — Technical Specification Document

**Version:** 1.0
**Date:** 2026-05-07
**Status:** MVP — Localhost Demo, Production-Ready Architecture

---

## Table of Contents

1. Project Overview
2. Technology Stack
3. System Architecture
4. Environment Variables
5. Database Schema
6. Authentication and Authorization Flow
7. Folder Structure
8. API Design
9. Assessment Engine Flow
10. Excel Upload Flow
11. Scoring Logic
12. State Management Design
13. Form Handling and Validation
14. Error Handling Strategy
15. Security Design
16. Performance Considerations
17. Development Environment Setup

---

## 1. Project Overview

**Project Name:** Skill Assessment Platform (MVP)

**Objective:** A web-based platform that enables organizations to create, assign, and evaluate MCQ-based employee assessments with automated scoring, pass/fail determination, and reporting. Built for localhost demo first, designed to deploy on internal org servers without architectural rework.

**Primary Users:**
- Admin: Creates assessments, manages employees, views results and reports
- Employee: Takes assigned assessments, views personal results

**Out of scope for MVP:**
- Real-time proctoring
- Video/audio questions
- Third-party LMS integration
- Mobile native app

---

## 2. Technology Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| Framework | Next.js | 15.x, App Router, TypeScript strict mode |
| Styling | Tailwind CSS | 3.x |
| UI Components | shadcn/ui | Latest, Radix UI primitives |
| Authentication | Supabase Auth | Email/password only for MVP; OAuth deferred post-MVP |
| Database | Supabase PostgreSQL | Cloud free tier |
| ORM | Prisma | 5.x, with Prisma Client |
| State Management | Zustand | 4.x |
| Forms & Validation | React Hook Form + Zod | RHF 7.x, Zod 3.x |
| Excel Parsing | xlsx (SheetJS) | For upload and export |
| Email (post-MVP hook) | Nodemailer or Resend SDK | Interface stubbed in MVP |
| Hosting (Demo) | localhost:3000 | |
| Version Control | GitHub | |
| IDE | VS Code | |

**Decision Notes:**
- OAuth (Google, Microsoft) is explicitly deferred to post-MVP to reduce auth surface area during the demo phase.
- Supabase Auth is used for session management and token issuance only. User profile and role data live in Prisma-managed tables to keep the data layer under ORM control.
- Server Actions are used for form mutations (assessment creation, question saving). API Routes are used for stateful engine operations (answer save, submission, timer sync) because they require precise HTTP status codes and are called from Zustand actions, not form submits.

---

## 3. System Architecture

```
Browser (Next.js App Router)
  |
  |-- React Server Components (read-heavy pages: dashboard, reports)
  |-- React Client Components (assessment engine, forms)
  |
  v
Next.js Middleware (route protection, role check)
  |
  |-- Server Actions (form mutations: create assessment, add question)
  |-- API Routes /api/v1/** (engine: save-answer, submit, timer-sync)
  |
  v
Prisma ORM (type-safe queries, migrations)
  |
  v
Supabase PostgreSQL (data store)
  +-- Supabase Auth (JWT issuance, session tokens)
```

**Data flow rules:**
- Server Components fetch data directly via Prisma (no API hop for read pages)
- Client Components that need server data use Server Actions returning typed objects or call API Routes
- Zustand store is client-side only and holds transient state (timer, current question index, draft answers)
- Database is the source of truth for all persisted state; Zustand is a performance layer only

---

## 4. Environment Variables

All variables must be present in `.env.local` for development. A `.env.example` file with placeholder values must be committed to the repository. The `.env.local` file must be in `.gitignore`.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_role_key>

# Prisma
DATABASE_URL=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_ENV=development

# Session
SESSION_SECRET=<random_32_char_string>

# Email (stubbed in MVP, wire up post-MVP)
EMAIL_FROM=no-reply@skillassess.local
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=

# Excel Upload
MAX_UPLOAD_ROWS=1000
MAX_UPLOAD_SIZE_MB=5

# Assessment Engine
AUTO_SAVE_INTERVAL_MS=10000
ATTEMPT_LIMIT_DEFAULT=1
SUBMISSION_GRACE_SECONDS=30
```

**Rules:**
- `NEXT_PUBLIC_` prefix exposes variables to the browser bundle. Never put secrets under this prefix.
- `SUPABASE_SERVICE_ROLE_KEY` is only used server-side (Server Actions, API Routes). Never exposed to client.
- All variables must be typed and validated at startup using a `src/lib/env.ts` module with Zod, so the app fails fast on misconfiguration rather than at runtime.

```typescript
// src/lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  AUTO_SAVE_INTERVAL_MS: z.coerce.number().default(10000),
  ATTEMPT_LIMIT_DEFAULT: z.coerce.number().default(1),
  MAX_UPLOAD_ROWS: z.coerce.number().default(1000),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(5),
})

export const env = envSchema.parse(process.env)
```

---

## 5. Database Schema

### Design Principles
- All tables use UUID primary keys (`gen_random_uuid()`)
- All tables have `created_at TIMESTAMPTZ DEFAULT now()` and `updated_at TIMESTAMPTZ DEFAULT now()`
- Soft deletes via `deleted_at TIMESTAMPTZ NULL` on entities that must be auditable (Users, Assessments, Questions)
- Hard deletes are used only for junction/answer tables where audit is not required
- Foreign keys with `ON DELETE CASCADE` for child records that are meaningless without the parent
- Foreign keys with `ON DELETE RESTRICT` where orphan prevention is critical

---

### 5.1 Table: `users`

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id       UUID UNIQUE NOT NULL,        -- Supabase auth.users.id
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

---

### 5.2 Table: `employees`

```sql
CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_code   TEXT UNIQUE NOT NULL,
  department      TEXT,
  designation     TEXT,
  phone           TEXT,
  manager_name    TEXT,
  date_joined     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_employees_user_id ON employees(user_id);
CREATE INDEX idx_employees_code ON employees(employee_code);
```

---

### 5.3 Table: `groups`

```sql
CREATE TABLE groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('project', 'department', 'role', 'team')),
  description  TEXT,
  created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_groups_name_type ON groups(name, type);
```

---

### 5.4 Table: `employee_groups`

```sql
CREATE TABLE employee_groups (
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, group_id)
);

CREATE INDEX idx_eg_group_id ON employee_groups(group_id);
```

---

### 5.5 Table: `assessments`

```sql
CREATE TABLE assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  pass_percentage   NUMERIC(5,2) NOT NULL CHECK (pass_percentage BETWEEN 0 AND 100),
  max_attempts      INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  randomize_questions BOOLEAN NOT NULL DEFAULT false,
  randomize_options   BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_created_by ON assessments(created_by);
```

**Assessment Status State Machine:**
```
draft → published → closed → archived
```
- `draft`: visible only to admin
- `published`: accessible to assigned employees within date window
- `closed`: no new attempts; existing results are final
- `archived`: soft-hidden from default views

---

### 5.6 Table: `questions`

```sql
CREATE TABLE questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  UUID REFERENCES assessments(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  question_type  TEXT NOT NULL CHECK (question_type IN ('single', 'multiple')),
  marks          NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  difficulty     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category       TEXT,
  explanation    TEXT,
  order_index    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX idx_questions_assessment_id ON questions(assessment_id);
```

---

### 5.7 Table: `question_options`

```sql
CREATE TABLE question_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text  TEXT NOT NULL,
  is_correct   BOOLEAN NOT NULL DEFAULT false,
  order_index  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_options_question_id ON question_options(question_id);
```

---

### 5.8 Table: `assessment_assignments`

```sql
CREATE TABLE assessment_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  assignee_type   TEXT NOT NULL CHECK (assignee_type IN ('employee', 'group')),
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  group_id        UUID REFERENCES groups(id) ON DELETE CASCADE,
  assigned_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_assignee CHECK (
    (assignee_type = 'employee' AND employee_id IS NOT NULL AND group_id IS NULL) OR
    (assignee_type = 'group'    AND group_id IS NOT NULL    AND employee_id IS NULL)
  )
);

CREATE INDEX idx_aa_assessment_id ON assessment_assignments(assessment_id);
CREATE INDEX idx_aa_employee_id ON assessment_assignments(employee_id);
CREATE INDEX idx_aa_group_id ON assessment_assignments(group_id);
```

---

### 5.9 Table: `assessment_attempts`

```sql
CREATE TABLE assessment_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  attempt_number    INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'submitted', 'timed_out', 'abandoned')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at      TIMESTAMPTZ,
  server_deadline   TIMESTAMPTZ NOT NULL,
  last_heartbeat_at TIMESTAMPTZ,
  question_order    UUID[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_attempt UNIQUE (assessment_id, employee_id, attempt_number)
);

CREATE INDEX idx_attempts_assessment_employee ON assessment_attempts(assessment_id, employee_id);
CREATE INDEX idx_attempts_status ON assessment_attempts(status);
```

**Notes:**
- `server_deadline` is computed at attempt start and used server-side to reject late submissions
- `question_order` stores the shuffled question UUID array for this specific attempt, ensuring consistency on page refresh

---

### 5.10 Table: `employee_answers`

```sql
CREATE TABLE employee_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  selected_option_ids  UUID[] NOT NULL DEFAULT '{}',
  is_flagged      BOOLEAN NOT NULL DEFAULT false,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_answer UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_ea_attempt_id ON employee_answers(attempt_id);
```

---

### 5.11 Table: `assessment_results`

```sql
CREATE TABLE assessment_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id          UUID UNIQUE NOT NULL REFERENCES assessment_attempts(id) ON DELETE RESTRICT,
  assessment_id       UUID NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  attempt_number      INTEGER NOT NULL,
  total_marks         NUMERIC(8,2) NOT NULL,
  marks_obtained      NUMERIC(8,2) NOT NULL,
  percentage          NUMERIC(5,2) NOT NULL,
  pass_percentage     NUMERIC(5,2) NOT NULL,   -- snapshot at submission time
  is_passed           BOOLEAN NOT NULL,
  total_questions     INTEGER NOT NULL,
  answered_questions  INTEGER NOT NULL,
  correct_count       INTEGER NOT NULL,
  incorrect_count     INTEGER NOT NULL,
  unanswered_count    INTEGER NOT NULL,
  time_taken_seconds  INTEGER NOT NULL,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_results_assessment_id ON assessment_results(assessment_id);
CREATE INDEX idx_results_employee_id ON assessment_results(employee_id);
```

---

## 6. Authentication and Authorization Flow

### 6.1 Auth Provider Decision
Supabase Auth handles credential verification and JWT issuance. Role and profile data live in Prisma-managed tables.

For MVP: **email + password only**. OAuth deferred to post-MVP.

### 6.2 Registration Flow
Employees are NOT self-registering. Created by admin via Excel upload or manual form.

On creation, the server:
1. Calls `supabase.auth.admin.createUser()` using service role key (server-side only)
2. Creates a `users` row linked by `auth_id`
3. Creates an `employees` row
4. Sets `must_change_password = true`

### 6.3 Login Flow

```
1. Employee/Admin submits email + password
2. Client calls Server Action: signIn(email, password)
3. Server calls supabase.auth.signInWithPassword()
4. Supabase returns session tokens
5. Tokens stored in HttpOnly cookies via @supabase/ssr
6. Server reads auth_id from session, queries users table for role + is_active
7. If is_active = false → sign out, return error
8. If must_change_password = true → redirect to /change-password
9. Redirect based on role:
   - admin → /admin/dashboard
   - employee → /employee/dashboard
```

### 6.4 Session Management
- Access token TTL: 1 hour (Supabase default)
- Refresh token TTL: 1 week
- `@supabase/ssr` auto-refreshes tokens via cookies on every request

### 6.5 Middleware — Route Protection

```typescript
// src/middleware.ts
export const config = {
  matcher: ['/admin/:path*', '/employee/:path*', '/api/v1/:path*'],
}
```

| Path prefix | Allowed roles |
|---|---|
| `/admin/**` | admin |
| `/employee/**` | employee |
| `/api/v1/admin/**` | admin |
| `/api/v1/employee/**` | employee |
| `/login` | unauthenticated only |

---

## 7. Folder Structure

```
MCQ_App/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   └── templates/
│       └── employee_upload_template.xlsx
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── change-password/page.tsx
│   │   │
│   │   ├── admin/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── upload/page.tsx
│   │   │   ├── groups/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── assessments/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       ├── questions/page.tsx
│   │   │   │       └── assign/page.tsx
│   │   │   └── reports/page.tsx
│   │   │
│   │   ├── employee/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── assessments/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx
│   │   │   │       ├── attempt/page.tsx
│   │   │   │       └── result/page.tsx
│   │   │   └── results/page.tsx
│   │   │
│   │   └── api/
│   │       └── v1/
│   │           ├── admin/
│   │           │   ├── employees/
│   │           │   │   ├── route.ts
│   │           │   │   ├── [id]/route.ts
│   │           │   │   └── upload/route.ts
│   │           │   ├── groups/route.ts
│   │           │   ├── assessments/
│   │           │   │   ├── route.ts
│   │           │   │   └── [id]/
│   │           │   │       ├── route.ts
│   │           │   │       ├── questions/route.ts
│   │           │   │       └── publish/route.ts
│   │           │   └── reports/route.ts
│   │           │
│   │           └── employee/
│   │               ├── assessments/
│   │               │   ├── route.ts
│   │               │   └── [id]/
│   │               │       ├── start/route.ts
│   │               │       ├── save-answer/route.ts
│   │               │       ├── heartbeat/route.ts
│   │               │       └── submit/route.ts
│   │               └── results/route.ts
│   │
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components (never edit manually)
│   │   ├── layout/
│   │   │   ├── AdminSidebar.tsx
│   │   │   ├── EmployeeSidebar.tsx
│   │   │   └── TopBar.tsx
│   │   ├── assessment/
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── NavigationSidebar.tsx
│   │   │   ├── TimerDisplay.tsx
│   │   │   └── SubmitConfirmDialog.tsx
│   │   ├── employees/
│   │   │   ├── EmployeeTable.tsx
│   │   │   └── ExcelUploadDropzone.tsx
│   │   └── shared/
│   │       ├── DataTable.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── StatusBadge.tsx
│   │       └── PageHeader.tsx
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── actions.ts
│   │   │   └── schemas.ts
│   │   ├── employees/
│   │   │   ├── actions.ts
│   │   │   ├── upload.ts
│   │   │   └── schemas.ts
│   │   ├── assessments/
│   │   │   ├── actions.ts
│   │   │   ├── questions.ts
│   │   │   └── schemas.ts
│   │   ├── engine/
│   │   │   ├── hooks.ts
│   │   │   └── utils.ts
│   │   └── results/
│   │       ├── scoring.ts
│   │       └── export.ts
│   │
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── supabase/
│   │   │   ├── client.ts          # Browser client (anon key)
│   │   │   ├── server.ts          # Server client (cookies)
│   │   │   └── admin.ts           # Admin client (service role, server-only)
│   │   ├── env.ts
│   │   ├── auth-guard.ts
│   │   ├── api-response.ts
│   │   └── errors.ts
│   │
│   ├── store/
│   │   ├── assessment-engine.store.ts
│   │   └── user.store.ts
│   │
│   ├── hooks/
│   │   ├── useCountdownTimer.ts
│   │   ├── useAutoSave.ts
│   │   └── useBeforeUnload.ts
│   │
│   ├── types/
│   │   ├── api.ts
│   │   ├── assessment.ts
│   │   ├── employee.ts
│   │   └── results.ts
│   │
│   └── middleware.ts
│
├── .env.example
├── .env.local                  # Never committed
├── .gitignore
├── .vscode/
│   └── extensions.json
├── components.json
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

**Separation principles:**
- `components/` — presentational only, no Prisma/Supabase calls
- `features/` — all business logic, Server Actions co-located with Zod schemas
- `lib/` — infrastructure plumbing, no business logic
- `store/` — client-side only, never imported in Server Components
- `types/` — type declarations only, no runtime code

---

## 8. API Design

### 8.1 Response Envelope

```typescript
type ApiSuccess<T> = {
  success: true
  data: T
  meta?: { page?: number; pageSize?: number; total?: number; totalPages?: number }
}

type ApiError = {
  success: false
  error: { code: string; message: string; details?: unknown }
}
```

**Standard HTTP status codes:**
- `200` — successful GET or action with return data
- `201` — successful resource creation
- `400` — validation error
- `401` — not authenticated
- `403` — wrong role
- `404` — resource not found
- `409` — conflict (duplicate, attempt limit exceeded)
- `422` — unprocessable (e.g., publish assessment with 0 questions)
- `500` — unexpected server error (never leaks stack trace)

---

### 8.2 Key Admin Endpoints

#### `GET /api/v1/admin/employees`
Query params: `page`, `pageSize` (max 100), `search`, `groupId`

#### `POST /api/v1/admin/employees`
```typescript
{
  fullName: string
  email: string
  employeeCode: string
  department?: string
  designation?: string
  phone?: string
  dateJoined?: string  // ISO date
}
```

#### `POST /api/v1/admin/employees/upload`
`multipart/form-data` with `file` field. Returns:
```typescript
{
  processed: number
  created: number
  skipped: number
  errors: Array<{ row: number; field: string; message: string }>
}
```

#### `POST /api/v1/admin/assessments`
```typescript
{
  title: string
  description?: string
  durationMinutes: number        // 5–480
  passPercentage: number         // 1–100
  maxAttempts: number            // default 1
  startDate?: string
  endDate?: string
  randomizeQuestions: boolean
  randomizeOptions: boolean
}
```

#### `POST /api/v1/admin/assessments/[id]/publish`
Pre-publish validation (422 if any fail):
- At least 1 question
- All questions have ≥ 2 options and ≥ 1 correct option
- Single questions have exactly 1 correct option
- End date after start date (if set)

#### `GET /api/v1/admin/reports`
Query: `assessmentId?`, `groupId?`, `dateFrom?`, `dateTo?`, `format` (`json`|`xlsx`|`csv`)

---

### 8.3 Key Employee Endpoints

#### `POST /api/v1/employee/assessments/[id]/start`
Pre-start validation:
- Employee is assigned to assessment
- Assessment status is `published`
- Within date window
- Attempt count < `max_attempts` (409 if exceeded)
- No existing `in_progress` attempt (409 with `attemptId` to resume)

Response includes questions (shuffled if enabled) **without** `is_correct` field.

#### `POST /api/v1/employee/assessments/[id]/save-answer`
```typescript
{ attemptId: string; questionId: string; selectedOptionIds: string[]; isFlagged?: boolean }
```
Returns `409 ATTEMPT_EXPIRED` if past `server_deadline`.

#### `POST /api/v1/employee/assessments/[id]/submit`
```typescript
{ attemptId: string }
```
Response: `{ resultId, isPassed, percentage, marksObtained, totalMarks }`

---

## 9. Assessment Engine Flow

### 9.1 Timer Management
- **Server is the source of truth.** `server_deadline = started_at + duration_minutes` stored in DB.
- Client calculates `timeRemaining = serverDeadline - Date.now()` on mount.
- `useCountdownTimer` auto-submits when timer reaches 0.
- Save-answer API rejects requests after `server_deadline`.
- Submit API accepts up to `SUBMISSION_GRACE_SECONDS` (default 30s) after deadline.
- Heartbeat every 60s updates `last_heartbeat_at`.

### 9.2 Auto-Save
- `useAutoSave` runs every `AUTO_SAVE_INTERVAL_MS` (default 10s)
- Saves dirty answers in parallel (`Promise.all`)
- After 3 consecutive failures: non-blocking toast warning
- Immediate save triggered on question navigation

### 9.3 Navigation States

| State | Condition |
|---|---|
| `not-visited` | No entry in Zustand answers map |
| `visited-unanswered` | In answers map with `selectedOptionIds = []` |
| `answered` | `selectedOptionIds.length > 0` |
| `flagged` | `isFlagged = true` |
| `current` | Matches `currentQuestionIndex` |

### 9.4 Browser Close Handling
- `useBeforeUnload` shows native browser dialog to warn on close
- Attempt stays `in_progress` if browser is closed
- On next login: employee sees "Resume pending attempt" banner
- If past `server_deadline` on resume: auto-submit with saved answers, mark `timed_out`

### 9.5 Submission Flow
```
Employee clicks "Submit"
  → SubmitConfirmDialog: "X of Y answered, Z unanswered. Confirm?"
  → Final save of all unsaved answers
  → POST /submit
  → Server computes score (Section 11)
  → Writes assessment_results in transaction
  → Updates attempt status → 'submitted'
  → Fires email notification (non-blocking)
  → Client redirects to result page
```

---

## 10. Excel Upload Flow

### 10.1 Expected Column Format

| Column | Required | Notes |
|---|---|---|
| `employee_code` | Yes | Unique, alphanumeric, max 20 chars |
| `full_name` | Yes | Min 2, max 100 chars |
| `email` | Yes | Valid email, unique |
| `department` | No | Max 100 chars |
| `designation` | No | Max 100 chars |
| `phone` | No | Digits only, max 15 chars |
| `manager_name` | No | Max 100 chars |
| `date_joined` | No | YYYY-MM-DD or DD/MM/YYYY |

Template file served from: `public/templates/employee_upload_template.xlsx`

### 10.2 Upload Constraints
- Max file size: `MAX_UPLOAD_SIZE_MB` (default 5MB)
- Max rows: `MAX_UPLOAD_ROWS` (default 1000)
- Accepted: `.xlsx`, `.xls`
- MIME type validated via **magic bytes** (`file-type` package), not Content-Type header

### 10.3 Processing Flow
```
Client validates file extension + size
  → POST multipart/form-data to /api/v1/admin/employees/upload
  → Server validates MIME via magic bytes
  → Parse with SheetJS
  → Validate each row with Zod (collect ALL errors, no fail-fast)
  → Check duplicates within file
  → Batch query DB for existing emails/codes
  → For valid rows: DB transaction (createUser + users + employees)
  → Return { processed, created, skipped, errors[] }
  → Client shows result table + downloadable error report
```

### 10.4 Default Password
```typescript
function generateDefaultPassword(row: ExcelRow): string {
  return `${row.employee_code}@${row.full_name.split(' ')[0]}`
}
// Example: EMP001@John
```

---

## 11. Scoring Logic

### 11.1 Rules
- **Single correct:** Correct selection → full marks. Wrong or no selection → 0.
- **Multiple correct:** Must select ALL correct options and NO incorrect options → full marks. Any other combination → 0. **No partial credit. No negative marking.**
- Percentage: `Math.round((obtained / total) * 10000) / 100` (2 decimal places)
- Pass: `percentage >= pass_percentage`

### 11.2 Scoring Function (pure, testable)

```typescript
// src/features/results/scoring.ts

function computeScore(
  questions: Array<{
    id: string
    questionType: 'single' | 'multiple'
    marks: number
    correctOptionIds: string[]    // fetched from DB; never sent to client
  }>,
  answers: Map<string, string[]>,  // questionId → selectedOptionIds
  passPercentage: number
): ScoreResult {
  // ...computes totalMarks, marksObtained, percentage, isPassed,
  //    correctCount, incorrectCount, unansweredCount
}
```

**Unit tests required** (Vitest):
- Single: correct/wrong/unanswered
- Multiple: all correct, partial correct, correct+extra incorrect, unanswered
- Pass/fail at exact threshold boundary

---

## 12. State Management Design

### Assessment Engine Store (Zustand)
```typescript
interface AssessmentEngineState {
  attemptId: string | null
  assessmentId: string | null
  serverDeadline: Date | null
  questions: ClientQuestion[]           // no correct answer field
  currentQuestionIndex: number
  answers: Record<string, string[]>     // questionId → selectedOptionIds
  flags: Record<string, boolean>
  dirtyQuestionIds: Set<string>         // modified since last save
  isSubmitting: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  consecutiveSaveFailures: number
  // actions: initAttempt, setAnswer, toggleFlag, navigateTo, markSaved, reset
}
```

### User Session Store (Zustand)
```typescript
interface UserState {
  user: { id: string; authId: string; email: string; fullName: string; role: 'admin' | 'employee' } | null
  isLoading: boolean
  setUser: (user: UserState['user']) => void
  clearUser: () => void
}
```

---

## 13. Form Handling and Validation

Zod schemas defined in `src/features/*/schemas.ts` are **shared** between React Hook Form (client validation) and Server Actions (server re-validation). Same schema never written twice.

```typescript
// Server Action pattern
'use server'
export async function createAssessment(formData: unknown) {
  const user = await requireRole(['admin'])   // throws if unauthorized
  const parsed = assessmentSchema.safeParse(formData)
  if (!parsed.success) return { success: false, error: parsed.error.flatten() }
  const assessment = await prisma.assessment.create({ data: { ...parsed.data, createdBy: user.id } })
  return { success: true, data: { id: assessment.id } }
}
```

---

## 14. Error Handling Strategy

### API Route Error Class
```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) { super(message) }
}
```

### Prisma Error Mapping
| Prisma code | HTTP status | App code |
|---|---|---|
| `P2002` (unique constraint) | 409 | `DUPLICATE_RECORD` |
| `P2025` (not found) | 404 | `NOT_FOUND` |
| `P2003` (FK violation) | 409 | `REFERENCE_CONFLICT` |

### Client Error Handling
- `src/app/error.tsx` — global React error boundary
- `src/app/not-found.tsx` — 404 page
- Assessment engine: non-blocking toasts (shadcn/ui Sonner)
- Forms: inline errors via React Hook Form

---

## 15. Security Design

### Auth Security
- Passwords hashed by Supabase (bcrypt)
- Session tokens in HttpOnly cookies
- CSRF: Next.js Server Actions have built-in CSRF protection; API Routes validate `Origin` header
- Rate limiting on attempt start: 5 req/min per IP (in-memory for MVP)
- Login rate limiting: handled by Supabase Auth built-in

### Authorization Security
- Every API Route independently validates JWT (does not rely solely on middleware)
- `is_correct` field is **never** included in any response to the client
- Employee endpoints verify `employee_id` matches authenticated user's ID

### Input Security
- All input validated with Zod before reaching Prisma
- Prisma uses parameterized queries exclusively
- Excel MIME type validated via magic bytes
- React escapes HTML by default (no XSS from question text)

### Row-Level Security (RLS)
Key Supabase RLS policies:
- `users`: user can only SELECT their own row
- `employee_answers`: employee can only access rows where `attempt.employee_id = auth.uid()`
- `assessment_results`: employee can only SELECT their own results

---

## 16. Performance Considerations

- All foreign keys have explicit indexes
- Report aggregations done in DB, not in Node.js
- Pagination enforced: default 20 rows, max 100
- Partial index: `CREATE INDEX ON assessments(status) WHERE deleted_at IS NULL`
- `prisma.$transaction` for multi-step writes
- Admin dashboard: parallel Prisma queries via `Promise.all` in Server Components
- Heavy report pages: `loading.tsx` with Suspense streaming
- Assessment engine page: fully Client Component (real-time timer + auto-save)

---

## 17. Development Environment Setup

### Prerequisites
- Node.js 20 LTS
- npm 10+ or pnpm 9+
- Git, VS Code

### Setup Steps

```bash
# 1. Clone and install
git clone <repo-url> MCQ_App
cd MCQ_App
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in Supabase Cloud project URL, anon key, service role key, DB URL

# 3. Run migrations
npx prisma migrate dev --name init

# 4. Seed database
npx prisma db seed

# 5. Start development
npm run dev
# App at http://localhost:3000
```

### Seed Data (prisma/seed.ts)
- 1 admin: `admin@skillassess.local` / `Admin@123`
- 3 sample employees
- 2 sample groups
- 1 sample assessment with 5 questions (3 single, 2 multiple)
- Assignment of sample assessment to sample employees

### npm Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "db:migrate": "prisma migrate dev",
  "db:generate": "prisma generate",
  "db:seed": "tsx prisma/seed.ts",
  "db:studio": "prisma studio",
  "db:reset": "prisma migrate reset",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### VS Code Extensions (.vscode/extensions.json)
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "Prisma.prisma",
    "eamodio.gitlens",
    "ms-vscode.vscode-typescript-next",
    "ZixuanChen.vitest-explorer"
  ]
}
```
