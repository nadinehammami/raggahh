require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const tesseract = require('node-tesseract-ocr');
const { fromBuffer } = require('pdf2pic');
const { execFile } = require('child_process');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Use configurable Ollama host (falls back to docker service name)
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama:11434';
const SUMMARY_CHUNK_CHARS = Number(process.env.SUMMARY_CHUNK_CHARS || 2500);
const SUMMARY_MAX_CHUNKS = Number(process.env.SUMMARY_MAX_CHUNKS || 6);
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 8);
const OCR_LANGS = process.env.OCR_LANGS || 'fra+eng';
const OCR_PSM = String(process.env.OCR_PSM || '6');
const OCR_DPI = Number(process.env.OCR_DPI || 300);
const OCR_MIN_TEXT_CHARS = Number(process.env.OCR_MIN_TEXT_CHARS || 80);

// Build a structured summary prompt for consistent, concise output
function buildPdfSummaryPrompt({ language, textSnippet, instruction }) {
  const lang = language || 'fr';
  const baseInstruction = instruction || '';
  return (
    `Tu es un assistant expert en résumés de documents.
Réponds uniquement en ${lang} et au format suivant, concis et structuré:

Titre:
Résumé (3-6 phrases):
Points clés (puces courtes):
Conclusions / Recommandations:

Contraintes:
- Pas de préambule, pas d'explications sur ta méthode
- Pas de contenu hors sujet, pas de balises supplémentaires
- Style clair et professionnel

${baseInstruction ? `Contexte additionnel:\n${baseInstruction}\n` : ''}
Contenu à résumer (extrait):\n${textSnippet}`
  );
}

function buildImageSummaryPrompt({ language, basePrompt }) {
  const lang = language || 'fr';
  const instruction = basePrompt || '';
  return (
    `Tu es un expert en description et synthèse d'images.
Réponds uniquement en ${lang} et au format suivant:

Titre:
Résumé (2-4 phrases):
Éléments visuels (puces):
Contexte / Interprétation:

Contraintes:
- Pas de préambule
- Pas de spéculation non justifiée
- Style factuel et concis

${instruction ? `Consigne:\n${instruction}\n` : ''}
Décris l'image et produis ensuite la synthèse avec les sections ci-dessus.`
  );
}

// ----------------------------
// Text utilities and pipeline
// ----------------------------

function normalizeExtractedText(raw) {
  if (!raw) return '';
  // Fix common artifacts: collapse whitespace, remove repeating newlines, de-hyphenation at line breaks
  let text = raw
    .replace(/\r/g, '')
    .replace(/[\t\f]+/g, ' ')
    .replace(/-\n/g, '') // join hyphenated line breaks
    .replace(/\n+/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text;
}

function splitIntoSentenceChunks(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length <= maxChars) {
      current = (current ? current + ' ' : '') + s;
    } else {
      if (current) chunks.push(current);
      current = s;
      if (current.length > maxChars) {
        // Very long sentence fallback: hard split
        while (current.length > maxChars) {
          chunks.push(current.slice(0, maxChars));
          current = current.slice(maxChars);
        }
      }
      if (chunks.length >= SUMMARY_MAX_CHUNKS) break;
    }
    if (chunks.length >= SUMMARY_MAX_CHUNKS) break;
  }
  if (current && chunks.length < SUMMARY_MAX_CHUNKS) chunks.push(current);
  return chunks;
}

async function summarizeChunk(model, text, instruction) {
  console.log(`\n=== SUMMARIZE CHUNK ===`);
  console.log(`Chunk length: ${text.length} characters`);
  console.log(`Chunk preview: ${text.slice(0, 200)}...`);
  
  const prompt = buildPdfSummaryPrompt({ language: 'fr', textSnippet: text, instruction });
  
  console.log(`\n=== PROMPT SENT TO OLLAMA ===`);
  console.log(prompt);
  console.log(`=== END PROMPT ===\n`);
  
  const result = await generateText(model, prompt);
  
  console.log(`\n=== OLLAMA RESPONSE ===`);
  console.log(result);
  console.log(`=== END RESPONSE ===\n`);
  
  return result;
}

