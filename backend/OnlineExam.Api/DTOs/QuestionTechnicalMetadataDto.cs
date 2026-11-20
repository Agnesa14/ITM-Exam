using System.Text.Json;
using OnlineExam.Api.Models;

namespace OnlineExam.Api.DTOs;

public class QuestionTechnicalMetadataDto
{
    public string? Schema { get; set; }
    public string? StarterCode { get; set; }
    public string? ExpectedOutput { get; set; }
    public string? ModelAnswer { get; set; }
    public string? GradingNotes { get; set; }
    public string? SqlDialect { get; set; }
    public string? DatasetDescription { get; set; }
    public string? RequiredMethodSignature { get; set; }
    public string? ExpectedBehavior { get; set; }
    public string? AllowedLibraries { get; set; }
    public string? TimeoutNote { get; set; }
    public string? MemoryNote { get; set; }
    public List<TechnicalTestCaseDto> PublicTestCases { get; set; } = [];
    public List<TechnicalTestCaseDto> HiddenTestCases { get; set; } = [];
}

public class TechnicalTestCaseDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Visibility { get; set; } = "Public";
    public string Input { get; set; } = string.Empty;
    public string Setup { get; set; } = string.Empty;
    public string ExpectedOutput { get; set; } = string.Empty;
    public double? Points { get; set; }
    public string GradingNote { get; set; } = string.Empty;
    public string? ComparisonMode { get; set; }
}

public static class QuestionTechnicalMetadataMapper
{
    public static string? SerializeForStorage(string questionType, QuestionTechnicalMetadataDto? metadata)
    {
        if (!IsTechnicalQuestionType(questionType) || metadata == null)
            return null;

        var normalized = Normalize(metadata);
        if (normalized == null)
            return null;

        return JsonSerializer.Serialize(normalized);
    }

    public static QuestionTechnicalMetadataDto? BuildResponseMetadata(Question question, bool includePrivateFields)
    {
        if (!IsTechnicalQuestionType(question.Type))
            return null;

        var stored = ReadStoredMetadata(question);
        var response = new QuestionTechnicalMetadataDto
        {
            Schema = stored?.Schema ?? ExtractStructuredQuestionSection(question.Text, "Schema"),
            StarterCode = stored?.StarterCode ??
                          ExtractStructuredQuestionSection(question.Text, "Starter SQL") ??
                          ExtractStructuredQuestionSection(question.Text, "Starter C# code"),
            ExpectedOutput = stored?.ExpectedOutput ?? ExtractStructuredQuestionSection(question.Text, "Expected output"),
            ModelAnswer = stored?.ModelAnswer ?? NormalizeOptionalValue(question.CorrectAnswer) ?? ExtractStructuredQuestionSection(question.Text, "Model answer"),
            GradingNotes = stored?.GradingNotes ?? ExtractStructuredQuestionSection(question.Text, "Expected answer / grading note"),
            SqlDialect = stored?.SqlDialect,
            DatasetDescription = stored?.DatasetDescription,
            RequiredMethodSignature = stored?.RequiredMethodSignature ?? ExtractStructuredQuestionSection(question.Text, "Required method signature"),
            ExpectedBehavior = stored?.ExpectedBehavior ?? ExtractStructuredQuestionSection(question.Text, "Expected behavior"),
            AllowedLibraries = stored?.AllowedLibraries,
            TimeoutNote = stored?.TimeoutNote,
            MemoryNote = stored?.MemoryNote,
            PublicTestCases = stored?.PublicTestCases ?? [],
            HiddenTestCases = stored?.HiddenTestCases ?? []
        };

        response = Normalize(response) ?? new QuestionTechnicalMetadataDto();
        if (!includePrivateFields)
        {
            response.ExpectedOutput = null;
            response.ModelAnswer = null;
            response.GradingNotes = null;
            response.HiddenTestCases = [];
        }

        return HasAnyValue(response) ? response : null;
    }

    public static string ResolvePrompt(Question question)
    {
        if (!IsTechnicalQuestionType(question.Type))
            return question.Text;

        return ExtractStructuredQuestionSection(question.Text, "Prompt") ?? question.Text;
    }

    public static string? ResolveExpectedAnswerOrNotes(Question question)
    {
        var metadata = BuildResponseMetadata(question, includePrivateFields: true);
        return NormalizeOptionalValue(metadata?.ModelAnswer) ??
               NormalizeOptionalValue(metadata?.GradingNotes) ??
               NormalizeOptionalValue(question.CorrectAnswer) ??
               ExtractStructuredQuestionSection(question.Text, "Expected answer / grading note");
    }

