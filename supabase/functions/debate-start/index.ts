import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StartDebateRequest {
  category: string;
  debate_experience: string;
  ai_level: string;
  opening_argument: string;
  session_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, debate_experience, ai_level, opening_argument, session_id } = await req.json() as StartDebateRequest;
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
    
    if (!GEMINI_API_KEY || !PINECONE_API_KEY) {
      throw new Error("Missing required API keys");
    }

    const currentSessionId = session_id || crypto.randomUUID();
    const turnIndex = 0;

    console.log("Starting debate:", { category, debate_experience, ai_level, session_id: currentSessionId });

    // 1. Embed the opening argument using Gemini gemini-embedding-001
    const embeddingResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        content: {
          parts: [{ text: opening_argument }]
        }
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding error:", errorText);
      throw new Error(`Embedding failed: ${errorText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.embedding.values;

    // 2. Query Pinecone for relevant context
    const pineconeResponse = await fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/query`, {
      method: "POST",
      headers: {
        "Api-Key": PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector: embedding,
        topK: 10,
        includeMetadata: true,
        namespace: "", // Query global corpus
      }),
    });

    if (!pineconeResponse.ok) {
      const errorText = await pineconeResponse.text();
      console.error("Pinecone query error:", errorText);
      throw new Error(`Pinecone query failed: ${errorText}`);
    }

    const pineconeData = await pineconeResponse.json();
    const matches = pineconeData.matches || [];
    
    console.log(`Retrieved ${matches.length} matches from Pinecone`);

    // 3. Build context from retrieved documents - USE ALL SOURCES
    const contextParts = matches.map((match: any, idx: number) => {
      const summary = match.metadata?.summary || "No summary available";
      return `[Source ${idx + 1}]: ${summary}`;
    });

    const context = contextParts.join("\n\n");

    // 4. Build RAG prompt for counterargument
    const systemPrompt = `You are an expert debater. Your task is to provide a concise, well-reasoned counterargument to the user's position.

CRITICAL RULES:
- You have access to ${matches.length} sources
- ONLY cite sources that exist: [Source 1] through [Source ${matches.length}]
- NEVER reference source numbers higher than ${matches.length}
- Use the retrieved context provided below, citing sources as [Source N] when using them
- If the retrieved sources are insufficient or don't provide accurate information for a specific point, you may use your general knowledge
- Always cite sources when using information from them: e.g., "According to [Source 1], ..." or "Studies show [Source 2] that..."
- When using general knowledge (not from sources), do not cite a source number
- Be direct, factual, and persuasive
- CRITICAL: Your response MUST be between 100-150 words. Count your words carefully.

Retrieved Context (all ${matches.length} sources):
${context}

Debate Topic: ${category}
User Experience Level: ${debate_experience}
AI Difficulty: ${ai_level}`;

    const userPrompt = `User's opening argument: "${opening_argument}"

Provide a counterargument addressing their key points in 100-150 words. Cite sources inline when using them.`;

    // 5. Generate counterargument with Gemini
    const llmResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\n${userPrompt}`
          }]
        }],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 2000,
        }
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM error:", errorText);
      throw new Error(`LLM generation failed: ${errorText}`);
    }

    const llmData = await llmResponse.json();
    console.log("LLM response:", JSON.stringify(llmData, null, 2));
    
    if (!llmData.candidates || !llmData.candidates[0]?.content?.parts?.[0]?.text) {
      console.error("Invalid LLM response structure:", llmData);
      throw new Error("Invalid response from AI model");
    }
    
    const answer = llmData.candidates[0].content.parts[0].text;

    console.log("Generated answer:", answer.substring(0, 100) + "...");

    // 6. Upsert user turn to Pinecone
    const userTurnId = `${currentSessionId}::turn::${turnIndex}`;
    await fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/vectors/upsert`, {
      method: "POST",
      headers: {
        "Api-Key": PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vectors: [{
          id: userTurnId,
          values: embedding,
          metadata: {
            role: "user",
            text: opening_argument,
            turn_index: turnIndex,
            timestamp: new Date().toISOString(),
            category,
            debate_experience,
            ai_level,
          }
        }],
        namespace: currentSessionId,
      }),
    });

    // 7. Upsert AI turn to Pinecone
    const aiEmbeddingResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        content: {
          parts: [{ text: answer }]
        }
      }),
    });

    const aiEmbeddingData = await aiEmbeddingResponse.json();
    const aiEmbedding = aiEmbeddingData.embedding.values;

    const aiTurnId = `${currentSessionId}::turn::${turnIndex + 1}`;
    await fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/vectors/upsert`, {
      method: "POST",
      headers: {
        "Api-Key": PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vectors: [{
          id: aiTurnId,
          values: aiEmbedding,
          metadata: {
            role: "assistant",
            text: answer,
            turn_index: turnIndex + 1,
            timestamp: new Date().toISOString(),
          }
        }],
        namespace: currentSessionId,
      }),
    });

    // 8. Format retrieved sources for frontend
    const retrieved = matches.map((match: any, idx: number) => ({
      id: match.id,
      score: match.score,
      source_number: idx + 1,
      title: match.metadata?.title || `Source ${idx + 1}`,
      summary: match.metadata?.summary || "No summary available",
      page: match.metadata?.page,
      date: match.metadata?.date,
      url: match.metadata?.url,
    }));

    return new Response(
      JSON.stringify({
        answer,
        retrieved,
        session_id: currentSessionId,
        turn_index: turnIndex + 1,
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("Error in debate-start:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
