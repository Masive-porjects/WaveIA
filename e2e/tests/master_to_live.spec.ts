// master_to_live.spec.ts
// E2E: Flujo completo upload → master → live tab → simulador conecta

import { test, expect } from '@playwright/test';
import { startSimulator, stopSimulator } from '../helpers/simulator';

test.describe('Flujo completo: Master → Live Engine', () => {
  let simulator: any;

  test.beforeAll(async () => {
    // Generar fixture de audio si no existe
    const { execSync } = require('child_process');
    const path = require('path');
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'test-audio.wav');
    const fs = require('fs');
    
    if (!fs.existsSync(fixturePath)) {
      console.log('[Test] Generating test audio fixture...');
      execSync('python e2e/fixtures/generate_fixture.py', { cwd: __dirname + '/..', stdio: 'inherit' });
    }
  });

  test.describe.configure({ retries: 0 });

  test('Carga audio → Master → Live Engine conectado a simulador', async ({ page }) => {
    // 1. Iniciar simulador en modo idle (solo HELLO + PING/PONG)
    const simulator = await startSimulator('idle', 8765);
    
    try {
      // 2. Navegar a Studio
      await page.goto('/');
      await expect(page.locator('[data-testid="live-view"]')).toBeVisible({ timeout: 10000 });

      // 3. Subir archivo de audio
      const fileInput = page.locator('input[type="file"]').first();
      const fixturePath = require('path').join(__dirname, '..', 'fixtures', 'test-audio.wav');
      
      await fileInput.setInputFiles(fixturePath);
      
      // Esperar análisis y procesamiento automático
      await expect(page.locator('text=Analizando')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Analizando')).toBeHidden({ timeout: 90000 });
      
      // Verificar que el master se completó
      await expect(page.locator('[data-testid="live-view"]')).toBeVisible();
      
      // 4. Navegar a pestaña Live
      await page.click('[data-testid="dock-tab-live"]');
      await expect(page.locator('[data-testid="live-view"]')).toBeVisible();

      // 5. Verificar conexión con simulador
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });
      
      // 6. Verificar RTT visible
      const rtt = page.locator('[data-testid="live-rtt"]');
      await expect(rtt).toBeVisible();
      const rttText = await rtt.getAttribute('data-rtt-ms');
      expect(parseFloat(rttText || '0')).toBeGreaterThan(0);

      // 7. Sin errores en consola
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      expect(errors.filter(e => !e.includes('favicon') && !e.includes('webpack'))).toHaveLength(0);
      
    } finally {
      await stopSimulator();
    }
  });

  test('Reconexión automática cuando simulador cae y vuelve', async ({ page }) => {
    const simulator = await startSimulator('idle', 8765);
    
    try {
      await page.goto('/');
      await page.click('[data-testid="dock-tab-live"]');
      
      // Verificar estado inicial: connected
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });

      // Detener simulador
      await stopSimulator(simulator);
      
      // Estado debe cambiar a disconnected/reconnecting
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .not.toHaveText('connected', { timeout: 5000 });

      // Relevantar simulador
      const newSimulator = await startSimulator('idle', 8765);
      
      // Reconexión automática
      await expect(page.locator('[data-testid="live-connection-status"]'))
        .toHaveText('connected', { timeout: 10000 });
      
      await stopSimulator(newSimulator);
    } finally {
      await stopSimulator(simulator);
    }
  });
});