import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { App } from './app';
import { PlanningsolutionApi } from './api';

describe('App', () => {
  let planningApi: { startPlanningSolution: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    planningApi = { startPlanningSolution: vi.fn().mockReturnValue(of(undefined)) };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: PlanningsolutionApi, useValue: planningApi },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    // given / when
    const fixture = TestBed.createComponent(App);

    // then
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the application title and navigation', async () => {
    // given
    const fixture = TestBed.createComponent(App);

    // when
    await fixture.whenStable();

    // then
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain(
      'Conference Schedule Optimizer',
    );
    expect(compiled.querySelector('a[href="/schedule"]')).toBeTruthy();
    expect(compiled.querySelector('a[href="/presets"]')).toBeTruthy();
  });

  it('should trigger a solve when "Optimize now" is clicked', async () => {
    // given
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.optimize-btn',
    ) as HTMLButtonElement;

    // when
    button.click();
    await fixture.whenStable();

    // then
    expect(planningApi.startPlanningSolution).toHaveBeenCalledTimes(1);
  });
});
