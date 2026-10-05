"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { WorkspaceChrome } from "@/components/report/workspace-chrome";
import {
  agentById,
  allRecommendedFindings,
  findingById,
  findingsByIds,
  type ReviewFinding,
  type ReviewMockupTab,
} from "@/lib/review-mockup/sample-data";

export const AGENT_STEP_MS = 420;

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ReviewMockupState = {
  chrome: WorkspaceChrome;
  setChrome: (chrome: WorkspaceChrome) => void;
  tab: ReviewMockupTab;
  setTab: (tab: ReviewMockupTab) => void;
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  selectedPlaybookId: string | null;
  selectPlaybook: (id: string | null) => void;
  selectedSkillId: string | null;
  selectSkill: (id: string | null) => void;
  runState: "idle" | "running" | "done";
  runStepIndex: number;
  ranAllRecommended: boolean;
  visibleFindingIds: string[];
  visibleFindings: ReviewFinding[];
  selectedFindingId: string | null;
  appliedFixIds: string[];
  showSkillPrompt: boolean;
  skillCreated: boolean;
  dismissSkillPrompt: () => void;
  createSkill: () => void;
  assistantMessages: AssistantMessage[];
  sendAssistant: (text: string) => void;
  runAgent: (agentId: string) => void;
  runAllRecommended: () => void;
  showFinding: (findingId: string) => void;
  applyFix: (findingId: string) => void;
  tm02Applied: boolean;
  registerAnchor: (id: string, node: HTMLElement | null) => void;
  scrollToAnchor: (anchorId: string) => void;
};

const ReviewMockupContext = createContext<ReviewMockupState | null>(null);

function replyForPrompt(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("di-038") || lower.includes("electrical")) {
    return "DI-038 (electrical isolation of the tip assembly) is allocated in DIS-0088 but no TM in this protocol covers it. The §7 coverage statement that “this protocol verifies all design inputs allocated to the tip assembly” is therefore incorrect. Add a TM for dielectric / leakage, or remove DI-038 from the coverage claim and point at the protocol that does own it.";
  }
  if (lower.includes("coverage")) {
    return "Suggested coverage statement: “This protocol verifies design inputs DI-031, DI-034, DI-036 and DI-040 allocated to the tip assembly in DIS-0088 Rev D. DI-038 (electrical isolation) is verified under DVP-0148. Risk control RC-12 is not verified here.”";
  }
  if (lower.includes("critical") || lower.includes("summar")) {
    return "Four critical items before routing: DI-038 has no test; TM-02 uses a subjective criterion (repeat 483 Obs. 3); n = 30 has no statistical rationale; and Quality approval is still a placeholder. Resolve the criticals, then the majors on RC-12 and the irrigation window.";
  }
  return "This is a review prototype with sample findings for DVP-0142 Rev B. Open Agents to run Design Traceability Gaps, Playbooks for Kestrel’s audit-finding memory, Skills for the DV matrix export, or Trace for the live DI/RC map.";
}

