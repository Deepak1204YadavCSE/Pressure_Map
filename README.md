# Pressure Map

**Tagline:** "Find Unfair Targets, Not Faulty Workers"  
**Principle:** "Strengthen the system; protect the people in it."

---

## What It Does
Pressure Map is a privacy-first health reporting checker designed for frontline health systems:
- **Group-Level Checks:** Live audits detecting system-level anomalies:
  - *Impossible numbers* (reported > eligible)
  - *Unfair targets* (target > eligible population ceiling)
  - *Spikes* (>50% surge above baseline)
  - *Session mismatches* (high reported numbers despite low completed sessions)
- **Target Feasibility Simulator:** Sandbox allowing supervisors to model proposed quotas against demographic baselines before issuing administrative directives. Includes suggested fair target ranges.
- **Worker Voice Panel:** Anonymous, aggregate feedback mechanism allowing frontline workers to flag unfeasible targets and supply shortages.
- **Privacy by Design:**
  - Zero worker names, patient names, Aadhaar numbers, phone numbers, or personal IDs stored.
  - Small demographic groups (< 30 eligible individuals) are strictly suppressed from KPI counts, charts, maps, and CSV exports.
  - Worker voice issue tallies are displayed only when a catchment block reaches at least 5 submissions.

---

## How to Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Or on Windows PowerShell:
   Copy-Item .env.example .env
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## Demo Credentials & Access

- **Supervisor / Admin:**
  - Username: `admin`
  - Password: `PressureMap2026!` *(from `.env.example`)*
- **Health Worker:**
  - Catchment Block Access Code: `BLOCK-ALPHA1` *(from `backend/data/blockCodes.json`)*

---

## Project Structure
- `frontend/`: Plain HTML, CSS, and vanilla JavaScript (Admin dashboard, Worker portal, Simulator, Responsible Use guide, local vendor libraries)
- `backend/`: Node.js + Express backend (`server.js`, pure logic checks in `logic/`, synthetic demo data in `data/`, and test suites in `test/`)

> **Note:** All data is synthetic demo data. Demo-level login only.

---

## Attribution
Built with the assistance of Google Antigravity.
