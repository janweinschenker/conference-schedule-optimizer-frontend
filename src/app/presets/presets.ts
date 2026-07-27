import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

import {
  PresetApi,
  TalkPresetRequest,
  TalkPresetViewModel,
  TimeslotPresetRequest,
  TimeslotPresetViewModel,
} from '../api';
import { ConfirmDialog, ConfirmDialogData } from '../shared/confirm-dialog/confirm-dialog';

const NEW_ID = -1;

type CellValue = string | number | boolean;

@Component({
  selector: 'app-presets',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatCardModule,
    MatProgressBarModule,
  ],
  templateUrl: './presets.html',
  styleUrl: './presets.scss',
})
export class Presets implements OnInit {
  private readonly api = inject(PresetApi);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  protected readonly newId = NEW_ID;

  // ---- Timeslot presets ----
  protected readonly timeslots = signal<TimeslotPresetViewModel[]>([]);
  protected readonly editingTimeslotId = signal<number | null>(null);
  protected readonly timeslotLoading = signal(false);
  protected readonly timeslotColumns = [
    'room',
    'start',
    'end',
    'seats',
    'beamer',
    'flipchart',
    'actions',
  ];
  private readonly timeslotBooleanColumns = ['beamer', 'flipchart'];
  protected readonly timeslotSort = signal<Sort>({ active: '', direction: '' });
  protected readonly timeslotFilters = signal<Record<string, string>>({});
  protected readonly hasTimeslotFilters = computed(() =>
    Object.values(this.timeslotFilters()).some((v) => v !== ''),
  );
  private readonly timeslotValue = (row: TimeslotPresetViewModel, col: string): CellValue => {
    switch (col) {
      case 'room':
        return row.room ?? '';
      case 'start':
        return row.start ?? '';
      case 'end':
        return row.end ?? '';
      case 'seats':
        return row.seats;
      case 'beamer':
        return row.beamerAvailable ?? false;
      case 'flipchart':
        return row.flipchartAvailable ?? false;
      default:
        return '';
    }
  };
  protected readonly timeslotRows = computed<TimeslotPresetViewModel[]>(() => {
    const filtered = this.timeslots().filter((r) =>
      this.matchesFilters(r, this.timeslotFilters(), this.timeslotValue, this.timeslotBooleanColumns),
    );
    const sorted = this.sortRows(filtered, this.timeslotSort(), this.timeslotValue);
    return this.editingTimeslotId() === NEW_ID
      ? [{ id: NEW_ID, room: '', seats: 0 } as TimeslotPresetViewModel, ...sorted]
      : sorted;
  });
  protected timeslotForm: FormGroup = this.buildTimeslotForm();

  // ---- Talk presets ----
  protected readonly talks = signal<TalkPresetViewModel[]>([]);
  protected readonly editingTalkId = signal<number | null>(null);
  protected readonly talkLoading = signal(false);
  protected readonly talkColumns = [
    'title',
    'speaker',
    'duration',
    'favorites',
    'beamer',
    'flipchart',
    'actions',
  ];
  private readonly talkBooleanColumns = ['beamer', 'flipchart'];
  protected readonly talkSort = signal<Sort>({ active: '', direction: '' });
  protected readonly talkFilters = signal<Record<string, string>>({});
  protected readonly hasTalkFilters = computed(() =>
    Object.values(this.talkFilters()).some((v) => v !== ''),
  );
  private readonly talkValue = (row: TalkPresetViewModel, col: string): CellValue => {
    switch (col) {
      case 'title':
        return row.title ?? '';
      case 'speaker':
        return row.speaker ?? '';
      case 'duration':
        return row.durationMinutes ?? '';
      case 'favorites':
        return row.favorites ?? '';
      case 'beamer':
        return row.beamerRequired ?? false;
      case 'flipchart':
        return row.flipchartRequired ?? false;
      default:
        return '';
    }
  };
  protected readonly talkRows = computed<TalkPresetViewModel[]>(() => {
    const filtered = this.talks().filter((r) =>
      this.matchesFilters(r, this.talkFilters(), this.talkValue, this.talkBooleanColumns),
    );
    const sorted = this.sortRows(filtered, this.talkSort(), this.talkValue);
    return this.editingTalkId() === NEW_ID
      ? [{ id: NEW_ID, title: '' } as TalkPresetViewModel, ...sorted]
      : sorted;
  });
  protected talkForm: FormGroup = this.buildTalkForm();

