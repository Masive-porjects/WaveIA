"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import { VIEW_TRANSITION, fadeUp } from "@/shared/motion";
import { API_BASE } from "@/adapters/api/config";
import LicenseGuard from "@/components/LicenseGuard";
import MobileDrawer from "@/components/MobileDrawer";
import ModuleDock from "@/components/dock/ModuleDock";
import type { MasteringTab } from "@/components/dock/types";
import ModuleSheet from "@/components/ModuleSheet";
import PaintedModule from "@/components/PaintedModule";
import Player from "@/components/Player";
import { ComingSoonNotice } from "@/components/ComingSoonNotice";
import { useIsMobile } from "@/shared/useIsMobile";
import { isPresetCompleted } from "@/lib/audioUtils";
import { getAudioUrl } from "@/lib/api";
import { useTranslation } from "@/i18n";
import { ChevronLeft } from "lucide-react";

import {
  useMasteringWorkflow,
  MasteringHeader,
  MasteringOverlays,
  MasteringCanvas,
  AnalysisSidebar,
  MobileMasteringView,
} from "@/features/mastering";
import { UploadView } from "@/features/upload";

const TABS: { key: MasteringTab; label: string }[] = [
  { key: "mezcla", label: "Mezcla de Audio" },
  { key: "modules", label: "Masterizar Audio" },
  { key: "splitter", label: "Splitter" },
  { key: "vocal", label: "Vocal" },
  { key: "songstarter", label: "Beats" },
  { key: "genres", label: "Guía de Géneros" },
  { key: "pipeline", label: "Cadena de Master" },
  { key: "analysis", label: "Análisis" },
  { key: "stereo", label: "Estéreo" },
  { key: "live", label: "Live Engine" },
  { key: "album", label: "Álbum" },
];

