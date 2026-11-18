# MindEcho (LECTOR) — Project Report Documentation

> Adaptive Spaced Retention & Feynman Learning Platform  
> SIH 2026 — Team: All Six Not Found

---

## 1. Software Process Model Adopted

### Selected Model: **Agile Methodology (Incremental & Iterative Development)** with **Evolutionary Prototyping**

The MindEcho project follows an **Agile incremental development model**, supported by **evolutionary prototyping** of the frontend and mock-backed services. This is documented in the project’s own _Agile Backend Development Plan_ (`docs/phases.md`).

| Aspect                             | How MindEcho follows it                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| Iterative delivery                 | Backend built in **Phases 0–8**, each with exit criteria        |
| Working software early             | Frontend first with **localStorage demo**; API integrated later |
| Change-friendly design             | Hexagonal / ports-and-adapters for LLM, STT, payments           |
| Continuous integration of features | Feature flags (`FEATURE_VOICE_EVAL`, `FEATURE_BILLING`)         |
| Feedback-driven                    | Contract-first OpenAPI; frontend and backend evolved together   |

**Why not Waterfall?**  
Requirements, UI, and backend were not frozen and then built end-to-end once. Modules (auth → notes → calendar → evaluation → SM-2 → billing → workers) were added phase by phase.

**Why not pure Prototyping alone?**  
Prototyping was used for early UX validation, but production architecture, database migrations, automated tests, and a phased backend plan make the **primary process model Agile**.

**Report statement:**  
_“The MindEcho project follows an Agile incremental development model, supported by evolutionary prototyping of the frontend and mock-backed services.”_

---

## 2. System Design and Methodology

### 2.1 System Architecture

MindEcho is an **npm monorepo** with a clear client–server split:

```text
┌─────────────────────┐     REST /api/v1/*      ┌──────────────────────────┐
│  React 19 SPA       │ ──────────────────────► │  Fastify 5 API           │
│  (Vite, Tailwind)   │                         │  TypeScript              │
│  apps/web           │                         │  apps/api                │
└─────────────────────┘                         └────────────┬─────────────┘
                                                             │
                    ┌──────────────┬─────────────────────────┼──────────────┐
                    ▼              ▼                         ▼              ▼
               MongoDB 7        Redis 7              Object Storage     External AI
               (Mongoose)     (cache / queue)         (S3 / MinIO)     (LLM / STT)
```

**Architectural layers**

| Layer                 | Responsibility                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Presentation**      | React pages — Landing, Dashboard, Workspace, Feynman Studio, Calendar, Payment                       |
| **Application / API** | Domain modules — `auth`, `notes`, `calendar`, `evaluations`, `billing`, `analytics`, `notifications` |
| **Domain logic**      | SM-2 spaced repetition, LECTOR score calibration, usage limits                                       |
| **Infrastructure**    | MongoDB, Docker Compose, audio storage, OpenAI / Gemini / Stripe adapters                            |

**Architecture style:** Hexagonal (ports & adapters), so LLM, STT, and payment providers can be swapped via environment configuration without rewriting core business logic.

**Monorepo layout**

```text
MindEcho/
├── apps/
│   ├── web/          # Frontend React 19 SPA (Vite + Tailwind v4)
│   └── api/          # Backend REST API (Fastify 5 + TypeScript)
├── docs/             # Architecture diagrams, phases, product specs
├── docker-compose.yml
├── PRODUCT.md
└── package.json
```

---

### 2.2 Data Flow Diagrams

#### A. Learner study loop (core product flow)

```text
Note (content)
    → Feynman explanation (text / voice)
        → STT transcription (if voice)
            → LLM evaluation
                → LECTOR calibration
                    → Evaluation persisted
                        → SM-2 update on Note
                            (easiness factor, interval, nextReviewDate, retentionHealth)
                                → Dashboard / Calendar show due reviews
```

#### B. Authentication flow

```text
Register / Login
    → bcrypt password hash
        → JWT access token + refresh token
            → Protected /api/v1/* routes (auth guard)
```

#### C. Dual study modes

```text
User calendar settings (Exam Mode | Skill Mastery Mode)
    + optional exam target date / important dates
        → Interval compression when exam pressure is high
            → Adaptive next-review schedule
```

#### D. Billing and usage control

```text
Subscription plan (starter / pro / team)
    → Daily evaluation limits
        → assertCanEvaluate before Feynman session
            → Usage record updated after evaluation
```

---