    private static QuestionTechnicalMetadataDto? ReadStoredMetadata(Question question)
    {
        var raw = NormalizeOptionalValue(question.MetadataJson);
        if (raw == null)
            return null;

        try
        {
            var parsed = JsonSerializer.Deserialize<QuestionTechnicalMetadataDto>(raw);
            return Normalize(parsed);
        }
        catch
        {
            return null;
        }
    }

    private static QuestionTechnicalMetadataDto? Normalize(QuestionTechnicalMetadataDto? metadata)
    {
        if (metadata == null)
            return null;

        var normalized = new QuestionTechnicalMetadataDto
        {
            Schema = NormalizeOptionalValue(metadata.Schema),
            StarterCode = NormalizeOptionalValue(metadata.StarterCode),
            ExpectedOutput = NormalizeOptionalValue(metadata.ExpectedOutput),
            ModelAnswer = NormalizeOptionalValue(metadata.ModelAnswer),
            GradingNotes = NormalizeOptionalValue(metadata.GradingNotes),
            SqlDialect = NormalizeOptionalValue(metadata.SqlDialect),
            DatasetDescription = NormalizeOptionalValue(metadata.DatasetDescription),
            RequiredMethodSignature = NormalizeOptionalValue(metadata.RequiredMethodSignature),
            ExpectedBehavior = NormalizeOptionalValue(metadata.ExpectedBehavior),
            AllowedLibraries = NormalizeOptionalValue(metadata.AllowedLibraries),
            TimeoutNote = NormalizeOptionalValue(metadata.TimeoutNote),
            MemoryNote = NormalizeOptionalValue(metadata.MemoryNote),
            PublicTestCases = NormalizeTestCases(metadata.PublicTestCases, "Public"),
            HiddenTestCases = NormalizeTestCases(metadata.HiddenTestCases, "Hidden")
        };

        return HasAnyValue(normalized) ? normalized : null;
    }

    private static bool HasAnyValue(QuestionTechnicalMetadataDto metadata)
    {
        return !string.IsNullOrWhiteSpace(metadata.Schema) ||
               !string.IsNullOrWhiteSpace(metadata.StarterCode) ||
               !string.IsNullOrWhiteSpace(metadata.ExpectedOutput) ||
               !string.IsNullOrWhiteSpace(metadata.ModelAnswer) ||
               !string.IsNullOrWhiteSpace(metadata.GradingNotes) ||
               !string.IsNullOrWhiteSpace(metadata.SqlDialect) ||
               !string.IsNullOrWhiteSpace(metadata.DatasetDescription) ||
               !string.IsNullOrWhiteSpace(metadata.RequiredMethodSignature) ||
               !string.IsNullOrWhiteSpace(metadata.ExpectedBehavior) ||
               !string.IsNullOrWhiteSpace(metadata.AllowedLibraries) ||
               !string.IsNullOrWhiteSpace(metadata.TimeoutNote) ||
               !string.IsNullOrWhiteSpace(metadata.MemoryNote) ||
               metadata.PublicTestCases.Count > 0 ||
               metadata.HiddenTestCases.Count > 0;
    }

    private static List<TechnicalTestCaseDto> NormalizeTestCases(IEnumerable<TechnicalTestCaseDto>? testCases, string visibility)
    {
        if (testCases == null)
            return [];

        return testCases
            .Select((testCase, index) => new TechnicalTestCaseDto
            {
                Id = NormalizeOptionalValue(testCase.Id) ?? $"{visibility.ToLowerInvariant()}-{index + 1}",
                Title = NormalizeOptionalValue(testCase.Title) ?? $"{visibility} test {index + 1}",
                Visibility = visibility,
                Input = NormalizeOptionalValue(testCase.Input) ?? string.Empty,
                Setup = NormalizeOptionalValue(testCase.Setup) ?? string.Empty,
                ExpectedOutput = NormalizeOptionalValue(testCase.ExpectedOutput) ?? string.Empty,
                Points = testCase.Points,
                GradingNote = NormalizeOptionalValue(testCase.GradingNote) ?? string.Empty,
                ComparisonMode = NormalizeOptionalValue(testCase.ComparisonMode)
            })
            .Where(testCase =>
                !string.IsNullOrWhiteSpace(testCase.Input) ||
                !string.IsNullOrWhiteSpace(testCase.Setup) ||
                !string.IsNullOrWhiteSpace(testCase.ExpectedOutput) ||
                !string.IsNullOrWhiteSpace(testCase.GradingNote))
            .ToList();
    }

    private static bool IsTechnicalQuestionType(string? questionType)
    {
        return string.Equals(questionType, "SQL", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(questionType, "CSharp", StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractStructuredQuestionSection(string value, string label)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var sections = value
            .Split("\n\n---\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var section in sections)
        {
            var prefix = $"{label}:\n";
            if (section.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return NormalizeOptionalValue(section[prefix.Length..]);
        }

        return null;
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