export default function Home() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const [currentView, setCurrentView] = useState<"upload" | "mastering">("upload");
  const [masteringMode, setMasteringMode] = useState<"manual" | "ai">("manual");
  const [currentTab, setCurrentTab] = useState<MasteringTab | null>(null);
  const [sheetTab, setSheetTab] = useState<MasteringTab | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Workflow custom hook encapsulating all mastering state & mutations
  const workflow = useMasteringWorkflow({
    onSessionLoaded: () => setCurrentView("mastering"),
  });

  // Right panel collapse state
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [panelSyncTab, setPanelSyncTab] = useState<MasteringTab | null>(null);

  const needsRightPanel = currentTab === "analysis" || currentTab === "stereo";
  if (currentTab !== panelSyncTab) {
    setPanelSyncTab(currentTab);
    setRightPanelOpen(needsRightPanel);
  }

  // Player stretch/reposition when a dock tab is toggled
  const playerScaleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!playerScaleRef.current) return;
    const stretch = currentTab === null ? 1 : 1.03;
    gsap.to(playerScaleRef.current, {
      scaleX: stretch,
      scaleY: 1,
      duration: 0.9,
      ease: "power3.inOut",
      overwrite: "auto",
    });
  }, [currentTab]);

  const handleModuleClick = useCallback((tab: MasteringTab) => {
    setCurrentTab((prev) => (prev === tab ? null : tab));
    setSheetTab(null);
  }, []);

  const handleHomeClick = useCallback(() => {
    workflow.handleBackToUpload();
    setCurrentView("upload");
    setCurrentTab(null);
    setSheetTab(null);
  }, [workflow]);

  const isMezclaTab = currentTab === "mezcla" || sheetTab === "mezcla";

  return (
    <LicenseGuard>
      <main className="h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden font-sans relative selection:bg-[var(--accent-primary)] selection:text-white">
        {/* Global Overlays & Modals */}
        <MasteringOverlays
          currentView={currentView}
          session={workflow.session}
          params={workflow.params}
          setParams={workflow.setParams}
          errorModal={workflow.errorModal}
          setErrorModal={workflow.setErrorModal}
          overMasterWarning={workflow.overMasterWarning}
          onOverMasterConfirm={workflow.handleOverMasterConfirm}
          onOverMasterCancel={workflow.handleOverMasterCancel}
          loading={workflow.loading}
          uploadProgress={workflow.uploadProgress}
          processing={workflow.processing}
          processingProgress={workflow.progress}
        />

        {/* Header Bar */}
        <MasteringHeader
          currentView={currentView}
          session={workflow.session}
          processing={workflow.processing}
          loading={workflow.loading}
          masteringMode={masteringMode}
          setMasteringMode={setMasteringMode}
          onBackToUpload={handleHomeClick}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          onClearSheet={() => setSheetTab(null)}
        />

        {/* Mobile Navigation Drawer */}
        <MobileDrawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          session={workflow.session}
          onBackToUpload={handleHomeClick}
        />

        {/* Main Workspaces Layout */}
        <div className="flex-1 flex min-h-0">
          <main className="flex-1 h-full flex flex-col min-w-0 relative">
            <div className="flex flex-1 min-h-0 relative">
              <div className="flex-1 flex flex-col min-w-0 relative">
                {currentView === "upload" ? (
                  <UploadView
                    loading={workflow.loading}
                    uploadBurst={workflow.uploadBurst}
                    onError={(title, message) => workflow.setErrorModal({ title, message })}
                    onFileSelected={(file) => {
                      workflow.handleFileSelected(file);
                    }}

                  />
                ) : (
                  <>
                    {/* AI Mode Workspace */}
                    <div
                      className={`${
                        masteringMode === "ai" && !isMezclaTab ? "flex" : "hidden"
                      } flex-1 min-h-0 items-center justify-center overflow-y-auto px-4 py-5 md:px-6 md:py-8`}
                      aria-hidden={masteringMode !== "ai" || isMezclaTab}
                    >
                      <motion.div
                        className="flex h-full max-h-[min(42rem,100%)] min-h-[28rem] w-full max-w-2xl flex-col"
                        initial={VIEW_TRANSITION.initial}
                        animate={VIEW_TRANSITION.animate}
                        transition={VIEW_TRANSITION.transition}
                      >
                        <ComingSoonNotice
                          title={t("nav.aiMode", "Asistente IA")}
                          message="El asistente con recomendaciones llega pronto. Mientras tanto, masterizá en modo Manual con las guías de género."
                        />
                      </motion.div>
                    </div>

                    {/* Manual Mode Workspace */}
                    <div
                      className={`${
                        masteringMode === "manual" || isMezclaTab ? "flex" : "hidden"
                      } flex-1 min-h-0 flex-col`}
                      aria-hidden={masteringMode !== "manual" && !isMezclaTab}
                    >
                      {isMobile ? (
                        <MobileMasteringView
                          session={workflow.session}
                          currentTab={currentTab}
                          sheetTab={sheetTab}
                          setCurrentTab={setCurrentTab}
                          activePresetId={workflow.activePresetId}
                          processing={workflow.processing}
                          masterBurst={workflow.masterBurst}
                          error={workflow.error}
                          onPresetSelect={workflow.handlePresetSelect}
                          onProcess={workflow.handleProcess}
                          onDownload={workflow.handleDownload}
                          renderTabContent={(tab) => (
                            <MasteringCanvas
                              tab={tab}
                              session={workflow.session}
                              params={workflow.params}
                              setParams={workflow.setParams}
                              activePresetId={workflow.activePresetId}
                              onPresetSelect={workflow.handlePresetSelect}
                              onProcess={workflow.handleProcess}
                              onReset={workflow.handleReset}
                              processing={workflow.processing}
                              stemState={workflow.stemState}
                              setStemState={workflow.setStemState}
                              onStemSplit={workflow.handleStemSplit}
                              onVocalProcess={workflow.handleVocalProcess}
                              vocalProcessing={workflow.vocalProcessing}
                              vocalProcessed={workflow.vocalProcessed}
                              masteringMode={masteringMode}
                              onNavigateTab={handleModuleClick}
                            />
                          )}
                        />
                      ) : (
                        <>
                          {/* Desktop Player */}
                          {!isMezclaTab && (
                            <motion.div
                              layout="position"
                              transition={{ type: "spring", stiffness: 40, damping: 12 }}
                              className={`relative z-[1] px-4 lg:px-6 pt-4 pb-2 ${
                                currentTab === null
                                  ? "flex-1 flex items-center justify-center min-h-0"
                                  : "shrink-0"
                              }`}
                            >
                              {workflow.session && (
                                <div
                                  ref={playerScaleRef}
                                  className={`w-full origin-center ${
                                    currentTab === null ? "max-w-5xl" : ""
                                  }`}
                                >
                                  <Player
                                    originalUrl={getAudioUrl(workflow.session.session_id, "original")}
                                    masteredUrl={
                                      isPresetCompleted(workflow.session, workflow.activePresetId)
                                        ? getAudioUrl(
                                            workflow.session.session_id,
                                            "mastered",
                                            workflow.activePresetId ?? undefined,
                                          )
                                        : null
                                    }
                                    disabled={workflow.processing}
                                    presetId={workflow.activePresetId ?? undefined}
                                    sessionId={workflow.session.session_id}
                                    burstSignal={workflow.masterBurst}
                                  />
                                </div>
                              )}
                            </motion.div>
                          )}

                          {/* Vocal Result Banner */}
                          {workflow.vocalProcessed && workflow.session && (
                            <div className="shrink-0 px-4 lg:px-6 py-2">
                              <div
                                className="flex items-center gap-3 rounded-xl px-4 py-2"
                                style={{
                                  background: "rgba(94, 92, 230, 0.06)",
                                  border: "1px solid rgba(94, 92, 230, 0.12)",
                                }}
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-[#5e5ce6] shadow-lg shadow-[rgba(94,92,230,0.3)]" />
                                <span className="text-xs text-[var(--text-secondary)]">
                                  Voz procesada —{" "}
                                  <a
                                    href={`${API_BASE}/session/${workflow.session.session_id}/vocal/audio`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#5e5ce6] hover:underline"
                                  >
                                    escuchar resultado vocal
                                  </a>
                                </span>
                                <button
                                  onClick={() => {
                                    if (!workflow.session) return;
                                    const a = document.createElement("a");
                                    a.href = `${API_BASE}/session/${workflow.session.session_id}/vocal/audio`;
                                    a.download = `${workflow.session.session_id}_vocal.wav`;
                                    a.click();
                                  }}
                                  className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                  {t("common.download", "Descargar")} WAV
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Scrollable Tab Canvas */}
                          <div
                            className={`relative z-[1] overflow-y-auto px-4 lg:px-6 pt-4 pb-40 ${
                              sheetTab !== null || currentTab === null ? "hidden" : "flex-1"
                            }`}
                          >
                            {workflow.error && (
                              <motion.div className="mb-4" {...fadeUp(0)}>
                                <div
                                  className="p-4 rounded-2xl text-sm"
                                  style={{
                                    background: "rgba(220, 38, 38, 0.08)",
                                    border: "1px solid rgba(220, 38, 38, 0.2)",
                                    color: "var(--accent-error)",
                                  }}
                                >
                                  {workflow.error}
                                </div>
                              </motion.div>
                            )}

                            <AnimatePresence mode="wait">
                              {currentTab !== null && (
                                <PaintedModule key={currentTab}>
                                  <MasteringCanvas
                                    tab={currentTab}
                                    session={workflow.session}
                                    params={workflow.params}
                                    setParams={workflow.setParams}
                                    activePresetId={workflow.activePresetId}
                                    onPresetSelect={workflow.handlePresetSelect}
                                    onProcess={workflow.handleProcess}
                                    onReset={workflow.handleReset}
                                    processing={workflow.processing}
                                    stemState={workflow.stemState}
                                    setStemState={workflow.setStemState}
                                    onStemSplit={workflow.handleStemSplit}
                                    onVocalProcess={workflow.handleVocalProcess}
                                    vocalProcessing={workflow.vocalProcessing}
                                    vocalProcessed={workflow.vocalProcessed}
                                    masteringMode={masteringMode}
                                    onNavigateTab={handleModuleClick}
                                  />
                                </PaintedModule>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Floating Bottom ModuleDock */}
                          {sheetTab === null && (
                            <ModuleDock
                              activeTab={currentTab}
                              onSelect={handleModuleClick}
                              processingProgress={workflow.processing ? workflow.progress : 0}
                              lufs={
                                workflow.session?.master_result?.integrated_lufs ??
                                workflow.session?.analysis?.integrated_lufs ??
                                null
                              }
                            />
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Expand Analysis Panel Button */}
            {currentView === "mastering" &&
              masteringMode === "manual" &&
              needsRightPanel &&
              !rightPanelOpen &&
              !isMobile && (
                <button
                  onClick={() => setRightPanelOpen(true)}
                  className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-hover)] flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-all shadow-lg cursor-pointer"
                  aria-label={t("analysis.openAnalysisShort", "Abrir Análisis")}
                >
                  <ChevronLeft size={14} className="text-[var(--text-secondary)]" />
                </button>
              )}
          </main>

          {/* Analysis Sidebar Column */}
          {currentView === "mastering" && masteringMode === "manual" && !isMobile && (
            <AnalysisSidebar
              open={rightPanelOpen}
              onClose={() => setRightPanelOpen(false)}
              currentTab={currentTab}
              onSelectTab={handleModuleClick}
              session={workflow.session}
              params={workflow.params}
              activePresetId={workflow.activePresetId}
              onDownload={workflow.handleDownload}
              onFileSelected={workflow.handleFileSelected}
              onError={(title, message) => workflow.setErrorModal({ title, message })}
              loading={workflow.loading}
            />
          )}
        </div>

        {/* Floating Module Sheet Panel */}
        {sheetTab !== null && (
          <ModuleSheet
            open={sheetTab !== null}
            onClose={() => setSheetTab(null)}
            title={TABS.find((t) => t.key === sheetTab)?.label ?? "Módulo"}
            subtitle={
              sheetTab === "splitter"
                ? "Separar en stems"
                : sheetTab === "vocal"
                  ? "Cadena vocal pro"
                  : sheetTab === "songstarter"
                    ? "Generador de ideas"
                    : sheetTab === "genres"
                      ? "Guía de géneros"
                      : sheetTab === "mezcla"
                        ? "Mezclar stems en un bus"
                        : undefined
            }
          >
            <MasteringCanvas
              tab={sheetTab}
              session={workflow.session}
              params={workflow.params}
              setParams={workflow.setParams}
              activePresetId={workflow.activePresetId}
              onPresetSelect={workflow.handlePresetSelect}
              onProcess={workflow.handleProcess}
              onReset={workflow.handleReset}
              processing={workflow.processing}
              stemState={workflow.stemState}
              setStemState={workflow.setStemState}
              onStemSplit={workflow.handleStemSplit}
              onVocalProcess={workflow.handleVocalProcess}
              vocalProcessing={workflow.vocalProcessing}
              vocalProcessed={workflow.vocalProcessed}
              masteringMode={masteringMode}
              onNavigateTab={handleModuleClick}
            />
          </ModuleSheet>
        )}
      </main>
    </LicenseGuard>
  );
}
