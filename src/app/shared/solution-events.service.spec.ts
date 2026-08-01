import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Subscription } from 'rxjs';

// NOTE: These imports intentionally target production code that does not exist yet.
// Until `solution-events.service.ts` is implemented, this whole spec fails to compile
// (module resolution / missing exports) — which is the correct "red" state for spec-first TDD.
import {
  SolutionEventsService,
  SolutionChangedEvent,
  EVENT_SOURCE_FACTORY,
} from './solution-events.service';

/**
 * Minimal, test-driven fake for the browser `EventSource`, which does not exist in the
 * jsdom/Vitest environment. It supports the named-event listener API (`addEventListener`)
 * that the service is expected to use for the `solution-changed` event, lets the test push
 * frames synchronously, fire `error` events, and asserts `close()` was invoked.
 *
 * The service must obtain its EventSource via the injectable `EVENT_SOURCE_FACTORY` token
 * (a design constraint, so it never reaches for `window`/global `EventSource` directly and
 * stays unit-testable).
 */
class FakeEventSource {
  readyState = 0;
  closeCount = 0;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  private readonly listeners = new Map<string, Set<(e: Event) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, cb: (e: Event) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
  }

  removeEventListener(type: string, cb: (e: Event) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  close(): void {
    this.closeCount += 1;
    this.readyState = 2;
  }

  get closed(): boolean {
    return this.closeCount > 0;
  }

  // ---- test drivers ----

  /** Dispatch a named SSE event carrying a raw string `data` payload. */
  emit(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((cb) => cb(event));
    if (type === 'message') {
      this.onmessage?.(event);
    }
  }

  /** Fire a native `error` event (as EventSource does on every ~5-min reconnect). */
  emitError(): void {
    const event = new Event('error');
    this.listeners.get('error')?.forEach((cb) => cb(event));
    this.onerror?.(event);
  }
}

const SAMPLE: SolutionChangedEvent = {
  solutionId: 2452,
  hardScore: 0,
  softScore: -384,
  feasible: true,
  occurredAt: '2026-08-01T12:34:29.888478Z',
};

function frame(overrides: Partial<SolutionChangedEvent> = {}): string {
  return JSON.stringify({ ...SAMPLE, ...overrides });
}

