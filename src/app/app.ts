import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PlanningsolutionApi } from './api';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly planningApi = inject(PlanningsolutionApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly optimizing = signal(false);

  protected optimizeNow(): void {
    if (this.optimizing()) {
      return;
    }
    this.optimizing.set(true);
    this.planningApi.startPlanningSolution().subscribe({
      next: () => {
        this.optimizing.set(false);
        this.snackBar.open(
          'Optimization started. The schedule will update once it finishes.',
          'OK',
          { duration: 4000 },
        );
      },
      error: (err: HttpErrorResponse) => {
        this.optimizing.set(false);
        this.snackBar.open(
          `Could not start optimization${err.status ? ` (HTTP ${err.status})` : ''}.`,
          'Dismiss',
          { duration: 4000 },
        );
      },
    });
  }
}
