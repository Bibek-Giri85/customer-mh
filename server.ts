import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import zlib from 'node:zlib';
import { createServer as createViteServer } from 'vite';
import {
  deleteBirthdayOffer,
  getDashboardSnapshot,
  getSyncStatus,
  importCustomersFromCsv,
  initDatabase,
  processBatchCustomers,
  resetCampaignOperations,
  retrainModelControlled,
  sendSmsCampaign,
  startSupabaseSyncLoop,
  syncFromSupabase,
  upsertBirthdayOffer,
  upsertCustomer,
} from './server/db.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const allowedOrigins = [
    'https://mothers-hut-frontend.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );

    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  app.use(express.json({ limit: '10mb' }));

  await initDatabase();
  startSupabaseSyncLoop();

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: "Mother's Hut Guest Portal API",
      ...getSyncStatus(),
    });
  });

  app.post('/api/sync', async (_req, res) => {
    try {
      const syncInfo = await syncFromSupabase(true);
      res.json({ ...syncInfo, snapshot: getDashboardSnapshot() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/dashboard', async (req, res) => {
    try {
      const status = getSyncStatus();
      if (status.supabase_configured && status.dataset_source === 'supabase:pending') {
        await syncFromSupabase(true);
      }

      const snapshot = getDashboardSnapshot();
      const acceptEncoding = String(req.headers['accept-encoding'] || '');
      if (acceptEncoding.includes('gzip')) {
        const payload = Buffer.from(JSON.stringify(snapshot));
        zlib.gzip(payload, (err, compressed) => {
          if (err) {
            return res.json(snapshot);
          }
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Vary', 'Accept-Encoding');
          return res.send(compressed);
        });
        return;
      }
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/customers', (req, res) => {
    try {
      const result = upsertCustomer(req.body);
      res.json({
        ...result,
        avg_spend_per_visit_inr: result.customer.avg_spend_per_visit_inr,
        snapshot: getDashboardSnapshot(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/customers/batch', (req, res) => {
    try {
      const items = Array.isArray(req.body) ? req.body : req.body?.records || req.body?.customers || [];
      const result = processBatchCustomers(items);
      res.json({
        ...result,
        snapshot: getDashboardSnapshot(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/customers/import-csv', (req, res) => {
    try {
      const csvText = String(req.body?.csvText || req.body?.csv_text || '');
      const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';
      const result = importCustomersFromCsv(csvText, mode);
      res.json({ ...result, snapshot: getDashboardSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/ml/retrain', (_req, res) => {
    try {
      const result = retrainModelControlled();
      res.json({ ...result, snapshot: getDashboardSnapshot() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/birthday-offers', (req, res) => {
    try {
      const offer = upsertBirthdayOffer(req.body);
      res.json({ offer, snapshot: getDashboardSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/birthday-offers/:id', (req, res) => {
    try {
      deleteBirthdayOffer(req.params.id);
      res.json({ ok: true, snapshot: getDashboardSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/campaigns/send', (req, res) => {
    try {
      const campaign = sendSmsCampaign(req.body);
      res.json({
        campaign,
        snapshot: getDashboardSnapshot(),
      });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.startsWith('DUPLICATE_BIRTHDAY_BLOCKED') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  app.post('/api/campaigns/simulate', (req, res) => {
    try {
      const campaign = sendSmsCampaign(req.body);
      res.json({
        campaign,
        snapshot: getDashboardSnapshot(),
      });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.startsWith('DUPLICATE_BIRTHDAY_BLOCKED') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  app.post('/api/campaigns/reset', (_req, res) => {
    try {
      resetCampaignOperations();
      res.json({ ok: true, snapshot: getDashboardSnapshot() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mother's Hut Guest Portal running on http://localhost:${PORT}`);
  });
}

startServer();