async function summarizeLongText(model, fullText, instruction) {
  console.log(`\n=== SUMMARIZE LONG TEXT ===`);
  console.log(`Full text length: ${fullText.length} characters`);
  console.log(`Full text preview: ${fullText.slice(0, 300)}...`);
  
  const chunks = splitIntoSentenceChunks(fullText, SUMMARY_CHUNK_CHARS);
  console.log(`Split into ${chunks.length} chunks`);
  
  if (chunks.length === 1) {
    return summarizeChunk(model, chunks[0], instruction);
  }
  
  const partials = [];
  for (const [index, chunk] of chunks.entries()) {
    console.log(`\nProcessing chunk ${index + 1}/${chunks.length}`);
    const summary = await summarizeChunk(model, chunk, instruction);
    partials.push(summary);
  }
  
  console.log(`\n=== MERGING PARTIAL SUMMARIES ===`);
  console.log(`Number of partial summaries: ${partials.length}`);
  
  const mergePrompt =
    `Tu vas fusionner des résumés partiels en un résumé final unique, clair et non redondant.\n\n` +
    `Contraintes:\n- En français\n- Titre, Résumé (3–6 phrases), Points clés (puces), Conclusions / Recommandations\n` +
    `- Supprime les doublons et harmonise le style\n\n` +
    `Résumés partiels:\n${partials.map((p, i) => `\n[Partie ${i + 1}]\n${p}`).join('\n')}\n\n` +
    `Produit uniquement le résumé final (sans explication).`;
  
  console.log(`\n=== MERGE PROMPT SENT TO OLLAMA ===`);
  console.log(mergePrompt);
  console.log(`=== END MERGE PROMPT ===\n`);
  
  const finalResult = await generateText(model, mergePrompt);
  
  console.log(`\n=== FINAL MERGED RESPONSE ===`);
  console.log(finalResult);
  console.log(`=== END FINAL RESPONSE ===\n`);
  
  return finalResult;
}

// Preprocess images to speed up multimodal inference
async function preprocessImageForVision(imageBuffer) {
  try {
    const processed = await sharp(imageBuffer)
      .rotate() // auto-orient
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, chromaSubsampling: '4:2:0' })
      .toBuffer();
    return processed.toString('base64');
  } catch (e) {
    console.warn('Image preprocess failed, using original buffer:', e.message);
    return imageBuffer.toString('base64');
  }
}

async function generateText(model, prompt) {
  try {
    console.log(`\n[Generate] model=${model}`);
    console.log("Prompt preview:", prompt.slice(0, 200));
    
    const res = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      { model, prompt, stream: false, options: { temperature: 0.2 } },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log(`Ollama response status: ${res.status}`);
    console.log(`Ollama response data keys: ${Object.keys(res.data)}`);
    
    return res.data.response || "Pas de réponse d'Ollama.";
  } catch (err) {
    console.error('Erreur Generate:', err.message);
    if (err.response) {
      console.error('Error response data:', err.response.data);
      console.error('Error response status:', err.response.status);
    }
    return "Erreur lors de l'appel à Ollama.";
  }
}

/**
 * Appelle l'endpoint /api/generate d'Ollama pour décrire une image.
 * - model: 'llava'
 * - prompt: instruction (depuis .env)
 * - images: [base64]
 */