### 2.3 Algorithms, Models, and Frameworks

| Component              | Technique                                        | Role in MindEcho                                                         |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Memory decay           | **Ebbinghaus forgetting curve** \(R = e^{-t/S}\) | Conceptual retention / retrievability model                              |
| Review scheduling      | **SuperMemo SM-2**                               | Updates easiness factor, interval, and next review after each evaluation |
| Exam pressure          | **Dynamic interval compression**                 | Shortens review intervals so topics fit before the exam date             |
| Comprehension scoring  | **LLM evaluation + LECTOR calibration**          | Clarity, correctness, completeness → quality score \(q \in [0, 5]\)      |
| Voice input            | **Whisper STT** (or mock provider)               | Speech → transcript for Feynman practice                                 |
| Semantic notes         | **Text embeddings** (OpenAI / mock)              | Optional semantic search over learner notes                              |
| Application frameworks | React 19, Fastify 5, Mongoose                    | UI, API, and persistence                                                 |

#### Ebbinghaus Forgetting Curve

Memory retention decay is modeled as:

\[
R = e^{-\frac{t}{S}}
\]

where:

- \(R\) = Retrievability / memory retention (0.0 to 1.0)
- \(t\) = Time elapsed since last review (days)
- \(S\) = Memory stability (derived from review performance history)

#### SuperMemo SM-2 Interval Update

After each practice session with quality score \(q \in [0, 5]\) (mapped from LECTOR 1–10 score):

\[
EF' = \max\left(1.3,\, EF + \left(0.1 - (5 - q) \times (0.08 + (5 - q) \times 0.02)\right)\right)
\]

\[
I(n) =
\begin{cases}
1 & \text{if } n = 1 \\
6 & \text{if } n = 2 \\
I(n-1) \times EF' & \text{if } n > 2
\end{cases}
\]

#### Exam Mode Dynamic Compression

When Exam Mode is enabled with target date \(T\_{\text{exam}}\), intervals are scaled by compression factor \(C\):

\[
C = \min\left(1.0,\, \frac{T*{\text{exam}} - T*{\text{current}}}{\sum I(n)}\right)
\]

---

### 2.4 Database Design

**Approach:** Document-oriented NoSQL using **MongoDB 7** with **Mongoose** ODM.  
This fits Markdown notes, nested LLM feedback objects, and evolving evaluation schemas without rigid relational migrations.

#### Conceptual Entity–Relationship Diagram

```text
User 1 ──────── * Note
User 1 ──────── * Evaluation
Note 1 ──────── * Evaluation
User 1 ──────── 1 Subscription
User 1 ──────── * UsageRecord
User 1 ──────── * ImportantDate
User 1 ──────── * Notification
User 1 ──────── * RefreshToken
```

#### Entity–Relational Mapping (Collections)

| Collection / Model  | Key attributes                                                                                            | Relationship             |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| **users**           | `email`, `passwordHash`, embedded `calendarSettings`, `notificationSettings`                              | Root learner profile     |
| **notes**           | `userId`, `title`, `subject`, `content`, SM-2 fields, `retentionHealth`, `practiceQuestions`, `embedding` | Belongs to User          |
| **evaluations**     | `userId`, `noteId`, `mode`, `transcript`, scores, `feedback`, `audioUrl`                                  | Belongs to User + Note   |
| **important_dates** | `userId`, `date`, `subject`, `priority`, `title`                                                          | Belongs to User          |
| **subscriptions**   | `userId`, `planId`, `status`, `billingCycle`                                                              | One-to-one with User     |
| **usagerecords**    | `userId`, `type`, `date`, `count`                                                                         | Daily quota tracking     |
| **notifications**   | `userId`, `type`, `read`, `metadata`                                                                      | In-app alerts            |
| **refreshtokens**   | `userId`, `tokenHash`, `expiresAt`                                                                        | Auth session persistence |

**Rationale for MongoDB:** Notes and evaluations are self-contained documents. Nested `feedback` from LLM providers maps naturally without forced joins. Cross-document consistency (e.g. note deletion vs evaluations) is enforced in the service layer, with `userId` scoping on every collection.

---

## 3. Implementation Details

### 3.1 Programming Language(s) Used

| Language                      | Where used                                     |
| ----------------------------- | ---------------------------------------------- |
| **TypeScript**                | Frontend (`apps/web`) and backend (`apps/api`) |
| **JavaScript (Node.js ≥ 20)** | Runtime for API server, workers, and tooling   |
| **CSS / Tailwind**            | UI styling and design tokens                   |
| **Markdown**                  | Learner note content format                    |

