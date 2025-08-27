const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Optionally mock axios if you want to avoid real Ollama calls
// jest.mock('axios');
// const axios = require('axios');

const server = require('../server'); // Your backend exports the app

jest.setTimeout(30000);

describe('Backend /analyze API', () => {
  // ----------- 1) /analyze with JSON path (should fail) -----------
  test('should return 400 when sending JSON path instead of file', async () => {
    const res = await request(server)
      .post('/analyze')
      .send({ file: '"C:\Users\NadineHAMAMI\OneDrive - OPEN BEE\image\imagech.jpg"', action: 'decrire' })
      .set('Content-Type', 'application/json');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/manquant|missing|file/i);
  });

  // ----------- 2) /analyze with real image file (should succeed) -----------
  test('should return 200 for real image upload', async () => {
    const imgPath = path.join(__dirname, 'fixtures', 'image.png');
    if (!fs.existsSync(imgPath)) throw new Error('Test image missing!');
    const res = await request(server)
      .post('/analyze')
      .attach('file', fs.createReadStream(imgPath))
      .field('action', 'decrire');
    expect(res.statusCode).toBe(200);
    // Optionally check response content
    // expect(res.text).toBeDefined();
  });


    // ----------- 5) /analyze with image encoded in base64 (should succeed) -----------
    test('should return 200 for image upload as base64', async () => {
      const imgPath = path.join(__dirname, 'fixtures', 'image.png');
      if (!fs.existsSync(imgPath)) throw new Error('Test image missing!');
      const base64Data = fs.readFileSync(imgPath).toString('base64');
      const buffer = Buffer.from(base64Data, 'base64');
      const res = await request(server)
        .post('/analyze')
        .attach('file', buffer, 'image.png')
        .field('action', 'decrire');
      expect(res.statusCode).toBe(200);
      // Optionally check response content
      // expect(res.text).toBeDefined();
    });



  // ----------- 3) /analyze with real PDF file (should succeed) -----------
  test('should return 200 for real PDF upload', async () => {
    const pdfPath = path.join(__dirname, 'fixtures', 'document2.pdf');
    if (!fs.existsSync(pdfPath)) throw new Error('Test PDF missing!');
    const res = await request(server)
      .post('/analyze')
      .attach('file', fs.createReadStream(pdfPath))
      .field('action', 'resumer');
    expect(res.statusCode).toBe(200);
    // Optionally check response content
    // expect(res.text).toBeDefined();
  });

  // ----------- 4) /analyze with scanned PDF (should succeed) -----------
  test('should return 200 for scanned PDF upload', async () => {
    const scanPath = path.join(__dirname, 'fixtures', 'scannedpdf.pdf'); // Use a PNG as a scan example
    if (!fs.existsSync(scanPath)) throw new Error('Test scan image missing!');
    const res = await request(server)
      .post('/analyze')
      .attach('file', fs.createReadStream(scanPath))
      .field('action', 'resumer');
    expect(res.statusCode).toBe(200);
    // Optionally check response content
    // expect(res.text).toBeDefined();
  });

  test('should return 400 when sending JSON path instead of file', async () => {
    const res = await request(server)
      .post('/analyze')
      .send({ file: '"C:\Users\NadineHAMAMI\OneDrive - OPEN BEE\pdf\chapitre3.pdf"', action: 'resumer' })
      .set('Content-Type', 'application/json');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/manquant|missing|file/i);
  });


});