async function describeImage(model, prompt, base64Image) {
  try {
    const payload = { model, prompt, images: [base64Image], stream: false };
    console.log(`\n[Describe Image] model=${model}`);
    console.log("Prompt:", prompt.slice(0, 100));
    console.log("Image base64 length:", base64Image.length);
    
    console.log("Making request to Ollama...");
    const res = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      { ...payload, options: { temperature: 0.2, num_predict: 120 } },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000
      }
    );
    
    console.log("Ollama response status:", res.status);
    console.log("Ollama response keys:", Object.keys(res.data));
    
    if (res.data.response && res.data.response.trim().length > 0) {
      console.log("Response preview:", res.data.response.slice(0, 200));
      console.log("Full response length:", res.data.response.length);
      return res.data.response;
    } else {
      console.log("Empty or missing response; attempting fallback vision model...");
      throw new Error('EMPTY_RESPONSE');
    }
  } catch (err) {
    console.error('Erreur Image Generate:', err.message);
    console.error('Error details:', err.response?.data || err.code || 'No additional details');

    // Fallback to a lighter, faster multimodal model (moondream)
    try {
      const fallbackModel = process.env.IMG_FALLBACK_MODEL || 'moondream';
      if (model !== fallbackModel) {
        console.log(`Trying fallback model: ${fallbackModel}`);
        const res2 = await axios.post(
          `${OLLAMA_HOST}/api/generate`,
          { model: fallbackModel, prompt, images: [base64Image], stream: false, options: { temperature: 0.2, num_predict: 160 } },
          { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
        );
        if (res2.data?.response && res2.data.response.trim().length > 0) {
          console.log("Fallback model response preview:", res2.data.response.slice(0, 200));
          return res2.data.response;
        }
      }
    } catch (e2) {
      console.error('Fallback model failed:', e2.message);
    }

    return "Erreur lors de l'appel à Ollama pour l'image.";
  }
}

/**
 * Extract text from PDF using OCR for scanned documents
 */
