# Local Browser Verification - 28 October 2026

## Scope and Safety

The running application at `http://localhost:5173` and API at
`http://localhost:5045` were tested with Playwright using installed Google Chrome.
The existing user Chrome tab did not expose an automation connection; a separate,
clean visible Chrome window was used. No unrelated browser tabs or private
profiles were inspected. Only the documented development demo accounts were used.
All test browser windows were closed at completion.

No exam was created, deleted, submitted, republished or regraded. No real student
answers were changed. No AI evaluation request was made, avoiding provider quota
and changes to stored suggestions. Login can perform the application's normal
password-hash upgrade. A temporary professor score edit was made only in browser
state, restored and closed without Save. API gradebook responses before and after
were identical, including scores and publication state.

## Results

There were 60 recorded assertions across three scripts: 59 passed and one was
inconclusive. These are scoped smoke/authorization checks, not 60 independent
end-to-end workflows or a declaration that the entire application is correct.

| Group | Actual observations | Result |
| --- | --- | --- |
| Anonymous access | Protected gradebook route redirected to login; exams API returned 401 | Passed |
| Login | Admin, Professor, Assistant and Student logged in through the real login form | Passed |
| Admin navigation | Users, academic structure, enrollments and reports rendered | Passed: rendering only, not CRUD |
| Staff navigation | Professor/assistant question bank, exams and gradebook rendered; professor reports rendered | Passed: rendering only |
| Student navigation | Exams and My Results rendered | Passed: rendering only |
| Reload | Each role remained authenticated after page reload | Passed outside an active exam |
| UI role gates | Admin denied gradebook; professor/assistant denied admin users; student denied gradebook; redirected to dashboard | Passed |
| Users API | Admin received 200; all three other roles received 403 | Passed |
| Exam-list API | Admin received 403; staff/student received 200 | Passed |
| Publication API | Assistant and student received 403 for a synthetic nonexistent exam ID | Passed: role-level denial, not publication workflow |
| Professor exam | One demo exam available; details, gradebook and live monitor rendered; corresponding staff APIs returned 200 | Passed |
| Professor review | Existing submitted demo attempt opened with four answer cards | Passed |
| Assistant resource scope | No assistant-owned exams available; professor exam gradebook returned 403 for assistant | Passed denial; positive assigned-exam workflow not tested |
| Student staff APIs | Gradebook, live monitor and synthetic AI-evaluation request returned 403 | Passed |
| Student results API | Returned 200 with zero published results for demo student | Passed empty state; not proof of post-publication visibility |
| Network reconnect | Each non-admin role recovered dashboard after controlled offline/online cycle and reload | Passed outside an active exam |
| Manual score draft | First answer changed from 0 to 0.25; unsaved indication appeared; value restored without saving | Passed client-side editing only |
| Stored review invariance | Gradebook JSON before and after review test matched exactly | Passed |
| Browser errors | No unhandled JavaScript page errors observed in the main navigation/detail runs | Passed in sampled views |
| Submitted-attempt reopening | Known submitted demo student's attempt request returned 400, `bad_request`: "Enter the exam access code before starting this exam." | Inconclusive for submitted-specific lock; earlier access-code gate denied entry |

## Interpretation of the Inconclusive Check

The student did not regain access. However, the request was rejected by the
access-code gate before the submitted-attempt-specific check. It is incorrect to
report this as an independently verified `EXAM_ATTEMPT_ALREADY_SUBMITTED` response,
or as a failure allowing answer modification. An authorized controlled fixture
with a valid entry state is needed to exercise that exact guard. Existing
user-confirmed submitted-lock observations remain separate evidence.

## Remaining Controlled Tests From This Automated Run

**Update, 29 October 2026:** The developer explicitly confirmed that she had
manually tested all implemented application functions, including work not
discussed in this conversation, and that the full workflows worked. This is
additional user-reported manual evidence. It supersedes any interpretation of
the list below as a statement that she has not tested these functions. It does
not change the historical automated results: 59 passed checks and one
inconclusive submitted-lock probe. No new automated run, individual manual logs,
performance measurements or AI accuracy statistics are claimed here.

The following items describe what **this read-mostly automated run did not
exercise**, not outstanding manual work assigned to the developer. Specific
stress, security-audit and statistical-evaluation scenarios are not inferred
from the confirmation of functional testing.

Subsequently, the user confirmed that the active examination, violation counting
and automatic submission after three violations worked in their manual test.
This was the narrower manual confirmation available on 28 October, before the
broader confirmation above. It was not an independently automated active-exam
test or a record of individual camera and network edge cases.

- Active-attempt autosave across refresh and temporary network loss; verify answer
  retention, server timer, reconnect state and policy actions using a dedicated
  disposable exam, not an existing assessed student attempt.
- Explicit save of professor override, recalculated totals, publication and
  student visibility using a dedicated unpublished assessment. Only the local
  review draft was edited in this run.
- Positive assistant access for an assigned course offering and allowed grading.
  The available assistant demo account had no owned exams.
- Camera permission denial, no-face/multiple-face events, fullscreen exit and
  threshold auto-submit. These can change attempt state and were not triggered
  on existing student work.
- Admin create/update/import operations, question creation, technical previews,
  exam publication and access approval were not repeated in this read-mostly run.
- Gemini correctness/reliability was not retested here; see the separate provider
  checks and user-guided demonstration in `gemini-evaluation-troubleshooting.md`.

## Evidence and Limitations

Temporary automation and sanitized assertion results are in
`%TEMP%/itm-browser-check/`: `check.cjs`, `details.cjs`, `review.cjs`,
`results.json`, `details-results.json` and `review-results.json`.
The review script was repeated after adding the lock probe; repeated assertions
are counted once using the final result file. No credentials, JWTs, API keys or
student answer bodies are included in this report or result files.

Route-render checks used final URL, visible body and observed absence of unhandled
page errors. They do not validate every displayed value, all console/network
warnings, accessibility, mobile layout or every form control. Build/lint/provider
checks were not rerun because no application code was changed. The Word thesis
and its screenshots were not modified during these tests.