  ngOnInit(): void {
    this.loadTimeslots();
    this.loadTalks();
  }

  // ==== Timeslot presets ==================================================

  private buildTimeslotForm(): FormGroup {
    return this.fb.group({
      room: ['', [Validators.required, Validators.minLength(1)]],
      start: [''],
      end: [''],
      seats: [0, [Validators.required, Validators.min(0)]],
      beamerAvailable: [false],
      flipchartAvailable: [false],
    });
  }

  private loadTimeslots(): void {
    this.timeslotLoading.set(true);
    this.api.getTimeslotPresets().subscribe({
      next: (rows) => {
        this.timeslots.set(rows);
        this.timeslotLoading.set(false);
      },
      error: () => this.fail('Could not load timeslot presets', () => this.timeslotLoading.set(false)),
    });
  }

  protected isEditingTimeslot(row: TimeslotPresetViewModel): boolean {
    return this.editingTimeslotId() === row.id;
  }

  protected addTimeslot(): void {
    if (this.editingTimeslotId() !== null) {
      return;
    }
    this.timeslotForm = this.buildTimeslotForm();
    this.editingTimeslotId.set(NEW_ID);
  }

  protected editTimeslot(row: TimeslotPresetViewModel): void {
    this.timeslotForm = this.buildTimeslotForm();
    this.timeslotForm.patchValue({
      room: row.room,
      start: row.start ?? '',
      end: row.end ?? '',
      seats: row.seats,
      beamerAvailable: row.beamerAvailable ?? false,
      flipchartAvailable: row.flipchartAvailable ?? false,
    });
    this.editingTimeslotId.set(row.id);
  }

  protected cancelTimeslot(): void {
    this.editingTimeslotId.set(null);
  }

