import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';

/* =======================
   CONFIGURATION
======================= */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const DATASET_BASE = __ENV.DATASET_BASE || '../datasets';
const MANIFEST = __ENV.MANIFEST || `${DATASET_BASE}/dataset.manifest.json`;
const MIN_RESPONSE_CHARS = Number(__ENV.MIN_RESPONSE_CHARS || 100);

/* =======================
   CHARGEMENT DES DONNÉES
======================= */
const manifest = JSON.parse(open(MANIFEST));

function mimeFromName(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

const PDFs = new SharedArray('pdfs', () =>
  (manifest.pdfs || []).map((name) => ({
    name,
    mime: 'application/pdf',
    bin: open(`${DATASET_BASE}/pdfs/${name}`, 'b'),
    action: 'resumer'
  }))
);

const IMGs = new SharedArray('images', () =>
  (manifest.images || []).map((name) => ({
    name,
    mime: mimeFromName(name),
    bin: open(`${DATASET_BASE}/images/${name}`, 'b'),
    action: 'decrire'
  }))
);

/* =======================
   MÉTRIQUES
======================= */
const ok_pdf_response = new Rate('ok_pdf_response');
const ok_img_response = new Rate('ok_img_response');

/* =======================
   SCÉNARIOS DE TEST
======================= */
export const options = {
  scenarios: {
    /* --- TEST DE CHARGE NORMAL --- */
    load_pdfs: {
      executor: 'ramping-vus',
      exec: 'testPdf',
      startTime: '0s',
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      tags: { type: 'pdf' },
    },
    load_images: {
      executor: 'ramping-vus',
      exec: 'testImage',
      startTime: '0s',
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      tags: { type: 'image' },
    },

    /* --- TEST D'ENDURANCE --- */
    endurance_pdfs: {
      executor: 'constant-vus',
      exec: 'testPdf',
      vus: 10,
      duration: '10m',
      startTime: '2m',
      tags: { type: 'pdf', test: 'endurance' },
    },
    endurance_images: {
      executor: 'constant-vus',
      exec: 'testImage',
      vus: 10,
      duration: '10m',
      startTime: '2m',
      tags: { type: 'image', test: 'endurance' },
    },
  },

  /* --- SEUILS --- */
  thresholds: {
    // Disponibilité
    'http_req_failed{type:pdf}': ['rate<0.05'],
    'http_req_failed{type:image}': ['rate<0.05'],

    // Performance
    'http_req_duration{type:pdf}': ['p(95)<30000'], // 30s max pour PDF
    'http_req_duration{type:image}': ['p(95)<15000'], // 15s max pour images

    // Validité des réponses
    'ok_pdf_response': ['rate>0.9'],
    'ok_img_response': ['rate>0.9'],
  },

  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/* =======================
   FONCTIONS UTILITAIRES
======================= */
function healthcheck() {
  const r = http.get(`${BASE_URL}/`);
  check(r, { 'Healthcheck OK': (x) => x.status === 200 });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function responseIsValid(res) {
  return res && res.body && res.body.length >= MIN_RESPONSE_CHARS;
}

/* =======================
   TEST PDF
======================= */
export function testPdf() {
  if (!PDFs.length) {
    console.log('Aucun PDF disponible pour le test');
    return;
  }

  group('Test PDF Analysis', () => {
    healthcheck();
    
    const file = pickRandom(PDFs);
    const formData = {
      file: http.file(file.bin, file.name, file.mime),
      action: file.action
    };

    const params = {
      tags: { type: 'pdf', file: file.name },
      timeout: '120s' // 2 minutes timeout pour PDF
    };

    const res = http.post(`${BASE_URL}/analyze`, formData, params);

    const isValid = responseIsValid(res);
    ok_pdf_response.add(isValid);

    check(res, {
      'PDF - Status 200': (r) => r.status === 200,
      'PDF - Réponse valide': () => isValid,
      'PDF - Content-Type texte': (r) => r.headers['Content-Type']?.includes('text/plain'),
    });

    sleep(Math.random() * 2 + 1);
  });
}

/* =======================
   TEST IMAGE
======================= */
export function testImage() {
  if (!IMGs.length) {
    console.log('Aucune image disponible pour le test');
    return;
  }

  group('Test Image Analysis', () => {
    healthcheck();
    
    const file = pickRandom(IMGs);
    const formData = {
      file: http.file(file.bin, file.name, file.mime),
      action: file.action
    };

    const params = {
      tags: { type: 'image', file: file.name },
      timeout: '60s' // 1 minute timeout pour images
    };

    const res = http.post(`${BASE_URL}/analyze`, formData, params);

    const isValid = responseIsValid(res);
    ok_img_response.add(isValid);

    check(res, {
      'Image - Status 200': (r) => r.status === 200,
      'Image - Réponse valide': () => isValid,
      'Image - Content-Type texte': (r) => r.headers['Content-Type']?.includes('text/plain'),
    });

    sleep(Math.random() * 1.5 + 0.5);
  });
}

/* =======================
   RAPPORTS
======================= */
export function handleSummary(data) {
  return {
    'stress-test-report.html': htmlReport(data, { title: 'Test de Charge - Backend OCR/AI' }),
    'summary.txt': textSummary(data, { indent: ' ', enableColors: true }),
  };
}