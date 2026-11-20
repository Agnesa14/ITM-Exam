import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Editor from "@monaco-editor/react";
import AppShell from "../../components/AppShell";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { listMyOfferings } from "../../lib/academicApi";
import {
  createQuestionBankQuestion,
  getQuestionBankQuestion,
  updateQuestionBankQuestion,
} from "../../lib/questionBankApi";

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

const EMPTY_FORM = {
  offeringId: "",
  text: "",
  type: "MCQ",
  points: 10,
  topic: "",
  difficulty: "Medium",
  correctAnswer: "",
  correctAnswers: [],
  options: ["", ""],
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
};

export default function QuestionBankEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { questionId } = useParams();
  const [searchParams] = useSearchParams();
  const { user, loading: userLoading, error: userError } = useCurrentUser();
  const [offerings, setOfferings] = useState([]);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    offeringId: searchParams.get("offeringId") || "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = Boolean(questionId);
  const editorLanguage = form.type === "SQL" ? "sql" : "csharp";

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const offeringData = await listMyOfferings();
        if (!active) return;

        const nextOfferings = Array.isArray(offeringData) ? offeringData : [];
        setOfferings(nextOfferings);

        if (isEdit && questionId) {
          const question = await getQuestionBankQuestion(questionId);
          if (!active) return;

          setForm({
            offeringId: question.courseOfferingId,
            text: extractPrompt(question.text || ""),
            type: question.type || "MCQ",
            points: Number(question.points) || 10,
            topic: question.topic || "",
            difficulty: question.difficulty || "Medium",
            correctAnswer: !technicalTypes.has(question.type) ? (question.correctAnswer || "") : "",
            correctAnswers: question.type === "MCQ" ? parseCorrectAnswers(question.correctAnswer) : [],
            options: Array.isArray(question.options) && question.options.length > 0 ? question.options : ["", ""],
            starterCode: question.technicalMetadata?.starterCode || extractStarterCode(question.text || "", question.type || "MCQ"),
            sqlSchema: question.technicalMetadata?.schema || extractSqlSchema(question.text || ""),
            sqlDialect: question.technicalMetadata?.sqlDialect || "PostgreSQL",
            datasetDescription: question.technicalMetadata?.datasetDescription || "",
            expectedOutput: question.technicalMetadata?.expectedOutput || "",
            modelAnswer: question.technicalMetadata?.modelAnswer || (question.type === "SQL" || question.type === "CSharp" ? question.correctAnswer || "" : ""),
            gradingNotes: question.technicalMetadata?.gradingNotes || "",
            requiredMethodSignature: question.technicalMetadata?.requiredMethodSignature || "",
            expectedBehavior: question.technicalMetadata?.expectedBehavior || "",
            allowedLibraries: question.technicalMetadata?.allowedLibraries || "",
            timeoutNote: question.technicalMetadata?.timeoutNote || "",
            memoryNote: question.technicalMetadata?.memoryNote || "",
            publicTestCasesText: stringifyTestCases(question.technicalMetadata?.publicTestCases),
            hiddenTestCasesText: stringifyTestCases(question.technicalMetadata?.hiddenTestCases),
            expectedAnswer: technicalTypes.has(question.type) ? (question.correctAnswer || question.technicalMetadata?.modelAnswer || "") : "",
          });
        } else if (!searchParams.get("offeringId") && nextOfferings[0]?.id) {
          setForm((current) => ({ ...current, offeringId: current.offeringId || nextOfferings[0].id }));
        }
      } catch {
        if (active) setError(isEdit ? t("questionBank.editor.loadQuestionError") : t("questionBank.editor.loadContextError"));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isEdit, questionId, searchParams, t]);

  const selectedOffering = useMemo(
    () => offerings.find((offering) => offering.id === form.offeringId) || null,
    [form.offeringId, offerings]
  );

  function updateOption(index, value) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? value : option)),
    }));
  }

  function addOption() {
    setForm((current) => ({ ...current, options: [...current.options, ""] }));
  }

  function removeOption(index) {
    setForm((current) => ({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  }

  function onTypeChange(nextType) {
    setForm((current) => ({
      ...current,
      type: nextType,
      correctAnswer: technicalTypes.has(nextType) ? "" : current.correctAnswer,
      correctAnswers: nextType === "MCQ" ? current.correctAnswers : [],
      starterCode: technicalTypes.has(nextType) ? (current.starterCode || starterTemplates[nextType] || "") : current.starterCode,
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
      expectedAnswer: technicalTypes.has(nextType) ? current.expectedAnswer : "",
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.offeringId) return;

    const validationMessage = validateEditorForm(form);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        text: buildQuestionText(form),
        type: form.type,
        points: Number(form.points) || 0,
        topic: form.topic.trim(),
        difficulty: form.difficulty,
        correctAnswer: form.type === "SQL" || form.type === "CSharp"
          ? form.modelAnswer.trim()
          : technicalTypes.has(form.type)
            ? form.expectedAnswer.trim()
          : form.type === "MCQ"
            ? serializeCorrectAnswers(form.correctAnswers)
            : form.correctAnswer.trim(),
        options: form.type === "MCQ" ? form.options : [],
        technicalMetadata: buildTechnicalMetadata(form),
      };

      if (isEdit && questionId) {
        await updateQuestionBankQuestion(questionId, payload);
      } else {
        await createQuestionBankQuestion(form.offeringId, payload);
      }

      navigate(`/question-bank?offeringId=${form.offeringId}`);
    } catch (err) {
      const apiMessage =
        err?.response?.data?.message ||
        (typeof err?.response?.data === "string" ? err.response.data : null) ||
        err?.message;

      setError(apiMessage || t("questionBank.editor.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (userLoading || loading) {
    return <div className="pageState">{t("questionBank.editor.loading")}</div>;
  }

  if (!user) {
    return <div className="pageState">{userError || t("questionBank.userError")}</div>;
  }

  return (
    <AppShell
      user={user}
      badge={t("questionBank.badge")}
      title={isEdit ? t("questionBank.editor.editTitle") : t("questionBank.editor.createTitle")}
      subtitle={selectedOffering ? t("questionBank.editor.subtitle", { offering: formatOffering(selectedOffering) }) : t("questionBank.editor.subtitleEmpty")}
      actions={<Link className="btn" to={form.offeringId ? `/question-bank?offeringId=${form.offeringId}` : "/question-bank"}>{t("questionBank.editor.back")}</Link>}
    >
      <section className="formSurface">
        <div className="surfaceCard">
          <div className="sectionHeader">
            <div>
              <h3>{t("questionBank.editor.sectionTitle")}</h3>
              <span className="sectionMeta">Reusable question entries use the same authoring structure as exam questions.</span>
            </div>
            <span className="statusPill statusDraft">{isEdit ? "Editing" : "New entry"}</span>
          </div>
          <div className="sectionBody">
            {error ? <div className="alert">{error}</div> : null}

            <form className="formLayout" onSubmit={onSubmit}>
              <div className="formSection">
                <div className="formSectionHeader">
                  <div>
                    <h4>Question bank basics</h4>
                    <p>Assign the entry to one offering and keep scoring aligned with exam usage.</p>
                  </div>
                </div>

                <div className="formGrid formGridTwo">
                  <div className="field fieldSpanFull">
                    <label className="label">{t("questionBank.offering")}</label>
                    <select
                      className="input"
                      value={form.offeringId}
                      onChange={(e) => setForm((current) => ({ ...current, offeringId: e.target.value }))}
                      disabled={saving || isEdit}
                    >
                      <option value="">{t("questionBank.selectOffering")}</option>
                      {offerings.map((offering) => (
                        <option key={offering.id} value={offering.id}>
                          {formatOffering(offering)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field fieldSpanFull">
                    <label className="label">{t("questionBank.editor.prompt")}</label>
                    <textarea
                      className="input textarea"
                      value={form.text}
                      onChange={(e) => setForm((current) => ({ ...current, text: e.target.value }))}
                      rows={6}
                      disabled={saving}
                      placeholder={t("questionBank.editor.promptPlaceholder")}
                    />
                  </div>

                  <div className="field">
                    <label className="label">{t("questionBank.type")}</label>
                    <select
                      className="input"
                      value={form.type}
                      onChange={(e) => onTypeChange(e.target.value)}
                      disabled={saving}
                    >
                      <option value="MCQ">MCQ</option>
                      <option value="Text">{t("common.text")}</option>
                      <option value="CSharp">C#</option>
                      <option value="SQL">SQL</option>
                    </select>
                  </div>

                  <div className="field">
                    <label className="label">{t("questionBank.editor.points")}</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={form.points}
                      onChange={(e) => setForm((current) => ({ ...current, points: Number(e.target.value) }))}
                      disabled={saving}
                    />
                  </div>

                  <div className="field">
                    <label className="label">Topic / module</label>
                    <input
                      className="input"
                      value={form.topic}
                      onChange={(e) => setForm((current) => ({ ...current, topic: e.target.value }))}
                      disabled={saving}
                      placeholder="Example: Normalization, joins, arrays"
                    />
                  </div>

                  <div className="field">
                    <label className="label">Difficulty</label>
                    <select
                      className="input"
                      value={form.difficulty}
                      onChange={(e) => setForm((current) => ({ ...current, difficulty: e.target.value }))}
                      disabled={saving}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>

              {form.type === "SQL" ? (
                <div className="technicalQuestionPanel">
                  <div className="technicalQuestionHeader">
                    <div>
                      <h4>SQL evaluation setup</h4>
                      <p>Separate student-visible context from private grading references.</p>
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
                        disabled={saving}
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
                        disabled={saving}
                        placeholder="Example: Enrollment records for one academic year"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Database schema or table context</label>
                    <textarea
                      className="input textarea textareaCompact"
                      value={form.sqlSchema}
                      onChange={(e) => setForm((current) => ({ ...current, sqlSchema: e.target.value }))}
                      disabled={saving}
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
                        disabled={saving}
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
                        disabled={saving}
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
                      disabled={saving}
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
                        disabled={saving}
                        placeholder="Example: public static int SumEvenNumbers(int[] values)"
                      />
                    </div>
                    <div className="field">
                      <label className="label">Allowed libraries</label>
                      <input
                        className="input"
                        value={form.allowedLibraries}
                        onChange={(e) => setForm((current) => ({ ...current, allowedLibraries: e.target.value }))}
                        disabled={saving}
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
                      disabled={saving}
                      placeholder="Describe the behavior a correct solution must implement."
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
                        disabled={saving}
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
                        disabled={saving}
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
                        disabled={saving}
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
                        disabled={saving}
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
                        disabled={saving}
                        placeholder="Example: Must complete under 2 seconds"
                      />
                    </div>
                    <div className="field">
                      <label className="label">Memory note</label>
                      <input
                        className="input"
                        value={form.memoryNote}
                        onChange={(e) => setForm((current) => ({ ...current, memoryNote: e.target.value }))}
                        disabled={saving}
                        placeholder="Example: Avoid unnecessary duplicate collections"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label">Grading notes</label>
                    <textarea
                      className="input textarea textareaCompact"
                      value={form.gradingNotes}
                      onChange={(e) => setForm((current) => ({ ...current, gradingNotes: e.target.value }))}
                      disabled={saving}
                      placeholder="Explain partial credit, accepted alternatives, and common mistakes."
                      rows={3}
                    />
                  </div>
                </div>
              ) : null}

              {form.type === "MCQ" ? (
                <div className="stackLg">
                  <div className="sectionHeader sectionHeaderInline">
                    <div>
                      <h3>{t("questionBank.editor.options")}</h3>
                      <span className="sectionMeta">Add options first, then select one or more correct answers.</span>
                    </div>
                    <button className="btn" type="button" onClick={addOption} disabled={saving}>
                      {t("questionBank.editor.addOption")}
                    </button>
                  </div>

                  <div className="stackLg">
                    {form.options.map((option, index) => (
                      <div className="row questionBankOptionRow" key={index}>
                        <input
                          className="input"
                          value={option}
                          onChange={(e) => updateOption(index, e.target.value)}
                          disabled={saving}
                          placeholder={t("questionBank.editor.optionPlaceholder", { index: index + 1 })}
                        />
                        <button
                          className="btn btnGhost"
                          type="button"
                          onClick={() => removeOption(index)}
                          disabled={saving || form.options.length <= 2}
                        >
                          {t("questionBank.editor.remove")}
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="field">
                    <label className="label">Correct answer(s)</label>
                    <div className="correctAnswerChecklist">
                      {form.options
                        .map((option) => option.trim())
                        .filter(Boolean)
                        .map((option) => {
                          const selected = form.correctAnswers.includes(option);
                          return (
                            <label key={option}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  setForm((current) => ({
                                    ...current,
                                    correctAnswers: selected
                                      ? current.correctAnswers.filter((answer) => answer !== option)
                                      : [...current.correctAnswers, option],
                                  }))
                                }
                                disabled={saving}
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                    </div>
                    <span className="small">Select one or more correct options.</span>
                  </div>
                </div>
              ) : form.type === "Text" ? (
                <div className="field">
                  <label className="label">{t("questionBank.modelAnswer")}</label>
                  <textarea
                    className="input textarea"
                    value={form.correctAnswer}
                    onChange={(e) => setForm((current) => ({ ...current, correctAnswer: e.target.value }))}
                    rows={4}
                    disabled={saving}
                    placeholder={t("questionBank.editor.modelAnswerPlaceholder")}
                  />
                </div>
              ) : null}

              <div className="formActionsBar">
                <button className="btn btnPrimary" type="submit" disabled={saving || !form.offeringId || !form.text.trim()}>
                  {saving ? t("questionBank.editor.saving") : t("questionBank.editor.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function validateEditorForm(form) {
  if (!form.text.trim()) return "Question prompt is required.";
  if (!Number(form.points) || Number(form.points) <= 0) return "Points must be greater than zero.";
  if (form.type === "CSharp") {
    if (!form.starterCode.trim()) return "Starter C# code is required.";
    if (!form.expectedOutput.trim()) return "Expected C# output is required.";
    if (!form.modelAnswer.trim()) return "Model C# answer is required.";
    return "";
  }
  if (form.type !== "SQL") return "";
  if (!form.sqlSchema.trim()) return "Schema or table context is required for SQL questions.";
  if (!form.starterCode.trim()) return "Starter SQL is required.";
  if (!form.expectedOutput.trim()) return "Expected SQL result or output is required.";
  if (!form.modelAnswer.trim()) return "Model SQL answer is required.";
  return "";
}

function formatOffering(offering) {
  const code = offering.course?.code || "";
  const name = offering.course?.name || "";
  const term = offering.term?.code || offering.term?.name || "";
  const section = offering.sectionCode || "-";
  return [code && name ? `${code} - ${name}` : code || name, term, `Section ${section}`].filter(Boolean).join(" | ");
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

function stringifyTestCases(testCases) {
  return (Array.isArray(testCases) ? testCases : [])
    .map((testCase) => testCase.expectedOutput || testCase.gradingNote || testCase.title || "")
    .filter(Boolean)
    .join("\n");
}

function extractPrompt(text) {
  const sections = splitTechnicalSections(text);
  return sections.prompt || text || "";
}

function extractSqlSchema(text) {
  const sections = splitTechnicalSections(text);
  return sections.schema || "";
}

function extractStarterCode(text, type) {
  const sections = splitTechnicalSections(text);
  if (sections.code) return sections.code;
  return starterTemplates[type] || starterTemplates.CSharp;
}

function splitTechnicalSections(text) {
  const result = {
    prompt: "",
    schema: "",
    code: "",
  };

  const sections = String(text || "").split("\n\n---\n\n");
  for (const section of sections) {
    if (section.startsWith("Prompt:\n")) {
      result.prompt = section.replace("Prompt:\n", "").trim();
    } else if (section.startsWith("Schema:\n")) {
      result.schema = section.replace("Schema:\n", "").trim();
    } else if (section.startsWith("Starter SQL:\n")) {
      result.code = section.replace("Starter SQL:\n", "").trim();
    } else if (section.startsWith("Starter C# code:\n")) {
      result.code = section.replace("Starter C# code:\n", "").trim();
    }
  }

  return result;
}

function parseCorrectAnswers(correctAnswer) {
  const value = String(correctAnswer || "").trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // Older questions store a single answer as plain text.
  }

  return [value];
}

function serializeCorrectAnswers(correctAnswers) {
  const normalized = Array.from(new Set((correctAnswers || []).map((answer) => String(answer || "").trim()).filter(Boolean)));
  if (normalized.length <= 1) return normalized[0] || "";
  return JSON.stringify(normalized);
}
