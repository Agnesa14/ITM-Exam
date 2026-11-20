using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using OnlineExam.Api.DTOs;

namespace OnlineExam.Api.Services;

public class GeminiAnswerEvaluationService : IAnswerEvaluationService
{
    private const int MaximumPromptCharacters = 12000;
    private const int MaximumRequestAttempts = 3;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GeminiAnswerEvaluationService> _logger;

    public GeminiAnswerEvaluationService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<GeminiAnswerEvaluationService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<AnswerEvaluationResponseDto> EvaluateAttemptAsync(
        AnswerEvaluationRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var apiKey = ResolveApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
            return BuildFallbackResponse(request, "Gemini evaluation is not configured. Manual review required.");

        var response = new AnswerEvaluationResponseDto
        {
            AttemptId = request.AttemptId,
            ExamId = request.ExamId,
            Provider = "Gemini",
            Message = "Gemini generated grading suggestions. Professor review is still required."
        };

        foreach (var question in request.Questions)
        {
            response.Questions.Add(await EvaluateQuestionWithGeminiAsync(question, apiKey, cancellationToken));
        }

        if (response.Questions.All(x => x.Provider != "Gemini"))
        {
            response.Provider = "ManualFallback";
            response.Status = "RequiresManualReview";
            response.Message = "Gemini was unavailable. Local suggestions are not AI evaluation; manual review is required.";
        }
        else if (response.Questions.Any(x => x.Provider != "Gemini"))
        {
            response.Status = "Partial";
            response.Message = "Some questions were evaluated by fallback because Gemini was unavailable for those items.";
        }

        return response;
    }

