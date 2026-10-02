import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const DEMOS = ['vanilla', 'vue', 'svelte', 'react', 'angular'];
const API = 'https://hub-demo.test';
const TOKEN = 'hub-demo-smoke-token';
const hubVersion = JSON.parse(
    readFileSync(new URL('../react/package.json', import.meta.url), 'utf8'),
).dependencies['@stackone/hub'];
const installedVersion = JSON.parse(
    readFileSync(new URL('../react/node_modules/@stackone/hub/package.json', import.meta.url), 'utf8'),
).version;
const CDN = `https://unpkg.com/@stackone/hub@${hubVersion}/dist/webcomponent.js`;
const bundle = readFileSync(
    new URL('../react/node_modules/@stackone/hub/dist/webcomponent.js', import.meta.url),
);

if (!/^\d+\.\d+\.\d+$/.test(hubVersion) || installedVersion !== hubVersion) {
    throw new Error('Hub must be exactly pinned and installed before the browser tests run.');
}

const integration = {
    active: true,
    name: 'Fixture Connector',
    provider: 'fixture',
    type: 'hris',
    version: '1',
    authentication_config_key: 'api_key',
    environment: 'production',
    integration_id: 'fixture-custom',
    logo_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
};
const connector = {
    config: {
        key: 'fixture',
        name: 'Fixture Connector',
        type: 'custom',
        configFields: [{
            key: 'api_key',
            label: 'Fixture API key',
            type: 'password',
            required: true,
            readOnly: false,
            secret: true,
            placeholder: 'Synthetic value',
        }],
    },
    hub_settings: { configured_webhook_events: {}, project_settings: {} },
};
const oauthConnector = {
    ...connector,
    config: { ...connector.config, type: 'oauth2', configFields: [] },
};

const mockHub = async (page, baseURL, connectorResponse = connector) => {
    const oauth = connectorResponse.config.type === 'oauth2';
    const requests = [];
    const unexpectedRequests = [];
    const pageErrors = [];
    let oauthStatus = 'pending';
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.context().on('page', (popup) => {
        popup.on('pageerror', (error) => pageErrors.push(error.message));
    });
    await page.context().route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === new URL(baseURL).origin) {
            await route.continue();
            return;
        }
        if (url.href === CDN) {
            await route.fulfill({ contentType: 'application/javascript', body: bundle });
            return;
        }
        if (url.origin === API) {
            const headers = {
                'access-control-allow-origin': new URL(baseURL).origin,
                'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
                'access-control-allow-headers': 'content-type, x-hub-session-token, x-hub-version',
            };
            if (request.method() === 'OPTIONS') {
                await route.fulfill({ status: 204, headers });
                return;
            }
            requests.push(request);
            const respond = (json, status = 200) => route.fulfill({ status, headers, json });
            if (oauth && request.method() === 'GET' && url.pathname === '/connect/oauth2/fixture-custom') {
                await route.fulfill({
                    contentType: 'text/html',
                    body: '<!doctype html><title>Fixture OAuth</title><link rel="icon" href="data:,"><p>Fixture provider sign-in</p>',
                });
                return;
            }
            if (request.headers()['x-hub-session-token'] !== TOKEN) {
                await respond({ statusCode: 401, message: 'Synthetic token rejected' }, 401);
                return;
            }
            if (request.method() === 'GET' && url.pathname === '/hub/settings') {
                await respond({ enabled_features: [] });
                return;
            }
            if (request.method() === 'GET' && url.pathname === '/hub/connectors') {
                await respond({ integrations: [integration, {
                    ...integration,
                    name: 'Other Fixture',
                    provider: 'other-fixture',
                    integration_id: 'fixture-other',
                }] });
                return;
            }
            if (request.method() === 'GET' && url.pathname === '/hub/connectors/fixture-custom') {
                await respond(connectorResponse);
                return;
            }
            if (oauth && request.method() === 'POST' && url.pathname === '/hub/connection_attempts') {
                await respond({ id: 'fixture-attempt' });
                return;
            }
            if (oauth && url.pathname === '/hub/connection_attempts/fixture-attempt') {
                if (request.method() === 'GET') {
                    await respond({
                        status: oauthStatus,
                        account: oauthStatus === 'authenticated' ? { id: 'fixture-oauth-account' } : null,
                        error: null,
                    });
                    return;
                }
                if (request.method() === 'DELETE') {
                    await route.fulfill({ status: 204, headers });
                    return;
                }
            }
            if (request.method() === 'POST' && url.pathname === '/hub/accounts') {
                await respond({ id: 'fixture-account', provider: 'fixture' });
                return;
            }
        }
        unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort();
    });
    return {
        requests,
        unexpectedRequests,
        pageErrors,
        completeOAuth: () => { oauthStatus = 'authenticated'; },
    };
};