  protected saveTimeslot(): void {
    if (this.timeslotForm.invalid) {
      this.timeslotForm.markAllAsTouched();
      return;
    }
    const request = this.timeslotForm.getRawValue() as TimeslotPresetRequest;
    const editingId = this.editingTimeslotId();
    if (editingId === NEW_ID) {
      this.api.createTimeslotPreset(request).subscribe({
        next: (created) => {
          this.timeslots.update((rows) => [created, ...rows]);
          this.editingTimeslotId.set(null);
          this.snackBar.open('Timeslot preset created', 'OK', { duration: 2500 });
        },
        error: () => this.fail('Could not create timeslot preset'),
      });
    } else if (editingId !== null) {
      this.api.updateTimeslotPreset(editingId, request).subscribe({
        next: (updated) => {
          this.timeslots.update((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
          this.editingTimeslotId.set(null);
          this.snackBar.open('Timeslot preset updated', 'OK', { duration: 2500 });
        },
        error: () => this.fail('Could not update timeslot preset'),
      });
    }
  }

  protected deleteTimeslot(row: TimeslotPresetViewModel): void {
    this.confirm({
      title: 'Delete timeslot preset',
      message: `Delete "${row.room}"? This cannot be undone.`,
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.deleteTimeslotPreset(row.id).subscribe({
        next: () => {
          this.timeslots.update((rows) => rows.filter((r) => r.id !== row.id));
          this.snackBar.open('Timeslot preset deleted', 'OK', { duration: 2500 });
        },
        error: () => this.fail('Could not delete timeslot preset'),
      });
    });
  }

  // ==== Talk presets ======================================================

  private buildTalkForm(): FormGroup {
    return this.fb.group({
      title: ['', [Validators.required, Validators.minLength(1)]],
      speaker: [''],
      durationMinutes: [null, [Validators.min(0)]],
      favorites: [null, [Validators.min(0)]],
      beamerRequired: [false],
      flipchartRequired: [false],
    });
  }

  private loadTalks(): void {
    this.talkLoading.set(true);
    this.api.getTalkPresets().subscribe({
      next: (rows) => {
        this.talks.set(rows);
        this.talkLoading.set(false);
      },
      error: () => this.fail('Could not load talk presets', () => this.talkLoading.set(false)),
    });
  }

  protected isEditingTalk(row: TalkPresetViewModel): boolean {
    return this.editingTalkId() === row.id;
  }

  protected addTalk(): void {
    if (this.editingTalkId() !== null) {
      return;
    }
    this.talkForm = this.buildTalkForm();
    this.editingTalkId.set(NEW_ID);
  }

  protected editTalk(row: TalkPresetViewModel): void {
    this.talkForm = this.buildTalkForm();
    this.talkForm.patchValue({
      title: row.title,
      speaker: row.speaker ?? '',
      durationMinutes: row.durationMinutes ?? null,
      favorites: row.favorites ?? null,
      beamerRequired: row.beamerRequired ?? false,
      flipchartRequired: row.flipchartRequired ?? false,
    });
    this.editingTalkId.set(row.id);
  }

  protected cancelTalk(): void {
    this.editingTalkId.set(null);
  }

  protected saveTalk(): void {
    if (this.talkForm.invalid) {
      this.talkForm.markAllAsTouched();
      return;
    }
    const request = this.talkForm.getRawValue() as TalkPresetRequest;
    const editingId = this.editingTalkId();
    if (editingId === NEW_ID) {
      this.api.createTalkPreset(request).subscribe({
        next: (created) => {
          this.talks.update((rows) => [created, ...rows]);
          this.editingTalkId.set(null);
          this.snackBar.open('Talk preset created', 'OK', { duration: 2500 });
        },
        error: () => this.fail('Could not create talk preset'),
      });
    } else if (editingId !== null) {
      this.api.updateTalkPreset(editingId, request).subscribe({
        next: (updated) => {
          this.talks.update((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
          this.editingTalkId.set(null);
          this.snackBar.open('Talk preset updated', 'OK', { duration: 2500 });
        },
        error: () => this.fail('Could not update talk preset'),
      });
    }
  }

  protected deleteTalk(row: TalkPresetViewModel): void {
    this.confirm({
      title: 'Delete talk preset',
      message: `Delete "${row.title}"? This cannot be undone.`,
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.deleteTalkPreset(row.id).subscribe({
        next: () => {
          this.talks.update((rows) => rows.filter((r) => r.id !== row.id));
          this.snackBar.open('Talk preset deleted', 'OK', { duration: 2500 });
        },
        error: () => this.fail('Could not delete talk preset'),
      });
    });
  }

  // ==== Sorting & filtering ==============================================

  protected onTimeslotSort(sort: Sort): void {
    this.timeslotSort.set(sort);
  }

  protected onTalkSort(sort: Sort): void {
    this.talkSort.set(sort);
  }

  protected setTimeslotFilter(column: string, value: string): void {
    this.timeslotFilters.update((f) => ({ ...f, [column]: value }));
  }

  protected setTalkFilter(column: string, value: string): void {
    this.talkFilters.update((f) => ({ ...f, [column]: value }));
  }

  protected timeslotFilterValue(column: string): string {
    return this.timeslotFilters()[column] ?? '';
  }

  protected talkFilterValue(column: string): string {
    return this.talkFilters()[column] ?? '';
  }

  protected resetTimeslotFilters(): void {
    this.timeslotFilters.set({});
    this.timeslotSort.set({ active: '', direction: '' });
  }

  protected resetTalkFilters(): void {
    this.talkFilters.set({});
    this.talkSort.set({ active: '', direction: '' });
  }

  private matchesFilters<T>(
    row: T,
    filters: Record<string, string>,
    valueFn: (row: T, col: string) => CellValue,
    booleanColumns: string[],
  ): boolean {
    return Object.entries(filters).every(([col, filter]) => {
      if (!filter) {
        return true;
      }
      const value = valueFn(row, col);
      if (booleanColumns.includes(col)) {
        return String(value) === filter;
      }
      return String(value).toLowerCase().includes(filter.toLowerCase());
    });
  }

  private sortRows<T>(rows: T[], sort: Sort, valueFn: (row: T, col: string) => CellValue): T[] {
    if (!sort.active || sort.direction === '') {
      return rows;
    }
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => factor * this.compare(valueFn(a, sort.active), valueFn(b, sort.active)),
    );
  }

  private compare(a: CellValue, b: CellValue): number {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return (a ? 1 : 0) - (b ? 1 : 0);
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  // ==== Helpers ===========================================================

  private confirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialog, { data, width: '360px' }).afterClosed();
  }

  private fail(message: string, cleanup?: () => void): void {
    cleanup?.();
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}
