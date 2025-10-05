import os
import json
import time
import traceback
from typing import List, Dict, Any
from pathlib import Path
from dotenv import load_dotenv
from tqdm import tqdm
from jsonschema import validate, ValidationError
from google import genai

BATCH_SIZE = 498
CHECKPOINT_FILE = "processed_ids.json"

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in .env")

client = genai.Client(api_key=GEMINI_API_KEY)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

STRICT_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "fieldOfStudy": {"type": "string"}
    },
    "required": ["summary", "fieldOfStudy"]
}

class GeminiStrictProcessor:
    def __init__(self, model_name: str = GEMINI_MODEL):
        self.model_name = model_name
        self.client = client
        print(f"🔧 GeminiStrictProcessor initialized with model: {self.model_name}")

    def preprocess_source_text(self, source_data: Dict) -> Dict:
        processed = source_data.copy()
        text_parts = []

        if source_data.get("hasAbstract") and source_data.get("abstract"):
            text_parts.append(f"Abstract: {source_data['abstract']}")

        if source_data.get("hasFullText") and source_data.get("fullText"):
            full_text = source_data["fullText"]
            if len(full_text) > 3000:
                text_parts.append(f"Text Start: {full_text[:1500]}")
                text_parts.append(f"Text End: {full_text[-1500:]}")
            else:
                text_parts.append(f"Full Text: {full_text}")

        processed["processedText"] = "\n\n".join(text_parts)
        processed.pop("fullText", None)
        return processed

    def build_prompt(self, processed_source: Dict) -> str:
        essential_data = {
            "processedText": processed_source.get("processedText", ""),
            "detectedField": processed_source.get("detectedField", ""),
            "searchStrategy": processed_source.get("searchStrategy", ""),
        }

        return f"""
You are a fast summarization assistant optimized for producing strict JSON for bulk ingestion.

Use ONLY the 'processedText' (and optionally 'detectedField'/'searchStrategy').

Return EXACTLY one JSON object that conforms to this schema:
{{ "summary": "...", "fieldOfStudy": "..." }}

Rules:
- summary: ~80 words (±15), one paragraph; include purpose, key methods (if present), main findings/claims, and keywords/entities useful for semantic search.
- fieldOfStudy: cleaned detectedField (underscores -> spaces, capitalized) plus important keywords if present.
- DO NOT include document type, geographical region, or language.
- Output MUST be valid JSON only (no markdown fences, no commentary, no extra fields).
- If you cannot find a field, return an empty string for it, but still output the JSON object.

Input (use ONLY processedText + small metadata):
{json.dumps(essential_data, indent=2)}
"""

    def call_gemini_with_schema(self, prompt: str, max_retries: int = 3) -> Dict[str, Any]:
        last_raw = None
        for attempt in range(1, max_retries + 1):
            try:
                config = {
                    "max_output_tokens": 400,
                    "thinking_config": {"thinking_budget": 0},
                    "response_mime_type": "application/json",
                    "response_schema": STRICT_SUMMARY_SCHEMA
                }

                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=config
                )

                raw_text = getattr(response, "text", None)
                if raw_text is None:
                    out = getattr(response, "output", None)
                    if out:
                        parts = [p.get("text", "") for p in out if isinstance(p, dict)]
                        raw_text = "\n".join(parts)
                    else:
                        raw_text = str(response)

                last_raw = raw_text

                try:
                    parsed = json.loads(raw_text)
                except Exception:
                    parsed = self._extract_json_substring(raw_text)

                validate(instance=parsed, schema=STRICT_SUMMARY_SCHEMA)
                return parsed

            except ValidationError as ve:
                print(f"⚠️ Validation failed on attempt {attempt}/{max_retries}: {ve}")
                print("Raw response (truncated):", (last_raw or "")[:1000])
                if attempt < max_retries:
                    prompt += "\n\nImportant: OUTPUT EXACTLY the JSON and NOTHING ELSE."
                    time.sleep(1 + attempt)
                    continue
                else:
                    self._save_failed_raw(last_raw)
                    raise

            except Exception as e:
                print(f"⚠️ Gemini call error on attempt {attempt}/{max_retries}: {e}")
                print("Raw response (truncated):", (last_raw or "")[:1000])
                if attempt < max_retries:
                    time.sleep(1 + attempt)
                    continue
                else:
                    self._save_failed_raw(last_raw)
                    raise

        raise RuntimeError("Gemini response did not validate after retries")

    def _extract_json_substring(self, txt: str) -> Dict[str, Any]:
        cleaned = txt.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        first = cleaned.find("{")
        last = cleaned.rfind("}")
        if first == -1 or last == -1 or last <= first:
            raise ValueError("No JSON object found in text")
        return json.loads(cleaned[first:last + 1])

    def _save_failed_raw(self, raw: str):
        try:
            debug_path = Path("failed_raw_responses.jsonl")
            with open(debug_path, "a", encoding="utf-8") as f:
                record = {"raw": raw, "timestamp": time.time()}
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(f"🔖 Saved raw failed response to {debug_path}")
        except Exception as e:
            print("⚠️ Could not save failed raw response:", e)

    def process_source(self, source: Dict) -> Dict:
        processed = self.preprocess_source_text(source)
        prompt = self.build_prompt(processed)
        try:
            parsed = self.call_gemini_with_schema(prompt)
            summary = parsed.get("summary", "").strip()
            field = parsed.get("fieldOfStudy", "").strip()
            if not summary:
                raise ValueError("Empty summary in validated response")

            final = source.copy()
            final["summary"] = summary
            final["fieldOfStudy"] = field
            final["id"] = source.get("id", "")
            final["paper_id"] = source.get("paper_id", "")
            final.pop("fullText", None)
            final.pop("hasFullText", None)
            return final
        except Exception as e:
            print(f"❌ Failed to process source '{source.get('title','Unknown')}': {e}")
            traceback.print_exc()
            return None

