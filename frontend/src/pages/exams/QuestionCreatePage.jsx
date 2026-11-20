import { Link, useNavigate, useParams } from "react-router-dom";
import { addQuestion, getExam } from "../../lib/examsApi";
import { canManageExams } from "../../lib/permissions";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import AppShell from "../../components/AppShell";
import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const technicalTypes = new Set(["CSharp", "SQL"]);

const starterTemplates = {
  CSharp: `using System;

public class Solution
{
    public static void Main()
    {
        // Write your solution here
    }
}`,
  SQL: `SELECT
    *
FROM
    table_name;`,
};

export default function QuestionCreatePage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { examId } = useParams();
  const { user, loading: userLoading, error: userError } = useCurrentUser();
  const [exam, setExam] = useState(null);
  const [form, setForm] = useState({
    text: "",
    type: "MCQ",
    points: 10,
    options: ["", ""],
    correctAnswer: "",
    starterCode: starterTemplates.CSharp,
    sqlSchema: "",
    sqlDialect: "PostgreSQL",
    datasetDescription: "",
    expectedOutput: "",
    modelAnswer: "",
    gradingNotes: "",
    requiredMethodSignature: "",
    expectedBehavior: "",
    allowedLibraries: "",
    timeoutNote: "",
    memoryNote: "",
    publicTestCasesText: "",
    hiddenTestCasesText: "",
    expectedAnswer: "",
  });
  const [loadingExam, setLoadingExam] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canEdit = useMemo(() => canManageExams(user?.role), [user?.role]);
  const isTechnicalQuestion = technicalTypes.has(form.type);
  const editorLanguage = form.type === "SQL" ? "sql" : "csharp";

  useEffect(() => {
    if (!examId) return;

    (async () => {
      try {
        setLoadingExam(true);
        const data = await getExam(examId);
        setExam(data);
      } catch {
        setError(t("questionCreate.loadExamError"));
      } finally {
        setLoadingExam(false);
      }
    })();
  }, [examId, t]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!examId || !canEdit || !form.text.trim()) return;
    const validationError = validateQuestionForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");
      await addQuestion(examId, {
        text: buildQuestionText(form),
        type: form.type,
        points: Number(form.points) || 0,
        options: form.type === "MCQ" ? normalizeOptions(form.options) : [],
        correctAnswer: form.type === "MCQ"
          ? normalizeOptionalValue(form.correctAnswer)
          : form.type === "Text"
            ? normalizeOptionalValue(form.expectedAnswer)
              : form.type === "SQL" || form.type === "CSharp"
                ? normalizeOptionalValue(form.modelAnswer)
                : null,
        technicalMetadata: buildTechnicalMetadata(form),
      });
      nav(`/exams/${examId}`);
    } catch (err) {
      const apiMessage =
        err?.response?.data?.message ||
        (typeof err?.response?.data === "string" ? err.response.data : null) ||
        err?.message;

      setError(apiMessage || t("questionCreate.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function onTypeChange(nextType) {
    setForm((current) => ({
      ...current,
      type: nextType,
      options: nextType === "MCQ" ? (current.options.length > 0 ? current.options : ["", ""]) : current.options,
      correctAnswer: nextType === "MCQ" ? current.correctAnswer : "",
      starterCode: starterTemplates[nextType] || current.starterCode,
      sqlSchema: nextType === "SQL" ? current.sqlSchema : "",
      sqlDialect: nextType === "SQL" ? current.sqlDialect || "PostgreSQL" : current.sqlDialect,
      datasetDescription: nextType === "SQL" ? current.datasetDescription : "",
      expectedOutput: nextType === "SQL" || nextType === "CSharp" ? current.expectedOutput : "",
      modelAnswer: nextType === "SQL" || nextType === "CSharp" ? current.modelAnswer : "",
      gradingNotes: nextType === "SQL" || nextType === "CSharp" ? current.gradingNotes : "",
      requiredMethodSignature: nextType === "CSharp" ? current.requiredMethodSignature : "",
      expectedBehavior: nextType === "CSharp" ? current.expectedBehavior : "",
      allowedLibraries: nextType === "CSharp" ? current.allowedLibraries : "",
      timeoutNote: nextType === "CSharp" ? current.timeoutNote : "",
      memoryNote: nextType === "CSharp" ? current.memoryNote : "",
      publicTestCasesText: nextType === "SQL" || nextType === "CSharp" ? current.publicTestCasesText : "",
      hiddenTestCasesText: nextType === "SQL" || nextType === "CSharp" ? current.hiddenTestCasesText : "",
    }));
  }

  function updateOption(index, value) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? value : option)),
    }));
  }

  function addOptionField() {
    setForm((current) => ({
      ...current,
      options: [...current.options, ""],
    }));
  }

  function removeOptionField(index) {
    setForm((current) => {
      const nextOptions = current.options.filter((_, optionIndex) => optionIndex !== index);
      const nextCorrectAnswer =
        current.correctAnswer === current.options[index] ? "" : current.correctAnswer;

      return {
        ...current,
        options: nextOptions.length > 0 ? nextOptions : ["", ""],
        correctAnswer: nextCorrectAnswer,
      };
    });
  }

  if (userLoading) {
    return <div className="pageState">{t("questionCreate.loading")}</div>;
  }

  if (!user) {
    return <div className="pageState">{userError || t("questionCreate.userError")}</div>;
  }

  return (
    <AppShell
      user={user}
      badge={t("questionCreate.badge")}
      title={t("questionCreate.title")}
      subtitle={loadingExam ? t("questionCreate.subtitleLoading") : t("questionCreate.subtitle", { title: exam?.title || t("examDetails.titleFallback") })}
      actions={<Link className="btn" to={`/exams/${examId}`}>{t("questionCreate.backToExam")}</Link>}
    >
      <section className="formSurface">
        <div className="surfaceCard">
          <div className="sectionHeader">
            <div>
              <h3>{t("questionCreate.content")}</h3>
              <span className="sectionMeta">Author the prompt, scoring, and answer structure in one consistent flow.</span>
            </div>
            <span className="statusPill statusDraft">{form.type}</span>
          </div>
          <div className="sectionBody">
            {error ? <div className="alert">{error}</div> : null}
            <form className="formLayout" onSubmit={onSubmit}>
              <div className="formSection">
                <div className="formSectionHeader">
                  <div>
                    <h4>Question basics</h4>
                    <p>Choose the type first, then complete only the fields that matter for that format.</p>
                  </div>
                </div>

                <div className="formGrid formGridTwo">
                  <div className="field fieldSpanFull">
                    <label className="label">
                      {isTechnicalQuestion ? "Question prompt" : t("questionCreate.prompt")}
                    </label>
                    <textarea
                      className="input textarea"
                      value={form.text}
                      onChange={(e) => setForm((current) => ({ ...current, text: e.target.value }))}
                      disabled={saving || loadingExam}
                      placeholder={t("questionCreate.promptPlaceholder")}
                      rows={6}
                    />
                  </div>

                  <div className="field">
                    <label className="label">{t("questionCreate.type")}</label>
                    <select
                      className="input"
                      value={form.type}
                      onChange={(e) => onTypeChange(e.target.value)}
                      disabled={saving || loadingExam}
                    >
                      <option value="MCQ">MCQ</option>
                      <option value="Text">{t("common.text")}</option>
                      <option value="CSharp">C#</option>
                      <option value="SQL">SQL</option>
                    </select>
                  </div>

                  <div className="field">
                    <label className="label">{t("questionCreate.points")}</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={form.points}
                      onChange={(e) => setForm((current) => ({ ...current, points: Number(e.target.value) }))}
                      disabled={saving || loadingExam}
                    />
                  </div>
                </div>
              </div>

              {form.type === "MCQ" ? (
                <div className="technicalQuestionPanel">
                  <div className="technicalQuestionHeader">
                    <div>
                      <h4>MCQ options</h4>
                      <p>Add the answer choices and select which one is correct.</p>
                    </div>
                    <span className="statusPill statusDraft">MCQ</span>
                  </div>

                  <div className="stackLg compactStack">
                    {form.options.map((option, index) => (
                      <div className="row questionBankOptionRow" key={`option-${index}`}>
                        <input
                          className="input"
                          type="text"
                          value={option}
                          onChange={(e) => updateOption(index, e.target.value)}
                          disabled={saving || loadingExam}
                          placeholder={`Option ${index + 1}`}
                        />
                        <button
                          className="btn"
                          type="button"
                          onClick={() => removeOptionField(index)}
                          disabled={saving || loadingExam || form.options.length <= 2}
                        >
                          Remove
                        </button>
                      </div>
                    ))}

                    <div className="row">
                      <button className="btn" type="button" onClick={addOptionField} disabled={saving || loadingExam}>
                        Add option
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Correct answer</label>
                    <select
                      className="input"
                      value={form.correctAnswer}
                      onChange={(e) => setForm((current) => ({ ...current, correctAnswer: e.target.value }))}
                      disabled={saving || loadingExam}
                    >
                      <option value="">Select the correct option</option>
                      {normalizeOptions(form.options).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              {form.type === "Text" ? (
                <div className="field">
                  <label className="label">Expected answer or grading note</label>
                  <textarea
                    className="input textarea textareaCompact"
                    value={form.expectedAnswer}
                    onChange={(e) => setForm((current) => ({ ...current, expectedAnswer: e.target.value }))}
                    disabled={saving || loadingExam}
                    placeholder="Write the reference answer or grading criteria for this text question."
                    rows={4}
                  />
                </div>
              ) : null}

              {form.type === "SQL" ? (
                <div className="technicalQuestionPanel">
                  <div className="technicalQuestionHeader">
                    <div>
                      <h4>SQL evaluation setup</h4>
                      <p>Keep student context and private grading references structured for reliable review.</p>
                    </div>
                    <span className="statusPill statusDraft">Safe preview</span>
                  </div>

                  <div className="formGrid formGridTwo">
                    <div className="field">
                      <label className="label">SQL dialect</label>
                      <select
                        className="input"
                        value={form.sqlDialect}
                        onChange={(e) => setForm((current) => ({ ...current, sqlDialect: e.target.value }))}
                        disabled={saving || loadingExam}
                      >
                        <option value="PostgreSQL">PostgreSQL</option>
                        <option value="SQL Server">SQL Server</option>
                        <option value="MySQL">MySQL</option>
                        <option value="SQLite">SQLite</option>
                        <option value="Generic SQL">Generic SQL</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Dataset description</label>
                      <input
                        className="input"
                        value={form.datasetDescription}
                        onChange={(e) => setForm((current) => ({ ...current, datasetDescription: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Example: Enrollment data for one semester"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Database schema or table context</label>
                    <textarea
                      className="input textarea textareaCompact"
                      value={form.sqlSchema}
                      onChange={(e) => setForm((current) => ({ ...current, sqlSchema: e.target.value }))}
                      disabled={saving || loadingExam}
                      placeholder="Example: Students(Id, FullName), Exams(Id, Title), Attempts(StudentId, ExamId, Score)"
                      rows={4}
                    />
                  </div>

                  <div className="field">
                    <label className="label">Starter SQL</label>
                    <div className="monacoShell">
                      <Editor
                        height="220px"
                        language="sql"
                        theme="vs-dark"
                        value={form.starterCode}
                        onChange={(value) => setForm((current) => ({ ...current, starterCode: value || "" }))}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    </div>
                  </div>

                  <div className="formGrid formGridTwo">
                    <div className="field">
                      <label className="label">Expected result / output</label>
                      <textarea
                        className="input textarea textareaCompact"
                        value={form.expectedOutput}
                        onChange={(e) => setForm((current) => ({ ...current, expectedOutput: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Describe expected rows, columns, ordering, or result shape."
                        rows={5}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Model SQL answer</label>
                      <textarea
                        className="input textarea textareaCompact"
                        value={form.modelAnswer}
                        onChange={(e) => setForm((current) => ({ ...current, modelAnswer: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Write the reference SQL query used during review."
                        rows={5}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Grading notes</label>
                    <textarea
                      className="input textarea textareaCompact"
                      value={form.gradingNotes}
                      onChange={(e) => setForm((current) => ({ ...current, gradingNotes: e.target.value }))}
                      disabled={saving || loadingExam}
                      placeholder="Explain partial credit, accepted alternatives, and common mistakes."
                      rows={3}
                    />
                  </div>
                </div>
              ) : null}

              {form.type === "CSharp" ? (
                <div className="technicalQuestionPanel">
                  <div className="technicalQuestionHeader">
                    <div>
                      <h4>C# evaluation setup</h4>
                      <p>
                        Define the coding contract, starter code, expected output, and grading reference.
                      </p>
                    </div>
                    <span className="statusPill statusDraft">C#</span>
                  </div>

                  <div className="formGrid formGridTwo">
                    <div className="field">
                      <label className="label">Required method signature</label>
                      <input
                        className="input"
                        value={form.requiredMethodSignature}
                        onChange={(e) => setForm((current) => ({ ...current, requiredMethodSignature: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Example: public static int SumEvenNumbers(int[] values)"
                      />
                    </div>
                    <div className="field">
                      <label className="label">Allowed libraries</label>
                      <input
                        className="input"
                        value={form.allowedLibraries}
                        onChange={(e) => setForm((current) => ({ ...current, allowedLibraries: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Example: System, System.Linq"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Expected behavior</label>
                    <textarea
                      className="input textarea textareaCompact"
                      value={form.expectedBehavior}
                      onChange={(e) => setForm((current) => ({ ...current, expectedBehavior: e.target.value }))}
                      disabled={saving || loadingExam}
                      placeholder="Describe what a correct solution must do."
                      rows={3}
                    />
                  </div>

                  <div className="field">
                    <label className="label">Starter C# code</label>
                    <div className="monacoShell">
                      <Editor
                        height="280px"
                        language={editorLanguage}
                        theme="vs-dark"
                        value={form.starterCode}
                        onChange={(value) => setForm((current) => ({ ...current, starterCode: value || "" }))}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    </div>
                  </div>

                  <div className="formGrid formGridTwo">
                    <div className="field">
                      <label className="label">Expected output</label>
                      <textarea
                        className="input textarea textareaCompact"
                        value={form.expectedOutput}
                        onChange={(e) => setForm((current) => ({ ...current, expectedOutput: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Describe output, return value, or observable result."
                        rows={5}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Model C# answer</label>
                      <textarea
                        className="input textarea textareaCompact"
                        value={form.modelAnswer}
                        onChange={(e) => setForm((current) => ({ ...current, modelAnswer: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Write the reference C# solution or essential implementation outline."
                        rows={5}
                      />
                    </div>
                  </div>

                  <div className="formGrid formGridTwo">
                    <div className="field">
                      <label className="label">Public test cases</label>
                      <textarea
                        className="input textarea textareaCompact"
                        value={form.publicTestCasesText}
                        onChange={(e) => setForm((current) => ({ ...current, publicTestCasesText: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="One visible check per line."
                        rows={4}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Hidden grading checks</label>
                      <textarea
                        className="input textarea textareaCompact"
                        value={form.hiddenTestCasesText}
                        onChange={(e) => setForm((current) => ({ ...current, hiddenTestCasesText: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Private checks for professor/future sandbox grading."
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="formGrid formGridTwo">
                    <div className="field">
                      <label className="label">Timeout note</label>
                      <input
                        className="input"
                        value={form.timeoutNote}
                        onChange={(e) => setForm((current) => ({ ...current, timeoutNote: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Example: Must complete under 2 seconds"
                      />
                    </div>
                    <div className="field">
                      <label className="label">Memory note</label>
                      <input
                        className="input"
                        value={form.memoryNote}
                        onChange={(e) => setForm((current) => ({ ...current, memoryNote: e.target.value }))}
                        disabled={saving || loadingExam}
                        placeholder="Example: Avoid duplicate collections"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Grading notes</label>
                    <textarea
                      className="input textarea textareaCompact"
                      value={form.gradingNotes}
                      onChange={(e) => setForm((current) => ({ ...current, gradingNotes: e.target.value }))}
                      disabled={saving || loadingExam}
                      placeholder="Explain partial credit, accepted alternatives, and common mistakes."
                      rows={3}
                    />
                  </div>
                </div>
              ) : null}

              <div className="formActionsBar">
                <button className="btn btnPrimary" type="submit" disabled={saving || loadingExam || !canEdit || !form.text.trim()}>
                  {saving ? t("questionCreate.saving") : t("questionCreate.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function validateQuestionForm(form) {
  if (form.type === "MCQ") {
    const options = normalizeOptions(form.options);
    if (options.length < 2) {
      return "MCQ questions require at least two options.";
    }

    if (!normalizeOptionalValue(form.correctAnswer)) {
      return "Please select the correct answer for the MCQ question.";
    }

    return "";
  }

  if (!technicalTypes.has(form.type)) {
    return "";
  }

  if (!form.starterCode.trim()) {
    return "Starter code is required for C# and SQL questions.";
  }

  if (form.type === "SQL" && !form.sqlSchema.trim()) {
    return "Database schema or table context is required for SQL questions.";
  }

  if (form.type === "SQL" && !form.expectedOutput.trim()) {
    return "Expected SQL result or output is required.";
  }

  if (form.type === "SQL" && !form.modelAnswer.trim()) {
    return "Model SQL answer is required.";
  }

  if (form.type === "CSharp" && !form.expectedOutput.trim()) {
    return "Expected C# output is required.";
  }

  if (form.type === "CSharp" && !form.modelAnswer.trim()) {
    return "Model C# answer is required.";
  }

  return "";
}

function buildQuestionText(form) {
  if (!technicalTypes.has(form.type)) {
    return form.text.trim();
  }

  const sections = [
    `Prompt:\n${form.text.trim()}`,
  ];

  if (form.type === "SQL" && form.sqlSchema.trim()) {
    sections.push(`Schema:\n${form.sqlSchema.trim()}`);
  }

  if (form.starterCode.trim()) {
    sections.push(`${form.type === "SQL" ? "Starter SQL" : "Starter C# code"}:\n${form.starterCode.trim()}`);
  }

  if (form.expectedAnswer.trim()) {
    sections.push(`Expected answer / grading note:\n${form.expectedAnswer.trim()}`);
  }

  return sections.join("\n\n---\n\n");
}

function buildTechnicalMetadata(form) {
  if (!technicalTypes.has(form.type)) return null;

  if (form.type === "SQL") {
    return {
      schema: form.sqlSchema.trim(),
      starterCode: form.starterCode.trim(),
      expectedOutput: form.expectedOutput.trim(),
      modelAnswer: form.modelAnswer.trim(),
      gradingNotes: form.gradingNotes.trim(),
      sqlDialect: form.sqlDialect,
      datasetDescription: form.datasetDescription.trim(),
      publicTestCases: buildTextTestCases(form.publicTestCasesText, "Public"),
      hiddenTestCases: buildTextTestCases(form.hiddenTestCasesText, "Hidden"),
    };
  }

  return {
    starterCode: form.starterCode.trim(),
    expectedOutput: form.expectedOutput.trim(),
    modelAnswer: form.modelAnswer.trim(),
    gradingNotes: form.gradingNotes.trim(),
    requiredMethodSignature: form.requiredMethodSignature.trim(),
    expectedBehavior: form.expectedBehavior.trim(),
    allowedLibraries: form.allowedLibraries.trim(),
    timeoutNote: form.timeoutNote.trim(),
    memoryNote: form.memoryNote.trim(),
    publicTestCases: buildTextTestCases(form.publicTestCasesText, "Public"),
    hiddenTestCases: buildTextTestCases(form.hiddenTestCasesText, "Hidden"),
  };
}

function buildTextTestCases(value, visibility) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `${visibility.toLowerCase()}-${index + 1}`,
      title: `${visibility} check ${index + 1}`,
      visibility,
      expectedOutput: line,
      gradingNote: line,
    }));
}

function normalizeOptions(options) {
  return options
    .map((option) => option.trim())
    .filter(Boolean);
}

function normalizeOptionalValue(value) {
  return value?.trim() ? value.trim() : "";
}