    private async Task<AnswerEvaluationQuestionResultDto> EvaluateQuestionWithGeminiAsync(
        AnswerEvaluationQuestionRequestDto question,
        string apiKey,
        CancellationToken cancellationToken)
    {
        try
        {
            var model = ResolveModel();
            var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";

            using var response = await SendWithRetryAsync(endpoint, apiKey, question, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini answer evaluation for model {Model} failed with status {StatusCode}.", model, response.StatusCode);
                var reason = (int)response.StatusCode switch
                {
                    429 => "Gemini rate limit or quota was reached",
                    503 => "Gemini is temporarily unavailable or overloaded",
                    401 or 403 => "Gemini access was denied; check backend credentials and project permissions",
                    404 => "The configured Gemini model is unavailable",
                    _ => "Gemini evaluation failed"
                };
                return BuildFallbackQuestionResult(question,
                    $"{reason} (HTTP {(int)response.StatusCode}). Local fallback only; manual review required.");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var outputText = ExtractOutputText(document.RootElement);
            if (string.IsNullOrWhiteSpace(outputText))
                return BuildFallbackQuestionResult(question, "Gemini returned no structured grading output. Manual review required.");

            var result = JsonSerializer.Deserialize<AnswerEvaluationQuestionResultDto>(ExtractJsonObject(outputText), JsonOptions);
            if (result == null)
                return BuildFallbackQuestionResult(question, "Gemini grading output could not be parsed. Manual review required.");

            result.QuestionId = question.QuestionId;
            result.MaxPoints = question.MaxPoints;
            result.SuggestedPoints = ClampScore(result.SuggestedPoints, question.MaxPoints);
            result.Confidence = Math.Clamp(result.Confidence, 0, 1);
            result.ProfessorReviewRequired = true;
            result.Provider = "Gemini";
            result.EvaluatedAt = DateTime.UtcNow;
            result.Status = string.IsNullOrWhiteSpace(result.Status) ? "Evaluated" : result.Status;
            result.Feedback = NormalizeResultText(result.Feedback);
            result.Explanation = NormalizeResultText(result.Explanation);
            result.DetectedIssues = (result.DetectedIssues ?? [])
                .Where(issue => !string.IsNullOrWhiteSpace(issue))
                .Select(issue => issue.Trim())
                .Take(8)
                .ToList();

            return result;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Gemini answer evaluation timed out.");
            return BuildFallbackQuestionResult(question, "Gemini timed out. Local fallback only; manual review required.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gemini answer evaluation could not complete.");
            return BuildFallbackQuestionResult(question, "Gemini evaluation unavailable. Manual review required.");
        }
    }

    private async Task<HttpResponseMessage> SendWithRetryAsync(
        string endpoint,
        string apiKey,
        AnswerEvaluationQuestionRequestDto question,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(BuildGeminiPayload(question), options: JsonOptions)
            };
            request.Headers.TryAddWithoutValidation("x-goog-api-key", apiKey);

            var response = await _httpClient.SendAsync(request, cancellationToken);
            var status = (int)response.StatusCode;
            var transient = status is 408 or 429 or 500 or 502 or 503 or 504;
            if (!transient || attempt >= MaximumRequestAttempts)
                return response;

            var retryAfter = response.Headers.RetryAfter?.Delta;
            if (response.Headers.RetryAfter?.Date is { } retryDate)
                retryAfter = retryDate - DateTimeOffset.UtcNow;

            // Do not retry earlier than requested or keep a grading request waiting indefinitely.
            if (retryAfter > TimeSpan.FromSeconds(8))
                return response;

            var delay = retryAfter > TimeSpan.Zero
                ? retryAfter.Value
                : TimeSpan.FromMilliseconds(Math.Pow(2, attempt - 1) * 1000 + Random.Shared.Next(100, 350));
            response.Dispose();
            _logger.LogWarning("Gemini returned HTTP {StatusCode}; retry {Attempt} of {MaximumAttempts}.",
                status, attempt + 1, MaximumRequestAttempts);
            await Task.Delay(delay, cancellationToken);
        }
    }

    private object BuildGeminiPayload(AnswerEvaluationQuestionRequestDto question)
    {
        return new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[]
                    {
                        new { text = BuildEvaluationPrompt(question) }
                    }
                }
            },
            generationConfig = new
            {
                responseMimeType = "application/json"
            }
        };
    }

    private string BuildEvaluationPrompt(AnswerEvaluationQuestionRequestDto question)
    {
        var metadata = question.TechnicalMetadata;
        var prompt = $"""
        You are assisting a university professor with exam grading.
        Grade strictly and fairly using only the rubric, model answer, expected output, and submitted answer.
        Award partial credit. If the answer is empty, award 0. If the answer is unsafe, irrelevant, or unrelated, award a low score and explain why.
        Return one valid JSON object only. Do not include markdown.

        Required JSON fields:
        - status: one of Evaluated, RequiresManualReview, Failed
        - suggestedPoints: number
        - confidence: number between 0 and 1
        - feedback: string
        - explanation: string
        - detectedIssues: array of strings
        - professorReviewRequired: true

        The professor always makes the final decision.

        Question type: {question.QuestionType}
        Max points: {question.MaxPoints}

        Question prompt:
        {question.Prompt}

        Model answer:
        {question.ModelAnswer}

        Expected output:
        {question.ExpectedOutput}

        Grading notes:
        {question.GradingNotes}

        Technical context:
        Schema: {metadata?.Schema}
        Starter code: {metadata?.StarterCode}
        SQL dialect: {metadata?.SqlDialect}
        Dataset: {metadata?.DatasetDescription}
        Required method signature: {metadata?.RequiredMethodSignature}
        Expected behavior: {metadata?.ExpectedBehavior}
        Allowed libraries: {metadata?.AllowedLibraries}
        Timeout note: {metadata?.TimeoutNote}
        Memory note: {metadata?.MemoryNote}

        Student answer:
        {question.StudentAnswer}
        """;

        return prompt.Length <= MaximumPromptCharacters
            ? prompt
            : prompt[..MaximumPromptCharacters];
    }

    private static string ExtractOutputText(JsonElement root)
    {
        if (!root.TryGetProperty("candidates", out var candidates) || candidates.ValueKind != JsonValueKind.Array)
            return string.Empty;

        foreach (var candidate in candidates.EnumerateArray())
        {
            if (!candidate.TryGetProperty("content", out var content) ||
                !content.TryGetProperty("parts", out var parts) ||
                parts.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            var output = new System.Text.StringBuilder();
            foreach (var part in parts.EnumerateArray())
            {
                if (part.TryGetProperty("thought", out var thought) && thought.ValueKind == JsonValueKind.True)
                    continue;
                if (part.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                    output.Append(text.GetString());
            }
            if (output.Length > 0)
                return output.ToString();
        }

        return string.Empty;
    }

    private static string ExtractJsonObject(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.StartsWith("{") && trimmed.EndsWith("}"))
            return trimmed;

        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        return start >= 0 && end > start ? trimmed[start..(end + 1)] : trimmed;
    }

    private AnswerEvaluationResponseDto BuildFallbackResponse(AnswerEvaluationRequestDto request, string message)
    {
        return new AnswerEvaluationResponseDto
        {
            AttemptId = request.AttemptId,
            ExamId = request.ExamId,
            Status = "RequiresManualReview",
            Provider = "ManualFallback",
            Message = message,
            Questions = request.Questions.Select(question => BuildFallbackQuestionResult(question, message)).ToList()
        };
    }

    private static AnswerEvaluationQuestionResultDto BuildFallbackQuestionResult(
        AnswerEvaluationQuestionRequestDto question,
        string message)
    {
        var hasAnswer = !string.IsNullOrWhiteSpace(question.StudentAnswer);
        var suggestedPoints = hasAnswer
            ? CalculateSimilaritySuggestion(question.StudentAnswer, question.ModelAnswer ?? question.ExpectedOutput ?? string.Empty, question.MaxPoints)
            : 0;

        return new AnswerEvaluationQuestionResultDto
        {
            QuestionId = question.QuestionId,
            Status = "RequiresManualReview",
            SuggestedPoints = suggestedPoints,
            MaxPoints = question.MaxPoints,
            Confidence = hasAnswer && suggestedPoints > 0 ? 0.35 : 0.1,
            Feedback = message,
            Explanation = hasAnswer
                ? "A local fallback estimated similarity to the model answer. Professor review is required."
                : "No student answer was submitted for this question.",
            DetectedIssues = hasAnswer ? [] : ["Empty answer"],
            ProfessorReviewRequired = true,
            Provider = "ManualFallback",
            EvaluatedAt = DateTime.UtcNow
        };
    }

    private static double CalculateSimilaritySuggestion(string response, string expected, double maxPoints)
    {
        var responseTokens = Tokenize(response);
        var expectedTokens = Tokenize(expected);
        if (responseTokens.Count == 0 || expectedTokens.Count == 0)
            return 0;

        var overlap = expectedTokens.Count(token => responseTokens.Contains(token));
        var ratio = overlap / (double)expectedTokens.Count;
        return ClampScore(Math.Round(maxPoints * ratio, 2, MidpointRounding.AwayFromZero), maxPoints);
    }

    private static HashSet<string> Tokenize(string value)
    {
        return Regex.Matches(value.ToLowerInvariant(), "[a-z0-9_#]+")
            .Select(match => match.Value)
            .Where(token => token.Length > 2)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private string ResolveApiKey()
    {
        var configured = _configuration["Gemini:ApiKey"];
        return !string.IsNullOrWhiteSpace(configured)
            ? configured.Trim()
            : Environment.GetEnvironmentVariable("GEMINI_API_KEY")?.Trim() ?? string.Empty;
    }

    private string ResolveModel()
    {
        var configured = _configuration["Gemini:Model"];
        var model = !string.IsNullOrWhiteSpace(configured)
            ? configured
            : Environment.GetEnvironmentVariable("GEMINI_MODEL");
        return string.IsNullOrWhiteSpace(model) ? "gemini-3.8-flash" : model.Trim();
    }

    private static double ClampScore(double value, double maxPoints)
    {
        return Math.Clamp(Math.Round(value, 2, MidpointRounding.AwayFromZero), 0, maxPoints);
    }

    private static string NormalizeResultText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
    }
}