def save_checkpoint(processed_ids: List[str]):
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(processed_ids, f, indent=2)

def load_checkpoint() -> List[str]:
    if Path(CHECKPOINT_FILE).exists():
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def merge_all_batches(output_dir: Path, final_file: Path):
    merged = []
    for batch_file in sorted(output_dir.glob("summaries_batch_*.json")):
        with open(batch_file, "r", encoding="utf-8") as f:
            merged.extend(json.load(f))
    with open(final_file, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    print(f"✅ All batches merged into {final_file}")

def main():
    BASE_DIR = Path(__file__).resolve().parent
    APP_DIR = BASE_DIR.parent
    PROJECT_ROOT = APP_DIR.parent

    candidates = [
        APP_DIR / "debate_sources.json",
        PROJECT_ROOT / "debate_sources.json",
        BASE_DIR / "debate_sources.json",
    ]

    input_path = next((c for c in candidates if c.exists()), None)
    if input_path is None:
        print("Input missing. Tried the following paths:")
        for c in candidates:
            print(" -", str(c))
        return

    print("Using input file:", str(input_path))

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    all_sources: List[Dict] = []
    if isinstance(data, dict):
        for _, lst in data.items():
            if isinstance(lst, list):
                all_sources.extend(lst)
    elif isinstance(data, list):
        all_sources = data
    else:
        raise RuntimeError("Unsupported input top-level type")

    processed_ids = set(load_checkpoint())
    processor = GeminiStrictProcessor()
    results_batch = []
    batch_count = 0

    for source in tqdm(all_sources):
        source_id = source.get("id") or source.get("paper_id")
        if source_id in processed_ids:
            continue

        out = processor.process_source(source)
        if out:
            results_batch.append(out)
            processed_ids.add(source_id)

        if len(results_batch) >= BATCH_SIZE:
            batch_file = input_path.parent / f"summaries_batch_{batch_count}.json"
            with open(batch_file, "w", encoding="utf-8") as f:
                json.dump(results_batch, f, indent=2, ensure_ascii=False)
            print(f"🔖 Saved batch {batch_count} with {len(results_batch)} results to {batch_file}")
            results_batch = []
            batch_count += 1
            save_checkpoint(list(processed_ids))

        time.sleep(1)

    if results_batch:
        batch_file = input_path.parent / f"summaries_batch_{batch_count}.json"
        with open(batch_file, "w", encoding="utf-8") as f:
            json.dump(results_batch, f, indent=2, ensure_ascii=False)
        print(f"🔖 Saved final batch {batch_count} with {len(results_batch)} results to {batch_file}")
        save_checkpoint(list(processed_ids))

    # Merge all batches
    final_file = input_path.parent / "summaries_all.json"
    merge_all_batches(input_path.parent, final_file)
    print("✅ Processing complete.")

if __name__ == "__main__":
    main()
