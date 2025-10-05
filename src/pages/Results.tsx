import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  AlertCircle,
  Target,
  Loader2,
  Home,
  Download,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AnalysisScores {
  consistency: number;
  depth: number;
  evidence: number;
  conciseness: number;
  arguability: number;
  factuality: number;
}

interface Analysis {
  scores: AnalysisScores;
  strengths: string[];
  critical_issues: string[];
  actionable_steps: string[];
  summary: string;
}

const SCORE_COLORS = {
  high: "text-green-400",
  medium: "text-yellow-400",
  low: "text-red-400",
};

const SCORE_BG = {
  high: "bg-green-400/20",
  medium: "bg-yellow-400/20",
  low: "bg-red-400/20",
};

const getScoreLevel = (score: number): "high" | "medium" | "low" => {
  if (score >= 8) return "high";
  if (score >= 6) return "medium";
  return "low";
};

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sessionId] = useState(location.state?.session_id || "");
  const [transcript] = useState<Message[]>(location.state?.transcript || []);
  const [category] = useState(location.state?.category || "");
  const [sources] = useState<any[]>(location.state?.sources || []);
  
  const [userAnalysis, setUserAnalysis] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  useEffect(() => {
    if (!sessionId || transcript.length === 0) {
      navigate("/setup");
    }
  }, [sessionId, transcript, navigate]);

  // Auto-analyze on mount
  useEffect(() => {
    if (sessionId && !hasAnalyzed) {
      handleAnalyze();
    }
  }, [sessionId, hasAnalyzed]);

  const handleAnalyze = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setHasAnalyzed(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/debate-analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            transcript,
            user_analysis: userAnalysis || undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(errorData.error || errorData.message || "Analysis failed");
      }

      const data = await response.json();
      console.log("Analysis data received:", data);
      setAnalysis(data);
    } catch (error: any) {
      console.error("Error analyzing debate:", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error.message || "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTranscript = () => {
    let content = `DEBATE TRANSCRIPT\n`;
    content += `=================\n\n`;
    content += `Session ID: ${sessionId}\n`;
    content += `Category: ${category}\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Total Turns: ${transcript.length}\n\n`;
    
    content += `CONVERSATION\n`;
    content += `============\n\n`;
    transcript.forEach((msg, idx) => {
      content += `${msg.role === "user" ? "You" : "AI"} (Turn ${idx + 1}):\n`;
      content += `${msg.content}\n\n`;
    });
    
    if (sources && sources.length > 0) {
      content += `\nSOURCES USED\n`;
      content += `============\n\n`;
      sources.forEach((source, idx) => {
        content += `[Source ${idx + 1}] ${source.title}\n`;
        content += `${source.summary}\n`;
        if (source.url) content += `URL: ${source.url}\n`;
        if (source.page) content += `Page: ${source.page}\n`;
        if (source.date) content += `Date: ${source.date}\n`;
        content += `\n`;
      });
    }
    
    if (analysis) {
      content += `\nPERFORMANCE ANALYSIS\n`;
      content += `===================\n\n`;
      content += `Overall Assessment:\n${analysis.summary}\n\n`;
      
      content += `Scores:\n`;
      content += `- Consistency: ${analysis.scores.consistency}/10\n`;
      content += `- Depth: ${analysis.scores.depth}/10\n`;
      content += `- Evidence: ${analysis.scores.evidence}/10\n`;
      content += `- Conciseness: ${analysis.scores.conciseness}/10\n`;
      content += `- Arguability: ${analysis.scores.arguability}/10\n`;
      content += `- Factuality: ${analysis.scores.factuality}/10\n\n`;
      
      content += `Strengths:\n`;
      analysis.strengths.forEach(s => content += `- ${s}\n`);
      
      content += `\nAreas to Address:\n`;
      analysis.critical_issues.forEach(i => content += `- ${i}\n`);
      
      content += `\nNext Steps:\n`;
      analysis.actionable_steps.forEach(a => content += `- ${a}\n`);
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debate-transcript-${sessionId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Transcript saved",
      description: "Your debate transcript has been downloaded as a text file.",
    });
  };

  const ScoreCard = ({ label, score }: { label: string; score: number }) => {
    const level = getScoreLevel(score);
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-white font-semibold text-lg">{label}</h3>
          <div className={`text-3xl font-bold ${SCORE_COLORS[level]}`}>
            {score}
            <span className="text-white/40 text-lg">/10</span>
          </div>
        </div>
        <Progress value={score * 10} className="h-2" />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Header />

      <div className="container max-w-6xl mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-white mb-4">
              Debate Performance Analysis
            </h1>
            <p className="text-white/80 text-xl capitalize">
              {category} Debate • {transcript.length} turns
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-16 h-16 text-secondary animate-spin mb-4" />
              <p className="text-white/80 text-lg">Analyzing your performance...</p>
            </div>
          )}

          {/* Analysis Results */}
          {!isLoading && analysis && (
            <>
              {/* Overall Summary */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-8 border border-white/10">
                <h2 className="text-2xl font-bold text-white mb-4">Overall Assessment</h2>
                <p className="text-white/90 text-lg leading-relaxed">
                  {analysis.summary}
                </p>
              </div>

              {/* Performance Scores */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-6">Performance Scores</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ScoreCard label="Consistency" score={analysis.scores.consistency} />
                  <ScoreCard label="Depth" score={analysis.scores.depth} />
                  <ScoreCard label="Evidence" score={analysis.scores.evidence} />
                  <ScoreCard label="Conciseness" score={analysis.scores.conciseness} />
                  <ScoreCard label="Arguability" score={analysis.scores.arguability} />
                  <ScoreCard label="Factuality" score={analysis.scores.factuality} />
                </div>
              </div>

              {/* Detailed Feedback */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Strengths */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-green-400/20">
                      <Trophy className="w-6 h-6 text-green-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Strengths</h3>
                  </div>
                  <ul className="space-y-3">
                    {analysis.strengths.map((strength, idx) => (
                      <li key={idx} className="flex gap-2">
                        <TrendingUp className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-white/90">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Critical Issues */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-red-400/20">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Areas to Address</h3>
                  </div>
                  <ul className="space-y-3">
                    {analysis.critical_issues.map((issue, idx) => (
                      <li key={idx} className="flex gap-2">
                        <TrendingDown className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-white/90">{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actionable Steps */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-yellow-400/20">
                      <Target className="w-6 h-6 text-yellow-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Next Steps</h3>
                  </div>
                  <ul className="space-y-3">
                    {analysis.actionable_steps.map((step, idx) => (
                      <li key={idx} className="flex gap-2">
                        <Minus className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <span className="text-white/90">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Transcript */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                <h2 className="text-2xl font-bold text-white mb-6">Full Transcript</h2>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {transcript.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl ${
                        msg.role === "user"
                          ? "bg-secondary/20 border-l-4 border-secondary"
                          : "bg-primary/20 border-l-4 border-primary"
                      }`}
                    >
                      <div className="text-xs font-semibold mb-2 text-white/70">
                        {msg.role === "user" ? "You" : "AI"}
                      </div>
                      <div className="text-white/90 whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-center gap-4 mt-8">
                <Button
                  onClick={handleSaveTranscript}
                  size="lg"
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Save Transcript
                </Button>
                <Button
                  onClick={() => navigate("/")}
                  size="lg"
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  <Home className="w-5 h-5 mr-2" />
                  Back to Home
                </Button>
                <Button
                  onClick={() => navigate("/setup")}
                  size="lg"
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                >
                  Start New Debate
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
