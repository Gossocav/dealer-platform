import { test, expect } from '@playwright/test';

test('vehicles functional real flow', async ({ page }) => {
  test.setTimeout(240000);

  const baseUrl = 'http://localhost:3000';
  const now = Date.now();
  const email = `vehicle.smoke.${now}@example.com`;
  const password = 'Test1234!';
  const company = `Dealer Vehicle Smoke ${now}`;
  const vat = `IT${String(now).slice(-11).padStart(11, '0')}`;
  const uniq = String(now).slice(-6);
  const brand = `SmokeBrand${uniq}`;
  const model = `SmokeModel${uniq}`;

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  // 1) Registrazione/Login dealer test
  await page.goto(`${baseUrl}/registrazione`);
  await page.getByLabel('Ragione sociale').fill(company);
  await page.getByLabel('Partita IVA').fill(vat);
  await page.getByLabel('Referente').fill('Vehicle Tester');
  await page.getByLabel('Email commerciale').fill(email);
  await page.getByLabel('Telefono').fill('+39000111000');
  await page.getByLabel('Numero WhatsApp').fill('+39000111000');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Conferma password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crea account' }).click();

  await expect
    .poll(
      async () => {
        const path = new URL(page.url()).pathname;
        if (path === '/dashboard' || path.startsWith('/dashboard/')) {
          return 'dashboard';
        }

        const successLocator = page.locator('.border-emerald-200.bg-emerald-50');
        if ((await successLocator.count()) > 0) {
          const successMessage = (await successLocator.first().textContent()) ?? '';
          if (successMessage.toLowerCase().includes('effettua il login')) {
            return 'login-required';
          }
        }

        const errorLocator = page.locator('.border-red-200.bg-red-50');
        if ((await errorLocator.count()) > 0) {
          const serverError = ((await errorLocator.first().textContent()) ?? '').trim();
          if (serverError) {
            return `error:${serverError}`;
          }
        }

        return 'pending';
      },
      { timeout: 30000 }
    )
    .not.toBe('pending');

  const registrationOutcome = await (async () => {
    const path = new URL(page.url()).pathname;
    if (path === '/dashboard' || path.startsWith('/dashboard/')) {
      return 'dashboard';
    }

    const successLocator = page.locator('.border-emerald-200.bg-emerald-50');
    if ((await successLocator.count()) > 0) {
      const successMessage = (await successLocator.first().textContent()) ?? '';
      if (successMessage.toLowerCase().includes('effettua il login')) {
        return 'login-required';
      }
    }

    const errorLocator = page.locator('.border-red-200.bg-red-50');
    if ((await errorLocator.count()) > 0) {
      const serverError = ((await errorLocator.first().textContent()) ?? '').trim();
      if (serverError) {
        return `error:${serverError}`;
      }
    }

    return 'unknown';
  })();

  if (registrationOutcome === 'login-required') {
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await page.waitForURL(/\/dashboard$/);
  }

  if (registrationOutcome.startsWith('error:')) {
    throw new Error(`BLOCKER: registrazione dealer fallita: ${registrationOutcome.slice(6)}`);
  }

  // 2) Apertura lista veicoli
  await page.goto(`${baseUrl}/veicoli`);
  await expect(page.getByText('Gestisci il tuo parco auto')).toBeVisible();
  await expect(page.getByText('Caricamento veicoli in corso...')).toHaveCount(0);

  // 3) Creazione nuovo veicolo
  await page.getByRole('link', { name: 'Nuovo Veicolo' }).click();
  await expect(page.getByRole('heading', { name: 'Nuovo Veicolo' }).first()).toBeVisible();

  await page.getByLabel(/^Marca/).fill(brand);
  await page.getByLabel(/^Modello/).fill(model);
  await page.getByLabel(/^Versione/).fill('1.0 Test Edition');
  await page.getByLabel(/^Cilindrata/).fill('1600');
  await page.getByLabel(/^Potenza kW/).fill('88');
  await page.getByLabel(/^Potenza CV/).fill('120');
  await page.getByLabel('Porte *').fill('5');
  await page.getByLabel(/^Data immatricolazione/).fill('2022-05-10');
  await page.getByLabel(/^Colore/).selectOption({ index: 1 });
  await page.getByLabel('Interni *').selectOption({ index: 1 });
  await page.getByLabel('Prezzo *').fill('15900');
  await page.getByLabel('Chilometri *').fill('24500');
  await page.getByLabel('Alimentazione *').selectOption('Benzina');
  await page.getByLabel('Cambio *').selectOption('Manuale');
  await page.getByLabel('Provincia *').selectOption('RM');
  await page.getByLabel('Citta *').fill('Roma');
  await page
    .getByLabel(/^Descrizione/)
    .fill('Veicolo di test funzionale Playwright con descrizione completa, tagliandi certificati, unico proprietario e pronta consegna.');
  await page.getByRole('button', { name: 'Crea veicolo' }).click();

  await page.waitForURL(/\/veicoli\/[0-9a-f-]+$/i);

  const currentUrl = page.url();
  const vehicleId = currentUrl.split('/').filter(Boolean).pop();
  if (!vehicleId) throw new Error('BLOCKER: impossibile leggere vehicleId dalla URL dettaglio.');

  // 5) Apertura dettaglio veicolo
  await expect(page.getByRole('heading', { name: new RegExp(`${brand} ${model}`) })).toBeVisible();
  await expect(page.getByText('Salute veicolo')).toBeVisible();

  // 7) Verifica health score / blocco pubblicazione se incompleto (senza immagini)
  await expect(page.getByText('Non pubblicabile')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pubblica' })).toBeDisabled();

  // 6) Modifica veicolo
  await page.getByRole('link', { name: 'Modifica' }).click();
  await page.waitForURL(/\/veicoli\/modifica\//);
  await page.getByLabel(/^Versione/).fill('1.0 Test Edition Updated');
  await page.getByLabel('Prezzo *').fill('16900');

  // Completa requisito di pubblicazione caricando almeno un'immagine
  const png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgUyGJ6wAAAAASUVORK5CYII=';
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles([
    {
      name: 'vehicle-test-1.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png1x1, 'base64'),
    },
    {
      name: 'vehicle-test-2.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png1x1, 'base64'),
    },
    {
      name: 'vehicle-test-3.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png1x1, 'base64'),
    },
  ]);

  await page.getByLabel('Stato *').selectOption('published');
  await page.getByRole('button', { name: 'Salva modifiche' }).click();

  // 8) Pubblicazione se dati completi
  await page.waitForURL(/\/veicoli\/[0-9a-f-]+$/i);
  await expect(page.getByRole('button', { name: 'Passa a bozza' })).toBeVisible();
  await expect(page.getByText('Pubblicabile')).toBeVisible();

  // 9) Ritiro pubblicazione
  await page.getByRole('button', { name: 'Passa a bozza' }).click();
  await expect(page.getByRole('button', { name: 'Pubblica' })).toBeVisible();

  // 4) Verifica che appaia in lista
  await page.goto(`${baseUrl}/veicoli`);
  const tile = page.locator('tr,article').filter({ hasText: `${brand} ${model}` }).first();
  await expect(tile).toBeVisible();

  // 10) Duplicazione veicolo
  const before = await page.locator('tr,article').filter({ hasText: brand }).count();
  await tile.getByRole('button', { name: 'Duplica' }).click();
  await expect
    .poll(async () => await page.locator('tr,article').filter({ hasText: brand }).count(), {
      timeout: 12000,
    })
    .toBeGreaterThan(before);

  // 11) Eliminazione/archiviazione veicolo (test su duplicato appena creato)
  const candidates = page.locator('tr,article').filter({ hasText: brand });
  const candidateCount = await candidates.count();
  if (candidateCount < 2) {
    throw new Error(`BLOCKER: attesi almeno 2 veicoli dopo duplicazione, trovati ${candidateCount}`);
  }

  const duplicateTile = candidates.nth(1);
  await duplicateTile.getByRole('button', { name: 'Elimina' }).click();

  await expect
    .poll(async () => await page.locator('tr,article').filter({ hasText: brand }).count(), {
      timeout: 12000,
    })
    .toBe(candidateCount - 1);

  // 12) Assenza errori rossi o crash
  await expect(page.getByText(/Pubblicazione bloccata:/i)).toHaveCount(0);
  await expect(page.getByText(/Errore(\s|:|$)/i)).toHaveCount(0);
  await expect(page).not.toHaveURL(/error|500/i);
});
