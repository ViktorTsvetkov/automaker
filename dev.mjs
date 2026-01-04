#!/usr/bin/env node

/**
 * Automaker - Development Mode Launch Script
 *
 * This script starts the application in development mode with hot reloading.
 * It uses Vite dev server for fast HMR during development.
 *
 * Usage: npm run dev
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import {
  createRestrictedFs,
  log,
  runNpm,
  runNpmAndWait,
  printHeader,
  printModeMenu,
  resolvePortConfiguration,
  createCleanupHandler,
  setupSignalHandlers,
  startServerAndWait,
  ensureDependencies,
  prompt,
} from './scripts/launcher-utils.mjs';

const require = createRequire(import.meta.url);
const crossSpawn = require('cross-spawn');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create restricted fs for this script's directory
const fs = createRestrictedFs(__dirname, 'dev.mjs');

// Track background processes for cleanup
const processes = {
  server: null,
  web: null,
  electron: null,
  docker: null,
};

/**
 * Install Playwright browsers (dev-only dependency)
 */
async function installPlaywrightBrowsers() {
  log('Checking Playwright browsers...', 'yellow');
  try {
    const exitCode = await new Promise((resolve) => {
      const playwright = crossSpawn('npx', ['playwright', 'install', 'chromium'], {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'apps', 'ui'),
      });
      playwright.on('close', (code) => resolve(code));
      playwright.on('error', () => resolve(1));
    });

    if (exitCode === 0) {
      log('Playwright browsers ready', 'green');
    } else {
      log('Playwright installation failed (browser automation may not work)', 'yellow');
    }
  } catch {
    log('Playwright installation skipped', 'yellow');
  }
}

/**
 * Main function
 */
async function main() {
  // Change to script directory
  process.chdir(__dirname);

  printHeader('Automaker Development Environment');

  // Ensure dependencies are installed
  await ensureDependencies(fs, __dirname);

  // Install Playwright browsers (dev-only)
  await installPlaywrightBrowsers();

  // Resolve port configuration (check/kill/change ports)
  const { webPort, serverPort, corsOriginEnv } = await resolvePortConfiguration();

  // Show mode selection menu
  printModeMenu();

  // Setup cleanup handlers
  const cleanup = createCleanupHandler(processes);
  setupSignalHandlers(cleanup);

  // Prompt for choice
  while (true) {
    const choice = await prompt('Enter your choice (1, 2, or 3): ');

    if (choice === '1') {
      console.log('');
      log('Launching Web Application (Development Mode)...', 'blue');

      // Build shared packages once
      log('Building shared packages...', 'blue');
      await runNpmAndWait(['run', 'build:packages'], { stdio: 'inherit' }, __dirname);

      // Start the backend server in dev mode
      processes.server = await startServerAndWait({
        serverPort,
        corsOriginEnv,
        npmArgs: ['run', '_dev:server'],
        cwd: __dirname,
        fs,
        baseDir: __dirname,
      });

      if (!processes.server) {
        await cleanup();
        process.exit(1);
      }

      log(`The application will be available at: http://localhost:${webPort}`, 'green');
      console.log('');

      // Start web app with Vite dev server (HMR enabled)
      processes.web = runNpm(
        ['run', '_dev:web'],
        {
          stdio: 'inherit',
          env: {
            TEST_PORT: String(webPort),
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
          },
        },
        __dirname
      );

      await new Promise((resolve) => {
        processes.web.on('close', resolve);
      });

      break;
    } else if (choice === '2') {
      console.log('');
      log('Launching Desktop Application (Development Mode)...', 'blue');
      log('(Electron will start its own backend server)', 'yellow');
      console.log('');

      // Pass selected ports through to Vite + Electron backend
      processes.electron = runNpm(
        ['run', 'dev:electron'],
        {
          stdio: 'inherit',
          env: {
            TEST_PORT: String(webPort),
            PORT: String(serverPort),
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
            CORS_ORIGIN: corsOriginEnv,
          },
        },
        __dirname
      );

      await new Promise((resolve) => {
        processes.electron.on('close', resolve);
      });

      break;
    } else if (choice === '3') {
      console.log('');
      log('Launching Docker Container (Isolated Mode)...', 'blue');
      log('Building and starting Docker containers...', 'yellow');
      console.log('');

      // Check if ANTHROPIC_API_KEY is set
      if (!process.env.ANTHROPIC_API_KEY) {
        log('Warning: ANTHROPIC_API_KEY environment variable is not set.', 'yellow');
        log('The server will require an API key to function.', 'yellow');
        log('Set it with: export ANTHROPIC_API_KEY=your-key', 'yellow');
        console.log('');
      }

      // Build and start containers with docker-compose
      processes.docker = crossSpawn('docker', ['compose', 'up', '--build'], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
          ...process.env,
        },
      });

      log('Docker containers starting...', 'blue');
      log('UI will be available at: http://localhost:3007', 'green');
      log('API will be available at: http://localhost:3008', 'green');
      console.log('');
      log('Press Ctrl+C to stop the containers.', 'yellow');

      await new Promise((resolve) => {
        processes.docker.on('close', resolve);
      });

      break;
    } else {
      log('Invalid choice. Please enter 1, 2, or 3.', 'red');
    }
  }
}

// Run main function
main().catch(async (err) => {
  console.error(err);
  const cleanup = createCleanupHandler(processes);
  try {
    await cleanup();
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
  }
  process.exit(1);
});