async function extractTextWithOCR(pdfBuffer) {
  const tempDir = path.join(__dirname, 'uploads', 'temp');
  if (fs.existsSync(tempDir)) {
    fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f)));
  } else {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  
  try {
    console.log('Converting PDF to images for OCR...');
    
    // Configure pdf2pic with GraphicsMagick
    const convert = fromBuffer(pdfBuffer, {
      density: OCR_DPI,
      saveFilename: "page",
      savePath: tempDir,
      format: "png", // lossless helps OCR
      width: 1700,    // better for A4 @ ~200-300 DPI
      height: 2200
    });
    
    // Convert first few pages (limit to avoid long processing)
    const maxPages = OCR_MAX_PAGES;
    let allText = '';
    const ocrConfig = {
      lang: OCR_LANGS,
      oem: 1,
      psm: Number(OCR_PSM),
    };
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        console.log(`Processing page ${pageNum}...`);
        
        const result = await convert(pageNum, { responseType: "buffer" });
        
        if (!result.buffer) {
          console.log(`No more pages after page ${pageNum - 1}`);
          break;
        }
        
        // Preprocess (grayscale + threshold) to improve OCR
        // Multi-pass preprocessing: try 2-3 variants and keep best
        const variants = [];
        variants.push(
          sharp(result.buffer).grayscale().normalize().threshold(170).toBuffer()
        );
        variants.push(
          sharp(result.buffer).grayscale().normalize().threshold(200).toBuffer()
        );
        variants.push(
          sharp(result.buffer).grayscale().normalize().negate().threshold(170).toBuffer()
        );

        let bestText = '';
        let bestAlpha = 0;
        
        for (const [index, variantPromise] of variants.entries()) {
          try {
            const buf = await variantPromise;
            const text = await tesseract.recognize(buf, ocrConfig);
            const alphaCount = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g) || []).length;
            
            console.log(`Variant ${index + 1} OCR result: ${alphaCount} alphanumeric characters`);
            
            if (alphaCount > bestAlpha) {
              bestText = text;
              bestAlpha = alphaCount;
              console.log(`New best variant: ${index + 1} with ${alphaCount} chars`);
            }
          } catch (e) {
            console.log(`Variant ${index + 1} failed:`, e.message);
          }
        }
        
        allText += bestText + '\n\n';
        console.log(`Page ${pageNum} OCR completed, total text so far: ${allText.length} chars`);
        
      } catch (pageErr) {
        console.log(`Page ${pageNum} conversion failed or end of document:`, pageErr.message);
        break;
      }
    }
    
    let normalized = normalizeExtractedText(allText);
    console.log(`OCR extracted text length: ${normalized.length} characters`);
    console.log(`OCR extracted text preview: ${normalized.slice(0, 300)}`);
    
    if (normalized.length < OCR_MIN_TEXT_CHARS) {
      console.log(`OCR text too short (${normalized.length} < ${OCR_MIN_TEXT_CHARS}), trying fallback conversion...`);
      
      // Fallback: use poppler's pdftoppm for conversion
      const pdfPath = path.join(tempDir, `in_${Date.now()}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      
      await new Promise((resolve) => {
        execFile('pdftoppm', ['-png', '-r', String(OCR_DPI), pdfPath, path.join(tempDir, 'out')], (err) => {
          if (err) console.warn('pdftoppm failed:', err.message);
          resolve();
        });
      });
      
      const files = fs.readdirSync(tempDir)
        .filter(f => f.startsWith('out-') && f.endsWith('.png'))
        .sort();
      
      let fbText = '';
      const ocrConfig = { lang: OCR_LANGS, oem: 1, psm: Number(OCR_PSM) };
      
      for (const f of files) {
        try {
          const img = fs.readFileSync(path.join(tempDir, f));
          const buf = await sharp(img).grayscale().normalize().threshold(170).toBuffer();
          const t = await tesseract.recognize(buf, ocrConfig);
          fbText += t + '\n\n';
          console.log(`Fallback OCR for ${f}: ${t.length} characters`);
        } catch (e) {
          console.log(`Fallback OCR failed for ${f}:`, e.message);
        }
      }
      
      normalized = normalizeExtractedText(fbText) || normalized;
      console.log(`Fallback OCR result length: ${normalized.length} characters`);
      console.log(`Fallback OCR preview: ${normalized.slice(0, 300)}`);
    }
    
    return normalized;
    
  } catch (err) {
    console.error('OCR Error:', err.message);
    throw new Error('Erreur lors de l\'extraction OCR du PDF');
  }
}

// OCR for a single image buffer (PNG/JPG)
async function extractTextFromImageBuffer(imageBuffer) {
  try {
    const ocrConfig = {
      lang: OCR_LANGS,
      oem: 1,
      psm: Number(OCR_PSM),
    };
    const preprocessed = await sharp(imageBuffer)
      .grayscale()
      .threshold(180)
      .toBuffer();
    const text = await tesseract.recognize(preprocessed, ocrConfig);
    
    console.log(`Image OCR extracted: ${text.length} characters`);
    console.log(`Image OCR preview: ${text.slice(0, 200)}`);
    
    return normalizeExtractedText(text);
  } catch (err) {
    console.error('OCR Image Error:', err.message);
    return '';
  }
}

/**
 * Check if PDF appears to be scanned (low text content ratio)
 */
function isScannedPDF(extractedText, fileSize) {
  const textLength = extractedText.trim().length;
  const textToSizeRatio = textLength / fileSize;
  
  // If ratio is very low or text is mostly whitespace/symbols, likely scanned
  const hasLittleText = textLength < 100 || textToSizeRatio < 0.001;
  const mostlyNonAlpha = (extractedText.match(/[a-zA-Z]/g) || []).length < textLength * 0.5;
  
  console.log(`PDF Analysis: textLength=${textLength}, fileSize=${fileSize}, ratio=${textToSizeRatio.toFixed(6)}`);
  console.log(`Has little text: ${hasLittleText}, Mostly non-alpha: ${mostlyNonAlpha}`);
  
  return hasLittleText || mostlyNonAlpha;
}

app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const { file, body: { action } } = req;
    if (!file || !action) {
      return res.status(400).json({ error: "Fichier ou action manquant." });
    }
    
    console.log(`\n=== NEW ANALYSIS REQUEST ===`);
    console.log(`File: ${file.originalname}, Size: ${file.size} bytes, Type: ${file.mimetype}`);
    console.log(`Action: ${action}`);
    
    let aiResponse = '';

    if (action === 'resumer' && file.mimetype === 'application/pdf') {
      // 1) Try regular PDF text extraction first
      console.log('\n=== PDF TEXT EXTRACTION ===');
      const pdfData = await pdfParse(file.buffer);
      let text = normalizeExtractedText(pdfData.text);
      
      console.log(`Extracted text length: ${text.length} characters`);
      console.log(`Extracted text preview: ${text.slice(0, 500)}`);
      console.log(`Text extraction complete`);

      // 2) Check if PDF appears to be scanned and use OCR if needed
      const useOCR = process.env.USE_OCR === 'true';
      console.log(`USE_OCR setting: ${useOCR}`);
      
      if (useOCR && isScannedPDF(text, file.buffer.length)) {
        console.log("PDF appears to be scanned, switching to OCR...");
        try {
          text = await extractTextWithOCR(file.buffer);
          console.log("OCR extraction completed");
        } catch (ocrErr) {
          console.error("OCR failed, using original text:", ocrErr.message);
          // Keep original text if OCR fails
        }
      } else {
        console.log("PDF appears to be text-based, using direct extraction");
      }

      // 3) Résumé structuré avec chunking/merge si nécessaire
      const instruction = process.env.PROMPT_PDF || process.env.PDF_PROMPT_PREFIX || '';
      console.log(`Using PDF instruction: ${instruction}`);
      
      aiResponse = await summarizeLongText(process.env.MODEL_PDF || 'llama3.2:1b', text, instruction);

    } else if (action === 'decrire' && file.mimetype.startsWith('image/')) {
      // Toujours décrire l'image avec le modèle vision (LLaVA)
      console.log('\n=== IMAGE ANALYSIS ===');
      
      const base64 = await preprocessImageForVision(file.buffer);
      console.log(`Image preprocessed, base64 length: ${base64.length}`);
      
      const structuredPrompt = buildImageSummaryPrompt({ language: 'fr', basePrompt: process.env.PROMPT_IMG || process.env.IMAGE_PROMPT_PREFIX || '' });
      
      console.log(`\n=== IMAGE PROMPT SENT TO OLLAMA ===`);
      console.log(structuredPrompt);
      console.log(`=== END IMAGE PROMPT ===\n`);
      
      aiResponse = await describeImage(
        process.env.MODEL_IMG || 'llava:7b',
        structuredPrompt,
        base64
      );

    } else {
      console.log(`Unsupported file type or action: ${file.mimetype} / ${action}`);
      return res.status(400).json({ error: "Type de fichier non supporté pour cette action." });
    }

    // 4) Enregistrer et renvoyer la réponse
    console.log(`\n=== SAVING RESPONSE ===`);
    console.log(`Response length: ${aiResponse.length} characters`);
    
    const outDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const timestamp = Date.now(); // <- add timestamp
    const outPath = path.join(outDir, `${action}_${timestamp}_${file.originalname}.txt`);
    fs.writeFileSync(outPath, aiResponse, 'utf-8');
    
    
    console.log(`Response saved to: ${outPath}`);
    console.log(`=== ANALYSIS COMPLETE ===\n`);

    res.download(outPath, err => {
      fs.unlinkSync(outPath);
      if (err) console.error('Erreur envoi fichier:', err);
    });

  } catch (err) {
    console.error('Erreur /analyze:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});


if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`OLLAMA_HOST: ${OLLAMA_HOST}`);
    console.log(`MODEL_PDF: ${process.env.MODEL_PDF || 'llama3.2:1b'}`);
    console.log(`MODEL_IMG: ${process.env.MODEL_IMG || 'llava:7b'}`);
    console.log(`USE_OCR: ${process.env.USE_OCR || 'false'}`);
  });
}

// At the end of server.js
module.exports = app; // This makes it available for require()