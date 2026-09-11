// demo_flow.spec.ts
// E2E del modo demo real: backend on-demand multi-preset + wiring del
// Studio con ?preset_id=. Prueba el flujo completo en el navegador:
// upload → preset "fuego" → master servido con preset_id=fuego →
// descarga WAV (RIFF) → cambio a "cinta" (multi-preset).
//
// Requiere: backend en :8000 (modo demo) y studio dev en :3000 (los
// levanta el webServer del config o un proceso manual previo).

import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURE_FILE = 'demo-audio.wav';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', FIXTURE_FILE);
const GENERATOR = path.join(__dirname, '..', 'fixtures', 'generate_demo_fixture.py');
const REPO_ROOT = path.join(__dirname, '..', '..');

/** Registra las requests del navegador hacia el backend de audio. */
function trackApiRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/session/')) seen.push(req.url());
  });
  return seen;
}

/** True cuando la URL pide el master del preset indicado por playback. */
function isMasteredFor(url: string, presetId: string): boolean {
  return (
    url.includes('/api/session/') &&
    url.includes('/audio/mastered') &&
    url.includes(`preset_id=${presetId}`)
  );
}

test.describe('Demo flow: presets reales on-demand', () => {
  // Generoso ante transitorios (backend DSP pesado, 1 job por vez).
  test.describe.configure({ retries: 2, mode: 'serial' });

  test.beforeAll(() => {
    // Generar fixture determinista si no existe (convención del repo).
    if (!fs.existsSync(FIXTURE_PATH)) {
      console.log('[demo_flow] Generando fixture de audio demo...');
      const venvPython = path.join(
        REPO_ROOT, 'apps', 'audiomind', '.venv', 'Scripts', 'python.exe',
      );
      const python = fs.existsSync(venvPython) ? venvPython : 'python';
      execSync(`"${python}" "${GENERATOR}"`, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
    }
  });

  test('Subí el track → preset fuego → master con preset_id → descargá WAV → cinta', async ({ page }) => {
    test.setTimeout(400_000);
    const apiRequests = trackApiRequests(page);

    // ── 1. Entrada: main view con DropZone ───────────────────
    await page.goto('/');

    // Resiliencia: si el guard de licencia no llegó al backend al
    // montar (blip transitorio del server), recargás y el check
    // corre de nuevo; el resto del flujo sigue igual.
    const licenseError = page.getByText('No se pudo conectar con el servidor de licencias');
    await licenseError.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
    if (await licenseError.isVisible().catch(() => false)) {
      await page.reload();
      await licenseError.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    }

    await expect(page.getByText('Subí tu track para masterizar')).toBeVisible({
      timeout: 20_000,
    });

    // ── 2. Upload del fixture vía el input file oculto ───────
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_PATH);

    // ── 3. La mastering UI aparece cuando el análisis terminó ─
    await expect(
      page.getByRole('heading', { name: 'Macro-Carácter' }),
    ).toBeVisible({ timeout: 90_000 });

    // El fixture sintético puntúa como "ya masterizado" (bajo crest
    // factor, loudness comercial) → el modal de advertencia aparece
    // tras el análisis. Lo cerramos con "Cancelar" y seguimos el
    // flujo preset con preset_id intacto.
    const overMasterDialog = page.getByRole('alertdialog', {
      name: 'Advertencia de sobremasterización',
    });
    await overMasterDialog.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (await overMasterDialog.isVisible().catch(() => false)) {
      await overMasterDialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(overMasterDialog).toBeHidden({ timeout: 10_000 });
    }

    // ── 4. Preset "fuego" (tarjeta "Brutal") → auto-procesa ──
    // Registramos el waiter ANTES del click para no perder la request.
    const masteredFuego = page.waitForRequest(
      (req) => isMasteredFor(req.url(), 'fuego'),
      { timeout: 240_000 },
    );
    await page.getByText('Brutal', { exact: true }).click();

    // ── 5. Procesamiento terminó: el Player pidió el master ──
    //      con ?preset_id=fuego — evidencia del wiring nuevo.
    const fuegoReq = await masteredFuego;
    expect(fuegoReq.url()).toContain('preset_id=fuego');

    // El /process del preset también viajó con preset_id=fuego.
    await expect
      .poll(
        () =>
          apiRequests.some(
            (u) => u.includes('/process') && u.includes('preset_id=fuego'),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // ── 6. Descargá el WAV desde el panel de Análisis ────────
    await page.getByRole('button', { name: 'Módulo Análisis' }).click();
    const wavButton = page
      .locator('aside')
      .getByRole('button', { name: 'WAV', exact: true });
    await expect(wavButton).toBeVisible({ timeout: 15_000 });

    const downloadResp = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/session/') &&
        resp.url().includes('/download/wav') &&
        resp.status() === 200,
      { timeout: 120_000 },
    );
    await wavButton.click();
    const resp = await downloadResp;

    // La request de descarga llevó preset_id=fuego y el blob es un
    // WAV no vacío (magic RIFF).
    expect(resp.request().url()).toContain('preset_id=fuego');
    const wav = await resp.body();
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.length).toBeGreaterThan(1024 * 100);

    // ── 7. Multi-preset: cambiá a "cinta" (Vintage) ──────────
    await page.getByRole('button', { name: 'Módulo Macro-Carácter' }).click();
    const masteredCinta = page.waitForRequest(
      (req) => isMasteredFor(req.url(), 'cinta'),
      { timeout: 240_000 },
    );
    await page.getByText('Vintage', { exact: true }).click();
    const cintaReq = await masteredCinta;
    expect(cintaReq.url()).toContain('preset_id=cinta');

    // El audio del master final (cinta) está cargado en el Player.
    await expect(
      page.getByRole('heading', { name: 'Macro-Carácter' }),
    ).toBeVisible();
  });
});