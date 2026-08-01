import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';

import { Schedule } from './schedule';
import { ExplainApi, PlanningsolutionApi, PlanningSolutionViewModel } from '../api';

// NOTE: targets not-yet-existing production code. Until the SolutionEventsService module and the
// component's live-refresh wiring exist, this spec fails to compile / the behavioural assertions
// fail — the correct "red" state for spec-first TDD.
import { SolutionEventsService, SolutionChangedEvent } from '../shared/solution-events.service';

function solution(id: number): PlanningSolutionViewModel {
  return { id, talks: [], timeslots: [] };
}

const CHANGED: SolutionChangedEvent = {
  solutionId: 2452,
  hardScore: 0,
  softScore: -384,
  feasible: true,
  occurredAt: '2026-08-01T12:34:29.888478Z',
};

describe('Schedule (live SSE refresh)', () => {
  let fixture: ComponentFixture<Schedule>;
  let sut: Schedule;

  let getLatest: ReturnType<typeof vi.fn>;
  let events$: Subject<SolutionChangedEvent>;

  /** Builds the component after the mocks for this test have been arranged. */
  function createComponent(): void {
    TestBed.configureTestingModule({
      imports: [Schedule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PlanningsolutionApi, useValue: { getLatestPlanningSolution: getLatest } },
        { provide: ExplainApi, useValue: {} },
        { provide: SolutionEventsService, useValue: { events$: events$.asObservable() } },
      ],
    });

    fixture = TestBed.createComponent(Schedule);
    sut = fixture.componentInstance;
  }

  beforeEach(() => {
    getLatest = vi.fn();
    events$ = new Subject<SolutionChangedEvent>();
  });

  it('re-fetches the latest solution when a solution-changed event arrives', () => {
    // given an initial solution is loaded on construction
    getLatest.mockReturnValueOnce(of(solution(1))).mockReturnValueOnce(of(solution(2)));
    createComponent();
    expect(sut.solution()?.id).toBe(1);
    expect(getLatest).toHaveBeenCalledTimes(1);

    // when a live solution-changed event arrives
    events$.next(CHANGED);

    // then the component re-fetches and swaps in the new solution
    expect(getLatest).toHaveBeenCalledTimes(2);
    expect(sut.solution()?.id).toBe(2);
  });

  it('performs the live refresh silently — never flips loading back to true', () => {
    // given the initial load has resolved (spinner gone)
    const refresh$ = new Subject<PlanningSolutionViewModel>();
    getLatest.mockReturnValueOnce(of(solution(1))).mockReturnValueOnce(refresh$.asObservable());
    createComponent();
    expect(sut.loading()).toBe(false);

    // when an event triggers a refresh that is still in flight
    events$.next(CHANGED);

    // then loading stays false while the refresh is pending (no spinner flash on the projector)
    expect(sut.loading()).toBe(false);
    expect(sut.solution()?.id).toBe(1);

    // and when the refresh completes the schedule is swapped in place, still without a spinner
    refresh$.next(solution(2));
    refresh$.complete();
    expect(sut.loading()).toBe(false);
    expect(sut.solution()?.id).toBe(2);
  });

  it('keeps the on-screen schedule when a live refresh fails (transient blip)', () => {
    // given a solution is on screen
    getLatest
      .mockReturnValueOnce(of(solution(1)))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    createComponent();
    expect(sut.solution()?.id).toBe(1);

    // when a live refresh fails
    events$.next(CHANGED);

    // then the displayed schedule is preserved and no error state is shown
    expect(sut.solution()?.id).toBe(1);
    expect(sut.error()).toBeNull();
    expect(sut.loading()).toBe(false);
  });

  it('leaves the notFound state and shows the schedule when the first event arrives', () => {
    // given the component started with no solution yet (404 -> notFound)
    getLatest
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })))
      .mockReturnValueOnce(of(solution(7)));
    createComponent();
    expect(sut.notFound()).toBe(true);
    expect(sut.solution()).toBeNull();

    // when the solver finishes and pushes its first event
    events$.next(CHANGED);

    // then notFound clears and the freshly-solved schedule appears by itself
    expect(sut.notFound()).toBe(false);
    expect(sut.solution()?.id).toBe(7);
  });

  it('stops refreshing once the component is destroyed', () => {
    // given a live-wired component
    getLatest.mockReturnValue(of(solution(1)));
    createComponent();
    expect(getLatest).toHaveBeenCalledTimes(1);

    // when it is destroyed and a further event arrives
    fixture.destroy();
    events$.next(CHANGED);

    // then the SSE subscription was torn down (takeUntilDestroyed) — no extra fetch
    expect(getLatest).toHaveBeenCalledTimes(1);
  });
  it('never lets a slow earlier refresh overwrite a newer one', () => {
    // given an initial solution, then a live refresh that is still in flight
    const slow$ = new Subject<PlanningSolutionViewModel>();
    getLatest
      .mockReturnValueOnce(of(solution(1)))
      .mockReturnValueOnce(slow$.asObservable())
      .mockReturnValueOnce(of(solution(3)));
    createComponent();
    events$.next(CHANGED);
    expect(sut.solution()?.id).toBe(1);

    // when a second event resolves first, and only then the stale one responds
    events$.next(CHANGED);
    expect(sut.solution()?.id).toBe(3);
    slow$.next(solution(2));
    slow$.complete();

    // then the stale response is discarded — the newest solution stays on screen
    expect(sut.solution()?.id).toBe(3);
  });

  it('shows every talk sharing a timeslot instead of silently dropping one', () => {
    // given an infeasible solution where two talks were assigned the same timeslot
    const timeslot = { id: 10, room: 'Toucan', start: '09:00', end: '09:45', seats: 120 };
    getLatest.mockReturnValueOnce(
      of({
        id: 1,
        timeslots: [timeslot],
        talks: [
          { id: 1, title: 'First', timeslot },
          { id: 2, title: 'Second', timeslot },
        ],
      } as unknown as PlanningSolutionViewModel),
    );

    // when the schedule grid is built
    createComponent();
    const cell = sut.grid()[0].cells[0];

    // then both talks are present in that cell, so neither disappears from the timetable
    expect(cell?.talks.map((t) => t.id)).toEqual([1, 2]);
  });
});
