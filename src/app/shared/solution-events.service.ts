import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, share } from 'rxjs';

/** Payload of a `solution-changed` server-sent event. */
export interface SolutionChangedEvent {
  solutionId: number;
  hardScore: number;
  softScore: number;
  feasible: boolean;
  occurredAt: string;
}

/** Factory that builds an {@link EventSource} for a given URL. */
export type EventSourceFactory = (url: string) => EventSource;

/**
 * Injectable factory for creating the underlying {@link EventSource}. Kept behind a token so the
 * service never reaches for the global `EventSource`/`window` directly and stays unit-testable.
 * The default builds a real browser `EventSource`.
 */
export const EVENT_SOURCE_FACTORY = new InjectionToken<EventSourceFactory>('EVENT_SOURCE_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => new EventSource(url),
});

const SSE_URL = '/v1/planningsolution/events';

@Injectable({ providedIn: 'root' })
export class SolutionEventsService {
  private readonly createEventSource = inject(EVENT_SOURCE_FACTORY);

  /**
   * Stream of `solution-changed` events. Lazily opens a single shared `EventSource` on the first
   * subscription, fans frames out to every consumer, and closes the connection only after the last
   * consumer unsubscribes. Malformed frames and native `error` events (fired on every ~5-minute
   * reconnect) are swallowed so the stream never terminates.
   */
  readonly events$: Observable<SolutionChangedEvent> = new Observable<SolutionChangedEvent>(
    (subscriber) => {
      const source = this.createEventSource(SSE_URL);

      const onSolutionChanged = (event: Event): void => {
        const data = (event as MessageEvent).data as string;
        try {
          subscriber.next(JSON.parse(data) as SolutionChangedEvent);
        } catch {
          // Swallow malformed JSON — keep the stream alive for later good frames.
        }
      };

      // Native EventSource errors happen on every reconnect; they must not end the subscription.
      const onError = (): void => {};

      source.addEventListener('solution-changed', onSolutionChanged);
      source.addEventListener('error', onError);

      return () => {
        source.removeEventListener('solution-changed', onSolutionChanged);
        source.removeEventListener('error', onError);
        source.close();
      };
    },
  ).pipe(share());
}
