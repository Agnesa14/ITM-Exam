# Week 10 - AI-Assisted Exam Grading

## Goal

Week 10 adds real AI-assisted grading for open-ended academic answers. The feature evaluates submitted Text, SQL, and C# answers and stores grading suggestions for the professor. It does not publish grades and it does not replace professor review.

## Architecture

The backend exposes a controlled grading endpoint:

- `POST /api/exams/attempts/{attemptId}/ai-evaluation`

The endpoint is available only to professors and assistants who are authorized to manage the exam. It requires a submitted attempt and evaluates only non-MCQ answers.

The implementation uses a service abstraction:

- `IAnswerEvaluationService`
- `GeminiAnswerEvaluationService`

The service returns structured results per question:

- evaluation status
- suggested points
- max points
- confidence
- feedback
- explanation
- detected issues
- professor review required

## Gemini Configuration

The API key must be configured only on the backend.

Development user-secrets:

```powershell
dotnet user-secrets set "Gemini:ApiKey" "your_gemini_api_key"
dotnet user-secrets set "Gemini:Model" "gemini-3.8-flash"
```

Environment variables are also supported:

```powershell
$env:GEMINI_API_KEY="your_gemini_api_key"
$env:GEMINI_MODEL="gemini-3.8-flash"
```

`Gemini:Model` is optional. The backend default is `gemini-3.8-flash`.

Never hardcode the API key and never expose it in frontend code.

## Fallback Behavior

If Gemini is not configured or the API call fails, the system remains usable. The backend returns a manual fallback response:

- status: `RequiresManualReview`
- provider: `ManualFallback`
- clear feedback explaining that manual review is required

This keeps grading operational even without external AI access.

## Professor Workflow

1. Student submits an exam.
2. Professor opens Gradebook.
3. Professor opens a student attempt.
4. Professor clicks `Evaluate with AI`.
5. The backend evaluates Text, SQL, and C# answers.
6. Suggestions are saved in the attempt question score metadata.
7. Professor reviews the AI feedback.
8. Professor may accept the AI suggested score or enter a different score.
9. Professor saves the review.
10. Professor publishes the result manually.

AI suggestions do not automatically become final grades.

## Privacy and Security

The AI request contains only academic grading data needed for evaluation:

- question type
- prompt
- maximum points
- model answer
- expected output
- grading notes
- student answer
- SQL/C# technical metadata where relevant

The request must not include:

- passwords
- JWT tokens
- unnecessary student personal data
- audit logs
- unrelated exam data

## Limitations

- Free AI API access can have quota and rate limits.
- AI feedback is a grading suggestion, not an official grade.
- Professor review remains mandatory.
- SQL and C# execution is still a safe preview/validation workflow unless a sandbox runner is added later.

## Manual Testing Checklist

- Submit an exam as a student with Text, SQL, or C# answers.
- Login as professor.
- Open the exam Gradebook.
- Open the student review modal.
- Click `Evaluate with AI`.
- Confirm suggestions appear per question.
- Accept one AI suggestion.
- Manually change another score.
- Save review.
- Confirm total points and grade update.
- Publish result manually.
- Login as student and confirm the result appears only after publication.
