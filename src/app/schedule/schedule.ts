import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of, catchError, map, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import {
  ExplainApi,
  PlanningsolutionApi,
  PlanningSolutionViewModel,
  TalkViewModel,
  TimeslotViewModel,
  ConstraintMatchViewModel,
} from '../api';
import { SolutionEventsService } from '../shared/solution-events.service';

interface GridCell {
  timeslot: TimeslotViewModel;
  talk?: TalkViewModel;
}

interface GridRow {
  start: string;
  end?: string;
  cells: (GridCell | undefined)[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class Schedule {
  private readonly api = inject(PlanningsolutionApi);
  private readonly explainApi = inject(ExplainApi);
  private readonly solutionEvents = inject(SolutionEventsService);

  /** Refresh requests; the payload is whether the spinner should be shown. */
  private readonly refreshRequests = new Subject<boolean>();

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  readonly solution = signal<PlanningSolutionViewModel | null>(null);
  readonly selectedTalkId = signal<number | null>(null);

  // --- Explain / ask-the-planner conversation state ---
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly question = signal('');
  readonly asking = signal(false);
  readonly askError = signal<string | null>(null);
  readonly usedModel = signal<string | null>(null);
  private conversationId: string | null = null;

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
    // Refresh requests run through a single switchMap'd pipeline so an in-flight fetch is cancelled
    // when a newer one starts. Without it, a slow earlier GET could resolve last and overwrite a
    // newer solution with a stale one (initial load racing a live event, or two rapid events).
    this.refreshRequests
      .pipe(
        switchMap((showSpinner) =>
          this.api.getLatestPlanningSolution().pipe(
            map((solution) => ({
              showSpinner,
              solution,
              failure: null as HttpErrorResponse | null,
            })),
            catchError((failure: HttpErrorResponse) =>
              of({ showSpinner, solution: null, failure }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ showSpinner, solution, failure }) =>
        failure ? this.onFetchFailed(failure, showSpinner) : this.onFetchSucceeded(solution!),
      );

    this.load();

    // Live refresh: silently re-fetch the latest solution whenever the solver publishes a change.
    this.solutionEvents.events$.pipe(takeUntilDestroyed()).subscribe(() => this.fetch(false));
  }

  /** Public (re)load — shows the spinner while the initial/explicit fetch is in flight. */
  load(): void {
    this.fetch(true);
  }

  /**
   * Fetches the latest solution. When `showSpinner` is false the refresh is silent: `loading` is
   * never flipped to true and a failure keeps the currently displayed schedule (no error, no
   * blanking), so a live update never flashes a spinner or clears the screen mid-talk.
   */
  private fetch(showSpinner: boolean): void {
    if (showSpinner) {
      this.loading.set(true);
      this.notFound.set(false);
      this.error.set(null);
    }
    this.refreshRequests.next(showSpinner);
  }

  private onFetchSucceeded(solution: PlanningSolutionViewModel): void {
    this.solution.set(solution);
    this.notFound.set(false);
    this.error.set(null);
    this.loading.set(false);
  }

  private onFetchFailed(failure: HttpErrorResponse, showSpinner: boolean): void {
    if (!showSpinner) {
      // Transient blip on a live refresh — keep whatever is on screen.
      return;
    }
    this.loading.set(false);
    if (failure.status === 404) {
      this.notFound.set(true);
    } else {
      this.error.set('Failed to load the planning solution. Is the backend running?');
    }
  }

  selectTalk(talk: TalkViewModel | undefined): void {
    if (!talk) return;
    this.selectedTalkId.set(this.selectedTalkId() === talk.id ? null : talk.id);
  }

  clearSelection(): void {
    this.selectedTalkId.set(null);
  }

  askSuggested(text: string): void {
    this.question.set(text);
    this.ask();
  }

  ask(): void {
    const q = this.question().trim();
    const sol = this.solution();
    if (!q || this.asking() || !sol) return;

    this.chatMessages.update((msgs) => [...msgs, { role: 'user', text: q }]);
    this.question.set('');
    this.asking.set(true);
    this.askError.set(null);

    this.explainApi
      .explainPlanningSolution({
        question: q,
        planningSolutionId: sol.id,
        conversationId: this.conversationId ?? undefined,
      })
      .subscribe({
        next: (res) => {
          this.conversationId = res.conversationId;
          this.usedModel.set(res.model);
          this.chatMessages.update((msgs) => [...msgs, { role: 'assistant', text: res.answer }]);
          this.asking.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.asking.set(false);
          this.askError.set(
            err.status === 404
              ? 'No planning solution available to explain yet.'
              : 'Failed to get an answer. Is the backend (and OpenAI key) configured?',
          );
        },
      });
  }

  resetConversation(): void {
    this.conversationId = null;
    this.chatMessages.set([]);
    this.askError.set(null);
    this.usedModel.set(null);
  }

  hasHardViolation(talk: TalkViewModel | undefined): boolean {
    return !!talk?.score && talk.score.hardScore < 0;
  }

  isSelected(talk: TalkViewModel | undefined): boolean {
    return !!talk && this.selectedTalkId() === talk.id;
  }

  isPinned(talk: TalkViewModel | undefined): boolean {
    return !!talk && (talk.timePreset != null || talk.roomPreset != null);
  }

  /** Describes what a talk was pinned to, e.g. "Pinned to 09:00 · Room 1". */
  pinTooltip(talk: TalkViewModel | undefined): string {
    if (!this.isPinned(talk)) return '';
    const parts = [talk!.timePreset, talk!.roomPreset].filter((p) => p != null);
    return `Pinned to ${parts.join(' · ')}`;
  }

  formatDuration(min: number | undefined): string {
    return min != null ? `${min} min` : '';
  }
}
