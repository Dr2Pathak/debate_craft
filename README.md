# DebateCraft

**DebateCraft** is an AI-powered debate simulator that helps users sharpen argumentation skills by debating an adaptive AI opponent. It combines Retrieval-Augmented Generation (RAG), semantic search, streaming speech, and performance analytics to create a realistic training environment for students, professionals, and educators.

---

## Features

- **Interactive AI Debates** — Start a debate by selecting category, debate experience, and AI difficulty; the AI generates concise counterarguments (80–100 words) in real time.  
- **Signup / Signin** — Google OAuth sign-in for user accounts and session persistence.  
- **RAG-Powered Context** — User opening arguments are embedded, then the system retrieves the top-10 most semantically similar sources from Pinecone and uses their `metadata.summary` as the context for generation.  
- **Dynamic Prompting** — Prompts combine: category, user experience, AI level, opening argument, and debate history to produce grounded, evidence-based rebuttals.  
- **Streaming TTS + STT** — ElevenLabs STT for spoken user input and ElevenLabs streaming TTS to play AI counterarguments while text streams.  
- **Source Attribution** — Each AI counterargument includes inline source citations and an aesthetic sources panel showing source metadata and summaries.  
- **Session Memory & Re-ranking** — Each turn is embedded and stored so future retrievals prioritize session context alongside the global corpus.  
- **Performance Feedback** — After a debate, the app outputs scores (1–10) for Consistency, Depth, Evidence, Conciseness, Arguability, and Factuality, plus strengths, critical mistakes, and actionable next steps.  

---

## Tech Stack

- **Frontend & Cloud:** Lovable (React-based)  
- **Backend:** Python (FastAPI) / Supabase
- **Vector Database:** Pinecone (semantic search & retrieval)  
- **Summarization / Generation:** Gemini — `gemini-2.5-flash` (rebuttal generation & summarization of large corpora)  
- **Embedding:** Gemini — `gemini-embedding-001` (embedding 2,000+ sources)  
- **LangChain:** Orchestration for embedding user arguments + difficulty + subject → build retriever & prompt, manage session memory, and run RAG chains.  
- **Speech:** ElevenLabs STT + ElevenLabs streaming TTS (stream audio while text is generated)  

---

## How It Works (end-to-end)

1. **Start debate** — User selects category, debate experience, and AI level; types or speaks an opening argument (STT used if audio).  
2. **Embed & retrieve** — Server-side embedding of the opening argument (Gemini), then query Pinecone `debatecraft` index for top_k=10 matches. Retrieve each match’s `metadata.summary`.  
3. **Build RAG prompt** — LangChain composes a prompt containing user metadata (category, experience, AI level), conversation history, and the top-10 summaries labeled by SourceID. System instruction enforces grounding in provided context.  
4. **Generate & stream** — Gemini (gemini-2.5-flash) generates a counterargument (~80–100 words) while ElevenLabs streaming TTS begins playing audio in parallel so the user hears speech as the text appears.  
5. **Store turn & repeat** — Embed the new user/AI turn and upsert into Pinecone with the pattern `{session_id}::turn::{turn_index}` to support later re-ranking.  
6. **Analyze** — At the end of the session, call a debate-coach prompt to produce JSON scores and actionable feedback.

---

## How RAG System Was Created & Optimized

**Overview:** The RAG pipeline was built and tuned around a large, curated corpus (~2,000+ sources) across five subjects. The pipeline focuses on reliable field detection, strict summarization for semantic search, robust embedding, and clean Pinecone indexing.

### 1) Ingesting 2,000+ sources (5 subjects)  
- Collected sources programmatically from academic APIs using focused keyword strategies per discipline (history, english, politics, business, science).  
- Implemented robust deduplication via `create_paper_id()` (CORE ID / DOI / hash(title+author)).  
- Field detection combined `fieldOfStudy`, title/abstract/fulltext keyword matching, and scored heuristics to map papers to disciplines.  
- The collection script batches requests, respects rate limits, retries transient errors, and saves incremental progress.

### 2) Processing & strict summarization for optimal retrieval  
- Built a summarization pipeline that preprocesses abstracts/full text into compact inputs and calls Gemini with a **strict JSON schema** requirement (summary + fieldOfStudy).  
- The summarizer (`GeminiStrictProcessor`) enforces:
  - A deterministic JSON output (one object per source).
  - A concise ~80-word summary that highlights purpose, methods, findings, and keywords useful for semantic matching.  
- The pipeline validates responses, retries on schema failures, saves failed raw outputs for inspection, and checkpoints progress to allow safe batch processing.

### 3) Embedding 2,000+ sources with `gemini-embedding-001`  
- Batched the summaries and embedded them using Gemini embedding API.  
- Saved embedding vectors with source metadata (title, summary, authors, year, keywords) into `summaries_with_embeddings.json`.  
- Validated embedding dimensionality and integrity before upload.

### 4) Upload & index into Pinecone for retrieval  
- Sanitized metadata to Pinecone-compatible types and uploaded vectors in batches.  
- Used deterministic IDs and stored `metadata.summary` for prompt construction and UI source cards.  
- Performed sanity queries to verify retrieval quality and adjusted batching/rate limits for reliability.

**Optimization notes:**  
- Summaries are tuned to include keywords and claims to maximize embedding signal.  
- Session-based upserts of debate turns enable more relevant context and re-ranking.  
- Combined session + corpus retrieval prioritizes recent turns while preserving broader evidence from the corpus.  
- A strict JSON summarization contract reduces noisy context and improves retrieval precision.
##  Use Cases 
- **Students**: Practice for debate clubs, Model UN, or presentations. 
- **Professionals**: Hone persuasive skills for pitches, interviews, and negotiations.
- **Educators**: Train students in structured, evidence-based arguments.
- **Casual Users**: Enjoy debating AI on any topic, any time.
