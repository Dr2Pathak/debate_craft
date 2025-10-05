import { HeroSection } from "@/components/HeroSection";
import { HowItWorks } from "@/components/HowItWorks";
import { Header } from "@/components/Header";
import { motion } from "framer-motion";
import {
  Brain,
  MessageSquare,
  Trophy,
  Award,
  Lightbulb,
  Target,
  BookOpen,
  Users,
  Megaphone,
  Scale,
  Sparkles,
  Zap,
  Pencil,
  GraduationCap,
  Globe,
  FileText,
  ThumbsUp,
  Shield,
  Hash,
  Compass,
} from "lucide-react";

const Index = () => {
  const floatingIcons = [
    Brain,
    MessageSquare,
    Trophy,
    Award,
    Lightbulb,
    Target,
    BookOpen,
    Users,
    Sparkles,
    Zap,
    GraduationCap,
    FileText,
    ThumbsUp,
    Shield,
  ];

  // Double the icons
  const allIcons = [...floatingIcons, ...floatingIcons];

  // Generate positions with collision avoidance
  const iconPositions: { top: number; left: number }[] = [];
  allIcons.forEach(() => {
    const shouldAvoidCollision = Math.random() < 0.3;
    let top, left;
    let attempts = 0;
    
    do {
      top = Math.random() * 80 + 5;
      left = Math.random() * 80 + 5;
      attempts++;
    } while (
      shouldAvoidCollision &&
      attempts < 10 &&
      iconPositions.some(pos => 
        Math.abs(pos.top - top) < 15 && Math.abs(pos.left - left) < 15
      )
    );

    iconPositions.push({ top, left });
  });

  return (
    <div className="min-h-screen bg-gradient-hero relative flex flex-col">
      {/* Floating Icons Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-gradient-hero">
        {allIcons.map((Icon, index) => {
          const { top, left } = iconPositions[index];
          const size = Math.floor(Math.random() * 32) + 48;
          const duration = Math.random() * 4 + 4;
          const delay = Math.random() * 3;
          const moveX = Math.random() * 150 - 75;
          const moveY = Math.random() * 150 - 75;
          const rotate = Math.random() * 30 - 15;

          return (
            <motion.div
              key={index}
              animate={{
                x: [0, moveX, -moveX, 0],
                y: [0, moveY, -moveY, 0],
                rotate: [0, rotate, -rotate, 0],
                opacity: [0.5, 0.8, 0.6, 0.7],
              }}
              transition={{
                duration,
                delay,
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
              }}
              className="absolute"
              style={{
                top: `${top}%`,
                left: `${left}%`,
              }}
            >
              <Icon
                size={size}
                className={`${
                  index % 2 === 0 ? "text-primary" : "text-secondary"
                } opacity-40`}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col -mb-24">
        <Header showAuth={true} />
        <HeroSection />
        <HowItWorks />
      </div>
    </div>
  );
};

export default Index;
