const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const { readDB, writeDB } = require('./db');

const client = new Anthropic();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => cb(null, `emp_${Date.now()}_${uuidv4().slice(0,8)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Describe face features using Claude Vision
async function describeFace(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        },
        {
          type: 'text',
          text: `Analyze this face and provide a detailed descriptor JSON for facial recognition. 
Return ONLY valid JSON with these fields:
{
  "faceDetected": boolean,
  "skinTone": "very_light|light|medium|olive|brown|dark",
  "faceShape": "oval|round|square|heart|oblong|diamond",
  "eyeColor": "brown|black|blue|green|hazel|gray",
  "eyeShape": "almond|round|hooded|monolid|upturned|downturned",
  "eyebrowShape": "straight|arched|curved|flat|angled",
  "noseShape": "button|flat|roman|greek|nubian|hawk",
  "lipShape": "thin|medium|full|heart|wide|small",
  "facialHair": "none|stubble|beard|mustache|goatee",
  "hairColor": "black|dark_brown|brown|light_brown|blonde|red|gray|white|bald",
  "hairStyle": "short|medium|long|curly|wavy|straight|bald|tied",
  "ageRange": "child|teen|20s|30s|40s|50s|60s|70plus",
  "gender": "male|female|unknown",
  "distinctiveFeatures": ["list", "of", "notable", "features"],
  "glasses": boolean,
  "glassesType": "none|rimless|full_frame|half_frame|sunglasses",
  "uniqueMarkers": "any birthmarks, scars, dimples etc as string"
}`
        }
      ]
    }]
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]);
}

// Compare two face descriptors
function compareFaces(desc1, desc2) {
  if (!desc1.faceDetected || !desc2.faceDetected) return 0;

  const weights = {
    skinTone: 10,
    faceShape: 12,
    eyeColor: 15,
    eyeShape: 12,
    eyebrowShape: 8,
    noseShape: 8,
    lipShape: 6,
    facialHair: 10,
    hairColor: 10,
    hairStyle: 5,
    ageRange: 8,
    gender: 15,
    glasses: 10,
    glassesType: 8
  };

  let score = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    totalWeight += weight;
    if (desc1[key] !== undefined && desc2[key] !== undefined) {
      if (typeof desc1[key] === 'boolean') {
        if (desc1[key] === desc2[key]) score += weight;
      } else {
        if (desc1[key] === desc2[key]) score += weight;
        else {
          // Partial credit for close matches
          const v1 = String(desc1[key]);
          const v2 = String(desc2[key]);
          if (v1.includes(v2) || v2.includes(v1)) score += weight * 0.5;
        }
      }
    }
  }

  // Check distinctive features overlap
  if (desc1.distinctiveFeatures && desc2.distinctiveFeatures) {
    const overlap = desc1.distinctiveFeatures.filter(f => 
      desc2.distinctiveFeatures.some(f2 => f.toLowerCase().includes(f2.toLowerCase()) || f2.toLowerCase().includes(f.toLowerCase()))
    );
    if (overlap.length > 0) score += 10;
    totalWeight += 10;
  }

  // Check unique markers
  if (desc1.uniqueMarkers && desc2.uniqueMarkers && desc1.uniqueMarkers !== 'none' && desc2.uniqueMarkers !== 'none') {
    if (desc1.uniqueMarkers.toLowerCase() === desc2.uniqueMarkers.toLowerCase()) {
      score += 20;
    }
    totalWeight += 20;
  }

  return Math.round((score / totalWeight) * 100);
}

// POST /api/employees/register
router.post('/register', upload.single('image'), async (req, res) => {
  try {
    const { employeeId, name, department, email } = req.body;
    if (!employeeId || !name) {
      return res.status(400).json({ message: 'Employee ID and Name are required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Face photo is required' });
    }

    const db = readDB();

    // Check duplicate ID
    if (db.employees.find(e => e.employeeId === employeeId)) {
      return res.status(409).json({ message: `Employee ID ${employeeId} already exists` });
    }

    // Analyze face
    const faceDescriptor = await describeFace(req.file.path);
    if (!faceDescriptor.faceDetected) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'No face detected in the uploaded photo. Please use a clear front-facing photo.' });
    }

    const employee = {
      id: uuidv4(),
      employeeId,
      name,
      department: department || 'General',
      email: email || '',
      imageUrl: `/uploads/${req.file.filename}`,
      faceDescriptor,
      registeredAt: new Date().toISOString()
    };

    db.employees.push(employee);
    writeDB(db);

    res.json({ message: 'Employee registered successfully', employee: { ...employee, faceDescriptor: undefined } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

// GET /api/employees
router.get('/', (req, res) => {
  const db = readDB();
  res.json({ employees: db.employees.map(e => ({ ...e, faceDescriptor: undefined })) });
});

module.exports = { router, describeFace, compareFaces };
