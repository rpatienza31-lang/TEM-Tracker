"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ALL_GRADES, WEEK_NUMBERS } from "@/lib/constants";
import { previewCatalogAction, generateCatalogAction } from "./actions";
import type { CatalogGeneratorInput } from "@/lib/catalog/generator";

type Term = { id: string; name: string; schoolYear: string };
type Subject = { id: string; name: string; shortCode: string };
type GradeMap = Record<number, Set<string>>;

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toArrays(map: GradeMap): Record<number, string[]> {
  return Object.fromEntries(Object.entries(map).map(([g, s]) => [g, [...s]]));
}

export function CatalogWizard({ terms, subjects }: { terms: Term[]; subjects: Subject[] }) {
  const [termId, setTermId] = useState(terms[0]?.id ?? "");
  const [grades, setGrades] = useState<Set<number>>(new Set());
  const [dlpByGrade, setDlpByGrade] = useState<GradeMap>({});
  const [pptByGrade, setPptByGrade] = useState<GradeMap>({});
  const [weeks, setWeeks] = useState<Set<number>>(new Set(WEEK_NUMBERS));
  const [startDate, setStartDate] = useState("");
  const [deadlines, setDeadlines] = useState<Record<number, string>>({});
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

  function autofillDeadlines() {
    if (!startDate) return;
    const next: Record<number, string> = { ...deadlines };
    for (const week of [...weeks].sort((a, b) => a - b)) {
      next[week] = addDays(startDate, (week - 1) * 7);
    }
    setDeadlines(next);
  }

  function buildInput(): CatalogGeneratorInput | null {
    if (!termId || sortedGrades.length === 0) return null;
    const selectedWeeks = [...weeks].sort((a, b) => a - b);
    for (const week of selectedWeeks) {
      if (!deadlines[week]) return null;
    }
    return {
      termId,
      grades: sortedGrades,
      dlpByGrade: toArrays(dlpByGrade),
      pptByGrade: toArrays(pptByGrade),
      weeks: selectedWeeks.map((weekNumber) => ({ weekNumber, uploadDeadline: deadlines[weekNumber] })),
    };
  }

  async function handlePreview() {
    setError(null);
    const input = buildInput();
    if (!input) {
      setError("Select a term, at least one grade, and a deadline for every selected week.");
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
      setError("Select a term, at least one grade, and a deadline for every selected week.");
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
              <p className="mb-3 text-sm font-medium">Grade {grade}</p>
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
          <CardTitle>4. Weeks &amp; upload deadlines</CardTitle>
          <CardDescription>Default Weeks 1–10. Auto-fill sets each week 7 days after the previous.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="start-date">Week 1 deadline</Label>
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
            </div>
            <Button type="button" variant="secondary" onClick={autofillDeadlines} disabled={!startDate}>
              Auto-fill weekly
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {WEEK_NUMBERS.map((week) => (
              <div key={week} className="flex items-center gap-2">
                <label className="flex w-20 items-center gap-2 text-sm">
                  <Checkbox checked={weeks.has(week)} onCheckedChange={(c) => toggleWeek(week, c === true)} />
                  Week {week}
                </label>
                <Input
                  type="date"
                  disabled={!weeks.has(week)}
                  value={deadlines[week] ?? ""}
                  onChange={(e) => setDeadlines((prev) => ({ ...prev, [week]: e.target.value }))}
                />
              </div>
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