export function ReviewMockupProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<WorkspaceChrome>("document");
  const [tab, setTab] = useState<ReviewMockupTab>("agents");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(
    null
  );
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "done">("idle");
  const [runStepIndex, setRunStepIndex] = useState(0);
  const [ranAllRecommended, setRanAllRecommended] = useState(false);
  const [visibleFindingIds, setVisibleFindingIds] = useState<string[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    null
  );
  const [appliedFixIds, setAppliedFixIds] = useState<string[]>([]);
  const [showSkillPrompt, setShowSkillPrompt] = useState(true);
  const [skillCreated, setSkillCreated] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(
    []
  );
  const anchors = useRef(new Map<string, HTMLElement>());
  const runToken = useRef(0);

  const visibleFindings = useMemo(
    () => findingsByIds(visibleFindingIds),
    [visibleFindingIds]
  );

  const registerAnchor = useCallback((id: string, node: HTMLElement | null) => {
    if (node) anchors.current.set(id, node);
    else anchors.current.delete(id);
  }, []);

  const scrollToAnchor = useCallback((anchorId: string) => {
    const node = anchors.current.get(anchorId);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const showFinding = useCallback(
    (findingId: string) => {
      const finding = findingById(findingId);
      setSelectedFindingId(findingId);
      if (finding) scrollToAnchor(finding.anchorId);
    },
    [scrollToAnchor]
  );

  const finishRun = useCallback((findingIds: string[], all: boolean) => {
    const unique = [...new Set(findingIds)];
    setVisibleFindingIds(unique);
    setRunState("done");
    setRanAllRecommended(all);
    setSelectedFindingId(unique[0] ?? null);
  }, []);

  const animateSteps = useCallback(
    (agentId: string, findingIds: string[], all: boolean) => {
      const agent = agentById(agentId);
      const steps = agent?.steps.length ?? 3;
      const token = ++runToken.current;
      setRunState("running");
      setRunStepIndex(0);
      setVisibleFindingIds([]);
      setSelectedFindingId(null);
      setRanAllRecommended(false);

      for (let i = 0; i < steps; i += 1) {
        window.setTimeout(() => {
          if (runToken.current !== token) return;
          setRunStepIndex(i + 1);
          if (i + 1 === steps) finishRun(findingIds, all);
        }, AGENT_STEP_MS * (i + 1));
      }
    },
    [finishRun]
  );

  const runAgent = useCallback(
    (agentId: string) => {
      const agent = agentById(agentId);
      if (!agent) return;
      setSelectedAgentId(agentId);
      setTab("agents");
      animateSteps(agentId, agent.findingIds, false);
    },
    [animateSteps]
  );

  const runAllRecommended = useCallback(() => {
    setSelectedAgentId(null);
    setTab("agents");
    const ids = allRecommendedFindings().map((finding) => finding.id);
    animateSteps("traceability-gaps", ids, true);
  }, [animateSteps]);

  const applyFix = useCallback((findingId: string) => {
    setAppliedFixIds((current) =>
      current.includes(findingId) ? current : [...current, findingId]
    );
    toast.success("Applied as a tracked change on DVP-0142");
  }, []);

  const sendAssistant = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setAssistantMessages((current) => [
      ...current,
      { id: `u-${current.length}`, role: "user", text: trimmed },
      {
        id: `a-${current.length}`,
        role: "assistant",
        text: replyForPrompt(trimmed),
      },
    ]);
  }, []);

  const value = useMemo<ReviewMockupState>(
    () => ({
      chrome,
      setChrome,
      tab,
      setTab,
      selectedAgentId,
      selectAgent: setSelectedAgentId,
      selectedPlaybookId,
      selectPlaybook: setSelectedPlaybookId,
      selectedSkillId,
      selectSkill: setSelectedSkillId,
      runState,
      runStepIndex,
      ranAllRecommended,
      visibleFindingIds,
      visibleFindings,
      selectedFindingId,
      appliedFixIds,
      showSkillPrompt,
      skillCreated,
      dismissSkillPrompt: () => setShowSkillPrompt(false),
      createSkill: () => {
        setSkillCreated(true);
        setShowSkillPrompt(false);
        toast.success("Saved “DV test matrix → Excel” to your skills");
      },
      assistantMessages,
      sendAssistant,
      runAgent,
      runAllRecommended,
      showFinding,
      applyFix,
      tm02Applied: appliedFixIds.includes("tm-02-subjective"),
      registerAnchor,
      scrollToAnchor,
    }),
    [
      appliedFixIds,
      assistantMessages,
      chrome,
      ranAllRecommended,
      registerAnchor,
      runAgent,
      runAllRecommended,
      runState,
      runStepIndex,
      selectedAgentId,
      selectedPlaybookId,
      selectedSkillId,
      sendAssistant,
      showFinding,
      showSkillPrompt,
      skillCreated,
      tab,
      visibleFindingIds,
      visibleFindings,
      selectedFindingId,
      applyFix,
      scrollToAnchor,
    ]
  );

  return (
    <ReviewMockupContext.Provider value={value}>
      {children}
    </ReviewMockupContext.Provider>
  );
}

export function useReviewMockup(): ReviewMockupState {
  const value = useContext(ReviewMockupContext);
  if (!value) {
    throw new Error("useReviewMockup must be used inside ReviewMockupProvider");
  }
  return value;
}
