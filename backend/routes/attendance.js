const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { readDB, writeDB } = require('./db');
const { describeFace, compareFaces } = require('./employees');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => cb(null, `att_${Date.now()}_${uuidv4().slice(0,8)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const MATCH_THRESHOLD = 55; // % confidence to consider a match

// POST /api/attendance/mark
router.post('/mark', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    const db = readDB();
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const imageUrl = `/uploads/${req.file.filename}`;

    // Describe the uploaded face
    let incomingDescriptor;
    try {
      incomingDescriptor = await describeFace(req.file.path);
    } catch (err) {
      return res.status(400).json({ message: 'Could not analyze face: ' + err.message });
    }

    if (!incomingDescriptor.faceDetected) {
      return res.status(400).json({ message: 'No face detected in the image. Please ensure your face is clearly visible.' });
    }

    // Compare against all registered employees
    let bestMatch = null;
    let bestScore = 0;

    for (const emp of db.employees) {
      if (!emp.faceDescriptor) continue;
      const score = compareFaces(incomingDescriptor, emp.faceDescriptor);
      console.log(`Comparing with ${emp.name}: ${score}%`);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = emp;
      }
    }

    console.log(`Best match: ${bestMatch?.name || 'none'} at ${bestScore}%`);

    if (bestMatch && bestScore >= MATCH_THRESHOLD) {
      // Check if already marked today
      const alreadyMarked = db.attendance.find(a => 
        a.employeeId === bestMatch.employeeId && 
        a.date === date && 
        a.status === 'PRESENT'
      );

      if (alreadyMarked) {
        return res.json({
          matched: true,
          alreadyMarked: true,
          message: `${bestMatch.name} already marked present today at ${new Date(alreadyMarked.timestamp).toLocaleTimeString('en-IN')}`,
          attendance: { ...alreadyMarked, employee: bestMatch }
        });
      }

      // Mark attendance
      const record = {
        id: uuidv4(),
        employeeId: bestMatch.employeeId,
        employeeName: bestMatch.name,
        status: 'PRESENT',
        confidence: bestScore,
        date,
        timestamp: now.toISOString(),
        imageUrl
      };

      db.attendance.push(record);
      writeDB(db);

      return res.json({
        matched: true,
        message: `Attendance marked for ${bestMatch.name}`,
        attendance: { ...record, employee: bestMatch }
      });

    } else {
      // Unknown face - save the attempt
      const record = {
        id: uuidv4(),
        employeeId: 'UNKNOWN',
        employeeName: 'Unknown Person',
        status: 'UNRECOGNIZED',
        confidence: bestScore,
        date,
        timestamp: now.toISOString(),
        imageUrl,
        faceDescriptor: incomingDescriptor
      };

      db.attendance.push(record);
      writeDB(db);

      return res.json({
        matched: false,
        message: bestScore > 30 
          ? `No confident match found (best: ${bestScore}%). Please register this person.`
          : 'Face not recognized. Please register this person.',
        attendance: record,
        capturedImageUrl: imageUrl,
        capturedDescriptor: incomingDescriptor
      });
    }

  } catch (err) {
    console.error('Mark attendance error:', err);
    res.status(500).json({ message: 'Attendance failed: ' + err.message });
  }
});

// POST /api/attendance/register-unknown  (register from captured unknown face)
router.post('/register-unknown', upload.none(), async (req, res) => {
  try {
    const { employeeId, name, department, email, capturedImagePath, capturedDescriptor } = req.body;
    if (!employeeId || !name || !capturedImagePath) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const db = readDB();

    if (db.employees.find(e => e.employeeId === employeeId)) {
      return res.status(409).json({ message: `Employee ID ${employeeId} already exists` });
    }

    const descriptor = capturedDescriptor ? JSON.parse(capturedDescriptor) : null;

    const employee = {
      id: uuidv4(),
      employeeId,
      name,
      department: department || 'General',
      email: email || '',
      imageUrl: capturedImagePath,
      faceDescriptor: descriptor,
      registeredAt: new Date().toISOString()
    };

    db.employees.push(employee);

    // Also mark attendance for today
    const now = new Date();
    const record = {
      id: uuidv4(),
      employeeId,
      employeeName: name,
      status: 'PRESENT',
      confidence: 100,
      date: now.toISOString().split('T')[0],
      timestamp: now.toISOString(),
      imageUrl: capturedImagePath
    };

    db.attendance.push(record);
    writeDB(db);

    res.json({ message: `${name} registered and attendance marked!`, employee, attendance: record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed: ' + err.message });
  }
});

// GET /api/attendance
router.get('/', (req, res) => {
  const db = readDB();
  let records = [...db.attendance].reverse();
  if (req.query.date) {
    records = records.filter(r => r.date === req.query.date);
  }
  res.json({ records });
});

// GET /api/attendance/today
router.get('/today', (req, res) => {
  const db = readDB();
  const today = new Date().toISOString().split('T')[0];
  const records = db.attendance.filter(r => r.date === today).reverse();
  res.json({ records });
});

module.exports = router;
