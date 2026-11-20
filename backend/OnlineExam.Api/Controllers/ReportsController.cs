using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineExam.Api.Data;
using OnlineExam.Api.DTOs;
using OnlineExam.Api.Models;

namespace OnlineExam.Api.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize(Roles = "Admin,Professor,Assistant")]
public class ReportsController : ControllerBase
{
    private const string QuestionBankMarker = "__QUESTION_BANK__:";
    private const string ExamAttemptSubmittedStatus = "Submitted";
    private readonly AppDbContext _context;

    public ReportsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var exams = await scope.Exams!.ToListAsync();
        var examIds = exams.Select(x => x.Id).ToList();
        var attempts = await _context.ExamAttempts
            .AsNoTracking()
            .Include(x => x.Exam)
            .Where(x => examIds.Contains(x.ExamId))
            .ToListAsync();

        var submitted = attempts.Where(x => x.Status == ExamAttemptSubmittedStatus).ToList();
        var graded = submitted.Where(x => x.IsGraded).ToList();
        var eligibleStudents = await CountEligibleStudentsAsync(scope.AccessibleOfferingIds);
        var startedStudents = attempts.Select(x => x.StudentId).Distinct().Count();
        var passCount = graded.Count(x => CalculateFinalGrade(CalculateScorePercentage(x.FinalScore, ResolveExamMaxPoints(x.Exam))) >= 6);
        var failCount = graded.Count - passCount;
        var durationValues = submitted
            .Where(x => x.SubmittedAt.HasValue)
            .Select(x => Math.Max(0, (x.SubmittedAt!.Value - x.StartedAt).TotalMinutes))
            .ToList();

