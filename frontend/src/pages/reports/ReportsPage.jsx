import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { listMyOfferings, listOfferings } from "../../lib/academicApi";
import { isAdmin } from "../../lib/permissions";
import {
  getAbsentStudentsReport,
  getGradeDistributionReport,
  getIntegrityReport,
  getParticipationReport,
  getPublishStatusReport,
  getQuestionPerformanceReport,
  getReportFilters,
  getReportsOverview,
} from "../../lib/reportsApi";

const reportTabs = [
  { key: "participation", label: "Participation" },
  { key: "grades", label: "Grade distribution" },
  { key: "questions", label: "Question performance" },
  { key: "absent", label: "Absent students" },
  { key: "publish", label: "Publish status" },
  { key: "integrity", label: "Integrity" },
];

export default function ReportsPage() {
  const { user, loading: userLoading, error: userError } = useCurrentUser();
  const [activeTab, setActiveTab] = useState("participation");
  const [filters, setFilters] = useState({
    courseOfferingId: "",
    examId: "",
    academicYear: "",
    semesterNo: "",
    assessmentCategory: "",
    officialExamPeriod: "",
    status: "",
  });
  const [offerings, setOfferings] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [overview, setOverview] = useState(null);
  const [reports, setReports] = useState({
    participation: [],
    publish: [],
    integrity: [],
    grades: [],
    questions: [],
    absent: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(10);

  const apiFilters = useMemo(() => cleanParams(filters), [filters]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadFilterSources() {
      try {
        const [offeringData, reportFilterData] = await Promise.all([
          isAdmin(user.role) ? listOfferings() : listMyOfferings(),
          getReportFilters(),
        ]);
        if (!active) return;
        setOfferings(Array.isArray(offeringData) ? offeringData : []);
        setFilterOptions(reportFilterData || null);
      } catch {
        if (!active) return;
        setOfferings([]);
        setFilterOptions(null);
      }
    }

    loadFilterSources();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadReports() {
      try {
        setLoading(true);
        setError("");
        const [
          overviewData,
          participationData,
          publishData,
          integrityData,
          gradeData,
          questionData,
          absentData,
        ] = await Promise.all([
          getReportsOverview(apiFilters),
          getParticipationReport(apiFilters),
          getPublishStatusReport(apiFilters),
          getIntegrityReport(apiFilters),
          getGradeDistributionReport(apiFilters),
          getQuestionPerformanceReport(apiFilters),
          getAbsentStudentsReport(apiFilters),
        ]);

        if (!active) return;
        setOverview(overviewData);
        setReports({
          participation: normalizeRows(participationData?.items),
          publish: normalizeRows(publishData?.items),
          integrity: normalizeRows(integrityData?.items),
          grades: normalizeRows(gradeData?.items),
          questions: normalizeRows(questionData?.items),
          absent: normalizeRows(absentData?.items),
        });
      } catch (err) {
        if (active) setError(readApiMessage(err) || "Reports could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReports();
    return () => {
      active = false;
    };
  }, [apiFilters, user]);

  const activeRows = useMemo(() => reports[activeTab] || [], [reports, activeTab]);
  const activeColumns = getColumns(activeTab);
  const reportPageCount = Math.max(1, Math.ceil(activeRows.length / reportPageSize));
  const visibleRows = useMemo(() => {
    const startIndex = (reportPage - 1) * reportPageSize;
    return activeRows.slice(startIndex, startIndex + reportPageSize);
  }, [activeRows, reportPage, reportPageSize]);
  const reportStart = activeRows.length === 0 ? 0 : (reportPage - 1) * reportPageSize + 1;
  const reportEnd = Math.min(activeRows.length, reportPage * reportPageSize);
  const filteredExamOptions = useMemo(
    () => buildFilteredExamOptions(filterOptions?.exams, filters),
    [filterOptions, filters],
  );

  useEffect(() => {
    setReportPage(1);
  }, [activeTab, reportPageSize, apiFilters]);

  useEffect(() => {
    setReportPage((current) => Math.min(current, reportPageCount));
  }, [reportPageCount]);

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "courseOfferingId" ? { examId: "" } : {}),
    }));
  }

  function clearFilters() {
    setFilters({
      courseOfferingId: "",
      examId: "",
      academicYear: "",
      semesterNo: "",
      assessmentCategory: "",
      officialExamPeriod: "",
      status: "",
    });
  }

  function exportActiveCsv() {
    downloadCsv(`${activeTab}-academic-report.csv`, activeColumns, activeRows);
  }

  if (userLoading) return <div className="pageState">Loading reports...</div>;
  if (!user) return <div className="pageState">{userError || "Unable to load user profile."}</div>;

  return (
    <AppShell
      user={user}
      badge="Reports"
      title="Academic reports"
      subtitle="Analyze participation, grades, question performance, absences, publication status, and integrity risk."
      actions={
        <>
          <button className="btn" type="button" onClick={() => window.print()}>
            Print
          </button>
          <button className="btn btnPrimary" type="button" onClick={exportActiveCsv} disabled={activeRows.length === 0}>
            Export CSV
          </button>
        </>
      }
    >
      <div className="stackXl reportsPrintArea">
        {error ? <div className="alert">{error}</div> : null}

        <section className="surfaceCard reportControlPanel">
          <div className="sectionHeader">
            <div>
              <h3>Academic scope</h3>
              <span className="sectionMeta">Filter reports by academic year, semester, offering, assessment, and status.</span>
            </div>
            <div className="resourceActionGroup">
              <span className="statusPill statusDraft">{overview?.scope?.accessibleOfferings ?? 0} offerings</span>
              <button className="btn btnTiny" type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          </div>
          <div className="sectionBody">
            <div className="formGrid reportFilterGrid">
              <SelectFilter label="Academic year" value={filters.academicYear} onChange={(value) => updateFilter("academicYear", value)} options={filterOptions?.academicYears} allLabel="All academic years" />
              <SelectFilter label="Semester" value={filters.semesterNo} onChange={(value) => updateFilter("semesterNo", value)} options={filterOptions?.semesters} allLabel="All semesters" formatter={(value) => `Semester ${value}`} />
              <SelectFilter label="Course offering" value={filters.courseOfferingId} onChange={(value) => updateFilter("courseOfferingId", value)} options={offerings} allLabel="All accessible offerings" formatter={formatOffering} valueSelector={(item) => item.id} />
              <SelectFilter label="Assessment" value={filters.examId} onChange={(value) => updateFilter("examId", value)} options={filteredExamOptions} allLabel="All assessments" formatter={formatExamOption} valueSelector={(item) => item.id} />
              <SelectFilter label="Assessment category" value={filters.assessmentCategory} onChange={(value) => updateFilter("assessmentCategory", value)} options={filterOptions?.assessmentCategories} allLabel="All categories" />
              <SelectFilter label="Official exam period" value={filters.officialExamPeriod} onChange={(value) => updateFilter("officialExamPeriod", value)} options={filterOptions?.officialExamPeriods} allLabel="All periods" />
              <SelectFilter label="Status" value={filters.status} onChange={(value) => updateFilter("status", value)} options={filterOptions?.statuses} allLabel="All statuses" />
              <div className="reportScopeNote">
                <span className="summaryLabel">Current export</span>
                <strong>{reportTabs.find((tab) => tab.key === activeTab)?.label}</strong>
                <p>{activeRows.length} rows included in this table.</p>
              </div>
            </div>
          </div>
        </section>

        <ReportSummary summary={overview?.summary} loading={loading} />

        <section className="surfaceCard">
          <div className="sectionHeader">
            <div>
              <h3>Analytics tables</h3>
              <span className="sectionMeta">Reports summarize outcomes. Detailed scoring remains in Gradebook.</span>
            </div>
          </div>
          <div className="sectionBody stackLg">
            <div className="reportTabs">
              {reportTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`filterTab${activeTab === tab.key ? " filterTabActive" : ""}`}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <strong>{reports[tab.key]?.length ?? 0}</strong>
                </button>
              ))}
            </div>
            <div className="paginationBar">
              <span>Showing {reportStart}-{reportEnd} of {activeRows.length}. Export includes all rows in the selected report.</span>
              <div className="paginationActions">
                <select className="input inputCompact" value={reportPageSize} onChange={(e) => setReportPageSize(Number(e.target.value))} aria-label="Report rows per page">
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                </select>
                <button className="btn" type="button" disabled={reportPage <= 1} onClick={() => setReportPage((current) => Math.max(1, current - 1))}>Previous</button>
                <span className="paginationCurrent">Page {reportPage} of {reportPageCount}</span>
                <button className="btn" type="button" disabled={reportPage >= reportPageCount} onClick={() => setReportPage((current) => Math.min(reportPageCount, current + 1))}>Next</button>
              </div>
            </div>

            {loading ? (
              <div className="pageStateCard">Loading report data...</div>
            ) : activeRows.length === 0 ? (
              <div className="emptyState">
                <strong>No report rows</strong>
                <span>Try another academic scope or wait until exams and attempts are available.</span>
              </div>
            ) : (
              <ReportTable columns={activeColumns} rows={visibleRows} />
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SelectFilter({ label, value, onChange, options = [], allLabel, formatter, valueSelector }) {
  const safeOptions = Array.isArray(options) ? options : [];
  return (
    <div className="field">
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {safeOptions.map((option) => {
          const optionValue = valueSelector ? valueSelector(option) : option;
          const optionLabel = formatter ? formatter(option) : option;
          return (
            <option key={String(optionValue)} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function ReportSummary({ summary, loading }) {
  const cards = [
    { label: "Eligible students", value: summary?.eligibleStudents },
    { label: "Started attempts", value: summary?.startedAttempts },
    { label: "Submitted attempts", value: summary?.submittedAttempts },
    { label: "Absent students", value: summary?.absentStudents },
    { label: "Average score", value: summary?.averageScore ?? "-" },
    { label: "Pass rate", value: summary?.passRate == null ? "-" : `${summary.passRate}%` },
    { label: "Published results", value: summary?.publishedResults },
    { label: "Integrity violations", value: summary?.integrityViolations },
    { label: "Average duration", value: summary?.averageDurationMinutes == null ? "-" : `${summary.averageDurationMinutes} min` },
  ];

  return (
    <section className="reportSummaryGrid">
      {cards.map((card) => (
        <article className="summaryCard" key={card.label}>
          <span className="summaryLabel">{card.label}</span>
          <strong>{loading ? "..." : card.value ?? 0}</strong>
        </article>
      ))}
    </section>
  );
}

function ReportTable({ columns, rows }) {
  return (
    <div className="tableWrap reportTableWrap">
      <table className="dataTable reportTable">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{renderCell(row, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(row, column) {
  const value = row[column.key];
  if (column.type === "date") return formatDate(value);
  if (column.type === "status") return <span className={`statusPill ${value ? "statusLive" : "statusDraft"}`}>{value ? "Published" : "Draft"}</span>;
  if (column.type === "score") return value == null ? "-" : Number(value).toFixed(2);
  if (column.type === "percent") return value == null ? "-" : `${Number(value).toFixed(2)}%`;
  if (column.type === "danger") return <span className={`statusPill ${Number(value || 0) > 0 ? "statusWarn" : "statusLive"}`}>{value ?? 0}</span>;
  if (column.type === "attention") return <span className={`statusPill ${value ? "statusWarn" : "statusLive"}`}>{value ? "Needs attention" : "Stable"}</span>;
  return value ?? "-";
}

function getColumns(tab) {
  if (tab === "publish") {
    return [
      { key: "courseCode", label: "Course" },
      { key: "title", label: "Assessment" },
      { key: "academicYear", label: "Academic year" },
      { key: "semesterLabel", label: "Semester" },
      { key: "isPublished", label: "Exam status", type: "status" },
      { key: "submittedCount", label: "Submitted" },
      { key: "gradedCount", label: "Graded" },
      { key: "publishedCount", label: "Published" },
      { key: "pendingPublicationCount", label: "Pending publish" },
      { key: "pendingReviewCount", label: "Needs review" },
    ];
  }

  if (tab === "integrity") {
    return [
      { key: "courseCode", label: "Course" },
      { key: "title", label: "Assessment" },
      { key: "academicYear", label: "Academic year" },
      { key: "attemptsWithViolations", label: "Attempts flagged", type: "danger" },
      { key: "totalViolationCount", label: "Violations", type: "danger" },
      { key: "highestAttemptViolationCount", label: "Highest attempt", type: "danger" },
      { key: "autoActionCount", label: "Auto actions", type: "danger" },
      { key: "latestViolationAt", label: "Latest violation", type: "date" },
    ];
  }

  if (tab === "grades") {
    return [
      { key: "grade", label: "Grade" },
      { key: "count", label: "Students" },
      { key: "percentage", label: "Share", type: "percent" },
      { key: "status", label: "Outcome" },
    ];
  }

  if (tab === "questions") {
    return [
      { key: "courseCode", label: "Course" },
      { key: "examTitle", label: "Assessment" },
      { key: "questionType", label: "Type" },
      { key: "questionPreview", label: "Question" },
      { key: "maxPoints", label: "Max" },
      { key: "submittedCount", label: "Submitted" },
      { key: "averageAwardedPoints", label: "Avg points", type: "score" },
      { key: "averagePercentage", label: "Avg %" , type: "percent" },
      { key: "unansweredCount", label: "Unanswered", type: "danger" },
      { key: "manualOverrideCount", label: "Overrides" },
      { key: "needsAttention", label: "Signal", type: "attention" },
    ];
  }

  if (tab === "absent") {
    return [
      { key: "courseCode", label: "Course" },
      { key: "examTitle", label: "Assessment" },
      { key: "academicYear", label: "Academic year" },
      { key: "semesterLabel", label: "Semester" },
      { key: "studentName", label: "Student" },
      { key: "studentEmail", label: "Email" },
      { key: "studentNumber", label: "Student ID" },
      { key: "enrollmentStatus", label: "Enrollment" },
    ];
  }

  return [
    { key: "courseCode", label: "Course" },
    { key: "title", label: "Assessment" },
    { key: "academicYear", label: "Academic year" },
    { key: "semesterLabel", label: "Semester" },
    { key: "startsAt", label: "Starts", type: "date" },
    { key: "isPublished", label: "Status", type: "status" },
    { key: "eligibleStudents", label: "Eligible" },
    { key: "attemptCount", label: "Started" },
    { key: "submittedCount", label: "Submitted" },
    { key: "absentCount", label: "Absent", type: "danger" },
    { key: "participationRate", label: "Participation", type: "percent" },
    { key: "averageFinalScore", label: "Average", type: "score" },
  ];
}

function normalizeRows(value) {
  return Array.isArray(value) ? value : [];
}

function cleanParams(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== "" && entry != null),
  );
}

function buildFilteredExamOptions(exams, filters) {
  return normalizeRows(exams).filter((exam) => {
    if (filters.courseOfferingId && exam.courseOfferingId !== filters.courseOfferingId) return false;
    if (filters.academicYear && exam.academicYear !== filters.academicYear) return false;
    if (filters.semesterNo && String(exam.semesterNo || "") !== String(filters.semesterNo)) return false;
    if (filters.assessmentCategory && exam.assessmentType !== filters.assessmentCategory) return false;
    if (filters.officialExamPeriod && exam.examPeriod !== filters.officialExamPeriod) return false;
    if (filters.status && exam.status !== filters.status) return false;
    return true;
  });
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(formatCsvValue(row[column.key], column))).join(","))
    .join("\n");
  const blob = new Blob([[header, body].filter(Boolean).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatCsvValue(value, column) {
  if (column.type === "date") return formatDate(value);
  if (column.type === "status") return value ? "Published" : "Draft";
  if (column.type === "score") return value == null ? "" : Number(value).toFixed(2);
  if (column.type === "percent") return value == null ? "" : `${Number(value).toFixed(2)}%`;
  if (column.type === "attention") return value ? "Needs attention" : "Stable";
  return value ?? "";
}

function csvEscape(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function formatOffering(offering) {
  const course = offering.course?.code
    ? `${offering.course.code} - ${offering.course.name || "Course"}`
    : offering.course?.name || "Course";
  const term = offering.term?.code || offering.term?.name || "Term";
  const section = offering.sectionCode || "-";
  return `${course} / ${term} / Section ${section}`;
}

function formatExamOption(exam) {
  const course = exam.courseCode ? `${exam.courseCode} - ` : "";
  return `${course}${exam.title}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function readApiMessage(err) {
  return err?.response?.data?.message ||
    (typeof err?.response?.data === "string" ? err.response.data : null) ||
    err?.message;
}
