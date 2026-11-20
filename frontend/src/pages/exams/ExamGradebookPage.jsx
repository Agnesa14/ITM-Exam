import { Link, useParams } from "react-router-dom";
import AppShell from "../../components/AppShell";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { canManageExams } from "../../lib/permissions";
import {
  evaluateAttemptWithAi,
  getExam,
  getExamGradebook,
  gradeExamAttempt,
  publishExamResults,
} from "../../lib/examsApi";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function ExamGradebookPage() {
  const { examId } = useParams();
  const { user, loading: userLoading, error: userError } = useCurrentUser();
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [reviewingId, setReviewingId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishAttemptConfirm, setPublishAttemptConfirm] = useState(null);
  const canReview = canManageExams(user?.role);

  const loadGradebook = useCallback(async () => {
    if (!examId) return;

    try {
      setLoading(true);
      setError("");
      const [examData, gradebookData] = await Promise.all([getExam(examId), getExamGradebook(examId)]);
      const rows = normalizeGradebookRows(gradebookData);
      setExam(examData || null);
      setAttempts(rows);
      setDrafts(buildDrafts(rows));
      setSelectedAttemptId((current) => (rows.some((row) => row.attemptId === current) ? current : ""));
    } catch (err) {
      setExam(null);
      setAttempts([]);
      setDrafts({});
      setSelectedAttemptId("");
      setError(readApiMessage(err) || "Failed to load gradebook.");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadGradebook();
  }, [loadGradebook]);

  const gradedCount = useMemo(() => attempts.filter((attempt) => attempt.isGraded).length, [attempts]);
  const pendingCount = useMemo(() => attempts.filter((attempt) => !attempt.isGraded).length, [attempts]);
  const integrityCount = useMemo(
    () => attempts.reduce((total, attempt) => total + Number(attempt.integrityViolationCount || 0), 0),
    [attempts],
  );
  const publishedCount = useMemo(() => attempts.filter((attempt) => attempt.isPublished).length, [attempts]);
  const readyToPublishCount = useMemo(
    () => attempts.filter((attempt) => attempt.isGraded && !attempt.isPublished).length,
    [attempts],
  );
  const reviewCompletionPercent = useMemo(
    () => (attempts.length === 0 ? 0 : Math.round((gradedCount / attempts.length) * 100)),
    [attempts.length, gradedCount],
  );
  const visibleAttempts = useMemo(
    () => attempts
      .filter((attempt) => matchesReviewFilter(attempt, reviewFilter))
      .filter((attempt) => matchesStudentSearch(attempt, studentSearch)),
    [attempts, reviewFilter, studentSearch],
  );
  const selectedAttempt = useMemo(
    () => attempts.find((attempt) => attempt.attemptId === selectedAttemptId) || null,
    [attempts, selectedAttemptId],
  );

  if (userLoading) {
    return <div className="pageState">Loading gradebook...</div>;
  }

  if (!user) {
    return <div className="pageState">{userError || "User session could not be loaded."}</div>;
  }

  if (!canReview) {
    return <div className="pageState">You do not have permission to open this gradebook.</div>;
  }

  async function onAiReview(attempt) {
    try {
      setReviewingId(attempt.attemptId);
      setError("");
      setSuccess("");
      const review = await evaluateAttemptWithAi(attempt.attemptId);
      await loadGradebook();
      setSuccess(review?.message || "AI suggestions were saved for professor review. Final grading still requires human approval.");
    } catch (err) {
      setError(readApiMessage(err) || "Failed to generate AI-assisted review.");
    } finally {
      setReviewingId("");
    }
  }

  async function onSaveGrade(attempt) {
    const draft = drafts[attempt.attemptId] || {};

    try {
      setSavingId(attempt.attemptId);
      setError("");
      setSuccess("");
      const questionScores = buildQuestionScorePayload(draft, attempt);
      const finalScore = questionScores.length > 0
        ? questionScores.reduce((sum, item) => sum + Number(item.pointsAwarded || 0), 0)
        : parseNumberOrNull(draft.finalScore);
      const updated = await gradeExamAttempt(attempt.attemptId, {
        manualScore: parseNumberOrNull(draft.manualScore),
        finalScore,
        notes: draft.notes || null,
        questionScores,
      });

      setAttempts((current) =>
        current.map((item) =>
          item.attemptId === attempt.attemptId
            ? {
                ...item,
                ...updated,
                studentName: item.studentName,
                studentEmail: item.studentEmail,
                answers: Array.isArray(updated.answers) && updated.answers.length > 0 ? updated.answers : item.answers,
                questionScores: Array.isArray(updated.questionScores) && updated.questionScores.length > 0 ? updated.questionScores : item.questionScores,
              }
            : item,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [attempt.attemptId]: {
          manualScore: String(updated.manualScore ?? 0),
          finalScore: String(updated.finalScore ?? updated.autoScore ?? 0),
          notes: updated.gradingNotes || "",
          questionScores: normalizeQuestionScoreDrafts({
            ...attempt,
            ...updated,
            answers: Array.isArray(updated.answers) && updated.answers.length > 0 ? updated.answers : attempt.answers,
            questionScores: Array.isArray(updated.questionScores) && updated.questionScores.length > 0 ? updated.questionScores : attempt.questionScores,
          }),
        },
      }));
      setSuccess("Human review saved. This attempt is now ready to publish, but the result remains hidden from students until publication.");
    } catch (err) {
      setError(readApiMessage(err) || "Failed to save grade.");
    } finally {
      setSavingId("");
    }
  }

  async function onPublishResults() {
    if (pendingCount > 0) {
      setError("Finish reviewing every submitted attempt before publishing results.");
      setPublishConfirmOpen(false);
      return;
    }

    try {
      setPublishing(true);
      setError("");
      setSuccess("");
      const result = await publishExamResults(examId, { publishAll: true, attemptIds: [] });
      setAttempts((current) =>
        current.map((attempt) => attempt.isGraded ? { ...attempt, isPublished: true, publishedAt: new Date().toISOString() } : attempt),
      );
      setPublishConfirmOpen(false);
      setSuccess(result?.message || "Published graded results.");
    } catch (err) {
      setError(readApiMessage(err) || "Failed to publish results.");
    } finally {
      setPublishing(false);
    }
  }

  async function onPublishAttempt(attempt) {
    try {
      setPublishing(true);
      setError("");
      setSuccess("");
      const result = await publishExamResults(examId, { publishAll: false, attemptIds: [attempt.attemptId] });
      setAttempts((current) =>
        current.map((item) =>
          item.attemptId === attempt.attemptId
            ? { ...item, isGraded: true, isPublished: true, publishedAt: new Date().toISOString() }
            : item,
        ),
      );
      setSuccess(result?.message || `Published result for ${attempt.studentName || "student"}.`);
      setPublishAttemptConfirm(null);
    } catch (err) {
      setError(readApiMessage(err) || "Failed to publish this student's result.");
    } finally {
      setPublishing(false);
    }
  }

  function onExportCsv() {
    if (visibleAttempts.length === 0) {
      setError("No gradebook rows are available to export in the current view.");
      return;
    }

    const csv = buildGradebookCsv(visibleAttempts, drafts);
    const examName = exam?.title || "exam";
    const filterName = reviewFilter === "all" ? "all-attempts" : reviewFilter;
    downloadTextFile(`${safeFileName(examName)}-${filterName}-gradebook.csv`, csv, "text/csv;charset=utf-8");
    setError("");
    setSuccess(`Exported ${visibleAttempts.length} gradebook row${visibleAttempts.length === 1 ? "" : "s"} to CSV.`);
  }

  return (
    <AppShell
      user={user}
      badge="Gradebook"
      title={exam?.title ? `${exam.title} gradebook` : "Exam gradebook"}
      subtitle="Review submitted attempts, use assisted grading suggestions where available, and publish results only after human approval."
      actions={
        <>
          <button className="btn" type="button" onClick={loadGradebook} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <Link className="btn" to={`/exams/${examId}`}>Back to exam</Link>
        </>
      }
    >
      <div className="stackXl">
        {error ? (
          <div className="alert">
            <strong>Gradebook could not be loaded.</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {success ? <div className="successBanner">{success}</div> : null}

        {!loading && error ? (
          <section className="surfaceCard">
            <div className="sectionHeader">
              <div>
                <h3>Gradebook unavailable</h3>
                <span className="sectionMeta">The route is working, but the assessment data could not be loaded. Retry after checking the backend session or permissions.</span>
              </div>
              <button className="btn btnPrimary" type="button" onClick={loadGradebook}>Retry loading</button>
            </div>
          </section>
        ) : null}

        {!error ? (
          <section className="summaryStrip">
            <article className="summaryCard">
              <span className="summaryLabel">Attempts</span>
              <strong>{attempts.length}</strong>
            </article>
            <article className="summaryCard">
              <span className="summaryLabel">Graded</span>
              <strong>{gradedCount}</strong>
            </article>
            <article className="summaryCard">
              <span className="summaryLabel">Needs review</span>
              <strong>{pendingCount}</strong>
            </article>
            <article className="summaryCard">
              <span className="summaryLabel">Integrity flags</span>
              <strong>{integrityCount}</strong>
            </article>
            <article className="summaryCard">
              <span className="summaryLabel">Ready to publish</span>
              <strong>{readyToPublishCount}</strong>
            </article>
            <article className="summaryCard">
              <span className="summaryLabel">Review completion</span>
              <strong>{reviewCompletionPercent}%</strong>
            </article>
          </section>
        ) : null}
        {!error ? (
          <section className="surfaceCard">
            <div className="sectionHeader">
              <div>
                <h3>Human review workflow</h3>
                <span className="sectionMeta">
                  {pendingCount > 0
                    ? `${pendingCount} attempt${pendingCount === 1 ? "" : "s"} still need human review before results can be published.`
                    : "All submitted attempts are reviewed. Results can now be published for students."}
                </span>
              </div>
              <div className="resourceActionGroup">
                <span className="statusPill statusDraft">{publishedCount} published</span>
                <button className="btn" type="button" onClick={onExportCsv} disabled={loading || visibleAttempts.length === 0}>
                  Export CSV
                </button>
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={() => setPublishConfirmOpen(true)}
                  disabled={publishing || readyToPublishCount === 0 || pendingCount > 0 || !canReview}
                  title={pendingCount > 0 ? "Review all submitted attempts before publishing." : undefined}
                >
                  {publishing ? "Publishing..." : "Publish graded results"}
                </button>
              </div>
            </div>
            <div className="sectionBody stackLg">
              <div className="gradebookToolbar">
                <label className="gradebookSearchField">
                  <span className="summaryLabel">Search student</span>
                  <input
                    className="input"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Name, email, or attempt ID"
                  />
                </label>
                {[
                  { key: "all", label: "All attempts", count: attempts.length },
                  { key: "needsReview", label: "Needs review", count: pendingCount },
                  { key: "violations", label: "Violations", count: attempts.filter((attempt) => Number(attempt.integrityViolationCount || 0) > 0).length },
                  { key: "ready", label: "Ready to publish", count: readyToPublishCount },
                ].map((item) => (
                  <button
                    key={item.key}
                    className={`filterTab${reviewFilter === item.key ? " filterTabActive" : ""}`}
                    type="button"
                    onClick={() => setReviewFilter(item.key)}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="pageStateCard">Loading submitted attempts...</div>
              ) : attempts.length === 0 ? (
                <div className="emptyState">
                  <strong>No attempts submitted</strong>
                  <span>Gradebook review becomes available after students submit this assessment. Keep this page as the academic review workspace.</span>
                </div>
              ) : visibleAttempts.length === 0 ? (
                <div className="emptyState">
                  <strong>No attempts in this view</strong>
                  <span>Switch filters to see other gradebook queues for this exam.</span>
                </div>
              ) : (
                <>
                  <GradebookAttemptTable
                    attempts={visibleAttempts}
                    drafts={drafts}
                    publishing={publishing}
                    onReview={(attempt) => setSelectedAttemptId(attempt.attemptId)}
                    onPublish={(attempt) => setPublishAttemptConfirm(attempt)}
                  />
                  {selectedAttempt ? (
                    <AttemptReviewModal
                      attempt={selectedAttempt}
                      draft={drafts[selectedAttempt.attemptId] || {}}
                      reviewing={reviewingId === selectedAttempt.attemptId}
                      saving={savingId === selectedAttempt.attemptId}
                      disabled={!canReview}
                      onClose={() => setSelectedAttemptId("")}
                      onDraftChange={(nextDraft) =>
                        setDrafts((current) => ({ ...current, [selectedAttempt.attemptId]: nextDraft }))
                      }
                      onAiReview={() => onAiReview(selectedAttempt)}
                      onSaveGrade={() => onSaveGrade(selectedAttempt)}
                    />
                  ) : null}
                  {publishConfirmOpen ? (
                    <PublishResultsModal
                      exam={exam}
                      attempts={attempts}
                      readyToPublishCount={readyToPublishCount}
                      publishedCount={publishedCount}
                      publishing={publishing}
                      onClose={() => setPublishConfirmOpen(false)}
                      onConfirm={onPublishResults}
                    />
                  ) : null}
                  {publishAttemptConfirm ? (
                    <PublishSingleResultModal
                      exam={exam}
                      attempt={publishAttemptConfirm}
                      publishing={publishing}
                      onClose={() => setPublishAttemptConfirm(null)}
                      onConfirm={() => onPublishAttempt(publishAttemptConfirm)}
                    />
                  ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function GradebookAttemptTable({ attempts, drafts, publishing, onReview, onPublish }) {
  return (
    <div className="tableWrap gradebookAttemptTableWrap">
      <table className="dataTable gradebookAttemptTable">
        <thead>
          <tr>
            <th>Student</th>
            <th>Attempt status</th>
            <th>Submitted</th>
            <th>Exam points</th>
            <th>Student points</th>
            <th>Grade</th>
            <th>Status</th>
            <th>Integrity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => {
            const draft = drafts[attempt.attemptId] || {};
            const violations = Number(attempt.integrityViolationCount || 0);
            const finalScore = draft.questionScores ? sumQuestionScoreDraft(draft.questionScores) : Number(draft.finalScore ?? attempt.finalScore ?? 0);
            const maxPoints = resolveAttemptMaxPoints(attempt, draft.questionScores);
            const percentage = maxPoints > 0 ? (finalScore / maxPoints) * 100 : 0;
            const grade = calculateGrade(percentage);
            return (
              <tr key={attempt.attemptId}>
                <td>
                  <div className="examDirectoryTitle">
                    <strong>{attempt.studentName || "Student"}</strong>
                    <span>{attempt.studentEmail || "No email recorded"}</span>
                  </div>
                </td>
                <td>
                  <span className="statusPill statusDraft">{attempt.status || "Submitted"}</span>
                </td>
                <td>{formatDateTime(attempt.submittedAt) || "Pending"}</td>
                <td>{formatScore(maxPoints)}</td>
                <td><strong>{formatScore(finalScore)}</strong></td>
                <td>{formatGrade(grade, grade >= 6)}</td>
                <td>
                  <ResultBadge attempt={attempt} />
                </td>
                <td>
                  <span className={`statusPill ${violations > 0 ? "statusWarn" : "statusLive"}`}>
                    {violations > 0 ? `${violations} flag${violations === 1 ? "" : "s"}` : "Clear"}
                  </span>
                </td>
                <td>
                  <div className="gradebookRowActions">
                    <button className="btn btnTiny" type="button" onClick={() => onReview(attempt)}>
                      {attempt.isGraded ? "Review again" : "Review"}
                    </button>
                    {attempt.isGraded && !attempt.isPublished ? (
                      <button className="btn btnTiny btnPrimary" type="button" onClick={() => onPublish(attempt)} disabled={publishing}>
                        Publish
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function normalizeGradebookRows(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(Boolean)
    .map((attempt) => {
      const attemptId = attempt.attemptId || attempt.id || attempt.examAttemptId || "";
      return {
        ...attempt,
        attemptId,
        studentName: attempt.studentName || attempt.fullName || "Student",
        studentEmail: attempt.studentEmail || attempt.email || "",
        status: attempt.status || "Submitted",
        autoScore: Number(attempt.autoScore || 0),
        manualScore: Number(attempt.manualScore || 0),
        finalScore: Number(attempt.finalScore || attempt.autoScore || 0),
        examMaxPoints: Number(attempt.examMaxPoints || 0),
        scorePercentage: Number(attempt.scorePercentage || 0),
        finalGrade: Number(attempt.finalGrade || 0),
        integrityViolationCount: Number(attempt.integrityViolationCount || 0),
        answers: Array.isArray(attempt.answers) ? attempt.answers : [],
        questionScores: Array.isArray(attempt.questionScores) ? attempt.questionScores : [],
        integrityEvents: Array.isArray(attempt.integrityEvents) ? attempt.integrityEvents : [],
      };
    })
    .filter((attempt) => attempt.attemptId);
}

function AttemptReviewModal({ attempt, draft, reviewing, saving, disabled, onClose, onDraftChange, onAiReview, onSaveGrade }) {
  const violationCount = Number(attempt.integrityViolationCount || 0);
  const questionScoreDrafts = toQuestionScoreList(draft.questionScores);
  const safeQuestionScoreDrafts = questionScoreDrafts.length > 0 ? questionScoreDrafts : normalizeQuestionScoreDrafts(attempt);
  const currentFinalScore = safeQuestionScoreDrafts.length > 0
    ? safeQuestionScoreDrafts.reduce((sum, item) => sum + Number(item.pointsAwarded || 0), 0)
    : Number(draft.finalScore ?? attempt.finalScore ?? 0);

  const scoreDelta = currentFinalScore - Number(attempt.autoScore || 0);
  const currentMaxPoints = resolveAttemptMaxPoints(attempt, safeQuestionScoreDrafts);
  const currentPercentage = currentMaxPoints > 0 ? (currentFinalScore / currentMaxPoints) * 100 : 0;
  const currentGrade = calculateGrade(currentPercentage);
  const reviewedQuestions = safeQuestionScoreDrafts.filter((score) => String(score.pointsAwarded ?? "").trim() !== "").length;
  const hasUnsavedChanges = hasReviewDraftChanges(attempt, draft, safeQuestionScoreDrafts);

  function onQuestionScoreChange(questionId, changes) {
    const nextScores = updateQuestionScoreDraft(safeQuestionScoreDrafts, questionId, changes);
    const nextFinalScore = nextScores.reduce((sum, item) => sum + Number(item.pointsAwarded || 0), 0);
    onDraftChange({
      ...draft,
      questionScores: nextScores,
      finalScore: String(roundScore(nextFinalScore)),
      manualScore: String(roundScore(nextFinalScore - Number(attempt.autoScore || 0))),
    });
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <article className="modalCard gradebookReviewModal" id={`attempt-${attempt.attemptId}`}>
        <div className="gradebookReviewHeader">
          <div className="gradebookStudentBlock">
            <span className="summaryLabel">Student attempt review</span>
            <h4>{attempt.studentName || "Student"}</h4>
            <p>{attempt.studentEmail || "No email recorded"}</p>
          </div>
          <div className="gradebookBadgeRow">
            <ResultBadge attempt={attempt} />
            <ViolationBadge count={violationCount} policy={attempt.integrityPolicyAction} />
          </div>
        </div>

        <div className="gradebookReviewStickyBar">
          <div>
            <strong>{reviewedQuestions}/{attempt.answers.length || 0} questions reviewed</strong>
            <span>
              {hasUnsavedChanges
                ? "Unsaved score or feedback changes."
                : attempt.isGraded
                  ? "Saved review available. You can review again before publishing."
                  : "Adjust per-question points, then save review."}
            </span>
          </div>
          <div className="resourceActionGroup">
            <button className="btn" type="button" onClick={onAiReview} disabled={disabled || reviewing}>
              {reviewing ? "Evaluating..." : "Evaluate with AI"}
            </button>
            <button className="btn btnPrimary" type="button" onClick={onSaveGrade} disabled={disabled || saving}>
              {saving ? "Saving..." : "Save review"}
            </button>
            <button className="btn" type="button" onClick={onClose} disabled={saving || reviewing}>Close</button>
          </div>
        </div>

        <AttemptTimeline attempt={attempt} />

        <div className="gradebookScoreStrip">
          <ScoreTile label="Auto score" value={attempt.autoScore} />
          <ScoreTile label="AI/manual score" value={draft.manualScore ?? attempt.manualScore} />
          <ScoreTile label="Final score" value={currentFinalScore} strong />
          <ScoreTile label="Exam max points" value={currentMaxPoints} />
          <ScoreTile label="Score percentage" value={`${currentPercentage.toFixed(2)}%`} />
          <ScoreTile label="Final grade" value={formatGrade(currentGrade, currentGrade >= 6)} />
          <ScoreTile label="Adjustment" value={scoreDelta} signed />
          <ScoreTile label="Draft state" value={hasUnsavedChanges ? "Unsaved" : attempt.isGraded ? "Saved" : "New review"} />
        </div>

        <AttemptAnswersPanel
          attempt={attempt}
          questionScores={safeQuestionScoreDrafts}
          disabled={disabled || saving}
          onQuestionScoreChange={onQuestionScoreChange}
        />

        <IntegrityReviewPanel attempt={attempt} />



        <div className="formGrid formGridTwo gradebookScoreGrid">
          <div className="field">
            <label className="label">Manual score</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.25"
              value={roundScore(currentFinalScore - Number(attempt.autoScore || 0))}
              readOnly
              disabled
            />
          </div>
          <div className="field">
            <label className="label">Final score</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.25"
              value={roundScore(currentFinalScore)}
              readOnly
              disabled
            />
          </div>
        </div>


        <div className="field gradebookNotesField">
          <label className="label">Human review notes</label>
          <textarea
            className="input textareaCompact"
            value={draft.notes ?? ""}
            onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
            disabled={disabled || saving}
            placeholder="Record why the final score was accepted or adjusted."
          />
        </div>
      </article>
    </div>
  );
}

function ResultBadge({ attempt }) {
  if (attempt.isPublished) return <span className="statusPill statusLive">Published</span>;
  if (attempt.isGraded) return <span className="statusPill statusReady">Ready to publish</span>;
  return <span className="statusPill statusWarn">Needs review</span>;
}

function ViolationBadge({ count, policy }) {
  const hasViolations = count > 0;
  const label = hasViolations ? `${count} violation${count === 1 ? "" : "s"}` : "No violations";
  const policyLabel = policy && policy !== "None" ? ` / ${formatIntegrityEvent(policy)}` : "";
  return <span className={`statusPill ${hasViolations ? "statusWarn" : "statusLive"}`}>{label}{policyLabel}</span>;
}

function ScoreTile({ label, value, strong = false, signed = false }) {
  return (
    <div className={`gradebookScoreTile${strong ? " gradebookScoreTileStrong" : ""}`}>
      <span>{label}</span>
      <strong>{signed ? formatSignedScore(value) : formatDisplayValue(value)}</strong>
    </div>
  );
}

function AttemptTimeline({ attempt }) {
  const steps = [
    { label: "Started", value: attempt.startedAt },
    { label: "Submitted", value: attempt.submittedAt },
    { label: "Last violation", value: attempt.integrityLastViolationAt, warn: Number(attempt.integrityViolationCount || 0) > 0 },
    { label: "Graded", value: attempt.gradedAt, done: attempt.isGraded },
  ];

  return (
    <div className="attemptTimeline" aria-label="Attempt timeline">
      {steps.map((step) => (
        <div key={step.label} className={`attemptTimelineStep${step.value || step.done ? " attemptTimelineStepDone" : ""}${step.warn ? " attemptTimelineStepWarn" : ""}`}>
          <span className="attemptTimelineDot" />
          <div>
            <strong>{step.label}</strong>
            <span>{formatDateTime(step.value) || "Pending"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}


function AttemptAnswersPanel({ attempt, questionScores, disabled, onQuestionScoreChange }) {
  const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const scoreByQuestion = new Map((questionScores || []).map((item) => [item.questionId, item]));


  return (
    <div className="attemptAnswersPanel">
      <div className="sectionHeader">
        <div>
          <h3>Question-by-question review</h3>
          <span className="small">Adjust awarded points and leave notes for each answer before saving the human grade.</span>
        </div>
      </div>
      {answers.length === 0 ? (
        <div className="emptyState">No submitted answers were recorded for this attempt.</div>
      ) : (
        <div className="attemptAnswerList">
          {answers.map((answer, index) => (
            <article key={answer.questionId} className="attemptAnswerCard attemptAnswerReviewRow">
              <QuestionReviewCard
                answer={answer}
                index={index}
                score={scoreByQuestion.get(answer.questionId)}
                disabled={disabled}
                onChange={onQuestionScoreChange}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionReviewCard({ answer, index, score, disabled, onChange }) {
  const maxPoints = Number(score?.maxPoints ?? answer.points ?? 0);
  const autoPoints = Number(score?.autoPointsAwarded ?? answer.autoPointsAwarded ?? (answer.isCorrect ? maxPoints : 0));
  const awarded = score?.pointsAwarded ?? score?.finalPointsAwarded ?? answer.finalPointsAwarded ?? autoPoints;
  const technical = parseTechnicalReviewQuestion(answer);

  return (
    <article className="attemptAnswerCard">

              <div className="attemptAnswerHeader">
                <div>
                  <span className="summaryLabel">Question {index + 1} / {answer.questionType}</span>
                  <strong>{technical.prompt || answer.questionText}</strong>
                </div>
                <span className={`statusPill ${Number(awarded) >= maxPoints ? "statusLive" : "statusDraft"}`}>
                  {formatScore(awarded)} / {formatScore(maxPoints)} pts
                </span>
              </div>
              <div className="attemptAnswerReviewGrid">
                <div>
                  {isSqlAnswer(answer) && (technical.schema || technical.sqlDialect || technical.datasetDescription) ? (
                    <div className="sqlReviewContext">
                      <span className="summaryLabel">SQL context</span>
                      {technical.sqlDialect ? <small>Dialect: {technical.sqlDialect}</small> : null}
                      {technical.datasetDescription ? <small>Dataset: {technical.datasetDescription}</small> : null}
                      {technical.schema ? <pre>{technical.schema}</pre> : null}
                    </div>
                  ) : null}
                  {isCSharpAnswer(answer) && (technical.requiredMethodSignature || technical.expectedBehavior || technical.allowedLibraries || technical.timeoutNote || technical.memoryNote) ? (
                    <div className="sqlReviewContext">
                      <span className="summaryLabel">C# coding contract</span>
                      {technical.requiredMethodSignature ? <small>Signature: {technical.requiredMethodSignature}</small> : null}
                      {technical.expectedBehavior ? <small>Behavior: {technical.expectedBehavior}</small> : null}
                      {technical.allowedLibraries ? <small>Allowed libraries: {technical.allowedLibraries}</small> : null}
                      {technical.timeoutNote ? <small>Timeout: {technical.timeoutNote}</small> : null}
                      {technical.memoryNote ? <small>Memory: {technical.memoryNote}</small> : null}
                    </div>
                  ) : null}
                  {Array.isArray(answer.options) && answer.options.length > 0 ? (
                    <div className="attemptAnswerOptions">
                      {answer.options.map((option) => (
                        <span
                          key={option}
                          className={`${option === answer.response ? "selected" : ""}${option === answer.correctAnswer ? " correct" : ""}`}
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="attemptAnswerCompare">
                    <div className={`attemptAnswerResponse${isTechnicalAnswer(answer) ? " attemptAnswerTechnical" : ""}`}>
                      <span>Student answer</span>
                      {isTechnicalAnswer(answer) ? (
                        <pre>{answer.response || "(empty answer)"}</pre>
                      ) : (
                        <p>{answer.response || "(empty answer)"}</p>
                      )}
                    </div>
                    <div className={`attemptAnswerExpected${isTechnicalAnswer(answer) ? " attemptAnswerTechnical" : ""}`}>
                      <span>{isSqlAnswer(answer) ? "Model SQL answer" : isCSharpAnswer(answer) ? "Model C# answer" : "Expected answer / model"}</span>
                      {isTechnicalAnswer(answer) ? <pre>{technical.modelAnswer || answer.correctAnswer || "(no model answer)"}</pre> : <p>{answer.correctAnswer || "(no model answer)"}</p>}
                    </div>
                  </div>
                  {(isSqlAnswer(answer) || isCSharpAnswer(answer)) && technical.expectedOutput ? (
                    <div className="sqlExpectedResult">
                      <span className="summaryLabel">{isSqlAnswer(answer) ? "Expected result / output" : "Expected output"}</span>
                      <pre>{technical.expectedOutput}</pre>
                    </div>
                  ) : null}
                  {(isSqlAnswer(answer) || isCSharpAnswer(answer)) && technical.gradingNotes ? (
                    <div className="sqlExpectedResult">
                      <span className="summaryLabel">Grading notes</span>
                      <p>{technical.gradingNotes}</p>
                    </div>
                  ) : null}
                </div>
                <QuestionScoreReview
                  answer={answer}
                  score={score}
                  disabled={disabled}
                  onChange={(patch) => onChange(answer.questionId, patch)}
                />
              </div>

    </article>
  );
}

function QuestionScoreReview({ answer, score, disabled, onChange }) {
  const maxPoints = Number(score?.maxPoints ?? answer.points ?? 0);
  const autoPoints = Number(score?.autoPointsAwarded ?? answer.autoPointsAwarded ?? 0);
  const finalPoints = score?.pointsAwarded ?? score?.finalPointsAwarded ?? answer.finalPointsAwarded ?? autoPoints;
  const changed = Math.abs(Number(finalPoints || 0) - autoPoints) > 0.009;
  const aiSuggestedPoints = score?.aiSuggestedPoints ?? answer.aiSuggestedPoints;
  const suggestionPoints = aiSuggestedPoints ?? score?.pointsAwarded ?? answer.finalPointsAwarded ?? autoPoints;
  const confidence = score?.aiConfidence ?? answer.aiConfidence;
  const hasAiSuggestion = aiSuggestedPoints !== null && aiSuggestedPoints !== undefined;
  const provider = score?.aiProvider ?? answer.aiProvider;
  const isGeminiSuggestion = hasAiSuggestion && provider === "Gemini";
  const detectedIssues = score?.aiDetectedIssues || answer.aiDetectedIssues || [];

  return (
    <div className="questionScoreReview">
      <div className="questionScoreReviewHeader">
        <div>
          <span className="summaryLabel">{isGeminiSuggestion ? "Gemini AI suggestion" : hasAiSuggestion ? "Local suggestion (not AI)" : "Assisted grading suggestion"}</span>
          <strong>{formatScore(suggestionPoints)} / {formatScore(maxPoints)} pts</strong>
          <small>
            {score?.aiExplanation ||
              answer.aiExplanation ||
              score?.aiFeedback ||
              answer.aiFeedback ||
              answer.gradingNotes ||
              "Initial score is a system suggestion. Professor review is required for the final academic decision."}
          </small>
        </div>
        <span className={`statusPill ${changed ? "statusWarn" : "statusDraft"}`}>
          {isGeminiSuggestion
            ? `${formatConfidence(confidence)} AI confidence`
            : hasAiSuggestion ? "Manual review required" : changed ? "Suggested adjustment" : "Default suggestion"}
        </span>
      </div>
      {hasAiSuggestion ? (
        <div className="gradebookAiSuggestionBox">
          <div>
            <span>Feedback</span>
            <p>{score?.aiFeedback || answer.aiFeedback || "AI did not provide additional feedback."}</p>
          </div>
          {detectedIssues.length > 0 ? (
            <div>
              <span>Detected issues</span>
              <ul>
                {detectedIssues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          ) : null}
          <button
            className="btn btnTiny"
            type="button"
            onClick={() => onChange({ pointsAwarded: aiSuggestedPoints, notes: score?.aiFeedback || answer.aiFeedback || score?.aiExplanation || answer.aiExplanation || "" })}
            disabled={disabled}
          >
            {isGeminiSuggestion ? "Accept AI suggestion" : "Accept local suggestion"}
          </button>
        </div>
      ) : null}
      <div className="questionScoreControls">
        <label>
          <span>Final points</span>
          <input
            className="input"
            type="number"
            min="0"
            max={maxPoints}
            step="0.25"
            value={finalPoints}
            onChange={(event) => onChange({ pointsAwarded: event.target.value })}
            disabled={disabled}
          />
        </label>
        <label>
          <span>Feedback / reason</span>
          <textarea
            className="input textareaCompact"
            value={score?.notes ?? ""}
            onChange={(event) => onChange({ notes: event.target.value })}
            disabled={disabled}
            placeholder="Explain why this score is accepted or adjusted."
          />
        </label>
      </div>
    </div>
  );
}

function isTechnicalAnswer(answer) {
  return answer.questionType === "SQL" || answer.questionType === "CSharp";
}

function isSqlAnswer(answer) {
  return answer.questionType === "SQL";
}

function isCSharpAnswer(answer) {
  return answer.questionType === "CSharp";
}

function parseTechnicalReviewQuestion(answer) {
  if (!isTechnicalAnswer(answer)) {
    return { prompt: answer.questionText || "", schema: "", modelAnswer: answer.correctAnswer || "", expectedOutput: "", gradingNotes: "" };
  }

  const metadata = answer.technicalMetadata || {};
  const result = {
    prompt: "",
    schema: metadata.schema || "",
    modelAnswer: metadata.modelAnswer || answer.correctAnswer || "",
    expectedOutput: metadata.expectedOutput || "",
    gradingNotes: metadata.gradingNotes || answer.gradingNotes || "",
    sqlDialect: metadata.sqlDialect || "",
    datasetDescription: metadata.datasetDescription || "",
    requiredMethodSignature: metadata.requiredMethodSignature || "",
    expectedBehavior: metadata.expectedBehavior || "",
    allowedLibraries: metadata.allowedLibraries || "",
    timeoutNote: metadata.timeoutNote || "",
    memoryNote: metadata.memoryNote || "",
  };

  const sections = String(answer.questionText || "")
    .split(/\n---\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  for (const section of sections) {
    if (section.startsWith("Prompt:\n")) result.prompt = section.replace("Prompt:\n", "").trim();
    if (!result.schema && section.startsWith("Schema:\n")) result.schema = section.replace("Schema:\n", "").trim();
    if (!result.modelAnswer && section.startsWith("Expected answer / grading note:\n")) {
      result.modelAnswer = section.replace("Expected answer / grading note:\n", "").trim();
    }
  }

  if (!result.prompt) result.prompt = answer.questionText || "";
  return result;
}

function IntegrityReviewPanel({ attempt }) {
  const violationCount = Number(attempt.integrityViolationCount || 0);
  const events = buildVisibleIntegrityEvents(attempt.integrityEvents, violationCount);

  return (
    <div className={`integrityReview ${violationCount > 0 ? "integrityReviewWarn" : ""}`}>
      <div>
        <span className="summaryLabel">Integrity review</span>
        <strong>{violationCount > 0 ? `${violationCount} violation${violationCount === 1 ? "" : "s"}` : "No violations"}</strong>
        <div className="integrityStatusGrid">
          <span className={violationCount > 0 ? "statusWarn" : "statusOk"}>
            {attempt.integrityPolicyAction && attempt.integrityPolicyAction !== "None" ? formatIntegrityEvent(attempt.integrityPolicyAction) : "No policy action"}
          </span>
          <span className={attempt.integrityAutoActionTriggeredAt ? "statusWarn" : "statusOk"}>
            {attempt.integrityAutoActionTriggeredAt ? `Auto action ${formatDateTime(attempt.integrityAutoActionTriggeredAt)}` : "No auto action"}
          </span>
        </div>
      </div>
      {events.length > 0 ? (
        <ol>
          {events.map((event, index) => (
            <li key={`${event.eventType}-${event.createdAt}-${index}`}>
              <span>{formatIntegrityEvent(event.eventType)}</span>
              <small>{event.message || "Recorded during exam session."}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>No suspicious activity was recorded for this attempt.</p>
      )}
    </div>
  );
}

function buildVisibleIntegrityEvents(events, violationCount) {
  const uniqueEvents = [];
  const seen = new Set();

  for (const event of Array.isArray(events) ? events : []) {
    const key = [
      String(event.eventType || "").toLowerCase(),
      String(event.message || "").toLowerCase(),
      Number(event.violationCount || 0),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEvents.push(event);
  }

  const visibleLimit = violationCount > 0 ? Math.min(violationCount, 4) : 4;
  return uniqueEvents.slice(0, visibleLimit);
}

function formatIntegrityEvent(value) {
  return String(value || "Integrity event").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function AiReviewPanel({ review }) {
  return (
    <div className="technicalQuestionPreview gradebookAiReview">
      <div>
        <span className="summaryLabel">AI-assisted suggestion</span>
        <pre>{`Suggested manual score: ${formatScore(review.suggestedManualScore)}\n${review.reviewReminder || ""}`}</pre>
      </div>
      {(review.questions || []).map((question) => (
        <div key={question.questionId}>
          <span className="summaryLabel">{question.confidence} confidence</span>
          <pre>{`${question.rationale}\nSuggested: ${formatScore(question.suggestedPoints)} / ${formatScore(question.maxPoints)}\n\nAnswer:\n${question.response || "(empty)"}`}</pre>
        </div>
      ))}
    </div>
  );
}

function PublishResultsModal({ exam, attempts, readyToPublishCount, publishedCount, publishing, onClose, onConfirm }) {
  const totalAttempts = attempts.length;
  const reviewedCount = attempts.filter((attempt) => attempt.isGraded).length;
  const pendingCount = Math.max(0, totalAttempts - reviewedCount);
  const integrityFlags = attempts.reduce((sum, attempt) => sum + Number(attempt.integrityViolationCount || 0), 0);

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <article className="modalCard publishResultsModal">
        <div className="modalHeader">
          <div>
            <span className="summaryLabel">Result publication confirmation</span>
            <h3>Publish reviewed results?</h3>
          </div>
          <button className="btn" type="button" onClick={onClose} disabled={publishing}>Close</button>
        </div>
        <p>
          Students will be able to see their published scores after this action. Publish only after human review is complete.
        </p>
        <dl className="publishResultSummary">
          <div>
            <dt>Assessment</dt>
            <dd>{exam?.title || "Selected assessment"}</dd>
          </div>
          <div>
            <dt>Total submitted attempts</dt>
            <dd>{totalAttempts}</dd>
          </div>
          <div>
            <dt>Reviewed</dt>
            <dd>{reviewedCount}</dd>
          </div>
          <div>
            <dt>Ready to publish</dt>
            <dd>{readyToPublishCount}</dd>
          </div>
          <div>
            <dt>Already published</dt>
            <dd>{publishedCount}</dd>
          </div>
          <div>
            <dt>Integrity flags</dt>
            <dd>{integrityFlags}</dd>
          </div>
        </dl>
        {pendingCount > 0 ? (
          <div className="alert">
            <strong>Publication blocked</strong>
            <span>{pendingCount} submitted attempt{pendingCount === 1 ? "" : "s"} still need review.</span>
          </div>
        ) : null}
        <div className="modalFooter">
          <button className="btn" type="button" onClick={onClose} disabled={publishing}>Cancel</button>
          <button className="btn btnPrimary" type="button" onClick={onConfirm} disabled={publishing || pendingCount > 0 || readyToPublishCount === 0}>
            {publishing ? "Publishing..." : "Publish results"}
          </button>
        </div>
      </article>
    </div>
  );
}

function PublishSingleResultModal({ exam, attempt, publishing, onClose, onConfirm }) {
  const maxPoints = resolveAttemptMaxPoints(attempt, attempt.questionScores);
  const percentage = maxPoints > 0 ? (Number(attempt.finalScore || 0) / maxPoints) * 100 : 0;
  const grade = calculateGrade(percentage);

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <article className="modalCard publishResultsModal">
        <div className="sectionHeader">
          <div>
            <span className="summaryLabel">Publish student result</span>
            <h3>Publish this reviewed result?</h3>
          </div>
          <button className="btn" type="button" onClick={onClose} disabled={publishing}>Close</button>
        </div>
        <p className="sectionMeta">
          This makes the final grade visible to the student. Publish only after the human review is complete.
        </p>
        <dl className="publishResultSummary">
          <div>
            <dt>Student</dt>
            <dd>{attempt.studentName || "Student"}</dd>
          </div>
          <div>
            <dt>Assessment</dt>
            <dd>{exam?.title || "Assessment"}</dd>
          </div>
          <div>
            <dt>Final score</dt>
            <dd>{formatScore(attempt.finalScore)} / {formatScore(maxPoints)}</dd>
          </div>
          <div>
            <dt>Percentage</dt>
            <dd>{percentage.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>Grade</dt>
            <dd>{formatGrade(grade, grade >= 6)}</dd>
          </div>
        </dl>
        {!attempt.isGraded ? (
          <div className="alert">
            <strong>Publication blocked</strong>
            <span>This attempt must be reviewed before publication.</span>
          </div>
        ) : null}
        <div className="modalFooter">
          <button className="btn" type="button" onClick={onClose} disabled={publishing}>Cancel</button>
          <button className="btn btnPrimary" type="button" onClick={onConfirm} disabled={publishing || !attempt.isGraded}>
            {publishing ? "Publishing..." : "Publish result"}
          </button>
        </div>
      </article>
    </div>
  );
}

function buildDrafts(attempts) {
  return attempts.reduce((acc, attempt) => {
    const questionScores = buildQuestionScoresDraft(attempt);
    const finalScore = sumQuestionScoreDraft(questionScores);
    acc[attempt.attemptId] = {
      questionScores,
      manualScore: String(roundScore(finalScore - Number(attempt.autoScore || 0))),
      finalScore: String(roundScore(finalScore)),
      notes: attempt.gradingNotes || "",
    };
    return acc;
  }, {});
}


function buildQuestionScoresDraft(attempt, aiReview = null) {
  const aiByQuestion = (aiReview?.questions || []).reduce((acc, question) => {
    acc[question.questionId] = question;
    return acc;
  }, {});
  const existingByQuestion = (attempt?.questionScores || []).reduce((acc, score) => {
    acc[score.questionId] = score;
    return acc;
  }, {});

  return (attempt?.answers || []).map((answer) => {
    const existing = existingByQuestion[answer.questionId] || {};
    const aiSuggestion = aiByQuestion[answer.questionId];
    const maxPoints = Number(existing.maxPoints ?? answer.points ?? aiSuggestion?.maxPoints ?? 0);
    const autoPoints = Number(existing.autoPointsAwarded ?? answer.autoPointsAwarded ?? aiSuggestion?.suggestedPoints ?? 0);
    const finalPoints = aiSuggestion
      ? Number(aiSuggestion.suggestedPoints ?? autoPoints)
      : Number(existing.finalPointsAwarded ?? answer.finalPointsAwarded ?? autoPoints);

    return {
      questionId: answer.questionId,
      maxPoints,
      autoPointsAwarded: roundScore(autoPoints),
      pointsAwarded: String(roundScore(Math.max(0, Math.min(finalPoints, maxPoints)))),
      notes: existing.gradingNotes || aiSuggestion?.rationale || answer.gradingNotes || "",
      aiSuggestedPoints: existing.aiSuggestedPoints ?? answer.aiSuggestedPoints ?? aiSuggestion?.suggestedPoints ?? null,
      aiConfidence: existing.aiConfidence ?? answer.aiConfidence ?? null,
      aiFeedback: existing.aiFeedback ?? answer.aiFeedback ?? "",
      aiExplanation: existing.aiExplanation ?? answer.aiExplanation ?? aiSuggestion?.rationale ?? "",
      aiDetectedIssues: existing.aiDetectedIssues ?? answer.aiDetectedIssues ?? [],
      aiProvider: existing.aiProvider ?? answer.aiProvider ?? null,
    };
  });
}

function sumQuestionScoreDraft(questionScores) {
  return roundScore(toQuestionScoreList(questionScores).reduce((total, score) => total + Number(score.pointsAwarded || 0), 0));
}

function toQuestionScoreList(questionScores) {
  if (Array.isArray(questionScores)) return questionScores;
  if (questionScores && typeof questionScores === "object") return Object.values(questionScores);
  return [];
}

function normalizeQuestionScoreDrafts(attempt) {
  const scores = Array.isArray(attempt.questionScores) ? attempt.questionScores : [];
  const scoreByQuestion = new Map(scores.map((score) => [score.questionId, score]));
  const answers = Array.isArray(attempt.answers) ? attempt.answers : [];

  return answers.map((answer) => {
    const score = scoreByQuestion.get(answer.questionId) || {};
    const maxPoints = Number(score.maxPoints ?? answer.points ?? 0);
    const autoPoints = Number(score.autoPointsAwarded ?? answer.autoPointsAwarded ?? (answer.isCorrect ? maxPoints : 0));
    const finalPoints = Number(score.finalPointsAwarded ?? answer.finalPointsAwarded ?? autoPoints);

    return {
      questionId: answer.questionId,
      maxPoints,
      autoPointsAwarded: roundScore(autoPoints),
      pointsAwarded: String(roundScore(finalPoints)),
      notes: score.gradingNotes || answer.gradingNotes || "",
      aiSuggestedPoints: score.aiSuggestedPoints ?? answer.aiSuggestedPoints ?? null,
      aiConfidence: score.aiConfidence ?? answer.aiConfidence ?? null,
      aiFeedback: score.aiFeedback ?? answer.aiFeedback ?? "",
      aiExplanation: score.aiExplanation ?? answer.aiExplanation ?? "",
      aiDetectedIssues: score.aiDetectedIssues ?? answer.aiDetectedIssues ?? [],
      aiProvider: score.aiProvider ?? answer.aiProvider ?? null,
    };
  });
}

function updateQuestionScoreDraft(scores, questionId, changes) {
  return toQuestionScoreList(scores).map((score) => {
    if (score.questionId !== questionId) return score;

    const nextPoints = Object.prototype.hasOwnProperty.call(changes, "pointsAwarded")
      ? clampScore(changes.pointsAwarded, score.maxPoints)
      : score.pointsAwarded;

    return {
      ...score,
      pointsAwarded: String(nextPoints),
      notes: Object.prototype.hasOwnProperty.call(changes, "notes") ? changes.notes : score.notes,
    };
  });
}

function buildQuestionScorePayload(draft, attempt) {
  const draftScores = toQuestionScoreList(draft.questionScores);
  const scores = draftScores.length > 0 ? draftScores : normalizeQuestionScoreDrafts(attempt);
  return scores.map((score) => ({
    questionId: score.questionId,
    pointsAwarded: clampScore(score.pointsAwarded, score.maxPoints),
    notes: score.notes || null,
  }));

}

function hasReviewDraftChanges(attempt, draft, questionScores) {
  const currentScores = toQuestionScoreList(questionScores);
  const savedScores = normalizeQuestionScoreDrafts(attempt);
  const savedByQuestion = new Map(savedScores.map((score) => [score.questionId, score]));

  const scoreChanged = currentScores.some((score) => {
    const saved = savedByQuestion.get(score.questionId) || {};
    return Math.abs(Number(score.pointsAwarded || 0) - Number(saved.pointsAwarded || 0)) > 0.009 ||
      String(score.notes || "") !== String(saved.notes || "");
  });

  return scoreChanged || String(draft.notes || "") !== String(attempt.gradingNotes || "");
}

function buildGradebookCsv(attempts, drafts) {
  const headers = [
    "Student",
    "Email",
    "Attempt ID",
    "Submitted At",
    "Duration",
    "Auto Score",
    "Manual Score",
    "Final Score",
    "Exam Max Points",
    "Percentage",
    "Grade",
    "Review Status",
    "Publication Status",
    "Integrity Violations",
    "Policy Action",
    "Answers",
    "Notes",
  ];

  const rows = attempts.map((attempt) => {
    const draft = drafts[attempt.attemptId] || {};
    const finalScore = draft.questionScores ? sumQuestionScoreDraft(draft.questionScores) : Number(draft.finalScore ?? attempt.finalScore ?? 0);
    const examMaxPoints = resolveAttemptMaxPoints(attempt, draft.questionScores);
    const percentage = examMaxPoints > 0 ? (finalScore / examMaxPoints) * 100 : 0;
    const answerCount = Array.isArray(attempt.answers) ? attempt.answers.length : 0;

    return [
      attempt.studentName || "Student",
      attempt.studentEmail || "",
      attempt.attemptId,
      formatDateTime(attempt.submittedAt),
      formatAttemptDuration(attempt.startedAt, attempt.submittedAt),
      formatScore(attempt.autoScore),
      formatScore(draft.manualScore ?? attempt.manualScore),
      formatScore(finalScore),
      formatScore(examMaxPoints),
      `${percentage.toFixed(2)}%`,
      formatGrade(calculateGrade(percentage), percentage >= 51),
      attempt.isGraded ? "Reviewed" : "Needs review",
      attempt.isPublished ? "Published" : "Hidden",
      Number(attempt.integrityViolationCount || 0),
      attempt.integrityPolicyAction || "None",
      answerCount,
      draft.notes ?? attempt.gradingNotes ?? "",
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function resolveAttemptMaxPoints(attempt, questionScores = null) {
  const scores = toQuestionScoreList(questionScores).length > 0
    ? toQuestionScoreList(questionScores)
    : Array.isArray(attempt.questionScores) && attempt.questionScores.length > 0
    ? attempt.questionScores
    : normalizeQuestionScoreDrafts(attempt);

  const questionTotal = scores.reduce((sum, score) => sum + Number(score.maxPoints ?? 0), 0);
  if (questionTotal > 0) return roundScore(questionTotal);

  const answerTotal = Array.isArray(attempt.answers)
    ? attempt.answers.reduce((sum, answer) => sum + Number(answer.points ?? 0), 0)
    : 0;
  if (answerTotal > 0) return roundScore(answerTotal);

  return Number(attempt.examMaxPoints || 0);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return String(value || "gradebook")
    .trim()
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "gradebook";
}

function parseNumberOrNull(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value, maxPoints) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return roundScore(Math.min(Math.max(parsed, 0), Number(maxPoints || 0)));
}

function roundScore(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatScore(value) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

function formatConfidence(value) {
  if (value === null || value === undefined || value === "") return "Pending";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Pending";
  return `${Math.round(parsed * 100)}%`;
}

function formatSignedScore(value) {
  const parsed = Number(value || 0);
  const formatted = formatScore(Math.abs(parsed));
  if (parsed > 0) return `+${formatted}`;
  if (parsed < 0) return `-${formatted}`;
  return formatted;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAttemptDuration(startedAt, submittedAt) {
  if (!startedAt || !submittedAt) return "-";
  const start = new Date(startedAt);
  const end = new Date(submittedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";

  const totalSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatDisplayValue(value) {
  if (typeof value === "string") return value;
  return formatScore(value);
}

function formatGrade(grade, passed) {
  if (!grade) return "-";
  return `${grade} ${passed ? "(Pass)" : "(Fail)"}`;
}

function calculateGrade(percentage) {
  if (percentage < 51) return 5;
  if (percentage <= 60) return 6;
  if (percentage <= 70) return 7;
  if (percentage <= 80) return 8;
  if (percentage <= 90) return 9;
  return 10;
}

function matchesReviewFilter(attempt, filter) {
  if (filter === "needsReview") return !attempt.isGraded;
  if (filter === "violations") return Number(attempt.integrityViolationCount || 0) > 0;
  if (filter === "ready") return attempt.isGraded && !attempt.isPublished;
  return true;
}

function matchesStudentSearch(attempt, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;

  return [
    attempt.studentName,
    attempt.studentEmail,
    attempt.studentId,
    attempt.attemptId,
    attempt.status,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function readApiMessage(err) {
  return err?.response?.data?.message ||
    (typeof err?.response?.data === "string" ? err.response.data : null) ||
    err?.message;
}
