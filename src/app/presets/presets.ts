import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
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

@Component({
  selector: 'app-presets',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
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
  protected readonly timeslotRows = computed<TimeslotPresetViewModel[]>(() => {
    const rows = this.timeslots();
    return this.editingTimeslotId() === NEW_ID
      ? [{ id: NEW_ID, room: '', seats: 0 } as TimeslotPresetViewModel, ...rows]
      : rows;
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
  protected readonly talkRows = computed<TalkPresetViewModel[]>(() => {
    const rows = this.talks();
    return this.editingTalkId() === NEW_ID
      ? [{ id: NEW_ID, title: '' } as TalkPresetViewModel, ...rows]
      : rows;
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

  // ==== Helpers ===========================================================

  private confirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialog, { data, width: '360px' }).afterClosed();
  }

  private fail(message: string, cleanup?: () => void): void {
    cleanup?.();
    this.snackBar.open(message, 'Dismiss', { duration: 4000 });
  }
}
