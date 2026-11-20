# Week 9 - API Endpoint Documentation

Base backend location: `backend/OnlineExam.Api/Controllers`.

Most endpoints require JWT authentication. Role and ownership checks are enforced in the backend, not only in the frontend.

## Authentication and Settings

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | Public | Authenticate user and return JWT/user profile |
| GET | `/auth/me` | Authenticated | Return current authenticated user |
| PUT | `/auth/me/password` | Authenticated | Change own password with current password validation |
| GET | `/auth/admin/ping` | Admin | Verify admin authorization |

## Users and Identity

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/users` | Admin | List/filter users |
| POST | `/api/users` | Admin | Create user |
| POST | `/api/users/import` | Admin | Import users in bulk |
| GET | `/api/users/{id}` | Admin | Get one user |
| PUT | `/api/users/{id}` | Admin | Update user |
| PUT | `/api/users/{id}/status` | Admin | Activate/deactivate user |
| PUT | `/api/users/{id}/reset-password` | Admin | Reset user password |
| GET | `/api/student-identities/me` | Student | Current student's official identity |
| GET | `/api/student-identities/{studentId}` | Admin/Staff | Student identity details |
| GET | `/api/student-identities/{studentId}/photo` | Authenticated as allowed | Protected official photo |
| POST | `/api/student-identities/{studentId}/photo` | Admin | Upload official student photo |

## Academic Structure

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/terms` | Authenticated/staff context | List academic terms |
| POST | `/api/terms` | Admin | Create term |
| PUT | `/api/terms/{id}` | Admin | Update term |
| POST | `/api/terms/{id}/publish` | Admin | Publish term |
| POST | `/api/terms/{id}/close` | Admin | Close term |
| GET | `/api/courses` | Authenticated/staff context | List courses |
| POST | `/api/courses` | Admin | Create course |
| PUT | `/api/courses/{id}` | Admin | Update course |
| POST | `/api/courses/{id}/deactivate` | Admin | Deactivate course |
| GET | `/api/course-offerings` | Admin/Staff | List course offerings |
| GET | `/api/course-offerings/mine` | Professor/Assistant | List assigned offerings |
| GET | `/api/course-offerings/{id}` | Admin/Staff | Offering details |
| GET | `/api/course-offerings/{id}/students` | Admin/Staff | Offering roster |
| POST | `/api/course-offerings` | Admin | Create offering |
| PUT | `/api/course-offerings/{id}` | Admin | Update offering |
| POST | `/api/course-offerings/{id}/publish` | Admin | Publish offering |
| POST | `/api/course-offerings/{id}/close` | Admin | Close offering |
| GET | `/api/course-offerings/{offeringId}/staff` | Admin | List staff assignments |
| POST | `/api/course-offerings/{offeringId}/staff` | Admin | Assign staff |
| PUT | `/api/course-offerings/{offeringId}/staff/{assignmentId}` | Admin | Update staff assignment |
| POST | `/api/course-offerings/{offeringId}/staff/{assignmentId}/revoke` | Admin | Revoke staff assignment |

## Enrollments and Carry-Over

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/semester-enrollments` | Admin | List semester enrollments |
| GET | `/api/students/{studentId}/semester-enrollments` | Admin | Student semester enrollment history |
| POST | `/api/students/{studentId}/semester-enrollments` | Admin | Add semester enrollment |
| PUT | `/api/semester-enrollments/{id}` | Admin | Update semester enrollment |
| POST | `/api/semester-enrollments/{id}/activate` | Admin | Activate semester enrollment |
| POST | `/api/semester-enrollments/{id}/withdraw` | Admin | Withdraw semester enrollment |
| GET | `/api/students/{studentId}/course-enrollments` | Admin | Student course enrollments |
| GET | `/api/students/me/eligibility` | Student | Current student eligibility |
| POST | `/api/students/{studentId}/course-enrollments` | Admin | Add course enrollment |
| PUT | `/api/student-course-enrollments/{id}` | Admin | Update course enrollment |
| POST | `/api/students/{studentId}/course-enrollments/regularize` | Admin | Regularize course enrollments |
| GET | `/api/students/{studentId}/carry-overs` | Admin | Carry-over list |
| POST | `/api/students/{studentId}/carry-overs` | Admin | Create carry-over |
| POST | `/api/carry-overs/{id}/assign-offering` | Admin | Assign carry-over to offering |
| POST | `/api/carry-overs/{id}/close` | Admin | Close carry-over |
| POST | `/api/carry-overs/{id}/cancel` | Admin | Cancel carry-over |

## Questions and Question Bank

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/question-bank/{offeringId}/questions` | Professor/Assistant | List reusable questions for offering |
| POST | `/api/question-bank/{offeringId}/questions` | Professor/Assistant | Create question-bank question |
| GET | `/api/question-bank/questions/{id}` | Professor/Assistant | Get question-bank question |
| PUT | `/api/question-bank/questions/{id}` | Professor/Assistant | Update question-bank question |
| DELETE | `/api/question-bank/questions/{id}` | Professor/Assistant | Delete question-bank question |
| GET | `/api/exams/{examId}/questions` | Student/Staff by context | List exam questions with role-safe fields |
| POST | `/api/exams/{examId}/questions` | Professor/Assistant | Add exam question |
| PUT | `/api/questions/{id}` | Professor/Assistant | Update exam question |
| DELETE | `/api/questions/{id}` | Professor/Assistant | Remove exam question |

