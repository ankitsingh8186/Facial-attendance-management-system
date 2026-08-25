# 👁 FaceTrack — Live Facial Attendance System

A real-time facial attendance system with AI-powered face recognition using Claude Vision API.

## How It Works

1. **Open website** → Camera starts automatically
2. **Face detected** → Click "Capture & Mark Attendance" (or enable Auto mode)
3. **Match found** → Attendance marked ✅
4. **No match** → Prompted to register → fills form → marks attendance immediately

## Setup

### Requirements
- Node.js 18+
- Anthropic API Key
- Webcam

### Install & Run

```bash
# 1. Go to project folder
cd facetrack

# 2. Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# 3. Start the server
chmod +x start.sh
./start.sh

# OR manually:
cd backend
npm install
node server.js
```

### Open Browser
```
http://localhost:3001
```

---

## Features

### 📷 Live Camera Tab
- Real-time webcam feed with face guide frame
- **Manual capture**: Click the button
- **Auto mode**: Toggle ON → captures every 5 seconds automatically with countdown
- Flash animation on capture
- Instant AI analysis result

### ✅ Match Found
- Shows employee name, ID, department
- Confidence percentage bar
- Time-stamped attendance record
- Handles "already marked today" gracefully

### ❌ Face Not Recognized
- Shows captured photo
- Inline registration form (name, ID, department)
- One-click "Register & Mark Attendance"
- No page navigation needed!

### 📋 Register Employee Tab
- Upload clear front-facing photo
- Claude Vision analyzes and stores 14+ facial feature descriptors
- Instant confirmation

### 📊 Records Tab
- Date filter
- Stats: Total / Present / Unrecognized / Avg Confidence
- Full attendance table

---

## How Face Recognition Works

Since this uses Claude Vision (not a dedicated face-recognition library), it:

1. **On register**: Sends photo to Claude → extracts 14 facial descriptors (skin tone, face shape, eye color, nose shape, hair, glasses, age range, etc.)
2. **On mark attendance**: Sends captured frame → same process
3. **Compares descriptors**: Weighted scoring across all features
4. **Threshold**: 55% match → considered recognized

### Best Practices
- Use clear, well-lit, front-facing photos for registration
- Good lighting during attendance capture
- Avoid hats/sunglasses during capture

---

## Project Structure

```
facetrack/
├── backend/
│   ├── server.js          # Express server
│   ├── routes/
│   │   ├── employees.js   # Register + face descriptor extraction
│   │   ├── attendance.js  # Mark attendance + matching
│   │   └── db.js         # Simple JSON database
│   ├── data/
│   │   └── db.json       # Employees + attendance records
│   └── uploads/          # Face photos
├── frontend/
│   └── index.html        # Complete SPA frontend
└── start.sh             # Quick start script
```

---

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework, zero dependencies)
- **Backend**: Node.js + Express
- **AI**: Claude claude-opus-4-5 Vision API (face feature extraction)
- **DB**: JSON file (no database setup needed)
- **Camera**: Browser `getUserMedia` API
