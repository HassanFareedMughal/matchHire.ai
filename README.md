# 🚀 matchHire.ai

**matchHire.ai** is an AI-powered, real-time semantic job matching system designed to revolutionize the recruitment process. Unlike traditional keyword-based filters, matchHire.ai leverages a hybrid Natural Language Processing (NLP) framework and Named Entity Recognition (NER) to intelligently understand a candidate's resume and align it dynamically with real-world job postings.

---

## 🌟 Key Features

- 📑 **Smart PDF Extraction**: Seamlessly parses user resumes into raw text data.
- 🌍 **Real-Time Job Fetching**: Integrates with the JSearch API to pull verified, live job postings matching the user's location and desired industry.
- ⚡ **3-Tier Caching Layer**: Redis (Upstash) → MongoDB Atlas → JSearch API. Repeat searches are served in milliseconds, protecting API quota significantly.
- 🗄️ **Persistent Job Storage**: All fetched jobs are stored in MongoDB Atlas with a compound index on `keyword + location` for instant database lookups.
- 🧠 **NER-Enhanced Skill Extraction**: Utilizes a 3-layer `spaCy` NLP pipeline to intelligently map skills while avoiding false positive keywords (e.g., distinguishing between a person named "Ruby" and the "Ruby" programming language).
- 📊 **Hybrid Scoring Engine**: Employs a robust composite scoring algorithm designed around 4 distinct signals:
  1. **Skill Recall (55%)**: Exact and fuzzy string matching (`RapidFuzz`) of required skills.
  2. **Semantic Match (20%)**: TF-IDF context embeddings capturing domain relevance.
  3. **Position Bonus (15%)**: Weighted scoring based on skill positioning within the resume.
  4. **Extra Skills (10%)**: Compensates broad multi-disciplinary knowledge.
- 🎨 **Premium UI/UX**: A responsive, glassmorphic React dashboard featuring color-coded visual scoring limits and comprehensive score breakdown analytics.

---

## 🏗️ System Architecture

The project operates across a three-tier architecture ensuring clean separation of concerns:

```mermaid
graph TD
    A[React Client] -->|1. Upload PDF & Search Parameters| B(Node.js / Express Backend)
    B -->|2. Check Cache| R[(Redis - Upstash)]
    R -.->|3a. Cache HIT → Return instantly| B
    R -->|3b. Cache MISS| M[(MongoDB Atlas)]
    M -.->|4a. DB HIT → Cache + Return| B
    M -->|4b. DB MISS| C[JSearch API]
    C -.->|5. Save to MongoDB + Redis| B
    B -->|6. Pipe Resume + Jobs via child_process| D{Python AI Engine}
    D -->|7. Tokenize & Lemmatize| E[spaCy NER Pipeline]
    E -->|8. Calculate Matrix| F[TF-IDF + RapidFuzz Engine]
    F -->|9. Output JSON Scores| B
    B -->|10. Enriched Result Set| A
    A -->|11. Render Results & Breakdowns| Z[User Interface]

    classDef react fill:#61DAFB,stroke:#333,stroke-width:2px,color:#000;
    classDef node fill:#68A063,stroke:#333,stroke-width:2px,color:#fff;
    classDef python fill:#FFD43B,stroke:#333,stroke-width:2px,color:#000;
    classDef db fill:#4DB33D,stroke:#333,stroke-width:2px,color:#fff;
    classDef cache fill:#DC382D,stroke:#333,stroke-width:2px,color:#fff;

    class A,Z react;
    class B node;
    class D,E,F python;
    class M db;
    class R cache;
```

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | React 19, Vite, Tailwind CSS v4, Axios |
| **Backend** | Node.js, Express.js, Multer, `pdf-parse`, Mongoose, ioredis |
| **Database** | MongoDB Atlas (cloud, AWS Mumbai) — persistent job storage |
| **Cache** | Upstash Redis (cloud, AWS Mumbai) — TTL-based in-memory cache |
| **AI / Machine Learning** | Python 3, `scikit-learn` (TF-IDF), `spaCy` (NER & Lemmatization), `rapidfuzz` (string matching) |

---

## 🚀 Installation & Setup

> [!IMPORTANT]
> To run this project locally, you must install Node.js (v18+) and Python 3.10+. Provide your own RapidAPI / JSearch API key inside a `.env` file within the `backend/` directory.

