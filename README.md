# 🧭 Resource Management Recommender System (RMRS)

A web-based system for **WEA** that automates employee skill extraction from resumes and training documents using an **OCR → NLP → ML pipeline**, then recommends the best-fit employees for project requirements based on **skills, availability/workload, and past performance**.

Developed as a capstone/thesis project.

## 🎯 Purpose

* Remove manual skill tracking by extracting skills, certifications, and experience from uploaded documents
* Help Resource Managers staff projects with ranked, explainable recommendations
* Centralize recruitment, assignments, feedback, and reporting in one platform

## ✨ Features

* **Skill Extraction Pipeline**
  * OCR with Tesseract + OpenCV preprocessing
  * NLP with spaCy: skill normalization, alias merging, canonical master skills
  * scikit-learn classifier trained on employee feedback
  * Employees review and confirm flagged skills via the Employee Portal
* **Recommendation Engine**
  * Weighted composite score: **60% skill match, 25% availability, 15% performance**
  * Primary (required) skills weighted higher than secondary skills
  * Workload computed from task priority (High / Medium / Low)
* **Role-Based Portals**
  * Super Admin / Admin: accounts, branches, audit logs, system settings
  * Human Resources: job postings, applications, interviews, hired employees
  * Resource Manager: projects, requirements, recommendations, assignments, reports
  * Project Manager: tasks, resource requests, performance, feedback requests
  * Employee: profile, documents, assignments, history, feedback
  * Applicant: application portal and CV template
* **Backup & Restore** (Super Admin): streamed JSON export/import that doesn't use Supabase storage
* **Security**: JWT auth, role guards, branch-level access checks, login lockout, audit logging, Supabase RLS
* **Reports & Notifications**: Excel/PDF exports, email notifications

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, React Router, Axios, SweetAlert2 |
| Backend | Node.js, Express 5, JWT, Multer, ExcelJS, PDFKit, Nodemailer |
| Python | Tesseract (pytesseract), OpenCV, spaCy, NLTK, scikit-learn, pandas |
| Database & Auth | Supabase (PostgreSQL) |
| Deployment | Docker, Render, GitHub Actions |

## 📁 Project Structure

```
├── main/                 # React + Vite frontend
│   └── src/frontend/     # Role-based pages (Admin, HR, RM, PM, Employee, Applicant)
├── backend/              # Express API
│   ├── routes/           # Per-role API routes
│   ├── controllers/      # Documents, recommendations, feedback
│   ├── services/         # Recommendation engine, workload, Python bridge
│   ├── sql/              # Database schema and policies
│   ├── tests/            # Regression and skill-normalizer tests
│   └── utils/            # Auth helpers, mailer, validators, audit logger
├── python/
│   ├── modules/          # OCR, NLP, skill classifier, integration
│   └── scripts/          # Daemon and evaluation/accuracy scripts
├── shared-data/          # Skills DB cache and trained model
├── Dockerfile            # Node + Python single image
└── start.sh              # Starts Python daemon, then Node backend
```

## ⚙️ Setup

**Prerequisites:** Node.js 22+, Python 3.10, Tesseract OCR, Poppler, a Supabase project.

1. Clone the repo
```
   git clone https://github.com/LynnCzyla/ResourceManagementRecommenderSystem.git
```
2. Create your Supabase project and run the SQL in `backend/sql/`.
3. Backend:
```
   cd backend
   cp .env.example .env     # fill in your own values
   npm install
   npm run dev
```
4. Python environment:
```
   python -m venv python/venv
   python/venv/bin/pip install -r python/requirements.clean.txt
   python/venv/bin/pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_md-3.7.1/en_core_web_md-3.7.1-py3-none-any.whl
```
5. Frontend:
```
   cd main
   npm install
   npm run dev
```
   Set your Supabase URL/key and API base URL as shown in `src/lib/supabaseClient.js` and `src/config/api.js`.

### Environment variables (`backend/.env`)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`

> ⚠️ Never commit real keys. Use your own `.env` locally.

## 🐳 Deployment

The included `Dockerfile` builds one image with Node (API) and Python (OCR/NLP/ML). `start.sh` launches a warm Python daemon alongside the Node server. Designed for Render + Supabase; a GitHub Actions workflow pings `/api/health` to keep the free-tier backend awake.

## 🧪 Testing

* Backend: `backend/tests/` (regression, skill normalizer)
* Accuracy evaluation scripts for OCR, skill extraction, and classification live in `python/scripts/`

## 👥 Team

* Lynn Czyla Alpuerto
* Romell Ebuen
* Vincent Miguel Soriano

## 📄 License

For academic use. Add a license if you plan to open-source this.
