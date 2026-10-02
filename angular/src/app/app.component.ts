import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

const TOKEN_KEY = 'stackone-hub-token';
const BASE_URL_KEY = 'stackone-hub-base-url';
const DEFAULT_BASE_URL = 'https://api.stackone.com';

interface LogEntry {
    at: string;
    label: string;
    detail?: unknown;
}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, FormsModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <header>
            <h1>stackone-hub — Angular 22</h1>
            <p>
                Standalone component + <code>CUSTOM_ELEMENTS_SCHEMA</code>.
                <a href="../">← back to demos</a>
            </p>
        </header>

        <section class="controls">
            <label>
                Token
                <input
                    type="text"
                    [(ngModel)]="token"
                    (ngModelChange)="persistToken()"
                    placeholder="paste connect-session token"
                />
            </label>
            <label>
                Base URL
                <input type="text" [(ngModel)]="baseUrl" (ngModelChange)="persistBaseUrl()" />
            </label>
            <div class="row">
                <button type="button" (click)="setTheme('light')">Light</button>
                <button type="button" (click)="setTheme('dark')">Dark</button>
            </div>
        </section>

        <stackone-hub
            [attr.token]="token || null"
            [attr.base-url]="baseUrl"
            mode="integration-picker"
            height="600px"
            [attr.theme]="theme"
            (success)="onSuccess($event)"
            (close)="onClose()"
        ></stackone-hub>

        <section class="events">
            <h2>Event log</h2>
            <ol>
                <li *ngFor="let event of events; let i = index">
                    [{{ event.at }}] {{ event.label }}
                    <span *ngIf="event.detail"> — {{ event.detail | json }}</span>
                </li>
            </ol>
        </section>
    `,
    styles: [
        `
            header h1 { margin: 0 0 4px; font-size: 20px; }
            header p { margin: 0 0 24px; color: #666; font-size: 14px; }
            header p a { color: #555; }
            .controls { display: grid; gap: 12px; margin-bottom: 24px; }
            .controls label { display: grid; gap: 4px; font-size: 13px; color: #444; }
            .controls input { padding: 8px 10px; border: 1px solid #d4d4d4; border-radius: 6px; font-size: 14px; }
            .row { display: flex; gap: 8px; }
            button { padding: 6px 12px; border: 1px solid #d4d4d4; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; }
            button:hover { background: #f5f5f5; }
            stackone-hub { display: block; margin-bottom: 24px; }
            .events h2 { font-size: 14px; margin: 0 0 8px; color: #444; }
            .events ol { list-style: none; padding: 0; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; background: #fafafa; }
            .events li { padding: 6px 10px; border-bottom: 1px solid #eee; }
            .events li:last-child { border-bottom: none; }
        `,
    ],
})
export class AppComponent {
    token = localStorage.getItem(TOKEN_KEY) ?? '';
    baseUrl = localStorage.getItem(BASE_URL_KEY) ?? DEFAULT_BASE_URL;
    theme: 'light' | 'dark' = 'light';
    events: LogEntry[] = [];

    onSuccess(event: Event) {
        this.events = [
            {
                at: new Date().toLocaleTimeString(),
                label: 'success',
                detail: (event as CustomEvent).detail,
            },
            ...this.events,
        ];
    }

    onClose() {
        this.events = [{ at: new Date().toLocaleTimeString(), label: 'close' }, ...this.events];
    }

    persistToken() {
        localStorage.setItem(TOKEN_KEY, this.token);
    }

    persistBaseUrl() {
        localStorage.setItem(BASE_URL_KEY, this.baseUrl);
    }

    setTheme(next: 'light' | 'dark') {
        this.theme = next;
    }
}
