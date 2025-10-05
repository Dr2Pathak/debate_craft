# pinecone_upload.py
import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from tqdm import tqdm

# Pinecone new client
from pinecone import Pinecone

load_dotenv()

# ----------------------
# Config
# ----------------------
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
INDEX_NAME = os.getenv("INDEX_NAME", "debatecraft-index")
BATCH_SIZE = int(os.getenv("PINECONE_BATCH_SIZE", "100"))

if not PINECONE_API_KEY:
    raise RuntimeError("PINECONE_API_KEY not set in environment/.env")

# ----------------------
# Locate embedded JSON
# ----------------------
BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR.parent
PROJECT_ROOT = APP_DIR.parent

candidates = [
    APP_DIR / "summaries_with_embeddings.json",
    PROJECT_ROOT / "summaries_with_embeddings.json",
    BASE_DIR / "summaries_with_embeddings.json",
]

EMBEDDED_JSON = next((c for c in candidates if c.exists()), None)
if EMBEDDED_JSON is None:
    print("Tried paths:")
    for c in candidates:
        print(" -", c)
    raise FileNotFoundError("Could not find summaries_with_embeddings.json")

print("Using embedded JSON:", EMBEDDED_JSON)

with open(EMBEDDED_JSON, "r", encoding="utf-8") as f:
    sources = json.load(f)

print(f"Loaded {len(sources)} records")

# ----------------------
# Infer embedding dimension
# ----------------------
def infer_embedding_dim(records):
    for r in records:
        v = r.get("embedding") or r.get("vector") or r.get("values")
        if isinstance(v, list) and len(v) > 0:
            return len(v)
    return None

EMBEDDING_DIM = infer_embedding_dim(sources)
if EMBEDDING_DIM is None:
    raise RuntimeError("Could not infer embedding dimension from data.")
print("Inferred embedding dim:", EMBEDDING_DIM)

# ----------------------
# Pinecone client + index
# ----------------------
pc = Pinecone(api_key=PINECONE_API_KEY)

# create index if missing (many Pinecone installs require different call signatures;
# best to create manually in console if this fails)
try:
    if not pc.has_index(INDEX_NAME):
        print(f"Index '{INDEX_NAME}' not found. Creating with dim={EMBEDDING_DIM}...")
        pc.create_index(name=INDEX_NAME, dimension=EMBEDDING_DIM, metric="cosine")
        print("Index created.")
    else:
        print(f"Index '{INDEX_NAME}' already exists.")
except Exception as e:
    print("Warning: automatic index creation failed or is unsupported for this SDK/version.")
    print("If the index does not exist, please create it in the Pinecone console with:")
    print(f" - name: {INDEX_NAME}")
    print(f" - dimension: {EMBEDDING_DIM}")
    print("Then re-run this script.")
    # Don't abort yet; attempt to continue (pc.Index will fail later if index missing)

index = pc.Index(INDEX_NAME)

# ----------------------
# Metadata sanitization helpers
# ----------------------
def sanitize_value(v):
    """Convert v into an allowed Pinecone metadata value:
       - string, number, boolean, or list of strings
    """
    # Handle None
    if v is None:
        return ""  # replace None/null with empty string

    # Primitive accepted types: bool, int, float, str
    if isinstance(v, (bool, int, float, str)):
        # ensure booleans remain booleans, numbers remain numbers, strings remain strings
        return v

    # If it's a list/tuple -> convert each element to string (filter None)
    if isinstance(v, (list, tuple)):
        sanitized = []
        for el in v:
            if el is None:
                continue
            # if element is primitive number/bool/string, keep, else convert to str
            if isinstance(el, (bool, int, float, str)):
                sanitized.append(str(el) if not isinstance(el, str) else el)
            else:
                sanitized.append(json.dumps(el, ensure_ascii=False))
        return sanitized

    # For dicts or other objects -> convert to a JSON string
    try:
        return json.dumps(v, ensure_ascii=False)
    except Exception:
        return str(v)

def sanitize_metadata(raw_meta: dict) -> dict:
    """Return a metadata dict with only allowed value types."""
    sanitized = {}
    for k, v in (raw_meta or {}).items():
        try:
            sv = sanitize_value(v)
            # Pinecone requires metadata keys to be strings, values to be allowed types.
            sanitized[k] = sv
        except Exception as e:
            # Fallback to string representation
            sanitized[k] = str(v)
    return sanitized

# ----------------------
# Upsert helpers
# ----------------------
def build_metadata(record):
    """Pick fields to store in metadata and sanitize them."""
    meta = {
        "title": record.get("title", ""),
        "summary": record.get("summary", "") or "",
        "fieldOfStudy": record.get("fieldOfStudy", "") or "",
        "paper_id": str(record.get("paper_id", "")) if record.get("paper_id") is not None else "",
        # Optional extra fields (sanitized)
        "yearPublished": record.get("yearPublished"),
        "doi": record.get("doi"),
        "publisher": record.get("publisher"),
        "citationCount": record.get("citationCount"),
        "authors": record.get("authors"),
        "keywordUsed": record.get("keywordUsed"),
        "detectedField": record.get("detectedField"),
        "searchStrategy": record.get("searchStrategy"),
    }
    return sanitize_metadata(meta)

def upsert_batch(batch, start_idx):
    tuples = []
    for offset, rec in enumerate(batch):
        idx = start_idx + offset
        rec_id = rec.get("id") or rec.get("paper_id") or f"doc_{idx}"
        # ensure string id
        rec_id = str(rec_id)
        vec = rec.get("embedding") or rec.get("vector") or rec.get("values")
        if not isinstance(vec, list):
            raise RuntimeError(f"Missing/invalid embedding for record {rec_id}")
        metadata = build_metadata(rec)
        tuples.append((rec_id, vec, metadata))
    # Upsert tuples
    index.upsert(vectors=tuples)

# ----------------------
# Validate and upload
# ----------------------
# Validate embeddings roughly
invalid = []
for i, r in enumerate(sources):
    v = r.get("embedding") or r.get("vector") or r.get("values")
    if not isinstance(v, list):
        invalid.append((i, "no embedding"))
    elif len(v) != EMBEDDING_DIM:
        invalid.append((i, f"dim {len(v)} != {EMBEDDING_DIM}"))
if invalid:
    print(f"Found {len(invalid)} records with invalid embeddings (first 5): {invalid[:5]}")
    raise RuntimeError("Fix embed shapes before uploading")

total = len(sources)
print(f"Uploading {total} vectors in batches of {BATCH_SIZE}...")

for i in tqdm(range(0, total, BATCH_SIZE)):
    batch = sources[i:i + BATCH_SIZE]
    try:
        upsert_batch(batch, i)
    except Exception as e:
        print(f"Error upserting batch starting at {i}: {e}")
        # Save failing batch for inspection
        tmp = Path(f"failed_batch_{i}.json")
        with open(tmp, "w", encoding="utf-8") as tf:
            json.dump(batch, tf, indent=2, ensure_ascii=False)
        raise
    # small pause
    time.sleep(0.05)

print("Upload complete ")

# Optional quick sanity check
try:
    sample_vec = sources[0]["embedding"]
    res = index.query(vector=sample_vec, top_k=3, include_metadata=True)
    print("Sample query results (raw):")
    print(res)
except Exception as e:
    print("Sanity query failed:", e)
