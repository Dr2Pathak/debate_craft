import { Button } from "@/components/ui/button";
import { Sparkles, Brain, Zap, Swords } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen overflow-hidden flex items-center justify-center px-4">
      {/* Animated floating icons */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-secondary/20"
            initial={{ 
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0 
            }}
            animate={{ 
              opacity: [0, 0.3, 0],
              y: [-20, -40, -20],
              rotate: [0, 360]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          >
            {i % 4 === 0 ? (
              <Sparkles className="w-6 h-6" />
            ) : i % 4 === 1 ? (
              <Brain className="w-6 h-6" />
            ) : i % 4 === 2 ? (
              <Zap className="w-6 h-6" />
            ) : (
              <Swords className="w-6 h-6" />
            )}
          </motion.div>
        ))}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <h1 className="text-7xl md:text-8xl lg:text-9xl font-extrabold">
            <span className="text-white">Debate</span>
            <span className="text-secondary">Craft</span>
          </h1>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl md:text-6xl font-bold text-white leading-tight"
        >
          Challenge the AI and{" "}
          <span className="text-secondary">Debate on Anything!</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto"
        >
          Test your arguments against advanced AI. Choose your expertise level and experience intellectual sparring like never before.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-wrap justify-center gap-4 pt-4"
        >
          {[
            { icon: Sparkles, text: "Multiple Topics" },
            { icon: Brain, text: "AI-Powered" },
            { icon: Zap, text: "Real-time Feedback" },
          ].map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05, boxShadow: "var(--glow-secondary)" }}
              className="bg-white/10 backdrop-blur-sm text-secondary px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all cursor-default"
            >
              <item.icon className="w-5 h-5" />
              {item.text}
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="pt-2"
        >
          <Button
            size="lg"
            onClick={() => navigate("/setup")}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 text-xl px-12 py-6 rounded-2xl font-bold shadow-2xl hover:shadow-[var(--glow-secondary)] transition-all transform hover:scale-105"
          >
            Start Debate
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
