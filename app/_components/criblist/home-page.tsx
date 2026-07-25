"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ContextFortune, Footer, Header } from "./chrome";
import { ApartmentDeck } from "./deck";
import { DetailDrawer, SavedPanel } from "./panels";
import { SearchComplete, SearchSetup, Searching } from "./search";
import {
  ApartmentSearchResponseSchema,
  SearchErrorResponseSchema,
} from "../../../shared/search-contract";
import {
  DEFAULT_PREFERENCES,
  PREFS_KEY,
  SAVED_KEY,
  SESSION_KEY,
  type ApartmentCard,
  type Decision,
  type Stage,
} from "./model";
import { loadHuntStorage } from "./storage";

export function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>("setup");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [apartments, setApartments] = useState<ApartmentCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<Decision[]>([]);
  const [saved, setSaved] = useState<ApartmentCard[]>([]);
  const [seenUrls, setSeenUrls] = useState<string[]>([]);
  const [hasFoundResults, setHasFoundResults] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [detail, setDetail] = useState<ApartmentCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchSequence = useRef(0);

  const currentApartment = apartments[currentIndex];

  useEffect(() => {
    const upcomingImages = [
      ...apartments[currentIndex]?.images.slice(0, 2) ?? [],
      ...apartments[currentIndex + 1]?.images.slice(0, 3) ?? [],
      ...apartments[currentIndex + 2]?.images.slice(0, 1) ?? [],
    ];
    const uniqueImages = [...new Set(upcomingImages)];
    uniqueImages.forEach((src) => {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    });
  }, [apartments, currentIndex]);

  // One-time hydration from localStorage. Reading must happen after mount
  // (no `localStorage` during SSR), so the mount-effect setState is expected
  // here rather than a cascading-render smell.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const restored = loadHuntStorage(localStorage);
    setSaved(restored.saved);
    setPreferences(restored.preferences);
    if (restored.session) {
      setApartments(restored.session.apartments);
      setCurrentIndex(
        Math.min(
          restored.session.currentIndex,
          restored.session.apartments.length - 1,
        ),
      );
      setSeenUrls(restored.session.seenUrls);
      setHasFoundResults(true);
      setStage("deck");
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      /* storage may be unavailable */
    }
  }, [saved, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    } catch {
      /* storage may be unavailable */
    }
  }, [preferences, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (stage === "deck" && apartments.length > 0) {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ apartments, currentIndex, seenUrls }),
        );
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* storage may be unavailable */
    }
  }, [stage, apartments, currentIndex, seenUrls, hydrated]);

  const isSaved = useCallback(
    (url: string) => saved.some((apartment) => apartment.url === url),
    [saved],
  );

  const addSaved = useCallback((apartment: ApartmentCard) => {
    setSaved((current) =>
      current.some((entry) => entry.url === apartment.url)
        ? current
        : [apartment, ...current],
    );
  }, []);

  const removeSaved = useCallback((url: string) => {
    setSaved((current) => current.filter((apartment) => apartment.url !== url));
  }, []);

  const search = useCallback(async () => {
    const sequence = searchSequence.current + 1;
    searchSequence.current = sequence;
    setStage("searching");
    setError(null);
    setApartments([]);
    setCurrentIndex(0);
    setHistory([]);

    try {
      const excludeUrls = [
        ...new Set([
          ...seenUrls,
          ...saved.map((apartment) => apartment.url),
        ]),
      ].slice(-200);
      const response = await fetch("/api/apartment-search?source=all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...preferences, excludeUrls }),
      });
      const responseBody: unknown = await response.json();
      if (!response.ok) {
        const error = SearchErrorResponseSchema.safeParse(responseBody);
        throw new Error(
          error.success ? error.data.error : "the search hit a snag.",
        );
      }
      const result = ApartmentSearchResponseSchema.safeParse(responseBody);
      if (!result.success) throw new Error("the search returned invalid data.");
      if (searchSequence.current !== sequence) return;
      const nextApartments = result.data.apartments;
      if (nextApartments.length === 0) {
        setApartments([]);
        setStage("done");
        return;
      }
      setApartments(nextApartments);
      setHasFoundResults(true);
      setStage("deck");
    } catch (searchError) {
      if (searchSequence.current !== sequence) return;
      setError(
        searchError instanceof Error ? searchError.message : "the search hit a snag.",
      );
      setStage("setup");
    }
  }, [preferences, saved, seenUrls]);

  const decide = useCallback(
    (kind: Decision["kind"]) => {
      if (!currentApartment) return;
      if (kind === "save") addSaved(currentApartment);
      setSeenUrls((current) =>
        current.includes(currentApartment.url)
          ? current
          : [...current, currentApartment.url].slice(-200),
      );
      setHistory((current) => [...current, { apartment: currentApartment, kind }]);
      setDetail(null);
      if (currentIndex >= apartments.length - 1) {
        setStage("done");
        return;
      }
      setCurrentIndex((index) => index + 1);
    },
    [currentApartment, currentIndex, apartments.length, addSaved],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    if (last.kind === "save") removeSaved(last.apartment.url);
    setHistory((current) => current.slice(0, -1));
    setCurrentIndex((index) => Math.max(0, index - 1));
    setStage("deck");
  }, [history, removeSaved]);

  const editSearch = useCallback(() => {
    searchSequence.current += 1;
    setDetail(null);
    setSavedOpen(false);
    setSeenUrls([]);
    setHasFoundResults(false);
    setStage("setup");
  }, []);

  const showFooter = stage === "setup" || stage === "done";

  return (
    <main className="nook-canvas text-foreground">
      <div className="relative z-10 flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:px-6 md:px-10">
        <Header
          saved={saved}
          onOpenSaved={() => setSavedOpen(true)}
          onHome={editSearch}
        />

        <div className="flex w-full flex-1 flex-col">
          <AnimatePresence mode="wait">
            {stage === "setup" ? (
              <SearchSetup
                key="setup"
                preferences={preferences}
                error={error}
                onChange={(patch) =>
                  setPreferences((current) => ({ ...current, ...patch }))
                }
                onSearch={() => void search()}
              />
            ) : stage === "searching" ? (
              <Searching key="searching" preferences={preferences} />
            ) : stage === "deck" && currentApartment ? (
              <ApartmentDeck
                key="deck"
                apartment={currentApartment}
                nextApartment={apartments[currentIndex + 1]}
                afterNext={apartments[currentIndex + 2]}
                currentIndex={currentIndex}
                total={apartments.length}
                canUndo={history.length > 0}
                lastDecision={history[history.length - 1]?.kind ?? null}
                modalOpen={savedOpen || detail !== null}
                onDecision={decide}
                onDetails={() => setDetail(currentApartment)}
                onUndo={undo}
              />
            ) : (
              <SearchComplete
                key="done"
                savedCount={saved.length}
                hasResults={hasFoundResults}
                onEdit={editSearch}
                onFindMore={() => void search()}
                onViewSaved={() => setSavedOpen(true)}
              />
            )}
          </AnimatePresence>
        </div>

        {showFooter ? <Footer /> : <div className="h-6" />}
      </div>

      <div aria-hidden className="nook-frame-border" />
      <ContextFortune />

      <AnimatePresence>
        {savedOpen ? (
          <SavedPanel
            key="saved"
            saved={saved}
            onClose={() => setSavedOpen(false)}
            onOpen={(apartment) => setDetail(apartment)}
            onRemove={removeSaved}
            onNewSearch={editSearch}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {detail ? (
          <DetailDrawer
            key={detail.url}
            apartment={detail}
            saved={isSaved(detail.url)}
            onClose={() => setDetail(null)}
            onToggleSave={() =>
              isSaved(detail.url) ? removeSaved(detail.url) : addSaved(detail)
            }
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
