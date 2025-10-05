import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  Scale,
  FlaskConical,
  Briefcase,
  Landmark,
  Loader2,
  ArrowLeft,
} from "lucide-react";

const CATEGORIES = [
  { id: "english", label: "English", icon: BookOpen },
  { id: "politics", label: "Politics", icon: Scale },
  { id: "science", label: "Science", icon: FlaskConical },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "history", label: "History", icon: Landmark },
];

const EXPERIENCE_LABELS = ["Beginner", "Intermediate", "Advanced", "Expert"];
const AI_LEVEL_LABELS = ["Casual", "Moderate", "Competitive", "Expert"];

export default function Setup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [userExperience, setUserExperience] = useState([1]);
  const [aiLevel, setAiLevel] = useState([1]);
  const [openingArgument, setOpeningArgument] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  const handleStartDebate = async () => {
    if (!selectedCategory) {
      toast({
        variant: "destructive",
        title: "Select a category",
        description: "Please choose a debate topic to continue.",
      });
      return;
    }

    if (openingArgument.trim().length < 20) {
      toast({
        variant: "destructive",
        title: "Opening argument required",
        description: "Please provide an opening argument (at least 20 characters).",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/debate-start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            category: selectedCategory,
            debate_experience: EXPERIENCE_LABELS[userExperience[0]],
            ai_level: AI_LEVEL_LABELS[aiLevel[0]],
            opening_argument: openingArgument,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start debate");
      }

      const data = await response.json();

      // Navigate to debate page with state
      navigate("/debate", {
        state: {
          session_id: data.session_id,
          category: selectedCategory,
          debate_experience: EXPERIENCE_LABELS[userExperience[0]],
          ai_level: AI_LEVEL_LABELS[aiLevel[0]],
          conversation: [
            { role: "user", content: openingArgument },
            { role: "assistant", content: data.answer },
          ],
          source_groups: [
            {
              turnIndex: data.turn_index,
              sources: data.retrieved,
            },
          ],
          turn_index: data.turn_index,
        },
      });
    } catch (error: any) {
      console.error("Error starting debate:", error);
      toast({
        variant: "destructive",
        title: "Failed to start debate",
        description: error.message || "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container max-w-4xl mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Back Button */}
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="mb-6 text-foreground hover:bg-card"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          <h1 className="text-5xl font-bold text-primary text-center mb-12">
            Setup Your Debate
          </h1>

          {/* Category Selection */}
          <div className="mb-12">
            <Label className="text-foreground text-xl mb-4 block">Choose Topic</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {CATEGORIES.map((cat) => (
                <motion.button
                  key={cat.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-6 rounded-xl flex flex-col items-center gap-3 transition-all border ${
                    selectedCategory === cat.id
                      ? "bg-primary text-primary-foreground shadow-[var(--glow-primary)] border-primary"
                      : "bg-card text-foreground hover:bg-card/80 border-primary/20"
                  }`}
                >
                  <cat.icon className="w-8 h-8" />
                  <span className="font-semibold">{cat.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* User Experience Level */}
          <div className="mb-12">
            <Label className="text-foreground text-xl mb-4 block">
              Your Debate Experience
            </Label>
            <div className="bg-card border border-primary/20 p-6 rounded-xl shadow-lg">
              <Slider
                value={userExperience}
                onValueChange={setUserExperience}
                min={0}
                max={3}
                step={1}
                className="mb-4"
              />
              <div className="flex justify-between text-muted-foreground text-sm">
                {EXPERIENCE_LABELS.map((label, idx) => (
                  <span
                    key={idx}
                    className={
                      userExperience[0] === idx ? "text-secondary font-bold" : ""
                    }
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* AI Difficulty Level */}
          <div className="mb-12">
            <Label className="text-foreground text-xl mb-4 block">
              AI Debate Level
            </Label>
            <div className="bg-card border border-primary/20 p-6 rounded-xl shadow-lg">
              <Slider
                value={aiLevel}
                onValueChange={setAiLevel}
                min={0}
                max={3}
                step={1}
                className="mb-4"
              />
              <div className="flex justify-between text-muted-foreground text-sm">
                {AI_LEVEL_LABELS.map((label, idx) => (
                  <span
                    key={idx}
                    className={
                      aiLevel[0] === idx ? "text-secondary font-bold" : ""
                    }
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Opening Argument */}
          <div className="mb-12">
            <Label className="text-foreground text-xl mb-4 block">
              Your Opening Argument
            </Label>
            <Textarea
              value={openingArgument}
              onChange={(e) => setOpeningArgument(e.target.value)}
              placeholder="State your position on the topic and provide your initial arguments..."
              className="min-h-[150px] bg-card border border-primary/20 text-foreground placeholder:text-muted-foreground resize-none shadow-lg"
            />
            <p className="text-muted-foreground text-sm mt-2">
              {openingArgument.length} characters (minimum 20)
            </p>
          </div>

          {/* Start Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <Button
              onClick={handleStartDebate}
              disabled={isLoading || !selectedCategory || openingArgument.trim().length < 20}
              size="lg"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 text-xl px-16 py-8 rounded-2xl font-bold shadow-2xl hover:shadow-[var(--glow-secondary)] transition-all transform hover:scale-105"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                  Starting Debate...
                </>
              ) : (
                "Enter the Arena"
              )}
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