        var summary = new
        {
            offerings = scope.AccessibleOfferingIds.Count,
            exams = exams.Count,
            publishedExams = exams.Count(x => x.IsPublished && x.Status == "Published"),
            eligibleStudents,
            startedAttempts = attempts.Count,
            startedStudents,
            submittedAttempts = submitted.Count,
            absentStudents = Math.Max(0, eligibleStudents - startedStudents),
            gradedAttempts = graded.Count,
            publishedResults = attempts.Count(x => x.IsPublished),
            pendingResults = submitted.Count(x => !x.IsPublished),
            passCount,
            failCount,
            passRate = submitted.Count == 0 ? 0 : Math.Round((double)passCount / submitted.Count * 100, 2),
            failRate = submitted.Count == 0 ? 0 : Math.Round((double)failCount / submitted.Count * 100, 2),
            averageScore = graded.Count == 0 ? null : (double?)Math.Round(graded.Average(x => x.FinalScore), 2),
            highestScore = graded.Count == 0 ? null : (double?)Math.Round(graded.Max(x => x.FinalScore), 2),
            lowestScore = graded.Count == 0 ? null : (double?)Math.Round(graded.Min(x => x.FinalScore), 2),
            averageDurationMinutes = durationValues.Count == 0 ? null : (double?)Math.Round(durationValues.Average(), 2),
            integrityViolations = await _context.ExamIntegrityEvents.CountAsync(x => examIds.Contains(x.ExamId)),
            studentsWithViolations = attempts.Count(x => x.IntegrityViolationCount > 0)
        };

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            summary
        });
    }

    [HttpGet("participation")]
    public async Task<IActionResult> GetParticipation(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var exams = await scope.Exams!
            .Include(x => x.Attempts)
            .OrderByDescending(x => x.StartsAt)
            .ToListAsync();
        var enrolledByOffering = await GetEligibleStudentCountByOfferingAsync(exams.Select(x => x.CourseOfferingId).OfType<Guid>().Distinct().ToList());

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            items = exams.Select(exam =>
            {
                var eligible = exam.CourseOfferingId.HasValue && enrolledByOffering.TryGetValue(exam.CourseOfferingId.Value, out var count) ? count : 0;
                var started = exam.Attempts.Count;
                var submitted = exam.Attempts.Count(x => x.Status == ExamAttemptSubmittedStatus);
                var graded = exam.Attempts.Where(x => x.Status == ExamAttemptSubmittedStatus && x.IsGraded).ToList();
                return new
                {
                    id = exam.Id,
                    title = exam.Title,
                    exam.Status,
                    exam.IsPublished,
                    exam.StartsAt,
                    exam.EndsAt,
                    exam.CourseOfferingId,
                    courseCode = exam.CourseOffering?.Course?.Code,
                    courseName = exam.CourseOffering?.Course?.Name,
                    exam.AcademicYear,
                    exam.SemesterLabel,
                    exam.AssessmentType,
                    exam.ExamPeriod,
                    eligibleStudents = eligible,
                    attemptCount = started,
                    submittedCount = submitted,
                    startedNotSubmittedCount = exam.Attempts.Count(x => x.Status != ExamAttemptSubmittedStatus),
                    absentCount = Math.Max(0, eligible - started),
                    participationRate = eligible == 0 ? 0 : Math.Round((double)started / eligible * 100, 2),
                    submissionRate = eligible == 0 ? 0 : Math.Round((double)submitted / eligible * 100, 2),
                    publishedResultCount = exam.Attempts.Count(x => x.IsPublished),
                    averageFinalScore = graded.Count == 0 ? null : (double?)Math.Round(graded.Average(x => x.FinalScore), 2)
                };
            })
        });
    }

    [HttpGet("publish-status")]
    public async Task<IActionResult> GetPublishStatus(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var rows = await scope.Exams!
            .Select(exam => new
            {
                exam.Id,
                exam.Title,
                exam.Status,
                exam.IsPublished,
                CourseOfferingId = exam.CourseOfferingId,
                CourseCode = exam.CourseOffering != null && exam.CourseOffering.Course != null ? exam.CourseOffering.Course.Code : null,
                exam.AcademicYear,
                exam.SemesterLabel,
                exam.AssessmentType,
                exam.ExamPeriod,
                SubmittedCount = exam.Attempts.Count(a => a.Status == ExamAttemptSubmittedStatus),
                GradedCount = exam.Attempts.Count(a => a.Status == ExamAttemptSubmittedStatus && a.IsGraded),
                PublishedCount = exam.Attempts.Count(a => a.IsPublished),
                PendingPublicationCount = exam.Attempts.Count(a => a.Status == ExamAttemptSubmittedStatus && a.IsGraded && !a.IsPublished),
                PendingReviewCount = exam.Attempts.Count(a => a.Status == ExamAttemptSubmittedStatus && !a.IsGraded)
            })
            .OrderBy(x => x.CourseCode)
            .ThenBy(x => x.Title)
            .ToListAsync();

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            items = rows
        });
    }

    [HttpGet("integrity")]
    public async Task<IActionResult> GetIntegrity(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var rows = await scope.Exams!
            .Select(exam => new
            {
                exam.Id,
                exam.Title,
                CourseOfferingId = exam.CourseOfferingId,
                CourseCode = exam.CourseOffering != null && exam.CourseOffering.Course != null ? exam.CourseOffering.Course.Code : null,
                exam.AcademicYear,
                exam.SemesterLabel,
                exam.AssessmentType,
                exam.ExamPeriod,
                AttemptsWithViolations = exam.Attempts.Count(a => a.IntegrityViolationCount > 0),
                TotalViolationCount = exam.Attempts.Sum(a => a.IntegrityViolationCount),
                HighestAttemptViolationCount = exam.Attempts.Select(a => (int?)a.IntegrityViolationCount).Max() ?? 0,
                AutoActionCount = exam.Attempts.Count(a => a.IntegrityPolicyAction == "AutoSubmit"),
                EventCount = exam.Attempts.SelectMany(a => a.IntegrityEvents).Count(),
                LatestViolationAt = exam.Attempts.Max(a => a.IntegrityLastViolationAt)
            })
            .OrderByDescending(x => x.TotalViolationCount)
            .ThenBy(x => x.CourseCode)
            .ThenBy(x => x.Title)
            .ToListAsync();

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            items = rows
        });
    }

    [HttpGet("grade-distribution")]
    public async Task<IActionResult> GetGradeDistribution(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var examIds = await scope.Exams!.Select(x => x.Id).ToListAsync();
        var attempts = await _context.ExamAttempts
            .AsNoTracking()
            .Include(x => x.Exam)
            .Where(x => examIds.Contains(x.ExamId) && x.Status == ExamAttemptSubmittedStatus && x.IsGraded)
            .ToListAsync();

        var rows = Enumerable.Range(5, 6)
            .Select(grade =>
            {
                var count = attempts.Count(x => CalculateFinalGrade(CalculateScorePercentage(x.FinalScore, ResolveExamMaxPoints(x.Exam))) == grade);
                return new
                {
                    id = grade,
                    grade,
                    count,
                    percentage = attempts.Count == 0 ? 0 : Math.Round((double)count / attempts.Count * 100, 2),
                    status = grade >= 6 ? "Pass" : "Fail"
                };
            })
            .ToList();

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            items = rows
        });
    }

    [HttpGet("question-performance")]
    public async Task<IActionResult> GetQuestionPerformance(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var exams = await scope.Exams!
            .Include(x => x.Questions)
            .Include(x => x.Attempts)
            .OrderByDescending(x => x.StartsAt)
            .ToListAsync();

        var rows = new List<object>();
        foreach (var exam in exams)
        {
            var submittedAttempts = exam.Attempts.Where(x => x.Status == ExamAttemptSubmittedStatus).ToList();
            foreach (var question in exam.Questions.OrderBy(x => x.Id))
            {
                var perAttempt = submittedAttempts
                    .Select(attempt => new
                    {
                        Attempt = attempt,
                        Answer = ParseAttemptAnswers(attempt.AnswersJson).FirstOrDefault(x => x.QuestionId == question.Id),
                        Score = ReadQuestionScores(attempt.QuestionScoresJson).FirstOrDefault(x => x.QuestionId == question.Id)
                    })
                    .ToList();

                var scoreValues = perAttempt.Select(x => x.Score?.FinalPointsAwarded ?? 0).ToList();
                var unanswered = perAttempt.Count(x => string.IsNullOrWhiteSpace(x.Answer?.Response));
                var manualOverrides = perAttempt.Count(x => x.Score?.IsManuallyOverridden == true);
                var correctCount = string.Equals(question.Type, "MCQ", StringComparison.OrdinalIgnoreCase)
                    ? perAttempt.Count(x => IsCorrectMcqAnswer(question.CorrectAnswer, x.Answer?.Response))
                    : 0;

                rows.Add(new
                {
                    id = $"{exam.Id}-{question.Id}",
                    examId = exam.Id,
                    examTitle = exam.Title,
                    courseCode = exam.CourseOffering?.Course?.Code,
                    academicYear = exam.AcademicYear,
                    semesterLabel = exam.SemesterLabel,
                    questionId = question.Id,
                    questionType = question.Type,
                    questionPreview = Truncate(QuestionTechnicalMetadataMapper.ResolvePrompt(question), 120),
                    maxPoints = question.Points,
                    submittedCount = submittedAttempts.Count,
                    unansweredCount = unanswered,
                    correctCount,
                    incorrectCount = string.Equals(question.Type, "MCQ", StringComparison.OrdinalIgnoreCase)
                        ? (int?)Math.Max(0, submittedAttempts.Count - correctCount - unanswered)
                        : null,
                    averageAwardedPoints = scoreValues.Count == 0 ? 0 : Math.Round(scoreValues.Average(), 2),
                    averagePercentage = question.Points <= 0 || scoreValues.Count == 0 ? 0 : Math.Round(scoreValues.Average() / question.Points * 100, 2),
                    manualOverrideCount = manualOverrides,
                    reviewRequiredCount = perAttempt.Count(x => RequiresManualReview(question.Type, x.Answer?.Response)),
                    needsAttention = scoreValues.Count > 0 && question.Points > 0 && scoreValues.Average() / question.Points < 0.51
                });
            }
        }

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            items = rows
        });
    }

    [HttpGet("absent-students")]
    public async Task<IActionResult> GetAbsentStudents(
        [FromQuery] Guid? courseOfferingId = null,
        [FromQuery] Guid? examId = null,
        [FromQuery] string? academicYear = null,
        [FromQuery] int? semesterNo = null,
        [FromQuery] string? assessmentCategory = null,
        [FromQuery] string? officialExamPeriod = null,
        [FromQuery] string? status = null)
    {
        var scope = await BuildScopeAsync(new ReportFilters(courseOfferingId, examId, academicYear, semesterNo, assessmentCategory, officialExamPeriod, status));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var exams = await scope.Exams!
            .Include(x => x.Attempts)
            .OrderByDescending(x => x.StartsAt)
            .ToListAsync();

        var rows = new List<object>();
        foreach (var exam in exams.Where(x => x.CourseOfferingId.HasValue))
        {
            var attemptedStudentIds = exam.Attempts.Select(x => x.StudentId).ToHashSet();
            var absentStudents = await _context.StudentCourseEnrollments
                .AsNoTracking()
                .Where(x => x.CourseOfferingId == exam.CourseOfferingId && x.EligibleForExam && !attemptedStudentIds.Contains(x.StudentId))
                .Join(_context.Users.AsNoTracking(), enrollment => enrollment.StudentId, user => user.Id, (enrollment, user) => new { enrollment, user })
                .OrderBy(x => x.user.FullName)
                .ToListAsync();

            rows.AddRange(absentStudents.Select(x => new
            {
                id = $"{exam.Id}-{x.user.Id}",
                examId = exam.Id,
                examTitle = exam.Title,
                courseCode = exam.CourseOffering?.Course?.Code,
                courseName = exam.CourseOffering?.Course?.Name,
                academicYear = exam.AcademicYear,
                semesterLabel = exam.SemesterLabel,
                studentId = x.user.Id,
                studentName = x.user.FullName,
                studentEmail = x.user.Email,
                studentNumber = x.user.StudentNumber,
                enrollmentStatus = x.enrollment.Status
            }));
        }

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            items = rows
        });
    }

    [HttpGet("filters")]
    public async Task<IActionResult> GetFilters()
    {
        var scope = await BuildScopeAsync(new ReportFilters(null, null, null, null, null, null, null));
        if (scope.ErrorResult != null)
            return scope.ErrorResult;

        var exams = await scope.Exams!
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.CourseOfferingId,
                CourseCode = x.CourseOffering != null && x.CourseOffering.Course != null ? x.CourseOffering.Course.Code : null,
                CourseName = x.CourseOffering != null && x.CourseOffering.Course != null ? x.CourseOffering.Course.Name : null,
                x.AcademicYear,
                x.SemesterLabel,
                SemesterNo = x.CourseOffering != null ? x.CourseOffering.SemesterNo : (int?)null,
                x.AssessmentType,
                x.ExamPeriod,
                x.Status
            })
            .OrderByDescending(x => x.AcademicYear)
            .ThenBy(x => x.CourseCode)
            .ThenBy(x => x.Title)
            .ToListAsync();

        return Ok(new
        {
            scope = BuildScopeResponse(scope),
            academicYears = exams.Select(x => x.AcademicYear).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().OrderDescending().ToList(),
            semesters = exams.Select(x => x.SemesterNo).Where(x => x.HasValue).Select(x => x!.Value).Distinct().OrderBy(x => x).ToList(),
            assessmentCategories = exams.Select(x => x.AssessmentType).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().OrderBy(x => x).ToList(),
            officialExamPeriods = exams.Select(x => x.ExamPeriod).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().OrderBy(x => x).ToList(),
            statuses = exams.Select(x => x.Status).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().OrderBy(x => x).ToList(),
            exams
        });
    }

    private async Task<ReportScopeResult> BuildScopeAsync(ReportFilters filters)
    {
        if (User.IsInRole("Admin"))
        {
            var exams = BuildExamQuery(filters, null);
            var accessibleOfferingIds = filters.CourseOfferingId.HasValue
                ? [filters.CourseOfferingId.Value]
                : await exams.Where(x => x.CourseOfferingId.HasValue).Select(x => x.CourseOfferingId!.Value).Distinct().ToListAsync();

            return new ReportScopeResult
            {
                Exams = exams,
                AccessibleOfferingIds = accessibleOfferingIds,
                Filters = filters
            };
        }

        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return new ReportScopeResult
            {
                ErrorResult = Unauthorized()
            };
        }

        var assignmentRole = User.IsInRole("Professor") ? "Professor" : "Assistant";
        var accessibleOfferingIdsForStaff = await GetAssignedOfferingIdsAsync(userId.Value, assignmentRole);

        if (filters.CourseOfferingId.HasValue && !accessibleOfferingIdsForStaff.Contains(filters.CourseOfferingId.Value))
        {
            return new ReportScopeResult
            {
                ErrorResult = Forbid()
            };
        }

        return new ReportScopeResult
        {
            Exams = BuildExamQuery(filters, accessibleOfferingIdsForStaff),
            AccessibleOfferingIds = filters.CourseOfferingId.HasValue ? [filters.CourseOfferingId.Value] : accessibleOfferingIdsForStaff,
            Filters = filters
        };
    }

    private IQueryable<Exam> BuildExamQuery(ReportFilters filters, IReadOnlyCollection<Guid>? accessibleOfferingIds)
    {
        var query = _context.Exams
            .AsNoTracking()
            .Include(x => x.CourseOffering)!
                .ThenInclude(x => x!.Course)
            .Include(x => x.Attempts)
                .ThenInclude(x => x.IntegrityEvents)
            .Where(x => !x.Description.StartsWith(QuestionBankMarker));

        if (accessibleOfferingIds != null)
        {
            query = query.Where(x =>
                x.CourseOfferingId.HasValue &&
                accessibleOfferingIds.Contains(x.CourseOfferingId.Value));
        }

        if (filters.CourseOfferingId.HasValue)
            query = query.Where(x => x.CourseOfferingId == filters.CourseOfferingId.Value);

        if (filters.ExamId.HasValue)
            query = query.Where(x => x.Id == filters.ExamId.Value);

        if (!string.IsNullOrWhiteSpace(filters.AcademicYear))
            query = query.Where(x => x.AcademicYear == filters.AcademicYear);

        if (filters.SemesterNo.HasValue)
            query = query.Where(x => x.CourseOffering != null && x.CourseOffering.SemesterNo == filters.SemesterNo.Value);

        if (!string.IsNullOrWhiteSpace(filters.AssessmentCategory))
            query = query.Where(x => x.AssessmentType == filters.AssessmentCategory);

        if (!string.IsNullOrWhiteSpace(filters.OfficialExamPeriod))
            query = query.Where(x => x.ExamPeriod == filters.OfficialExamPeriod);

        if (!string.IsNullOrWhiteSpace(filters.Status))
            query = query.Where(x => x.Status == filters.Status);

        return query;
    }

    private static object BuildScopeResponse(ReportScopeResult scope)
    {
        return new
        {
            courseOfferingId = scope.Filters.CourseOfferingId,
            examId = scope.Filters.ExamId,
            academicYear = scope.Filters.AcademicYear,
            semesterNo = scope.Filters.SemesterNo,
            assessmentCategory = scope.Filters.AssessmentCategory,
            officialExamPeriod = scope.Filters.OfficialExamPeriod,
            status = scope.Filters.Status,
            accessibleOfferings = scope.AccessibleOfferingIds.Count
        };
    }

    private async Task<int> CountEligibleStudentsAsync(IReadOnlyCollection<Guid> offeringIds)
    {
        if (offeringIds.Count == 0)
            return 0;

        return await _context.StudentCourseEnrollments
            .AsNoTracking()
            .Where(x => offeringIds.Contains(x.CourseOfferingId) && x.EligibleForExam)
            .Select(x => x.StudentId)
            .Distinct()
            .CountAsync();
    }

    private async Task<Dictionary<Guid, int>> GetEligibleStudentCountByOfferingAsync(IReadOnlyCollection<Guid> offeringIds)
    {
        if (offeringIds.Count == 0)
            return new Dictionary<Guid, int>();

        return await _context.StudentCourseEnrollments
            .AsNoTracking()
            .Where(x => offeringIds.Contains(x.CourseOfferingId) && x.EligibleForExam)
            .GroupBy(x => x.CourseOfferingId)
            .Select(x => new { CourseOfferingId = x.Key, Count = x.Select(e => e.StudentId).Distinct().Count() })
            .ToDictionaryAsync(x => x.CourseOfferingId, x => x.Count);
    }

    private async Task<List<Guid>> GetAssignedOfferingIdsAsync(Guid userId, string assignmentRole)
    {
        var assignmentIds = await _context.CourseOfferingStaffAssignments
            .Where(a =>
                a.UserId == userId &&
                a.IsActive &&
                a.RoleInOffering == assignmentRole)
            .Select(a => a.CourseOfferingId)
            .ToListAsync();

        var directIds = assignmentRole == "Professor"
            ? await _context.CourseOfferings.Where(x => x.PrimaryProfessorId == userId).Select(x => x.Id).ToListAsync()
            : await _context.CourseOfferings.Where(x => x.AssistantId == userId).Select(x => x.Id).ToListAsync();

        return assignmentIds
            .Concat(directIds)
            .Distinct()
            .ToList();
    }

    private Guid? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(userId, out var parsed) ? parsed : null;
    }

    private static double CalculateScorePercentage(double finalScore, double examMaxPoints)
    {
        return examMaxPoints <= 0 ? 0 : Math.Round(finalScore / examMaxPoints * 100, 2);
    }

    private static int CalculateFinalGrade(double scorePercentage)
    {
        if (scorePercentage < 51) return 5;
        if (scorePercentage <= 60) return 6;
        if (scorePercentage <= 70) return 7;
        if (scorePercentage <= 80) return 8;
        if (scorePercentage <= 90) return 9;
        return 10;
    }

    private static double ResolveExamMaxPoints(Exam exam)
    {
        return exam.MaximumPoints > 0 ? exam.MaximumPoints : exam.Questions.Sum(x => x.Points);
    }

    private static List<AnswerDto> ParseAttemptAnswers(string? answersJson)
    {
        if (string.IsNullOrWhiteSpace(answersJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<AnswerDto>>(answersJson) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<ExamAttemptQuestionScoreDto> ReadQuestionScores(string? questionScoresJson)
    {
        if (string.IsNullOrWhiteSpace(questionScoresJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<ExamAttemptQuestionScoreDto>>(questionScoresJson) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static bool IsCorrectMcqAnswer(string? correctAnswer, string? response)
    {
        var correct = NormalizeAnswerSet(correctAnswer);
        var submitted = NormalizeAnswerSet(response);
        return correct.Count > 0 && correct.SetEquals(submitted);
    }

    private static HashSet<string> NormalizeAnswerSet(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return [];

        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(value);
            if (parsed != null)
                return parsed.Select(x => x.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            // Older answers may be stored as a plain string.
        }

        return value
            .Split("||", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static bool RequiresManualReview(string questionType, string? response)
    {
        return string.Equals(questionType, "Text", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(questionType, "SQL", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(questionType, "CSharp", StringComparison.OrdinalIgnoreCase) ||
               string.IsNullOrWhiteSpace(response);
    }

    private static string Truncate(string? value, int maxLength)
    {
        var text = string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
        return text.Length <= maxLength ? text : $"{text[..Math.Max(0, maxLength - 3)]}...";
    }

    private sealed record ReportFilters(
        Guid? CourseOfferingId,
        Guid? ExamId,
        string? AcademicYear,
        int? SemesterNo,
        string? AssessmentCategory,
        string? OfficialExamPeriod,
        string? Status);

    private sealed class ReportScopeResult
    {
        public IActionResult? ErrorResult { get; set; }
        public IQueryable<Exam>? Exams { get; set; }
        public List<Guid> AccessibleOfferingIds { get; set; } = [];
        public ReportFilters Filters { get; set; } = new(null, null, null, null, null, null, null);
    }
}
