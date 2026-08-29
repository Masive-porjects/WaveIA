// live_params.spec.ts
// E2E: Validación de sweep y presets contra LiveParams esperados

import { test, expect } from '@playwright/test';
import { startSimulator, stopSimulator } from '../helpers/simulator';

test.describe('LiveParams: Sweep y Presets', () => {
  let simulator: any;

  test.describe.configure({ retries: 0 });

  test('Sweep step-mode: barrido discreto con valores exactos', async ({ page }) => {
    // Simulador en modo sweep step-mode
    const simulator = await startSimulator('sweep', 8765, ['--step-mode']);
    
    try {
      await page.goto('/');
      
      // Subir audio y procesar
      const fixturePath = require('path').join(__dirname, '..', 'fixtures', 'test-audio.wav');
      await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
      
      await expect(page.locator('text=Analizando')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Analizando')).toBeHidden({ timeout: 90000 });
      
      // Ir a Live
      await page.click('[data-testid="dock-tab-live"]');
      
      // Verificar conexión
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });

      // Validar barrido discreto de filter_cutoff (step-mode)
      const expectedCutoffs = [200, 1200, 4000, 12000]; // valores de step-mode
      
      for (const expected of expectedCutoffs) {
        const knob = page.locator('[data-testid="knob-filter_cutoff"]');
        await expect.poll(async () => {
          const val = await knob.getAttribute('data-value');
          return val ? parseFloat(val) : null;
        }).toBeCloseTo(expected, 1);
      }
    } finally {
      await stopSimulator();
    }
  });

  test('Presets: clean \u2192 dub \u2192 big_room \u2192 radio', async ({ page }) => {
    const simulator = await startSimulator('presets', 8765, ['--preset-interval', '1.5']);
    
    try {
      await page.goto('/');
      
      // Subir audio
      const fixturePath = require('path').join(__dirname, '..', 'fixtures', 'test-audio.wav');
      await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
      
      await expect(page.locator('text=Analizando')).toBeHidden({ timeout: 90000 });
      
      // Ir a Live
      await page.click('[data-testid="dock-tab-live"]');
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });
      
      // Verificar secuencia de presets
      const presets = ['clean', 'dub', 'big_room', 'radio'];
      
      for (const preset of presets) {
        // Esperar a que el preset activo cambie
        await expect.poll(async () => {
          const active = page.locator('[data-testid="fx-preset-active"]');
          return await active.textContent();
        }).toBe(preset, { timeout: 3000 });
        
        // Verificar par\u00e1metros esperados del preset
        if (preset === 'dub') {
          await expect(page.locator('[data-testid="knob-delay_time"]'))
            .toHaveAttribute('data-value', '375', { tolerance: 5 });
          await expect(page.locator('[data-testid="knob-echo_feedback"]'))
            .toHaveAttribute('data-value', '0.65', { tolerance: 0.05 });
        }
        
        if (preset === 'big_room') {
          await expect(page.locator('[data-testid="knob-reverb_mix"]'))
            .toHaveAttribute('data-value', '0.7', { tolerance: 0.05 });
        }
      }
    } finally {
      await stopSimulator();
    }
  });

  test('Random walk: valores dentro de rangos v\u00e1lidos', async ({ page }) => {
    const simulator = await startSimulator('random_walk', 8765, ['--seed', '42']);
    
    try {
      await page.goto('/');
      
      const fixturePath = require('path').join(__dirname, '..', 'fixtures', 'test-audio.wav');
      await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
      
      await expect(page.locator('text=Analizando')).toBeHidden({ timeout: 90000 });
      await page.click('[data-testid="dock-tab-live"]');
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });
      
      // Verificar que todos los knobs est\u00e1n dentro de rangos v\u00e1lidos
      const ranges = {
        filter_cutoff: { min: 200, max: 12000 },
        filter_res: { min: 0.5, max: 12 },
        drive: { min: 0, max: 1 },
        delay_time: { min: 50, max: 800 },
        echo_feedback: { min: 0, max: 0.8 },
        reverb_mix: { min: 0, max: 1 },
      };
      
      for (const [param, range] of Object.entries(ranges)) {
        const knob = page.locator(`[data-testid="knob-${param}"]`);
        const value = await knob.getAttribute('data-value');
        const val = parseFloat(value || '0');
        expect(val).toBeGreaterThanOrEqual(range.min - 1);
        expect(val).toBeLessThanOrEqual(range.max + 1);
      }
    } finally {
      await stopSimulator();
    }
  });
});