import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Flag, Home, Mic, Volume2, VolumeX } from "lucide-react";
import { Header } from "@/components/Header";
import { SourcesPanel } from "@/components/SourcesPanel";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SourceGroup {
  turnIndex: number;
  sources: Source[];
}

interface Source {
  id: string;
  score: number;
  source_number: number;
  title: string;
  summary: string;
  page?: number;
  date?: string;
  url?: string;
}

export default function Debate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [conversation, setConversation] = useState<Message[]>(
    location.state?.conversation || []
  );
  const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>(
    location.state?.source_groups || []
  );
  const [sessionId] = useState(location.state?.session_id || "");
  const [category] = useState(location.state?.category || "");
  const [debateExperience] = useState(location.state?.debate_experience || "");
  const [aiLevel] = useState(location.state?.ai_level || "");
  const [turnIndex, setTurnIndex] = useState(location.state?.turn_index || 1);
  
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [showExitDialog, setShowExitDialog] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      
      // Redirect if no debate session
      if (!sessionId) {
        navigate("/setup");
      }
    };
    checkAuth();
  }, [sessionId, navigate]);

  useEffect(() => {
    // Scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const queueAudio = (audioUrl: string) => {
    audioQueueRef.current.push(audioUrl);
    if (!isPlayingQueueRef.current) {
      playNextInQueue();
    }
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      setIsPlayingAudio(false);
      return;
    }

    isPlayingQueueRef.current = true;
    setIsPlayingAudio(true);
    
    const audioUrl = audioQueueRef.current.shift()!;
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = audioUrl;
    } else {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
    }

    audioRef.current.onended = () => {
      playNextInQueue();
    };
    
    audioRef.current.onerror = () => {
      console.error("Audio playback error, skipping to next");
      playNextInQueue();
    };

    try {
      await audioRef.current.play();
    } catch (error) {
      console.error("Play error:", error);
      playNextInQueue();
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    const messageText = userInput;
    const userMessage: Message = { role: "user", content: messageText };
    setConversation((prev) => [...prev, userMessage]);
    setUserInput("");
    setIsLoading(true);

    // Create placeholder AI message
    const aiMessageIndex = conversation.length + 1;
    setConversation((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/debate-continue`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            user_reply: messageText,
            turn_index: turnIndex,
            category,
            debate_experience: debateExperience,
            ai_level: aiLevel,
            conversation_history: conversation,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sentenceBuffer = "";
      let metadata: any = null;

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.done) {
                metadata = parsed;
              } else if (parsed.fullText) {
                const previousLength = fullText.length;
                fullText = parsed.fullText;
                const newText = fullText.slice(previousLength);
                sentenceBuffer += newText;
                
                // Update AI message progressively
                setConversation((prev) => {
                  const updated = [...prev];
                  updated[aiMessageIndex] = { role: "assistant", content: fullText };
                  return updated;
                });

                // Check for complete sentences and trigger TTS
                const sentenceMatch = sentenceBuffer.match(/^(.*?[.!?](?:\s|$))/);
                if (sentenceMatch) {
                  const completeSentence = sentenceMatch[1].trim();
                  sentenceBuffer = sentenceBuffer.slice(sentenceMatch[0].length);
                  
                  // Generate audio for this sentence (non-blocking)
                  if (completeSentence) {
                    playTTS(completeSentence).catch(err => 
                      console.error("TTS error for sentence:", err)
                    );
                  }
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      // Process any remaining text in buffer
      if (sentenceBuffer.trim()) {
        playTTS(sentenceBuffer.trim()).catch(err => 
          console.error("TTS error for final sentence:", err)
        );
      }

      // Update metadata when stream is done
      if (metadata) {
        setSourceGroups((prev) => [
          ...prev,
          {
            turnIndex: metadata.turn_index,
            sources: metadata.retrieved,
          },
        ]);
        setTurnIndex(metadata.turn_index);
      }

    } catch (error: any) {
      console.error("Error continuing debate:", error);
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: error.message || "Please try again.",
      });
      
      // Remove user and placeholder AI message on error
      setConversation((prev) => prev.slice(0, -2));
    } finally {
      setIsLoading(false);
    }
  };

  const playTTS = async (text: string) => {
    try {
      console.log("Generating TTS for sentence:", text.substring(0, 50) + "...");
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("TTS failed:", response.status, errorText);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Queue the audio for sequential playback
      queueAudio(audioUrl);
      
    } catch (error) {
      console.error("TTS error:", error);
    }
  };

  const stopAudio = () => {
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingAudio(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        variant: "destructive",
        title: "Recording failed",
        description: "Could not access microphone",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-stt`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ audio: base64Audio }),
          }
        );

        if (!response.ok) {
          throw new Error("Transcription failed");
        }

        const data = await response.json();
        setUserInput(data.text);
        
        toast({
          title: "Transcription complete",
          description: "You can now edit or send your message",
        });
      };
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        variant: "destructive",
        title: "Transcription failed",
        description: "Please try again",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleEndDebate = () => {
    navigate("/results", {
      state: {
        session_id: sessionId,
        transcript: conversation,
        category,
        source_groups: sourceGroups,
      },
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleBackToHome = () => {
    setShowExitDialog(true);
  };

  const confirmBackToHome = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Header />

      <div className="flex-1 container max-w-7xl mx-auto px-4 py-24 flex gap-6">
        {/* Main Debate Area */}
        <div className="flex-1 flex flex-col bg-card backdrop-blur-sm border border-primary/20 rounded-2xl overflow-hidden shadow-xl">
          {/* Debate Info */}
          <div className="p-6 border-b border-primary/20 bg-primary/5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <Button
                  onClick={handleBackToHome}
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/10"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </Button>
                {isPlayingAudio && (
                  <Button
                    onClick={stopAudio}
                    variant="outline"
                    size="sm"
                    className="bg-destructive/20 border-destructive/40 text-white hover:bg-destructive/30"
                  >
                    <VolumeX className="w-4 h-4 mr-2" />
                    Stop Audio
                  </Button>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-white capitalize">
                    {category} Debate
                  </h2>
                  <p className="text-white/60 text-sm mt-1">
                    Experience: {debateExperience} | AI Level: {aiLevel}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleEndDebate}
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <Flag className="w-4 h-4 mr-2" />
                End Debate
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <AnimatePresence>
              {conversation.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] p-4 rounded-2xl shadow-md ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground border border-primary/50"
                        : "bg-destructive/80 text-white border border-destructive"
                    }`}
                  >
                    <div className="text-xs font-semibold mb-2 opacity-70">
                      {msg.role === "user" ? "You" : "AI"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-primary/20 text-white border border-primary/30 p-4 rounded-2xl">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-primary/20 bg-primary/5">
            <div className="flex gap-3">
              <Textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your counterargument..."
                className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 resize-none min-h-[60px] max-h-[120px]"
                disabled={isLoading || isRecording || isTranscribing}
              />
              <Button
                onClick={toggleRecording}
                disabled={isLoading || isTranscribing}
                className={`${
                  isRecording 
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' 
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
                size="lg"
                variant={isRecording ? "default" : "outline"}
              >
                {isTranscribing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Mic className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />
                )}
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || isRecording || isTranscribing}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                size="lg"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-white/40 text-xs mt-2">
              {isRecording 
                ? "Recording... Click the mic again to stop" 
                : isTranscribing
                ? "Transcribing your speech..."
                : "Press Enter to send, Shift+Enter for new line, or use the mic for voice input"}
            </p>
          </div>
        </div>

        {/* Sources Sidebar */}
        {showSources && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-96 flex-shrink-0 overflow-y-auto"
          >
            <SourcesPanel sourceGroups={sourceGroups} />
          </motion.div>
        )}
      </div>

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent className="bg-gradient-card border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Leave Debate?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/80">
              You are currently in an active debate. To go back to the home page, please end the debate first by clicking "End Debate" button.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              Stay in Debate
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleEndDebate}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              End Debate & Go Home
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
