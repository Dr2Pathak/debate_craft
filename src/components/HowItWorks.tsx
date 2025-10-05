import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FileText, MessageCircle, BarChart3, Database, Target, FlaskConical, Mic } from "lucide-react";

export const HowItWorks = () => {
  return (
    <section className="py-16 px-4 mt-8 mb-24">
      <div className="max-w-4xl mx-auto space-y-12">
        <h2 className="text-5xl font-bold text-center mb-12">How It Works</h2>

        <Accordion type="single" collapsible className="space-y-4">
          <AccordionItem
            value="step1"
            className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-xl overflow-hidden shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all"
          >
            <AccordionTrigger className="text-xl font-semibold px-8 py-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/20 border border-secondary/30">
                  <FileText className="w-7 h-7 text-secondary" />
                </div>
                <span>Choose Your Topic & Level</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-8 pb-6 text-white/80 text-lg">
              Select from 5+ subject areas including English, Politics, Science,
              History, and Business. Choose your debate experience level from
              Beginner to Expert, and set the AI's difficulty from Casual to
              Competitive.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="step2"
            className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-xl overflow-hidden shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all"
          >
            <AccordionTrigger className="text-xl font-semibold px-8 py-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/20 border border-secondary/30">
                  <MessageCircle className="w-7 h-7 text-secondary" />
                </div>
                <span>Engage in Real-Time Debate</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-8 pb-6 text-white/80 text-lg">
              Debate using text or voice with our advanced AI opponent. Experience
              turn-based intellectual sparring with real-time transcription and
              live feedback. Enjoy multilingual capabilities for a personalized
              experience.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="step3"
            className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-xl overflow-hidden shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all"
          >
            <AccordionTrigger className="text-xl font-semibold px-8 py-6 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/20 border border-secondary/30">
                  <BarChart3 className="w-7 h-7 text-secondary" />
                </div>
                <span>Get Detailed Analysis</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-8 pb-6 text-white/80 text-lg">
              Receive comprehensive performance metrics including consistency,
              conciseness, depth, arguability, evidence quality, and factuality.
              Download transcripts and analysis for future reference.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-12">
          <div className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-2xl p-8 text-center space-y-3 shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all hover:scale-105">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center">
              <Database className="w-10 h-10 text-secondary" />
            </div>
            <div className="text-4xl font-bold text-secondary">2000+</div>
            <div className="text-foreground/80">Sources</div>
          </div>

          <div className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-2xl p-8 text-center space-y-3 shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all hover:scale-105">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center">
              <Target className="w-10 h-10 text-secondary" />
            </div>
            <div className="text-4xl font-bold text-secondary">3+</div>
            <div className="text-foreground/80">Difficulty Levels</div>
          </div>

          <div className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-2xl p-8 text-center space-y-3 shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all hover:scale-105">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center">
              <FlaskConical className="w-10 h-10 text-secondary" />
            </div>
            <div className="text-4xl font-bold text-secondary">5+</div>
            <div className="text-foreground/80">Subject Areas</div>
          </div>

          <div className="bg-primary/10 backdrop-blur-md border border-secondary/40 rounded-2xl p-8 text-center space-y-3 shadow-[var(--glow-secondary)] hover:shadow-[var(--glow-primary)] transition-all hover:scale-105">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center">
              <Mic className="w-10 h-10 text-secondary" />
            </div>
            <div className="text-4xl font-bold text-secondary">29</div>
            <div className="text-foreground/80">Multilingual Capabilities</div>
          </div>
        </div>
      </div>
    </section>
  );
};