### 3.2 Technologies and Tools Used

| Layer               | Technologies                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| Frontend            | React 19, Vite 8, React Router 7, Tailwind CSS v4, Framer Motion, Lucide   |
| Backend             | Fastify 5, Zod, Jose (JWT), bcrypt, Pino                                   |
| Database            | MongoDB 7, Mongoose 8, migrate-mongo                                       |
| Infrastructure      | Docker, Docker Compose, Redis, S3-compatible object storage (MinIO / Silo) |
| AI / ML services    | OpenAI (chat, Whisper, embeddings), Google Gemini                          |
| Payments            | Stripe (with mock provider for development)                                |
| Quality & contracts | Vitest, OpenAPI 3.1, oxlint                                                |

#### Implemented modules demonstrated in the system

1. Authentication (register / login / JWT refresh)
2. Notion-style interactive notes workspace
3. Feynman text and voice evaluation pipeline
4. SM-2 adaptive calendar and retention dashboard
5. Subscription / payment UI with plan-based usage limits
6. Dockerized local infrastructure (MongoDB, Redis, object storage)

### 3.3 Dataset Details

MindEcho is **not trained on a fixed public machine-learning dataset**. The platform operates on learner-generated educational content and AI evaluation outputs.

| Data type                  | Source                                             | Use                                        |
| -------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Learner-generated notes    | User Markdown content                              | Study material and evaluation context      |
| Feynman explanations       | User text / recorded audio                         | Input to STT and LLM scoring               |
| Evaluation feedback        | LLM provider responses                             | Scores, improvement tips, retention impact |
| Synthetic / mock responses | Mock LLM and STT providers                         | Offline development and demos              |
| Plan / config data         | Internal plan catalog (`starter` / `pro` / `team`) | Billing and usage limits                   |

**Report statement:**  
_“The system operates on user-generated educational content and AI evaluation outputs rather than a fixed public dataset.”_

---

## 4. Project Execution Plan (Timeline)

**Delivery model:** Agile phased delivery  
**Estimated overall duration:** approximately **8–12 weeks** (1–2 backend developers; frontend evolved in parallel)

| Phase | Deliverable                                                              | Estimated duration | Status    |
| ----- | ------------------------------------------------------------------------ | ------------------ | --------- |
| **0** | Foundation & project skeleton (monorepo, Fastify, Docker, health checks) | 3–5 days           | Completed |
| **1** | Authentication & user identity (JWT, refresh tokens)                     | 3–5 days           | Completed |
| **2** | Notes & knowledge repository (CRUD, search)                              | 4–6 days           | Completed |
| **3** | Calendar & study modes (Exam Mode / Skill Mastery Mode)                  | 3–4 days           | Completed |
| **4** | Feynman evaluation engine (LLM + STT + audio storage)                    | 7–10 days          | Completed |
| **5** | SM-2 spaced repetition & dashboard analytics                             | 5–7 days           | Completed |
| **6** | Subscriptions & LLM token billing                                        | 5–7 days           | Completed |
| **7** | Frontend API integration (`VITE_USE_API` cutover)                        | 4–6 days           | Completed |
| **8** | Background workers, notifications & production hardening                 | 5–8 days           | Completed |

### Timeline overview (Gantt-style)

```text
Week:  1    2    3    4    5    6    7    8    9   10   11   12
Ph0–1  ████
Ph2–3       ████████
Ph4              ████████████
Ph5                       ████████
Ph6                            ████████
Ph7                                 ████████
Ph8                                      ████████
```

**Process checkpoint:** Each phase followed a **Definition of Done** (API contract + tests + demoable feature) before progressing — consistent with Agile incremental release practice.

---

## 5. Conclusion

MindEcho (LECTOR) was developed using an **Agile incremental process**, documented as an eight-phase backend plan with evolutionary prototyping of the React frontend. System design follows a client–server monorepo architecture with hexagonal adapters for AI and payment services. The core learning methodology combines the **Feynman Technique** with **SuperMemo SM-2** and Ebbinghaus-inspired retention tracking, persisted in **MongoDB**. Implementation uses **TypeScript** across React and Fastify, with Dockerized MongoDB, Redis, and object storage. Project execution followed phased milestones from foundation through authentication, notes, evaluation, spaced repetition, billing, frontend integration, and production hardening.