describe('SolutionEventsService', () => {
  let created: FakeEventSource[];
  let sut: SolutionEventsService;

  beforeEach(() => {
    created = [];

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SolutionEventsService,
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string): EventSource => {
            const es = new FakeEventSource(url);
            created.push(es);
            return es as unknown as EventSource;
          },
        },
      ],
    });

    sut = TestBed.inject(SolutionEventsService);
  });

  it('is created', () => {
    // given / when the service is injected
    // then it exists
    expect(sut).toBeTruthy();
  });

  it('does not open a connection before anyone subscribes', () => {
    // given a freshly injected service
    // when nobody has subscribed to the stream
    // then no EventSource has been created (lazy connect)
    expect(created).toHaveLength(0);
  });

  it('opens an EventSource against the SSE endpoint on first subscribe', () => {
    // given a consumer
    // when it starts listening
    const sub = sut.events$.subscribe();

    // then exactly one EventSource is opened against the relative proxied URL
    expect(created).toHaveLength(1);
    expect(created[0].url).toBe('/v1/planningsolution/events');

    sub.unsubscribe();
  });

  it('parses a solution-changed frame into a typed SolutionChangedEvent', () => {
    // given a subscriber collecting events
    const received: SolutionChangedEvent[] = [];
    const sub = sut.events$.subscribe((e) => received.push(e));

    // when the server pushes a solution-changed frame
    created[0].emit('solution-changed', frame());

    // then the JSON data is parsed into the typed shape
    expect(received).toEqual([SAMPLE]);

    sub.unsubscribe();
  });

  it('does not emit for :ping heartbeats (no solution-changed listener fires)', () => {
    // given a subscriber
    const received: SolutionChangedEvent[] = [];
    const sub = sut.events$.subscribe((e) => received.push(e));

    // when only comment heartbeats arrive (modelled as a generic message, never a
    // 'solution-changed' named event)
    created[0].emit('message', '');

    // then nothing is delivered to the consumer
    expect(received).toEqual([]);

    sub.unsubscribe();
  });

  it('survives a malformed JSON frame and keeps delivering later good frames', () => {
    // given a subscriber tracking values, errors and completion
    const received: SolutionChangedEvent[] = [];
    let errored: unknown = null;
    let completed = false;
    const sub = sut.events$.subscribe({
      next: (e) => received.push(e),
      error: (err) => (errored = err),
      complete: () => (completed = true),
    });

    // when a broken payload arrives, followed by a valid one
    created[0].emit('solution-changed', '{ this is not json');
    created[0].emit('solution-changed', frame({ solutionId: 2453 }));

    // then the bad frame is swallowed, the stream stays alive, and the good frame lands
    expect(errored).toBeNull();
    expect(completed).toBe(false);
    expect(received).toEqual([{ ...SAMPLE, solutionId: 2453 }]);

    sub.unsubscribe();
  });

  it('does not terminate the subscription when EventSource fires an error (reconnect)', () => {
    // given a subscriber
    const received: SolutionChangedEvent[] = [];
    let errored: unknown = null;
    let completed = false;
    const sub = sut.events$.subscribe({
      next: (e) => received.push(e),
      error: (err) => (errored = err),
      complete: () => (completed = true),
    });

    // when the stream errors (as it does on every normal 5-minute reconnect)...
    created[0].emitError();
    // ...and then a good frame arrives after the browser reconnects
    created[0].emit('solution-changed', frame());

    // then the consumer never saw an error/complete and still receives events
    expect(errored).toBeNull();
    expect(completed).toBe(false);
    expect(received).toEqual([SAMPLE]);

    sub.unsubscribe();
  });

  it('closes the EventSource when the (only) consumer unsubscribes', () => {
    // given an open stream
    const sub = sut.events$.subscribe();
    expect(created[0].closed).toBe(false);

    // when the consumer unsubscribes
    sub.unsubscribe();

    // then the underlying connection is closed (no leak)
    expect(created[0].closed).toBe(true);
  });

  it('shares one connection across consumers and closes only after the last unsubscribes', () => {
    // given two concurrent consumers of the same stream
    const sub1 = sut.events$.subscribe();
    const sub2 = sut.events$.subscribe();

    // then a single EventSource is shared
    expect(created).toHaveLength(1);

    // when the first consumer leaves
    sub1.unsubscribe();
    // then the connection stays open for the remaining consumer
    expect(created[0].closed).toBe(false);

    // when the last consumer leaves
    sub2.unsubscribe();
    // then the connection is finally closed
    expect(created[0].closed).toBe(true);
  });

  it('fans a single frame out to all active subscribers', () => {
    // given two subscribers on the shared stream
    const a: SolutionChangedEvent[] = [];
    const b: SolutionChangedEvent[] = [];
    const subs = new Subscription();
    subs.add(sut.events$.subscribe((e) => a.push(e)));
    subs.add(sut.events$.subscribe((e) => b.push(e)));

    // when one frame is pushed on the shared connection
    created[0].emit('solution-changed', frame());

    // then both consumers receive it
    expect(a).toEqual([SAMPLE]);
    expect(b).toEqual([SAMPLE]);

    subs.unsubscribe();
  });
  it('opens a fresh connection when subscribed again after the last consumer left', () => {
    // given a connection that was opened and then fully released
    const first = sut.events$.subscribe();
    expect(created).toHaveLength(1);
    first.unsubscribe();
    expect(created[0].closed).toBe(true);

    // when a new consumer subscribes later
    const received: SolutionChangedEvent[] = [];
    const second = sut.events$.subscribe((e) => received.push(e));

    // then a brand-new EventSource is opened rather than reusing the closed one
    expect(created).toHaveLength(2);
    expect(created[1].closed).toBe(false);

    // and it delivers frames
    created[1].emit('solution-changed', frame());
    expect(received).toEqual([SAMPLE]);

    second.unsubscribe();
  });
});
