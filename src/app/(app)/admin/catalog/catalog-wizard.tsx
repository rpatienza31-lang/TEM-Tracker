"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ALL_GRADES, WEEK_NUMBERS } from "@/lib/constants";
import { previewCatalogAction, generateCatalogAction } from "./actions";
import type { CatalogGeneratorInput } from "@/lib/catalog/generator";

type Term = { id: string; name: string; schoolYear: string };
type Subject = { id: string; name: string; shortCode: string };
type GradeMap = Record<number, Set<string>>;

function toArrays(map: GradeMap): Record<number, string[]> {
  return Object.fromEntries(Object.entries(map).map(([g, s]) => [g, [...s]]));
}

export function CatalogWizard({ terms, subjects }: { terms: Term[]; subjects: Subject[] }) {
  const [termId, setTermId] = useState(terms[0]?.id ?? "");
  const [grades, setGrades] = useState<Set<number>>(new Set());
  const [dlpByGrade, setDlpByGrade] = useState<GradeMap>({});
  const [pptByGrade, setPptByGrade] = useState<GradeMap>({});
  const [weeks, setWeeks] = useState<Set<number>>(new Set(WEEK_NUMBERS));
  const [preview, setPreview] = useState<{ toCreate: number; toSkip: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [pending, setPending] = useState<"preview" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedGrades = useMemo(() => [...grades].sort((a, b) => a - b), [grades]);

  function clearOutput() {
    setPreview(null);
    setResult(null);
  }

  function toggleGrade(grade: number, checked: boolean) {
    setGrades((prev) => {
      const next = new Set(prev);
      if (checked) next.add(grade);
      else next.delete(grade);
      return next;
    });
    if (checked) {
      // Default: every subject gets a DLP and a PPT (adjust per subject below).
      const all = () => new Set(subjects.map((s) => s.id));
      setDlpByGrade((s) => ({ ...s, [grade]: s[grade] ?? all() }));
      setPptByGrade((s) => ({ ...s, [grade]: s[grade] ?? all() }));
    }
    clearOutput();
  }

  function toggleIn(setter: Dispatch<SetStateAction<GradeMap>>, grade: number, subjectId: string, checked: boolean) {
    setter((prev) => {
      const set = new Set(prev[grade] ?? []);
      if (checked) set.add(subjectId);
      else set.delete(subjectId);
      return { ...prev, [grade]: set };
    });
    clearOutput();
  }

  function toggleWeek(week: number, checked: boolean) {
    setWeeks((prev) => {
      const next = new Set(prev);
      if (checked) next.add(week);
      else next.delete(week);
      return next;
    });
    clearOutput();
  }

  // Bulk-set a whole grade's subject deliverables so the owner doesn't tick each
  // subject one by one.
  function bulkGrade(grade: number, dlpOn: boolean, pptOn: boolean) {
    const all = () => new Set(subjects.map((s) => s.id));
    setDlpByGrade((s) => ({ ...s, [grade]: dlpOn ? all() : new Set() }));
    setPptByGrade((s) => ({ ...s, [grade]: pptOn ? all() : new Set() }));
    clearOutput();
  }

  function setAllWeeks(on: boolean) {
    setWeeks(on ? new Set(WEEK_NUMBERS) : new Set());
    clearOutput();
  }

  function buildInput(): CatalogGeneratorInput | null {
    if (!termId || sortedGrades.length === 0) return null;
    const selectedWeeks = [...weeks].sort((a, b) => a - b);
    if (selectedWeeks.length === 0) return null;
    return {
      termId,
      grades: sortedGrades,
      dlpByGrade: toArrays(dlpByGrade),
      pptByGrade: toArrays(pptByGrade),
      // Deadlines are set later, on the Work Board, when items are assigned.
      weeks: selectedWeeks.map((weekNumber) => ({ weekNumber })),
    };
  }

  async function handlePreview() {
    setError(null);
    const input = buildInput();
    if (!input) {
      setError("Select a term, at least one grade, and at least one week.");
      return;
    }
    setPending("preview");
    try {
      const res = await previewCatalogAction(input);
      setPreview(res);
      setResult(null);
    } finally {
      setPending(null);
    }
  }

  async function handleGenerate() {
    setError(null);
    const input = buildInput();
    if (!input) {
      setError("Select a term, at least one grade, and at least one week.");
      return;
    }
    setPending("generate");
    try {
      const res = await generateCatalogAction(input);
      setResult(res);
      setPreview(null);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Term</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select a term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name} · {term.schoolYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2–3. Grades &amp; subjects per grade</CardTitle>
          <CardDescription>
            For each subject, tick the deliverables it needs — DLP, PPT, or both. Selecting a grade pre-ticks DLP and
            PPT for every subject; adjust as needed. Untick both to leave a subject out. (Customized orders are handled
            in the COT module, not here.)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {ALL_GRADES.map((grade) => (
              <label key={grade} className="flex items-center gap-2 text-sm">
                <Checkbox checked={grades.has(grade)} onCheckedChange={(c) => toggleGrade(grade, c === true)} />
                Grade {grade}
              </label>
            ))}
          </div>

          {sortedGrades.length > 0 && <Separator />}

          {sortedGrades.map((grade) => (
            <div key={grade} className="rounded-md border border-border p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Grade {grade}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <BulkBtn onClick={() => bulkGrade(grade, true, true)}>Check all</BulkBtn>
                  <BulkBtn onClick={() => bulkGrade(grade, false, false)}>Uncheck all</BulkBtn>
                  <BulkBtn onClick={() => bulkGrade(grade, true, false)}>DLP only</BulkBtn>
                  <BulkBtn onClick={() => bulkGrade(grade, false, true)}>PPT only</BulkBtn>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {subjects.map((subject) => (
                  <div key={subject.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/50 pb-2 text-sm last:border-b-0">
                    <span className="min-w-32 font-medium">{subject.name}</span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <TypeCheck
                        label="DLP"
                        checked={dlpByGrade[grade]?.has(subject.id) ?? false}
                        onChange={(c) => toggleIn(setDlpByGrade, grade, subject.id, c)}
                      />
                      <TypeCheck
                        label="PPT"
                        checked={pptByGrade[grade]?.has(subject.id) ?? false}
                        onChange={(c) => toggleIn(setPptByGrade, grade, subject.id, c)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Weeks</CardTitle>
          <CardDescription>
            Pick which weeks to generate (default Weeks 1–10). Deadlines are no longer set here — you set an item&apos;s
            deadline on the Work Board when you assign it, and that date is what places it on the Project Schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <BulkBtn onClick={() => setAllWeeks(true)}>Check all</BulkBtn>
            <BulkBtn onClick={() => setAllWeeks(false)}>Uncheck all</BulkBtn>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {WEEK_NUMBERS.map((week) => (
              <label key={week} className="flex items-center gap-2 text-sm">
                <Checkbox checked={weeks.has(week)} onCheckedChange={(c) => toggleWeek(week, c === true)} />
                Week {week}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={handlePreview} disabled={pending !== null}>
          {pending === "preview" ? "Calculating…" : "5–6. Preview"}
        </Button>
        <Button type="button" onClick={handleGenerate} disabled={pending !== null}>
          {pending === "generate" ? "Generating…" : "7. Generate"}
        </Button>
        {preview && (
          <p className="text-sm text-muted-foreground">
            This will create <strong>{preview.toCreate}</strong> new work items and skip{" "}
            <strong>{preview.toSkip}</strong> duplicates.
          </p>
        )}
        {result && (
          <p className="text-sm text-status-approved">
            Created {result.created} work items, skipped {result.skipped} that already existed.
          </p>
        )}
      </div>
    </div>
  );
}

/** Small pill button for the bulk check/uncheck shortcuts. */
function BulkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-input px-2.5 py-1 text-xs font-medium hover:bg-accent"
    >
      {children}
    </button>
  );
}

function TypeCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-sm">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      {label}
    </label>
  );
}
