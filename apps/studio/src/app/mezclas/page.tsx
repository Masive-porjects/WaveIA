"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import gsap from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import { VIEW_TRANSITION, fadeUp } from "@/shared/motion";
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
  useMastering,
  MasteringHeader,
  MasteringOverlays,
  MasteringCanvas,
  AnalysisSidebar,
  MobileMasteringView,
} from "@/features/mastering";
import { LibraryView } from "@/features/remastering-history";
import { fetchUserTracks, type Track } from "@/features/tracks";
import { useAuth } from "@/features/auth";

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

function MezclasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackIdParam = searchParams.get("track");
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { user } = useAuth();

  const workflow = useMastering();

  const [masteringMode, setMasteringMode] = useState<"manual" | "ai">("manual");
  const [currentTab, setCurrentTab] = useState<MasteringTab | null>(null);
  const [sheetTab, setSheetTab] = useState<MasteringTab | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // If a track parameter is in the URL and not loaded, load it from Supabase
  const loadedTrackRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !trackIdParam || loadedTrackRef.current === trackIdParam) return;
    if (workflow.currentTrack?.id === trackIdParam && workflow.session) return;

    loadedTrackRef.current = trackIdParam;
    fetchUserTracks(user.id, { page: 1, pageSize: 50 })
      .then((res) => {
        const found = res.items.find((tr) => tr.id === trackIdParam);
        if (found) {
          workflow.handleLoadTrackProject(found);
        }
      })
      .catch((err) => {
        console.error("Error loading track from URL param:", err);
      });
  }, [user, trackIdParam, workflow]);

  // If user visits /mezclas without an active session or track, send to /upload
  useEffect(() => {
    if (
      !workflow.session &&
      !workflow.loading &&
      !workflow.processing &&
      !workflow.isLoadingTrackProject &&
      !trackIdParam
    ) {
      router.replace("/upload");
    }
  }, [workflow.session, workflow.loading, workflow.processing, workflow.isLoadingTrackProject, trackIdParam, router]);

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
    router.push("/upload");
  }, [workflow, router]);

  const isMezclaTab = currentTab === "mezcla" || sheetTab === "mezcla";

  return (
    <LicenseGuard>
      <main className="h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden font-sans relative selection:bg-[var(--accent-primary)] selection:text-white">
        {/* Global Overlays & Modals */}
        <MasteringOverlays
          currentView="mastering"
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
          currentView="mastering"
          session={workflow.session}
          processing={workflow.processing}
          loading={workflow.loading}
          masteringMode={masteringMode}
          setMasteringMode={setMasteringMode}
          onBackToUpload={handleHomeClick}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          onClearSheet={() => setSheetTab(null)}
          autosaveStatus={workflow.autosaveStatus}
          onOpenLibrary={() => setLibraryOpen(true)}
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
                    <div
                      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-2xl"
                      style={{
                        background: "var(--bg-glass-elevated)",
                        borderColor: "var(--border-strong)",
                        boxShadow: "var(--shadow-card)",
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                            {t("nav.chat", "Asistente IA")}
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMasteringMode("manual")}
                          className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-hover)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                          <ChevronLeft size={13} />
                          <span>{t("common.backToMainFlow", "Volver al flujo principal")}</span>
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
                        <ComingSoonNotice
                          title={t("nav.chat", "Asistente IA")}
                          message={t(
                            "mastering.aiComingSoon",
                            "El asistente con recomendaciones inteligentes llega pronto. Mientras tanto, masteriza en modo Manual con las guías de género."
                          )}
                        />
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Manual Mode Workspace */}
                <div
                  className={`${
                    masteringMode === "manual" || isMezclaTab ? "flex" : "hidden"
                  } flex-1 min-h-0 relative`}
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
                    <motion.div
                      className="flex-1 flex flex-col min-h-0 relative"
                      initial={VIEW_TRANSITION.initial}
                      animate={VIEW_TRANSITION.animate}
                      transition={VIEW_TRANSITION.transition}
                    >
                      {currentTab !== null && (
                        <div className="flex-1 min-h-0 relative">
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
                        </div>
                      )}

                      {/* Dock Navigation */}
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
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            {/* Persistent Audio Player Bar */}
            {workflow.session && (
              <div
                ref={playerScaleRef}
                className="shrink-0 relative z-20 pb-safe px-4 pb-2 transition-transform duration-300"
              >
                <div
                  className="rounded-2xl border p-2 backdrop-blur-2xl shadow-xl"
                  style={{
                    backgroundColor: "var(--bg-glass-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <Player
                    originalUrl={
                      workflow.session ? getAudioUrl(workflow.session.session_id, "original") : null
                    }
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
                    sessionId={workflow.session?.session_id}
                    burstSignal={workflow.masterBurst}
                  />
                </div>
              </div>
            )}
          </main>

          {/* Analysis Sidebar Column */}
          {masteringMode === "manual" && !isMobile && (
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

        {/* User Songs Library / History Modal */}
        <LibraryView
          isOpen={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onSelectTrack={async (track) => {
            setLibraryOpen(false);
            await workflow.handleLoadTrackProject(track);
            router.push(`/mezclas?track=${track.id}`);
          }}
          onNewUpload={handleHomeClick}
        />
      </main>
    </LicenseGuard>
  );
}

export default function MezclasPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[var(--bg-app)] animate-pulse" />}>
      <MezclasContent />
    </Suspense>
  );
}
