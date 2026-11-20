# Gemini Evaluation Reliability

## Incident: 28 October 2026

The local gradebook displayed suggestions after `Evaluate with AI`, but the
feedback reported `Gemini evaluation failed`. A direct synthetic request using
the locally configured credential returned:

- Model: `gemini-3.8-flash`
- HTTP: `503`
- Provider status: `UNAVAILABLE`
- Provider reason: the model was experiencing high demand.

This was not a successful AI grading result. The service immediately used its
local token-similarity fallback, which was incorrectly labelled as AI confidence
in the gradebook. Accepting a suggestion and saving professor grading are
separate actions; neither action proves that Gemini produced the suggestion.

A synthetic request to `gemini-3.5-flash-lite`, using the same credential,
returned HTTP 200. Only the local `Gemini:Model` user secret was updated. No API
key is stored in this report or committed configuration.

## Changes

- Retry transient HTTP 408, 429, 500, 502, 503 and 504 responses, with a maximum
  of three requests per question and exponential backoff with jitter.
- Respect short `Retry-After` values; do not retry before a longer requested
  delay or keep the grading request waiting indefinitely.
- Do not retry permanent HTTP 400, 401, 403 or 404 errors.
- Distinguish caller cancellation from an HTTP timeout; keep manual review
  available after a timeout.
- Retain actionable HTTP status feedback without logging provider response
  bodies, answer text or credentials.
- Remove custom sampling temperature, which current Gemini documentation
  deprecates for newer models.
- Skip thought parts and concatenate final response text before JSON parsing.
- Label non-Gemini suggestions as `Local suggestion (not AI)` and replace their
  AI-confidence badge with `Manual review required`.
- Preserve provider information in frontend question-score drafts.
- Keep professor acceptance, score bounds, review and publication unchanged.

The default model remains configurable. A local working model is not a promise
of permanent availability or unlimited free usage. Account eligibility and
provider quotas still apply.

## Automated Checks

The dependency-free console checks use mocked HTTP responses and do not require
an API key, real student data or a database:

```powershell
dotnet build tests/OnlineExam.Evaluation.Checks -p:UseAppHost=false
dotnet tests/OnlineExam.Evaluation.Checks/bin/Debug/net8.0/OnlineExam.Evaluation.Checks.dll
```

Thirteen checks cover missing configuration, overload recovery, retry limits,
permanent errors, rate-limit delays, timeouts, cancellation, malformed JSON,
response parts and score normalization. When the backend is already running on
Windows, its loaded DLL can be locked. Build before starting the API, or build
only the checks against an already rebuilt API with
`-p:BuildProjectReferences=false`.

An explicit live check sends six synthetic answers through the real evaluation
service, without changing any database records:

```powershell
dotnet tests/OnlineExam.Evaluation.Checks/bin/Debug/net8.0/OnlineExam.Evaluation.Checks.dll --live
```

Run this command from the repository root. It reads backend configuration,
development user secrets and environment variables. It may consume API quota
or credits. It prints the provider, scores and feedback, never the API key.
The examples cover correct/incorrect text, correct/partial SQL and correct/
incorrect C# answers. These are integration smoke checks, not a statistically
validated assessment of grading accuracy.

### Live Result

At `2026-10-28T14:56:26.0375964Z`, the real service completed all six synthetic
cases with `Provider = Gemini`, `Status = Evaluated`, and mandatory professor
review. The overall status was `Completed`; no database records were changed.

| Synthetic case | Suggested points | Rubric expectation |
| --- | --- | --- |
| Correct virtual-memory explanation | 4 / 4 | Four required concepts |
| Unrelated virtual-memory explanation | 0 / 4 | None of the required concepts |
| Correct SQL query | 5 / 5 | Both filters and descending ordering |
| SQL with only the Running filter | 2 / 5 | Missing memory filter and ordering |
| Correct C# addition method | 3 / 3 | Signature and addition |
| C# subtraction instead of addition | 1 / 3 | Signature only |

The returned points matched the explicit rubric for these examples. Confidence
was the model's own reported value, not an independently calibrated measure of
accuracy. This test does not establish fairness, consistency across repeated
runs, or correctness for all student answers. It also does not execute SQL/C#.

Frontend lint and the production build passed. The build needed execution
outside the sandbox because of `spawn EPERM`; it retains the existing large
JavaScript-chunk warning. The checks build reported NU1900 because the package
vulnerability feed could not be reached; this does not mean the vulnerability
audit passed.

## Manual Application Check

1. Open the submitted test attempt in Gradebook.
2. Click `Evaluate with AI` once and wait for completion.
3. Verify each non-MCQ result says `Gemini AI suggestion`, not local fallback.
4. Check reasoning against the question and rubric before accepting points.
5. Accept or edit suggestions, save review and publish separately when ready.

The diagnostic checks do not publish a result or replace the student's stored
answers. An HTTP 200 from Swagger alone is not evidence of an authenticated
attempt workflow.

### User-Guided Manual Demonstration

On 28 October 2026, the user supplied gradebook screenshots showing real
`Gemini AI suggestion` results for the submitted test attempt: Text 0/5,
incomplete C# 0/3, partial SQL 4/7, virtual-memory Text 1/1, and FCFS C# 8/8.
The MCQ result 1/1 came from the answer-key logic, not Gemini. The partial SQL
case is illustrated in thesis Figure 12.

The user confirmed the access-code/waiting/approval flow, saving review,
publication, student result visibility, and the submitted-attempt lock in a
guided manual demonstration. These are user-confirmed observations, not
independently automated browser or API authorization tests. A deliberate score
override, refresh/reconnect, camera edge cases and assistant authorization were
not individually evidenced and must not be marked as passed on that basis.

### Subsequent Browser Verification

The separate [28 October browser verification](browser-verification-2026-10-28.md)
independently exercised four-role login, sampled navigation, API role denials,
assistant resource denial, authenticated reload, dashboard reconnect and a
temporary unsaved professor score override. It did not repeat Gemini calls or
save/publish grades. Active-exam reconnect and camera edge cases remain untested.
The submitted-lock probe was denied earlier by the entry-code gate and therefore
does not independently establish the submitted-specific response.

## Provider Documentation

- [Gemini troubleshooting and retry guidance](https://ai.google.dev/gemini-api/docs/troubleshooting)
- [Available Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API pricing and free-tier limitations](https://ai.google.dev/gemini-api/docs/pricing)
