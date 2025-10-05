import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContinueDebateRequest {
  session_id: string;
  user_reply: string;
  turn_index: number;
  category: string;
  debate_experience: string;
  ai_level: string;
  conversation_history: Array<{ role: string; content: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      session_id, 
      user_reply, 
      turn_index,
      category,
      debate_experience,
      ai_level,
      conversation_history 
    } = await req.json() as ContinueDebateRequest;
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const PINECONE_API_KEY = Deno.env.get("PINECONE_API_KEY");
    
    if (!GEMINI_API_KEY || !PINECONE_API_KEY) {
      throw new Error("Missing required API keys");
    }

    console.log("Continuing debate:", { session_id, turn_index });

    // 1. Embed the user's reply
    const embeddingResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        content: {
          parts: [{ text: user_reply }]
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

    // 2. Query both global corpus AND session history
    const [corpusResponse, sessionResponse] = await Promise.all([
      fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/query`, {
        method: "POST",
        headers: {
          "Api-Key": PINECONE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vector: embedding,
          topK: 7,
          includeMetadata: true,
          namespace: "", // Global corpus
        }),
      }),
      fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/query`, {
        method: "POST",
        headers: {
          "Api-Key": PINECONE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vector: embedding,
          topK: 3,
          includeMetadata: true,
          namespace: session_id, // Session-specific
        }),
      }),
    ]);

    if (!corpusResponse.ok || !sessionResponse.ok) {
      throw new Error("Pinecone query failed");
    }

    const corpusData = await corpusResponse.json();
    const sessionData = await sessionResponse.json();
    
    const corpusMatches = corpusData.matches || [];
    const sessionMatches = sessionData.matches || [];
    
    console.log(`Retrieved ${corpusMatches.length} corpus + ${sessionMatches.length} session matches`);

    // 3. Build context (prioritize session history, use all corpus sources)
    const sessionContext = sessionMatches
      .map((match: any) => `[Previous Turn]: ${match.metadata?.text || ""}`)
      .join("\n");

    // USE ALL CORPUS SOURCES
    const corpusContext = corpusMatches
      .map((match: any, idx: number) => {
        const summary = match.metadata?.summary || "No summary available";
        return `[Source ${idx + 1}]: ${summary}`;
      })
      .join("\n\n");

    const conversationSummary = conversation_history
      .slice(-6) // Last 3 exchanges
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
      .join("\n");

    // 4. Build RAG prompt
    const systemPrompt = `You are an expert debater engaged in an ongoing debate.

CRITICAL RULES:
- You have access to ${corpusMatches.length} sources
- ONLY cite sources that exist: [Source 1] through [Source ${corpusMatches.length}]
- NEVER reference source numbers higher than ${corpusMatches.length}
- Use the retrieved context and conversation history, citing sources as [Source N] when using them
- If the retrieved sources are insufficient or don't provide accurate information, you may use your general knowledge
- Always cite sources when using information from them: e.g., "Research indicates [Source 2] that..." or "[Source 5] demonstrates..."
- When using general knowledge (not from sources), do not cite a source number
- Address the user's latest point directly
- Build on previous arguments when relevant
- CRITICAL: Your response MUST be between 100-150 words. Count your words carefully.

Retrieved Corpus Context (all ${corpusMatches.length} sources):
${corpusContext}

Recent Session Context:
${sessionContext}

Recent Conversation:
${conversationSummary}

Debate Topic: ${category}
User Experience: ${debate_experience}
AI Difficulty: ${ai_level}`;

    const userPrompt = `User's latest argument: "${user_reply}"

Provide a counterargument addressing their points in 100-150 words. Cite sources inline when using them.`;

    // 5. Stream counterargument
    const llmResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse", {
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

    // Create a readable stream that forwards the Gemini SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const reader = llmResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let fullAnswer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  
                  if (text) {
                    fullAnswer += text;
                    // Forward the chunk to the client
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text, fullText: fullAnswer })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }

          // Send final metadata
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ 
            done: true, 
            fullText: fullAnswer,
            retrieved: corpusMatches.map((match: any, idx: number) => ({
              id: match.id,
              score: match.score,
              source_number: idx + 1,
              title: match.metadata?.title || `Source ${idx + 1}`,
              summary: match.metadata?.summary || "No summary available",
              page: match.metadata?.page,
              date: match.metadata?.date,
              url: match.metadata?.url,
            })),
            turn_index: turn_index + 1
          })}\n\n`));

          // Store the full answer for embedding
          const answer = fullAnswer;

          // 6. Upsert user turn in background
          const userTurnId = `${session_id}::turn::${turn_index}`;
          fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/vectors/upsert`, {
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
                  text: user_reply,
                  turn_index: turn_index,
                  timestamp: new Date().toISOString(),
                }
              }],
              namespace: session_id,
            }),
          }).catch(e => console.error("User turn upsert error:", e));

          // 7. Upsert AI turn in background
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

          const aiTurnId = `${session_id}::turn::${turn_index + 1}`;
          fetch(`https://debatecraft-index-opophot.svc.aped-4627-b74a.pinecone.io/vectors/upsert`, {
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
                  turn_index: turn_index + 1,
                  timestamp: new Date().toISOString(),
                }
              }],
              namespace: session_id,
            }),
          }).catch(e => console.error("AI turn upsert error:", e));

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("Error in debate-continue:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
