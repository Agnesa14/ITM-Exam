using OnlineExam.Api.DTOs;

namespace OnlineExam.Api.Services;

public interface IAnswerEvaluationService
{
    Task<AnswerEvaluationResponseDto> EvaluateAttemptAsync(
        AnswerEvaluationRequestDto request,
        CancellationToken cancellationToken = default);
}
