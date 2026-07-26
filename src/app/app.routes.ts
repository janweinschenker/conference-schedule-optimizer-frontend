import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'schedule' },
  {
    path: 'schedule',
    title: 'Conference Schedule',
    loadComponent: () =>
      import('./schedule/schedule').then((m) => m.Schedule),
  },
  {
    path: 'presets',
    title: 'Presets',
    loadComponent: () =>
      import('./presets/presets').then((m) => m.Presets),
  },
  { path: '**', redirectTo: 'schedule' },
];
