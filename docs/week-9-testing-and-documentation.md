# Week 9 - Testing and Documentation

## Goal

Week 9 prepares thesis-level testing evidence and technical documentation for ITM Exam. This sprint does not add OpenAI grading or new product features. It documents the current system, the main role workflows, API areas, database entities, diagrams, screenshot evidence, known limitations, and the next recommended sprint.

## Current Branch

- `thesis/week-9-testing-documentation`

## Files Inspected

- `README.md`
- `docs/00-master.md`
- `docs/07-data-model.md`
- `docs/08-system-architecture.md`
- `docs/09-api-overview.md`
- `docs/11-security-proctoring.md`
- `docs/week-2-student-exam-session-reliability.md`
- `docs/week-3-technical-question-evaluation-design.md`
- `docs/week-4-sql-question-evaluation.md`
- `docs/week-5-csharp-question-evaluation.md`
- `docs/week-6-advanced-gradebook-workflow.md`
- `docs/week-7-academic-reports-analytics.md`
- `docs/week-8-security-and-integrity-improvements.md`
- `frontend/src/routes/AppRoutes.jsx`
- `frontend/src/lib/examsApi.js`
- `backend/OnlineExam.Api/Controllers`
- `backend/OnlineExam.Api/Models`

## Documentation Deliverables

- `docs/week-9-manual-test-cases.md`
- `docs/week-9-api-endpoints.md`
- `docs/week-9-entities-and-diagrams.md`
- `docs/week-9-screenshot-checklist.md`
- `docs/week-9-testing-and-documentation.md`

## Main System Workflows Covered

The documentation covers four primary role areas:

- Admin: users, academic structure, enrollments, staff assignments, reports.
- Professor: question bank, exam creation, publishing, access code, monitoring, gradebook, result publication, reports.
- Assistant: assigned offering workspace, permitted exam/question/monitoring/grading operations.
- Student: available exams, access code, physical approval, rules, exam session, technical answers, submit, results.

## End-to-End Thesis Workflow

1. Admin prepares users and academic data.
2. Admin creates course offerings and enrollments.
3. Professor opens the question bank and creates MCQ, text, SQL, and C# questions.
4. Professor creates an assessment from an assigned course offering.
5. Professor adds questions manually or by random generation from the bank.
6. Professor publishes the exam after readiness checks.
7. Professor generates a temporary access code.
8. Student opens the published exam and enters the code.
9. Student waits for staff physical verification.
10. Professor approves the student in Live Monitor.
11. Student reads the rules and starts the exam.
12. Student answers questions, runs SQL/C# safe previews if needed, and submits.
13. Integrity events are recorded if violations occur.
14. Professor opens Gradebook, reviews answers, adjusts points, and saves grading.
15. Professor publishes the result.
16. Student opens My Results and sees the published grade.
17. Professor or admin opens Reports to review outcomes and integrity analytics.

## OpenAI Status

OpenAI-assisted grading is not implemented in Week 9. The current system includes automatic/heuristic evaluation support and professor manual override, but real OpenAI integration should be implemented in a later sprint.

Recommended Week 10:

- add backend `IAnswerEvaluationService`
- add optional OpenAI implementation through `OPENAI_API_KEY`
- keep manual grading fallback
- return structured JSON suggestions
- ensure professor approval remains required
- never expose API keys in frontend

## Known Limitations

- Browser-based proctoring can detect suspicious browser events but cannot fully prevent cheating.
- Fullscreen exit can be detected, but the browser cannot force permanent fullscreen.
- Network interruption behavior depends on reconnect timing, local draft state, and backend session state.
- SQL and C# Run actions are safe previews, not real sandbox execution.
- Real SQL/C# execution requires an isolated runner or external sandbox service.
- OpenAI grading is planned but not implemented.
- Secure browser integration is future work.
- Camera/face checks depend on institution policy, browser permissions, and device availability.

## Verification Commands

Run these commands before final thesis packaging:

```powershell
git status --short --branch
dotnet build OnlineExam.sln
cd frontend
npm run lint
npm run build
```

If `npm run build` fails with `spawn EPERM` inside a restricted Windows sandbox, rerun it outside the sandbox and document that result.

## Remaining Documentation Gaps

- Add real screenshots after manual testing.
- Add real test execution results in the test evidence template.
- Add deployment environment screenshots if the project is deployed online.
- Add OpenAI implementation documentation after Week 10.

## Recommended Next Step

Week 10 should focus on OpenAI-assisted grading as a controlled backend feature with professor override, secure API key storage, structured evaluation output, and graceful fallback to manual grading.
