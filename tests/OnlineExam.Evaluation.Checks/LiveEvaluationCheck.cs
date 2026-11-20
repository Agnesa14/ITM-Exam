using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using OnlineExam.Api.DTOs;
using OnlineExam.Api.Services;

internal static class LiveEvaluationCheck
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Directory.GetCurrentDirectory(), "backend", "OnlineExam.Api");
        var config = new ConfigurationBuilder().SetBasePath(root)
            .AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddUserSecrets<GeminiAnswerEvaluationService>(optional: true)
            .AddEnvironmentVariables().Build();
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        var service = new GeminiAnswerEvaluationService(client, config, NullLogger<GeminiAnswerEvaluationService>.Instance);
        var questions = new List<AnswerEvaluationQuestionRequestDto>();
        var names = new Dictionary<Guid, string>();
        void Add(string name, string type, string prompt, string model, string answer, double points, string rubric,
            QuestionTechnicalMetadataDto? metadata = null)
        {
            var id = Guid.NewGuid(); names[id] = name;
            questions.Add(new() { QuestionId = id, QuestionType = type, Prompt = prompt, ModelAnswer = model,
                StudentAnswer = answer, MaxPoints = points, GradingNotes = rubric, TechnicalMetadata = metadata });
        }
        const string textPrompt = "What is virtual memory and why does an operating system use it?";
        const string textModel = "Virtual memory maps virtual addresses to physical memory and can move pages to disk. It provides isolation and allows programs to use address spaces larger than available RAM.";
        const string textRubric = "One point each for address mapping, paging to disk, process isolation, and an address space larger than physical RAM.";
        Add("Text / correct", "Text", textPrompt, textModel, textModel, 4, textRubric);
        Add("Text / wrong", "Text", textPrompt, textModel, "It is a keyboard setting that doubles CPU speed.", 4, textRubric);
        const string sqlPrompt = "Select Id, ProcessName and MemoryUsageMB for Running processes using more than 100 MB, ordered by highest memory first.";
        const string sqlModel = "SELECT Id, ProcessName, MemoryUsageMB FROM Processes WHERE ProcessStatus = 'Running' AND MemoryUsageMB > 100 ORDER BY MemoryUsageMB DESC;";
        const string sqlRubric = "Award 2 points for the Running filter, 2 for MemoryUsageMB > 100, and 1 for descending memory ordering. Do not claim that code was executed.";
        var metadata = new QuestionTechnicalMetadataDto { Schema = "Processes(Id INT, ProcessName VARCHAR(100), ProcessStatus VARCHAR(30), MemoryUsageMB INT)" };
        Add("SQL / correct", "SQL", sqlPrompt, sqlModel, sqlModel, 5, sqlRubric, metadata);
        Add("SQL / partial", "SQL", sqlPrompt, sqlModel, "SELECT Id, ProcessName, MemoryUsageMB FROM Processes WHERE ProcessStatus = 'Running';", 5, sqlRubric, metadata);
        const string codePrompt = "Implement static int Add(int a, int b) returning the sum of its arguments.";
        const string codeModel = "static int Add(int a, int b) { return a + b; }";
        const string codeRubric = "One point for the required method signature and two for returning the correct sum. Do not claim code execution.";
        Add("CSharp / correct", "CSharp", codePrompt, codeModel, codeModel, 3, codeRubric);
        Add("CSharp / wrong operation", "CSharp", codePrompt, codeModel, "static int Add(int a, int b) { return a - b; }", 3, codeRubric);
        var result = await service.EvaluateAttemptAsync(new() { AttemptId = Guid.NewGuid(), ExamId = Guid.NewGuid(), Questions = questions });
        var evidence = new {
            TestedAtUtc = DateTimeOffset.UtcNow,
            Model = config["Gemini:Model"] ?? Environment.GetEnvironmentVariable("GEMINI_MODEL") ?? "gemini-3.8-flash",
            SyntheticDataOnly = true, DatabaseModified = false, result.Provider, result.Status,
            Questions = result.Questions.Select(q => new { Case = names[q.QuestionId], q.Provider, q.Status, q.SuggestedPoints,
                q.MaxPoints, q.Confidence, q.Feedback, q.ProfessorReviewRequired })
        };
        Console.WriteLine(JsonSerializer.Serialize(evidence, new JsonSerializerOptions { WriteIndented = true }));
        if (result.Questions.Count != questions.Count || result.Questions.Any(q => q.Provider != "Gemini"))
            throw new InvalidOperationException("Live evaluation was not completed by Gemini for every question.");
    }
}
