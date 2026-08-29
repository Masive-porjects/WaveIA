// live_reconnect.spec.ts
// E2E: Test de reconexión automática y escenario chaos

import { test, expect } from '@playwright/test';
import { startSimulator, stopSimulator } from '../helpers/simulator';

test.describe('Live Engine: Reconexión y Caos', () => {
  test('Reconexión automática: simulador cae y vuelve', async ({ page }) => {
    const { startSimulator, stopSimulator } = require('../helpers/simulator');
    
    const simulator = await startSimulator('idle', 8765);
    
    try {
      await page.goto('/');
      await page.click('[data-testid="dock-tab-live"]');
      
      // Verificar estado inicial: connected
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });

      // Detener simulador
      await stopSimulator();
      
      // Estado debe cambiar a disconnected/reconnecting
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .not.toHaveText('connected', { timeout: 5000 });

      // Relevantar simulador
      const newSimulator = await startSimulator('idle', 8765);
      
      // Reconexión automática
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });
      
      // Verificar que los knobs mantienen último valor válido
      const knob = page.locator('[data-testid="knob-filter_cutoff"]');
      const value = await knob.getAttribute('data-value');
      expect(parseFloat(value || '0')).toBeGreaterThan(0);
      
      await stopSimulator(newSimulator);
    } finally {
      await stopSimulator();
    }
  });

  test('Escenario chaos: payloads inválidos no rompen la UI', async ({ page }) => {
    const { startSimulator, stopSimulator } = require('../helpers/simulator');
    
    const simulator = await startSimulator('chaos', 8765, ['--seed', '42']);
    
    try {
      await page.goto('/');
      
      const fixturePath = require('path').join(__dirname, '..', 'fixtures', 'test-audio.wav');
      await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
      
      await expect(page.locator('text=Analizando')).toBeHidden({ timeout: 90000 });
      await page.click('[data-testid="dock-tab-live"]');
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });
      
      // UI no debe crashear - live-view debe seguir visible
      await expect(page.locator('[data-testid="live-view"]')).toBeVisible();
      
      // Knobs deben conservar último valor válido
      for (const param of ['filter_cutoff', 'drive', 'reverb_mix']) {
        const knob = page.locator(`[data-testid="knob-${param}"]`);
        const value = await knob.getAttribute('data-value');
        const val = parseFloat(value || '0');
        expect(val).toBeGreaterThanOrEqual(0);
      }
      
      // Sin errores críticos en consola
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          errors.push(msg.text());
        }
      });
      
      // Dar tiempo para que se procesen algunos mensajes chaos
      await page.waitForTimeout(3000);
      
      // Filtrar errores esperados de validación vs crashes reales
      const criticalErrors = errors.filter(e => 
        !e.includes('validation') && 
        !e.includes('Invalid LiveParams') &&
        !e.includes('favicon')
      );
      expect(criticalErrors).toHaveLength(0);
      
    } finally {
      await stopSimulator();
    }
  });
});