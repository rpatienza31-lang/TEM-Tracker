"use client";

import { useMemo, useState } from "react";

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

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CatalogWizard({ terms, subjects }: { terms: Term[]; subjects: Subject[] }) {
  const [termId, setTermId] = useState(terms[0]?.id ?? "");
  const [grades, setGrades] = useState<Set<number>>(new Set());
  const [subjectsByGrade, setSubjectsByGrade] = useState<Record<number, Set<string>>>({});
  const [cotByGrade, setCotByGrade] = useState<Record<number, Set<string>>>({});
  const [weeks, setWeeks] = useState<Set<number>>(new Set(WEEK_NUMBERS));
  const [startDate, setStartDate] = useState("");
  const [deadlines, setDeadlines] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<{ toCreate: number; toSkip: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [pending, setPending] = useState<"preview" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedGrades = useMemo(() => [...grades].sort((a, b) => a - b), [grades]);

  function toggleGrade(grade: number, checked: boolean) {
    setGrades((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(grade);
        setSubjectsByGrade((s) => ({ ...s, [grade]: s[grade] ?? new Set(subjects.map((sub) => sub.id)) }));
      } else {
        next.delete(grade);
      }
      return next;
    });
    setPreview(null);
    setResult(null);
  }

  function toggleSubject(grade: number, subjectId: string, checked: boolean) {
    setSubjectsByGrade((prev) => {
      const set = new Set(prev[grade] ?? []);
      if (checked) set.add(subjectId);
      else set.delete(subjectId);
      return { ...prev, [grade]: set };
    });
    setPreview(null);
    setResult(null);
  }

  function toggleCot(grade: number, subjectId: string, checked: boolean) {
    setCotByGrade((prev) => {
      const set = new Set(prev[grade] ?? []);
      if (checked) set.add(subjectId);
      else set.delete(subjectId);
      return { ...prev, [grade]: set };
    });
    setPreview(null);
    setResult(null);
  }

  function toggleWeek(week: number, checked: boolean) {
    setWeeks((prev) => {
      const next = new Set(prev);
      if (checked) next.add(week);
      else next.delete(week);
      return next;
    });
    setPreview(null);
    setResult(null);
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
      subjectsByGrade: Object.fromEntries(Object.entries(subjectsByGrade).map(([g, s]) => [g, [...s]])),
      cotByGrade: Object.fromEntries(Object.entries(cotByGrade).map(([g, s]) => [g, [...s]])),
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
          <CardDescription>Default: all active subjects for each selected grade. Uncheck COT for subjects with no observation tool.</CardDescription>
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
              <p className="mb-2 text-sm font-medium">Grade {grade}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {subjects.map((subject) => {
                  const checked = subjectsByGrade[grade]?.has(subject.id) ?? false;
                  const cotChecked = cotByGrade[grade]?.has(subject.id) ?? false;
                  return (
                    <div key={subject.id} className="flex items-center justify-between gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox checked={checked} onCheckedChange={(c) => toggleSubject(grade, subject.id, c === true)} />
                        {subject.name}
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Checkbox
                          disabled={!checked}
                          checked={cotChecked}
                          onCheckedChange={(c) => toggleCot(grade, subject.id, c === true)}
                        />
                        + COT
                      </label>
                    </div>
                  );
                })}
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
