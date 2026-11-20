# Week 9 - Manual Test Cases

## Test Evidence Template

| Field | Value |
| --- | --- |
| Test ID |  |
| Role | Admin / Professor / Assistant / Student |
| Feature |  |
| Preconditions |  |
| Steps |  |
| Expected Result |  |
| Actual Result |  |
| Status | Passed / Failed / Blocked |
| Notes |  |
| Screenshot Reference |  |

## Admin Test Cases

| ID | Feature | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| ADM-01 | Admin login | Admin user exists and is active | Login with admin credentials | Admin dashboard opens with admin navigation |
| ADM-02 | View users | Admin is logged in | Open Users page | User table loads with role/status information |
| ADM-03 | Filter users by role | Users exist for multiple roles | Filter by Student, Professor, Assistant | Table shows only selected role |
| ADM-04 | Create user | Admin is logged in | Open Create User, fill required fields, save | User is created and appears in users list |
| ADM-05 | Manage academic structure | Terms/courses page available | Open Academic Structure and review terms/courses | Academic data loads without runtime errors |
| ADM-06 | Manage course offerings | Course and term exist | Create or edit course offering | Offering is saved with course, term, semester, staff |
| ADM-07 | Manage enrollments | Student and offering exist | Add student course enrollment | Student appears in offering roster |
| ADM-08 | Assign staff | Professor/assistant users exist | Assign staff to course offering | Staff assignment is saved and reflected in role workspace |
| ADM-09 | Role-based navigation | Admin is logged in | Try staff/student-only routes directly | Unauthorized routes are blocked or redirected |
| ADM-10 | Admin reports | Exams/attempts exist | Open Reports and use filters | Admin can view broader academic analytics |

## Professor Test Cases

| ID | Feature | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| PROF-01 | Professor login | Professor user exists and is active | Login as professor | Professor dashboard opens |
| PROF-02 | Question bank access | Professor has assigned offering | Open Question Bank | Offering selector and question table load |
| PROF-03 | Create MCQ question | Offering exists | Add Multiple Choice Question with options and correct answer | Question is saved in bank |
| PROF-04 | Create text question | Offering exists | Add text-answer question with model answer | Question is saved in bank |
| PROF-05 | Create SQL question | Offering exists | Add SQL question with schema, starter SQL, expected output, model answer | Technical metadata is saved |
| PROF-06 | Create C# question | Offering exists | Add C# question with starter code, expected output, model answer | Technical metadata is saved |
| PROF-07 | Create exam | Offering exists | Open Create Exam, select offering, set date/time and points | Exam draft is created |
| PROF-08 | Add generated questions | Exam draft and bank questions exist | Generate selected number of questions | Questions are attached to exam |
| PROF-09 | Add manual questions | Exam draft and bank questions exist | Select questions manually from bank | Selected questions are attached |
| PROF-10 | Publish exam | Exam has questions and max points | Click Publish and confirm | Exam becomes published |
| PROF-11 | Generate access code | Exam is published | Click Generate Entry Code | 3-minute code appears with expiry |
| PROF-12 | Live monitor approval | Student verified code | Open Live Monitor and approve student | Student can proceed to rules screen |
| PROF-13 | Reject/revoke access | Student has request or active session | Reject or revoke with reason | Student access state updates and is audited |
| PROF-14 | Review gradebook | Student submitted exam | Open Gradebook and review attempt | Answers, model answers, scores, violations are visible |
| PROF-15 | Adjust per-question points | Gradebook review open | Change question score and save | Totals update and grading is saved |
| PROF-16 | Publish result | Attempt reviewed/graded | Publish result with confirmation | Student can see result in My Results |
| PROF-17 | Reports | Attempts exist | Open Reports and filter by course/exam | Academic metrics and CSV export are available |

## Assistant Test Cases

| ID | Feature | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| ASST-01 | Assistant login | Assistant user exists and is active | Login as assistant | Assistant workspace opens |
| ASST-02 | Assigned offerings | Assistant assigned to offering | Open Overview/My Exams/Question Bank | Only allowed assigned context appears |
| ASST-03 | Question bank use | Assistant has offering access | Open Question Bank and filter offering | Questions for assigned offering load |
| ASST-04 | Assessment management | Assistant has permission | Create/manage allowed assessment | Assessment remains scoped to assistant/assigned offering |
| ASST-05 | Live monitor | Published assessment exists | Open Live Monitor | Roster loads for assigned offering |
| ASST-06 | Admission actions | Student waits approval | Approve/reject/revoke student | Action succeeds only for allowed assessment |
| ASST-07 | Gradebook access | Submitted assistant-owned/allowed attempt exists | Open Gradebook | Attempts can be reviewed where permitted |
| ASST-08 | Ownership isolation | Professor-owned restricted exam exists | Try direct URL/API access | Backend returns forbidden or route blocks access |

## Student Test Cases

| ID | Feature | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| STU-01 | Student login | Student user exists and is active | Login as student | Student dashboard opens |
| STU-02 | Available exams | Published eligible exam exists | Open My Exams/Available Exams | Eligible published exams appear |
| STU-03 | Access code screen | Exam requires code | Click Open/Start exam | Code verification screen appears |
| STU-04 | Invalid code | Active code exists | Enter invalid code | Safe validation message appears |
| STU-05 | Valid code | Professor generated active code | Enter valid code | Student moves to waiting approval |
| STU-06 | Physical approval | Staff approves student | Wait for approval, continue | Rules screen appears before timer starts |
| STU-07 | Start exam | Rules screen visible | Click Start Exam | Timer starts and exam workspace opens |
| STU-08 | Answer MCQ/text | Questions exist | Answer MCQ and text question | Answers remain selected/typed |
| STU-09 | Run SQL preview | SQL question exists | Edit SQL and click Run Query | Safe preview/output/errors show, exam is not submitted |
| STU-10 | Run C# preview | C# question exists | Edit C# and click Run Code | Safe preview/output/errors show, exam is not submitted |
| STU-11 | Autosave/refresh | Attempt in progress | Answer question, wait autosave, refresh | Latest saved state restores where available |
| STU-12 | Violation tracking | Exam in progress | Exit fullscreen or use blocked shortcut | Violation count and warning update |
| STU-13 | Auto-submit | Violation threshold reached | Trigger third violation | Exam auto-submits once |
| STU-14 | Manual submit | Attempt in progress | Click Finish and Submit | Attempt submits and editable workspace closes |
| STU-15 | Submitted lock | Attempt submitted | Refresh or open copied session URL | Editable exam does not reopen |
| STU-16 | My Results | Professor published result | Open My Results | Published score/grade appears |

## End-to-End Test Case

| ID | Feature | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| E2E-01 | Full exam lifecycle | Admin, professor, student, offering, enrollment exist | Admin verifies users/enrollments. Professor creates questions, creates exam, adds questions, publishes, generates code. Student enters code and waits. Professor approves. Student starts, answers, triggers optional violation, submits. Professor reviews, adjusts points, publishes result. Student opens My Results. Professor opens Reports. | Full workflow completes with controlled access, submitted lock, grade publication, and report visibility |
