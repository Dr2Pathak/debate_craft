# embeddings.py
import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from tqdm import tqdm
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in .env")

# Create Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

# Configuration
BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR.parent
PROJECT_ROOT = APP_DIR.parent

# Try to find summaries_all.json in multiple locations
candidates = [
    APP_DIR / "summaries_all.json",
    PROJECT_ROOT / "summaries_all.json", 
    BASE_DIR / "summaries_all.json",
]

INPUT_JSON = None
for c in candidates:
    if c.exists():
        INPUT_JSON = c
        break

if INPUT_JSON is None:
    print("Input missing. Tried the following paths:")
    for c in candidates:
        print(" -", str(c))
    raise FileNotFoundError("Could not find summaries_all.json")

OUTPUT_JSON = INPUT_JSON.parent / "summaries_with_embeddings.json"
BATCH_SIZE = 40
EMBEDDING_MODEL = "gemini-embedding-001"

print(f"Using input file: {INPUT_JSON}")

# Load input JSON
with open(INPUT_JSON, "r", encoding="utf-8") as f:
    sources = json.load(f)

# Filter out sources with neither summary nor abstract
sources = [
    s for s in sources if (s.get("summary") or s.get("abstract"))
]

print(f"Total sources to embed: {len(sources)}")

# Process in batches
all_embedded = []
for i in tqdm(range(0, len(sources), BATCH_SIZE)):
    batch = sources[i:i+BATCH_SIZE]
    texts_to_embed = [
        s.get("summary") or s.get("abstract") for s in batch
    ]

    # Call Gemini embedding
    try:
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=texts_to_embed
        )
        embeddings_objs = result.embeddings  # list of embedding objects

        # Attach embeddings to corresponding source
        for src, emb_obj in zip(batch, embeddings_objs):
            src["embedding"] = emb_obj.values  # full-dim embedding vector
            all_embedded.append(src)

    except Exception as e:
        print(f" Error embedding batch {i}-{i+BATCH_SIZE}: {e}")
        continue

    # Optional: small delay to avoid rate limits
    time.sleep(0.2)

# Save output JSON
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(all_embedded, f, indent=2, ensure_ascii=False)

print(f" Embeddings complete. Saved {len(all_embedded)} sources to {OUTPUT_JSON}")