### 1. Setup the Python AI Engine
```bash
cd ai-engine
# Install core Python dependencies
pip install scikit-learn rapidfuzz spacy

# Download the English NER model
python -m spacy download en_core_web_sm
```

### 2. Setup the Node.js Backend
```bash
cd ../backend

# Install node modules
npm install

# Create environment variables (.env)
# Copy the template below and fill in your real credentials
```

Create a `backend/.env` file with the following:
```env
PORT=5000
RAPIDAPI_KEY=your_rapidapi_key_here

# MongoDB Atlas — get from cloud.mongodb.com → Connect → Drivers
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/matchhire

# Upstash Redis — get from console.upstash.com → Connect → ioredis
REDIS_URL=rediss://:<password>@<your-host>.upstash.io:6380

# Cache TTL in seconds (3600 = 1 hour)
REDIS_TTL_SECONDS=3600
```

```bash
# Run the backend
npm run dev
```

### 3. Setup the React Frontend
```bash
cd ../frontend

# Install node modules
npm install

# Run the Vite dev server
npm run dev
```

Visit `http://localhost:5173/` in your browser.

---

## 🗄️ Database Integration

Starting **May 2026**, matchHire.ai uses a **3-tier caching architecture** to reduce JSearch API costs and dramatically improve response times.

### How It Works

```
Request → Redis Cache → MongoDB → JSearch API
```

| Tier | Store | Latency | When Used |
| :--- | :--- | :--- | :--- |
| 1 | **Upstash Redis** | ~1ms | Same query within TTL window |
| 2 | **MongoDB Atlas** | ~50ms | Query seen before, Redis expired |
| 3 | **JSearch API** | ~2000ms | Brand new query never seen before |

### Cache Key Format
```
jobs:{keyword}:{location}
// e.g.  jobs:react:remote
//       jobs:python:new york
```

### New Backend Files
```
backend/
├── config/
│   ├── db.js            ← MongoDB Atlas connection (Mongoose)
│   └── redis.js         ← Upstash Redis client (ioredis + TLS)
├── models/
│   └── Job.js           ← Mongoose schema, indexed on keyword+location
└── services/
    └── jobService.js    ← 3-tier lookup logic
```

### Live Dashboard Snapshots

**MongoDB Atlas — Cluster Metrics** *(Opcounters spiking on first data ingestion)*
![MongoDB Atlas Metrics](docs/screenshots/mongodb_atlas_metrics.png)

**MongoDB Atlas Charts** *(Jobs stored by keyword — `react` vs `react developer`)*
![MongoDB Charts](docs/screenshots/mongodb_charts.png)

**Upstash Redis Dashboard** *(Cache commands firing on search requests)*
![Upstash Redis Dashboard](docs/screenshots/upstash_redis_dashboard.png)

---

## 🔍 How the AI Engine Works (In Depth)

The `matcher.py` script receives requests via standard input (IPC). It implements a cutting-edge skill-extraction methodology:

1. **PhraseMatcher**: A custom dictionary (`TECH_SKILLS`) is injected into the NLP engine to correctly identify heavy multi-word skill sets ("machine learning", "react native") without splitting context.
2. **Entity Exclusion**: The pre-trained `en_core_web_sm` model flags semantic clusters (`PERSON`, `ORG`, `GPE`). If a term maps to an Organization (like "Microsoft"), it skips analyzing it as an applicable trait *unless* the dictionary aggressively overrides it.
3. **Normalization**: Every token extracted is cross-referenced using a curated Synonym Lexicon (e.g. `K8s` -> `Kubernetes`, `JS` -> `JavaScript`).

> [!TIP]
> **Extending the Engine**: To add new skills or support entirely new industries, open `ai-engine/matcher.py` and modify the `TECH_SKILLS` set and `SYNONYMS` dictionaries.

---

## 📄 License & Academic Integrity

This project is authored as a Final Year Project. Architecture decisions, custom styling, tailored NLP methodology, and overall structure were deeply optimized to handle accurate real-world context data. All external libraries conform to MIT / open-source licensing.

---

*Last updated: May 2026 — Added MongoDB Atlas + Upstash Redis 3-tier caching layer.*
