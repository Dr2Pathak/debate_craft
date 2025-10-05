import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Copy, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

interface SourceGroup {
  turnIndex: number;
  sources: Source[];
}

interface SourcesPanelProps {
  sourceGroups: SourceGroup[];
}

export const SourcesPanel = ({ sourceGroups }: SourcesPanelProps) => {
  const { toast } = useToast();
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleSource = (sourceId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
  };

  const copyCitation = (source: Source) => {
    const citation = `[Source ${source.source_number}]: ${source.title}`;
    navigator.clipboard.writeText(citation);
    setCopiedId(source.id);
    setTimeout(() => setCopiedId(null), 2000);
    
    toast({
      title: "Citation copied",
      description: "Source citation copied to clipboard",
    });
  };

  if (!sourceGroups || sourceGroups.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Sources</h3>
        <p className="text-white/60">Sources will appear here as the debate progresses.</p>
      </div>
    );
  }

  const totalSources = sourceGroups.reduce((sum, group) => sum + group.sources.length, 0);

  return (
    <div className="bg-card backdrop-blur-sm border border-destructive/30 rounded-2xl p-6 shadow-xl">
      <h3 className="text-xl font-bold text-destructive mb-6">
        Sources ({totalSources})
      </h3>
      
      <div className="space-y-6">
        {sourceGroups.map((group) => (
          <div key={group.turnIndex} className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-destructive/20" />
              <span className="text-xs text-destructive/60 font-medium px-2">
                Turn {group.turnIndex}
              </span>
              <div className="h-px flex-1 bg-destructive/20" />
            </div>
            
            {group.sources.map((source) => {
              const isExpanded = expandedSources.has(source.id);
              
              return (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-destructive/10 rounded-xl overflow-hidden border border-destructive/30 shadow-lg"
                >
                  {/* Header */}
                  <button
                    onClick={() => toggleSource(source.id)}
                    className="w-full p-4 flex items-start justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 text-left">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center mt-0.5">
                        <span className="text-secondary font-bold text-sm">
                          {source.source_number}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold leading-tight mb-2">
                          {source.title}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {source.page && (
                            <span className="text-xs text-white/60 bg-white/5 px-2 py-0.5 rounded">
                              Page {source.page}
                            </span>
                          )}
                          {source.date && (
                            <span className="text-xs text-white/60 bg-white/5 px-2 py-0.5 rounded">
                              {source.date}
                            </span>
                          )}
                          <span className="text-xs text-secondary bg-secondary/10 px-2 py-0.5 rounded">
                            {(source.score * 100).toFixed(0)}% match
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-white/60" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-white/60" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-white/10"
                      >
                        <div className="p-4 space-y-4">
                          {/* Summary */}
                          <div>
                            <p className="text-white/80 text-sm leading-relaxed">
                              {source.summary}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyCitation(source)}
                              className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-xs"
                            >
                              {copiedId === source.id ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy Citation
                                </>
                              )}
                            </Button>
                            
                            {source.url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(source.url, "_blank")}
                                className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-xs"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View Source
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