## Exams, Access, Attempts, and Monitoring

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/exams` | Professor/Assistant/Student | List exams scoped to role |
| GET | `/api/exams/{id}` | Professor/Assistant/Student | Get exam details |
| POST | `/api/exams` | Professor/Assistant | Create exam |
| PUT | `/api/exams/{id}` | Professor/Assistant | Update exam draft |
| DELETE | `/api/exams/{id}` | Professor/Assistant | Delete exam where allowed |
| POST | `/api/exams/{id}/publish` | Professor/Assistant | Publish exam after readiness checks |
| POST | `/api/exams/{id}/unpublish` | Professor/Assistant | Unpublish if no attempts block it |
| POST | `/api/exams/{examId}/access-codes` | Professor/Assistant | Generate 3-minute entry code |
| GET | `/api/exams/{examId}/access-status` | Student | Check student exam access/admission state |
| POST | `/api/exams/{examId}/verify-entry-code` | Student | Verify entry code; does not start timer |
| POST | `/api/exams/{examId}/request-approval` | Student | Request physical staff approval |
| POST | `/api/exams/{examId}/request-device-change` | Student | Request new device approval |
| POST | `/api/exams/{examId}/students/{studentId}/allow-access` | Professor/Assistant | Staff approves student admission |
| POST | `/api/exams/{examId}/students/{studentId}/reject-access` | Professor/Assistant | Staff rejects admission |
| POST | `/api/exams/{examId}/students/{studentId}/revoke-access` | Professor/Assistant | Staff revokes active admission/session |
| GET | `/api/exams/{examId}/live-monitor` | Professor/Assistant | Live roster, admission, attempts, integrity |
| POST | `/api/exams/{examId}/attempt` | Student | Start/submit attempt depending active state and payload |
| GET | `/api/exams/{examId}/attempt` | Student | Current active attempt draft |
| PUT | `/api/exams/{examId}/attempt/draft` | Student | Save/autosave draft |
| POST | `/api/exams/{examId}/attempt/questions/{questionId}/run` | Student | Safe SQL/C# technical preview |
| POST | `/api/exams/{examId}/attempt/heartbeat` | Student | Update live session heartbeat |
| POST | `/api/exams/{examId}/attempt/integrity-events` | Student | Record integrity event with policy state |
| GET | `/api/exams/{examId}/attempt/integrity-summary` | Student | Current attempt integrity summary |

## Gradebook, Results, and Reports

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/exams/{id}/gradebook` | Professor/Assistant | Submitted attempts and review data |
| POST | `/api/exams/attempts/{attemptId}/grade` | Professor/Assistant | Save grading and score overrides |
| POST | `/api/exams/attempts/{attemptId}/ai-text-evaluation` | Professor/Assistant | Existing automatic/heuristic evaluation support, not OpenAI |
| POST | `/api/exams/{id}/results/publish` | Professor/Assistant | Publish graded results |
| GET | `/api/exams/results/me` | Student | Published student results |
| GET | `/api/exams/results/me/{attemptId}` | Student | One published result detail |
| GET | `/api/reports/overview` | Admin/Professor/Assistant | Academic summary metrics |
| GET | `/api/reports/participation` | Admin/Professor/Assistant | Participation and absence report |
| GET | `/api/reports/publish-status` | Admin/Professor/Assistant | Result publication status |
| GET | `/api/reports/integrity` | Admin/Professor/Assistant | Integrity summary report |
| GET | `/api/reports/grade-distribution` | Admin/Professor/Assistant | Grade distribution |
| GET | `/api/reports/question-performance` | Admin/Professor/Assistant | Question-level performance |
| GET | `/api/reports/absent-students` | Admin/Professor/Assistant | Absent student list |
| GET | `/api/reports/filters` | Admin/Professor/Assistant | Academic report filter options |
| GET | `/api/audit-logs` | Admin | Audit log review |

## SMU Integration

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/api/smu-integration/contract` | Admin | View integration contract |
| POST | `/api/smu-integration/map-preview` | Admin | Preview external payload mapping |
| GET | `/api/smu-integration/live-preview` | Admin | Preview live integration state |
| POST | `/api/smu-integration/sync` | Admin | Run configured sync |
| POST | `/api/smu-integration/sync-from-payload` | Admin | Sync from provided payload |

## Security Notes

- Students must never receive model answers or hidden grading metadata during active exams.
- Access code verification is not enough to start an exam; physical approval is required.
- Submitted attempts must remain locked by backend checks.
- Reports and gradebook data are scoped by role, offering, and ownership.
- OpenAI API keys are not present in the current API and must never be exposed to the frontend.
