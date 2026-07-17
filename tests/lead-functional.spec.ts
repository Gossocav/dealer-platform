import { test, expect } from 'playwright/test';

test('lead functional real flow', async ({ page, request }) => {
  const baseUrl = 'http://127.0.0.1:3000';
  const now = Date.now();
  const email = `lead.smoke.${now}@example.com`;
  const password = 'Test1234!';
  const company = `Dealer Lead Smoke ${now}`;
  const vat = `IT${String(now).slice(-11).padStart(11, '0')}`;

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.goto(`${baseUrl}/registrazione`);
  await page.getByLabel('Ragione sociale').fill(company);
  await page.getByLabel('Partita IVA').fill(vat);
  await page.getByLabel('Referente').fill('Lead Tester');
  await page.getByLabel('Email commerciale').fill(email);
  await page.getByLabel('Telefono').fill('+39000111333');
  await page.getByLabel('Numero WhatsApp').fill('+39000111333');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Conferma password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.waitForURL(/\/dashboard$/);

  await page.goto(`${baseUrl}/lead`);
  await expect(page.getByRole('main').getByRole('heading', { name: 'CRM Lead' })).toBeVisible();
  await expect(page.locator('.border-red-200.bg-rose-50,.border-red-200.bg-red-50')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tabella' }).click();
  let detailsLinks = page.getByRole('link', { name: 'Dettagli' });

  if ((await detailsLinks.count()) === 0) {
    // Seed realistico: importa un veicolo via UI (CSV) e crea un lead via endpoint pubblico marketplace.
    await page.goto(`${baseUrl}/veicoli/importa`);
    const csvPayload = [
      'brand,model,version,year,price,mileage,fuel,transmission',
      `Fiat,Panda,1.0 Hybrid Lounge,2022,11900,24500,Benzina,Manuale`,
    ].join('\n');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'vehicles-seed.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvPayload, 'utf-8'),
    });

    await expect(page.getByText('File caricato:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Importa veicoli' }).click();
    await expect(page.getByText('Report importazione')).toBeVisible();

    const reportText = (await page.locator('section').filter({ hasText: 'Report importazione' }).first().innerText()).replace(/\s+/g, ' ');
    const importedMatch = reportText.match(/Importati:\s*(\d+)/i);
    const importedCount = importedMatch ? Number(importedMatch[1]) : 0;

    if (importedCount < 1) {
      throw new Error(`BLOCKER: Import veicoli non riuscito. report=${reportText}`);
    }

    await page.goto(`${baseUrl}/veicoli`);
    await expect(page.getByText('Caricamento veicoli in corso...')).toHaveCount(0);

    const totalsSummary = page.locator('text=/\\d+ veicoli totali, \\d+ visualizzati in pagina\\./').first();
    await expect(totalsSummary).toBeVisible();

    await expect
      .poll(async () => {
        const text = (await totalsSummary.innerText()).trim();
        const match = text.match(/^(\d+)\s+veicoli\s+totali/i);
        return match ? Number(match[1]) : 0;
      }, { timeout: 12000 })
      .toBeGreaterThan(0);

    const vehicleLinks = page.locator('a[href^="/veicoli/"]');
    const hrefs = await vehicleLinks.evaluateAll((links) =>
      links
        .map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? '')
        .filter(Boolean)
    );

    const uuidLike = /^\/veicoli\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const vehicleHref = hrefs.find((href) => uuidLike.test(href));

    if (!vehicleHref) {
      const summaryText = (await totalsSummary.innerText()).trim();
      throw new Error(
        `BLOCKER: Nessun link veicolo valido trovato dopo import. summary=${summaryText} hrefs=${JSON.stringify(hrefs.slice(0, 10))}`
      );
    }

    const vehicleId = vehicleHref.split('/').filter(Boolean).pop();
    if (!vehicleId) {
      throw new Error('BLOCKER: ID veicolo non rilevabile dal link.');
    }

    const createLeadResp = await request.post(`${baseUrl}/api/marketplace/lead`, {
      data: {
        vehicleId,
        first_name: `Mario${String(now).slice(-4)}`,
        last_name: 'SmokeLead',
        email: `cliente.${now}@example.com`,
        phone: '+39000999888',
        message: 'Richiesta test funzionale lead',
      },
    });

    if (!createLeadResp.ok()) {
      const bodyText = await createLeadResp.text();
      throw new Error(`BLOCKER: Creazione lead test fallita (HTTP ${createLeadResp.status()}) body=${bodyText}`);
    }

    await page.goto(`${baseUrl}/lead`);
    await page.getByRole('button', { name: 'Tabella' }).click();
    detailsLinks = page.getByRole('link', { name: 'Dettagli' });
  }

  if ((await detailsLinks.count()) === 0) {
    throw new Error('BLOCKER: Nessun lead disponibile per eseguire test funzionale reale della sezione Lead.');
  }

  const row = page.locator('tr').filter({ has: page.getByRole('link', { name: 'Dettagli' }).first() }).first();
  await expect(row).toBeVisible();

  const customerName = (await row.locator('td').first().innerText()).trim();
  await row.getByRole('link', { name: 'Dettagli' }).click();
  await expect(page.getByRole('heading', { name: customerName })).toBeVisible();

  // Change lead status
  const detailSidebar = page.getByRole('complementary').filter({ hasText: 'Stato' }).first();
  const statusSelect = detailSidebar.locator('select').first();
  await statusSelect.selectOption('contattato');
  await expect(detailSidebar).toContainText('Contattato');

  // Save internal notes
  const noteText = `Nota interna test ${now}`;
  await page.locator('textarea[placeholder="Scrivi una nota..."]').fill(noteText);
  await page.getByRole('button', { name: 'Salva note' }).click();
  await expect(page.locator('section.border-emerald-200.bg-emerald-50')).toHaveCount(0);

  // Create appointment from lead detail
  await page.locator('input[type="datetime-local"]').fill('2026-07-15T10:00');
  await page.getByRole('button', { name: 'Crea appuntamento' }).click();
  await expect(page.getByText('Appuntamento lead', { exact: false }).first()).toBeVisible();

  // Timeline should include activities
  await expect(page.getByText('Timeline')).toBeVisible();
  await expect(page.getByText('Stato aggiornato', { exact: false }).first()).toBeVisible();

  // Fallback check for lead without vehicle if present in list
  await page.goto(`${baseUrl}/lead`);
  await page.getByRole('button', { name: 'Tabella' }).click();
  const fallbackDetail = page.locator('tr', { hasText: ' - ' }).locator('a:has-text("Dettagli")').first();
  if ((await fallbackDetail.count()) > 0) {
    await fallbackDetail.click();
    await expect(page.getByText('Veicolo non collegato', { exact: false })).toBeVisible();
  }

  await expect(page.locator('.border-red-200.bg-rose-50,.border-red-200.bg-red-50')).toHaveCount(0);
});
