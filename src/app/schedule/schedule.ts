import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import {
  PlanningsolutionApi,
  PlanningSolutionViewModel,
  TalkViewModel,
  TimeslotViewModel,
  ConstraintMatchViewModel,
} from '../api';

interface GridCell {
  timeslot: TimeslotViewModel;
  talk?: TalkViewModel;
}

interface GridRow {
  start: string;
  end?: string;
  cells: (GridCell | undefined)[];
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class Schedule {
  private readonly api = inject(PlanningsolutionApi);

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  readonly solution = signal<PlanningSolutionViewModel | null>(null);
  readonly selectedTalkId = signal<number | null>(null);

  readonly rooms = computed<string[]>(() => {
    const sol = this.solution();
    if (!sol) return [];
    const set = new Set<string>();
    for (const ts of sol.timeslots ?? []) {
      set.add(ts.room);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  readonly grid = computed<GridRow[]>(() => {
    const sol = this.solution();
    if (!sol) return [];
    const rooms = this.rooms();

    // Map talk by assigned timeslot id.
    const talkByTimeslot = new Map<number, TalkViewModel>();
    for (const talk of sol.talks ?? []) {
      if (talk.timeslot?.id != null) {
        talkByTimeslot.set(talk.timeslot.id, talk);
      }
    }

    // Group timeslots by start time.
    const rowMap = new Map<string, GridRow>();
    for (const ts of sol.timeslots ?? []) {
      const start = ts.start ?? '';
      let row = rowMap.get(start);
      if (!row) {
        row = { start, end: ts.end, cells: rooms.map(() => undefined) };
        rowMap.set(start, row);
      }
      const colIndex = rooms.indexOf(ts.room);
      if (colIndex >= 0) {
        row.cells[colIndex] = { timeslot: ts, talk: talkByTimeslot.get(ts.id) };
      }
    }

    return Array.from(rowMap.values()).sort((a, b) => a.start.localeCompare(b.start));
  });

  readonly unassignedTalks = computed<TalkViewModel[]>(() =>
    (this.solution()?.talks ?? []).filter((t) => t.timeslot?.id == null),
  );

  readonly solutionConstraints = computed<ConstraintMatchViewModel[]>(() =>
    [...(this.solution()?.constraintMatches ?? [])].sort(
      (a, b) => a.hardScore - b.hardScore || a.softScore - b.softScore,
    ),
  );

  readonly selectedTalk = computed<TalkViewModel | null>(() => {
    const id = this.selectedTalkId();
    if (id == null) return null;
    return (this.solution()?.talks ?? []).find((t) => t.id === id) ?? null;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.error.set(null);
    this.api.getLatestPlanningSolution().subscribe({
      next: (sol) => {
        this.solution.set(sol);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.error.set('Failed to load the planning solution. Is the backend running?');
        }
      },
    });
  }

  selectTalk(talk: TalkViewModel | undefined): void {
    if (!talk) return;
    this.selectedTalkId.set(this.selectedTalkId() === talk.id ? null : talk.id);
  }

  clearSelection(): void {
    this.selectedTalkId.set(null);
  }

  hasHardViolation(talk: TalkViewModel | undefined): boolean {
    return !!talk?.score && talk.score.hardScore < 0;
  }

  isSelected(talk: TalkViewModel | undefined): boolean {
    return !!talk && this.selectedTalkId() === talk.id;
  }

  formatDuration(min: number | undefined): string {
    return min != null ? `${min} min` : '';
  }
}
