import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  session_id: string;
  transcript: Array<{ role: string; content: string }>;
  user_analysis?: string;
}

interface AnalysisScores {
  consistency: number;
  depth: number;
  evidence: number;
  conciseness: number;
  arguability: number;
  factuality: number;
}

interface AnalysisResponse {
  scores: AnalysisScores;
  strengths: string[];
  critical_issues: string[];
  actionable_steps: string[];
  summary: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, transcript, user_analysis } = await req.json() as AnalyzeRequest;
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    console.log("Analyzing debate:", { session_id, turns: transcript.length });

    // Build transcript text - clearly label STUDENT vs AI
    const transcriptText = transcript
      .map(msg => `${msg.role === 'user' ? 'STUDENT' : 'AI Opponent'}: ${msg.content}`)
      .join("\n\n");

    // Debate coach analysis prompt
    const systemPrompt = `You are an expert debate coach analyzing a STUDENT's debate performance.

CRITICAL: You are ONLY analyzing the STUDENT's arguments (labeled "STUDENT" in the transcript).
IGNORE the AI Opponent's performance - they are just providing context for what the student was responding to.

Your task is to provide a comprehensive performance breakdown of the STUDENT with:
1. Scores (1-10) for six dimensions of the STUDENT's performance
2. Top strengths (2-3 items) shown by the STUDENT
3. Critical issues to address (2-3 items) in the STUDENT's arguments
4. Actionable next steps (3-4 items) for the STUDENT to improve

You MUST respond with valid JSON in this exact format:
{
  "scores": {
    "consistency": <1-10>,
    "depth": <1-10>,
    "evidence": <1-10>,
    "conciseness": <1-10>,
    "arguability": <1-10>,
    "factuality": <1-10>
  },
  "strengths": ["strength 1", "strength 2", ...],
  "critical_issues": ["issue 1", "issue 2", ...],
  "actionable_steps": ["step 1", "step 2", ...],
  "summary": "2-3 sentence overall assessment"
}

Score definitions (evaluate ONLY the STUDENT's performance):
- Consistency: Logical flow and coherence across the STUDENT's arguments
- Depth: Nuance, complexity, and thoroughness of the STUDENT's reasoning
- Evidence: Quality and relevance of supporting evidence in the STUDENT's arguments
- Conciseness: Clarity and brevity of the STUDENT's points without sacrificing substance
- Arguability: Persuasiveness and rhetorical effectiveness of the STUDENT
- Factuality: Accuracy and grounding in verifiable facts in the STUDENT's claims

Be constructive but honest. Identify real weaknesses in the STUDENT's performance and provide specific, actionable feedback for the STUDENT to improve.`;

    const userPrompt = `Debate Transcript:
${transcriptText}

${user_analysis ? `Student's self-assessment: ${user_analysis}` : ''}

Analyze this debate performance and return the JSON analysis.`;

    // Call LLM with function calling for structured output
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
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              scores: {
                type: "object",
                properties: {
                  consistency: { type: "number", minimum: 1, maximum: 10 },
                  depth: { type: "number", minimum: 1, maximum: 10 },
                  evidence: { type: "number", minimum: 1, maximum: 10 },
                  conciseness: { type: "number", minimum: 1, maximum: 10 },
                  arguability: { type: "number", minimum: 1, maximum: 10 },
                  factuality: { type: "number", minimum: 1, maximum: 10 },
                },
                required: ["consistency", "depth", "evidence", "conciseness", "arguability", "factuality"],
              },
              strengths: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 3,
              },
              critical_issues: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 3,
              },
              actionable_steps: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 4,
              },
              summary: { type: "string" },
            },
            required: ["scores", "strengths", "critical_issues", "actionable_steps", "summary"],
          }
        }
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM error:", errorText);
      throw new Error(`Analysis failed: ${errorText}`);
    }

    const llmData = await llmResponse.json();
    
    // Extract JSON response
    const analysis: AnalysisResponse = JSON.parse(llmData.candidates[0].content.parts[0].text);

    console.log("Analysis completed:", analysis.scores);

    return new Response(
      JSON.stringify(analysis),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("Error in debate-analyze:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
