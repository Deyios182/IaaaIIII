import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { exec } from 'child_process';

function wifiPlugin() {
  return {
    name: 'wifi-plugin',
    configureServer(server: any) {
      // Endpoint para WiFi
      server.middlewares.use('/api/wifi', (req: any, res: any) => {
        exec('netsh wlan show interfaces', (err, stdout) => {
          let ssid = "Wired/Unknown";
          if (!err) {
             const match = stdout.match(/SSID\s*:\s*(.+)/);
             if (match) ssid = match[1].trim();
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ssid }));
        });
      });

      // Endpoint para GPS Nativo de Windows
      server.middlewares.use('/api/location', (req: any, res: any) => {
        exec('powershell -ExecutionPolicy Bypass -File get_location.ps1', (err, stdout) => {
          let lat = null;
          let lon = null;
          if (!err && stdout.trim() !== "Unknown" && stdout.includes(",")) {
            const parts = stdout.trim().split(",");
            lat = parseFloat(parts[0]);
            lon = parseFloat(parts[1]);
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ lat, lon, raw: stdout.trim() }));
        });
      });
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3001,
      host: true,
      strictPort: true,
      cors: true,
      allowedHosts: true,
    },
    plugins: [
      wifiPlugin(),
      react(),
      electron([
        {
          // Main process entry point
          entry: 'electron/main.ts',
          onstart(options) {
            options.startup();
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron']
              }
            }
          }
        },
        {
          // Preload scripts - MUST be CommonJS
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload();
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron'],
                output: {
                  format: 'cjs'
                }
              }
            }
          }
        }
      ]),
      renderer()
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEYS': JSON.stringify(env.GEMINI_API_KEYS || env.VITE_GEMINI_API_KEYS || env.GEMINI_API_KEY || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
