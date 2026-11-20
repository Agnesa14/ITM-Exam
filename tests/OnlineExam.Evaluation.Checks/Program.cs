using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using OnlineExam.Api.DTOs;
using OnlineExam.Api.Services;

if (args.Contains("--live"))
{
    await LiveEvaluationCheck.RunAsync();
    return;
}

const string goodOutput = """{"status":"Evaluated","suggestedPoints":2,"confidence":0.9,"feedback":"Correct","explanation":"Meets the rubric","detectedIssues":[],"professorReviewRequired":true}""";
var checks = 0;
var previousKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
Environment.SetEnvironmentVariable("GEMINI_API_KEY", null);
try
{
    await Check("missing key does not send a request", async () =>
    {
        var handler = new StubHandler((_, _) => throw new Exception("Unexpected network request"));
        var result = await Evaluate(handler, key: "");
        Assert(handler.Calls == 0 && result.Provider == "ManualFallback", "Missing-key fallback");
    });
    await Check("503 retries and recovers without exposing credentials", async () =>
    {
        var handler = new StubHandler(async (request, call) =>
        {
            Assert(request.Headers.GetValues("x-goog-api-key").Single() == "test-secret", "Header key");
            var body = await request.Content!.ReadAsStringAsync();
            Assert(!body.Contains("test-secret") && !request.RequestUri!.ToString().Contains("test-secret"), "Credential isolation");
            using var json = JsonDocument.Parse(body);
            Assert(!json.RootElement.GetProperty("generationConfig").TryGetProperty("temperature", out _), "No deprecated sampling parameter");
            return call == 1 ? Error(503) : Success(goodOutput);
        });
        var result = await Evaluate(handler);
        Assert(handler.Calls == 2 && result.Provider == "Gemini" && result.Questions[0].SuggestedPoints == 2, "Recovered evaluation");
    });
    await Check("persistent 503 stops after three attempts and reports local fallback", async () =>
    {
        var handler = new StubHandler((_, _) => Task.FromResult(Error(503)));
        var result = await Evaluate(handler);
        Assert(handler.Calls == 3 && result.Provider == "ManualFallback" && result.Status == "RequiresManualReview", "Bounded retries");
        Assert(result.Questions[0].Feedback.Contains("HTTP 503"), "Actionable error");
    });
    foreach (var status in new[] { 400, 403, 404 })
        await Check($"HTTP {status} is not retried", async () =>
        {
            var handler = new StubHandler((_, _) => Task.FromResult(Error(status)));
            var result = await Evaluate(handler);
            Assert(handler.Calls == 1 && result.Provider == "ManualFallback", "Permanent error");
        });
    await Check("short Retry-After is respected", async () =>
    {
        var handler = new StubHandler((_, call) =>
        {
            var response = call == 1 ? Error(429) : Success(goodOutput);
            if (call == 1) response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(1));
            return Task.FromResult(response);
        });
        var result = await Evaluate(handler);
        Assert(handler.Calls == 2 && result.Provider == "Gemini", "Rate-limit recovery");
    });
    await Check("long Retry-After is not ignored", async () =>
    {
        var handler = new StubHandler((_, _) =>
        {
            var response = Error(429);
            response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromHours(1));
            return Task.FromResult(response);
        });
        var result = await Evaluate(handler);
        Assert(handler.Calls == 1 && result.Provider == "ManualFallback", "Do not retry before provider allows it");
    });
    await Check("timeout leaves manual grading available", async () =>
    {
        var handler = new StubHandler((_, _) => Task.FromException<HttpResponseMessage>(new TaskCanceledException()));
        var result = await Evaluate(handler);
        Assert(result.Provider == "ManualFallback" && result.Questions[0].Feedback.Contains("timed out"), "Timeout fallback");
    });
    await Check("caller cancellation interrupts retry", async () =>
    {
        var handler = new StubHandler((_, _) => Task.FromResult(Error(503)));
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        try { await Evaluate(handler, cancellationToken: cts.Token); throw new Exception("Cancellation was swallowed"); }
        catch (OperationCanceledException) when (cts.IsCancellationRequested) { }
        Assert(handler.Calls == 1, "No request after cancellation");
    });
    await Check("malformed output is not presented as Gemini grading", async () =>
    {
        var handler = new StubHandler((_, _) => Task.FromResult(Success("not JSON")));
        Assert((await Evaluate(handler)).Provider == "ManualFallback", "Invalid JSON fallback");
    });
    await Check("thought parts are skipped and output parts are joined", async () =>
    {
        var envelope = JsonSerializer.Serialize(new { candidates = new[] { new { content = new { parts = new object[] {
            new { thought = true, text = "internal reasoning" },
            new { text = goodOutput[..60] }, new { text = goodOutput[60..] }
        } } } } });
        var handler = new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = Json(envelope) }));
        Assert((await Evaluate(handler)).Provider == "Gemini", "Output extraction");
    });
    await Check("points and confidence stay bounded; professor review is mandatory", async () =>
    {
        var output = goodOutput.Replace("\"suggestedPoints\":2", "\"suggestedPoints\":200")
            .Replace("\"confidence\":0.9", "\"confidence\":5")
            .Replace("\"professorReviewRequired\":true", "\"professorReviewRequired\":false")
            .Replace("\"detectedIssues\":[]", "\"detectedIssues\":null");
        var handler = new StubHandler((_, _) => Task.FromResult(Success(output)));
        var question = (await Evaluate(handler)).Questions[0];
        Assert(question.SuggestedPoints == 2 && question.Confidence == 1 && question.ProfessorReviewRequired && question.DetectedIssues.Count == 0, "Safe normalization");
    });
    Console.WriteLine($"PASS: {checks} evaluation checks (mock HTTP only, no API key or database required).");
}
finally { Environment.SetEnvironmentVariable("GEMINI_API_KEY", previousKey); }

async Task Check(string name, Func<Task> run)
{
    await run(); checks++; Console.WriteLine($"PASS: {name}");
}
static void Assert(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
static StringContent Json(string value) => new(value, Encoding.UTF8, "application/json");
static HttpResponseMessage Error(int status) => new((HttpStatusCode)status) { Content = Json("{}") };
static HttpResponseMessage Success(string output)
{
    var envelope = new { candidates = new[] { new { content = new { parts = new[] { new { text = output } } } } } };
    return new HttpResponseMessage(HttpStatusCode.OK) { Content = Json(JsonSerializer.Serialize(envelope)) };
}
static async Task<AnswerEvaluationResponseDto> Evaluate(StubHandler handler, string key = "test-secret", CancellationToken cancellationToken = default)
{
    using var client = new HttpClient(handler);
    var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["Gemini:ApiKey"] = key, ["Gemini:Model"] = "test-model"
    }).Build();
    var service = new GeminiAnswerEvaluationService(client, config, NullLogger<GeminiAnswerEvaluationService>.Instance);
    return await service.EvaluateAttemptAsync(new AnswerEvaluationRequestDto {
        AttemptId = Guid.NewGuid(), ExamId = Guid.NewGuid(), Questions = [new() {
            QuestionId = Guid.NewGuid(), QuestionType = "Text", Prompt = "What is a process?", MaxPoints = 2,
            ModelAnswer = "A program in execution", StudentAnswer = "A running program"
        }]
    }, cancellationToken);
}
sealed class StubHandler(Func<HttpRequestMessage, int, Task<HttpResponseMessage>> send) : HttpMessageHandler
{
    public int Calls { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => send(request, ++Calls);
}