for (const demo of DEMOS) {
    test(`${demo}: renders, connects, forwards events and preserves controls`, async ({ page, baseURL }) => {
        const observed = await mockHub(page, baseURL);
        await page.goto('/');
        await page.locator(`a[href="./${demo}/"]`).click();
        await expect(page).toHaveURL(new URL(`/${demo}/`, baseURL).href);
        const hub = page.locator('stackone-hub');
        const tokenInput = page.getByLabel('Token', { exact: true });
        const baseInput = page.getByLabel('Base URL', { exact: true });
        const emptyMessage = hub.getByText('No token provided', { exact: true });
        await expect(emptyMessage).toBeVisible();
        expect(observed.requests).toHaveLength(0);

        const readColors = () => emptyMessage.evaluate((element) => ({
            foreground: getComputedStyle(element).color,
            background: getComputedStyle(document.documentElement).getPropertyValue('--malachite-card-background'),
        }));
        const lightColors = await readColors();
        await page.getByRole('button', { name: 'Dark', exact: true }).click();
        await expect.poll(readColors).not.toEqual(lightColors);
        await page.getByRole('button', { name: 'Light', exact: true }).click();
        await expect.poll(readColors).toEqual(lightColors);

        await baseInput.fill(API);
        await tokenInput.fill(TOKEN);
        await hub.getByRole('button', { name: /Fixture Connector/ }).click();
        const credentialInput = hub.getByLabel('Fixture API key', { exact: false });
        await expect(credentialInput).toBeVisible();
        await expect(hub.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();
        await credentialInput.fill('synthetic-credential');
        await credentialInput.blur();
        await hub.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect(hub.getByText('Connection Successful', { exact: true })).toBeVisible();
        const eventLog = page.locator('.events ol');
        await expect(eventLog.locator('li')).toHaveCount(1);
        await expect(eventLog).toContainText('success');
        await expect(eventLog).toContainText(/"id"\s*:\s*"fixture-account"/);
        await expect(eventLog).toContainText(/"provider"\s*:\s*"fixture"/);
        const accountRequests = observed.requests.filter((request) => new URL(request.url()).pathname === '/hub/accounts');
        expect(accountRequests).toHaveLength(1);
        expect(accountRequests[0].postDataJSON()).toEqual({
            integration_id: 'fixture-custom',
            credentials: { api_key: 'synthetic-credential' },
        });
        for (const request of observed.requests) {
            expect(request.headers()['x-hub-session-token']).toBe(TOKEN);
            expect(request.headers()['x-hub-version']).toBe(hubVersion);
        }
        await hub.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(eventLog.locator('li')).toHaveCount(2);
        await expect(eventLog.locator('li').first()).toContainText('close');
        await expect(eventLog.locator('li').nth(1)).toContainText('success');

        await page.reload();
        await expect(tokenInput).toHaveValue(TOKEN);
        await expect(baseInput).toHaveValue(API);
        await expect(hub.getByRole('button', { name: /Fixture Connector/ })).toBeVisible();
        await tokenInput.clear();
        await expect(emptyMessage).toBeVisible();
        expect(observed.unexpectedRequests).toEqual([]);
        expect(observed.pageErrors).toEqual([]);
    });

    test(`${demo}: rejected token cannot connect an account`, async ({ page, baseURL }) => {
        const observed = await mockHub(page, baseURL);
        await page.goto(`/${demo}/`);
        await expect(page.locator('stackone-hub').getByText('No token provided')).toBeVisible();
        await page.getByLabel('Base URL', { exact: true }).fill(API);
        await page.getByLabel('Token', { exact: true }).fill('rejected-synthetic-token');
        await expect.poll(() => observed.requests.some((request) =>
            new URL(request.url()).pathname === '/hub/connectors' &&
            request.headers()['x-hub-session-token'] === 'rejected-synthetic-token',
        )).toBe(true);
        await expect(page.locator('stackone-hub').getByText('No configured integrations available.')).toBeVisible();
        await expect(page.locator('.events ol li')).toHaveCount(0);
        expect(observed.requests.some((request) => request.method() === 'POST')).toBe(false);
        expect(observed.unexpectedRequests).toEqual([]);
        expect(observed.pageErrors).toEqual([]);
    });

    for (const outcome of ['complete after popup closes', 'cancel']) {
        test(`${demo}: OAuth ${outcome}`, async ({ page, baseURL }) => {
            const observed = await mockHub(page, baseURL, oauthConnector);
            await page.goto(`/${demo}/`);
            await page.getByLabel('Base URL', { exact: true }).fill(API);
            await page.getByLabel('Token', { exact: true }).fill(TOKEN);
            const hub = page.locator('stackone-hub');
            await hub.getByRole('button', { name: /Fixture Connector/ }).click();
            const [popup] = await Promise.all([
                page.waitForEvent('popup'),
                hub.getByRole('button', { name: 'Connect', exact: true }).click(),
            ]);
            await expect(popup.getByText('Fixture provider sign-in')).toBeVisible();
            const popupUrl = new URL(popup.url());
            expect(popupUrl.origin).toBe(API);
            expect(popupUrl.pathname).toBe('/connect/oauth2/fixture-custom');
            expect(Object.fromEntries(popupUrl.searchParams)).toEqual({
                redirect_uri: 'https://app.stackone.com/embedded/accounts/callback',
                token: TOKEN,
                connection_attempt_id: 'fixture-attempt',
            });
            const attemptRequests = (method) => observed.requests.filter((request) =>
                request.method() === method &&
                new URL(request.url()).pathname.startsWith('/hub/connection_attempts'),
            );
            expect(attemptRequests('POST')).toHaveLength(1);
            expect(attemptRequests('POST')[0].postDataJSON()).toEqual({ token: TOKEN });
            await expect.poll(() => attemptRequests('GET').length).toBeGreaterThan(0);
            const eventLog = page.locator('.events ol');

            if (outcome === 'cancel') {
                await hub.getByRole('button', { name: 'Cancel and start over', exact: true }).click();
                await expect.poll(() => attemptRequests('DELETE').length).toBe(1);
                await expect.poll(() => popup.isClosed()).toBe(true);
                await expect(hub.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled();
                const pollsAtCancellation = attemptRequests('GET').length;
                // Observe one whole polling interval after cancellation to catch a surviving timer.
                await page.waitForTimeout(2100);
                expect(attemptRequests('GET')).toHaveLength(pollsAtCancellation);
                await expect(eventLog.locator('li')).toHaveCount(0);
            } else {
                const pollsBeforeClose = attemptRequests('GET').length;
                await popup.close();
                await expect.poll(() => attemptRequests('GET').length).toBeGreaterThan(pollsBeforeClose);
                observed.completeOAuth();
                await expect(hub.getByText('Connection Successful', { exact: true })).toBeVisible();
                await expect(eventLog.locator('li')).toHaveCount(1);
                await expect(eventLog).toContainText('success');
                await expect(eventLog).toContainText(/"id"\s*:\s*"fixture-oauth-account"/);
                await expect(eventLog).toContainText(/"provider"\s*:\s*"fixture"/);
                expect(attemptRequests('DELETE')).toHaveLength(0);
            }

            for (const request of observed.requests.filter((request) => new URL(request.url()).pathname.startsWith('/hub/'))) {
                expect(request.headers()['x-hub-session-token']).toBe(TOKEN);
                expect(request.headers()['x-hub-version']).toBe(hubVersion);
            }
            expect(observed.requests.some((request) => new URL(request.url()).pathname === '/hub/accounts')).toBe(false);
            expect(observed.unexpectedRequests).toEqual([]);
            expect(observed.pageErrors).toEqual([]);
        });
    }
}
