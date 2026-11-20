namespace OnlineExam.Api.DTOs;

public class AnswerEvaluationRequestDto
{
    public Guid AttemptId { get; set; }
    public Guid ExamId { get; set; }
    public List<AnswerEvaluationQuestionRequestDto> Questions { get; set; } = [];
}

public class AnswerEvaluationQuestionRequestDto
{
    public Guid QuestionId { get; set; }
    public string QuestionType { get; set; } = string.Empty;
    public string Prompt { get; set; } = string.Empty;
    public double MaxPoints { get; set; }
    public string? ModelAnswer { get; set; }
    public string? ExpectedOutput { get; set; }
    public string? GradingNotes { get; set; }
    public string StudentAnswer { get; set; } = string.Empty;
    public QuestionTechnicalMetadataDto? TechnicalMetadata { get; set; }
}

public class AnswerEvaluationResponseDto
{
    public Guid AttemptId { get; set; }
    public Guid ExamId { get; set; }
    public string Status { get; set; } = "Completed";
    public string Provider { get; set; } = "Fallback";
    public string Message { get; set; } = string.Empty;
    public List<AnswerEvaluationQuestionResultDto> Questions { get; set; } = [];
}

public class AnswerEvaluationQuestionResultDto
{
    public Guid QuestionId { get; set; }
    public string Status { get; set; } = "RequiresManualReview";
    public double SuggestedPoints { get; set; }
    public double MaxPoints { get; set; }
    public double Confidence { get; set; }
    public string Feedback { get; set; } = string.Empty;
    public string Explanation { get; set; } = string.Empty;
    public List<string> DetectedIssues { get; set; } = [];
    public bool ProfessorReviewRequired { get; set; } = true;
    public string Provider { get; set; } = "Fallback";
    public DateTime EvaluatedAt { get; set; } = DateTime.UtcNow;
}
