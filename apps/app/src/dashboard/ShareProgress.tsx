/**
 * The "Share my progress" flow for the Friends tab: a hero button that opens a modal with the
 * generated epic flex card (see shareCard.ts), then Web-Share / save / copy actions. Pure UI —
 * all data arrives as `stats`; the card is drawn client-side so nothing extra leaves the machine.
 */

import { useEffect, useMemo, useState } from "react";
import { buildShareCaption, renderShareCard, type ShareStats } from "./shareCard";

/** Web Share Level 2 is feature-detected at call time (absent in most desktop/Tauri webviews). */
function canShareFiles(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }) && typeof navigator.share === "function";
}

export function ShareProgress({ stats }: { stats?: ShareStats }) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [card, setCard] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const caption = useMemo(() => (stats ? buildShareCaption(stats) : ""), [stats]);

  // Draw the card whenever the modal opens (or the stats behind it change).
  useEffect(() => {
    if (!open || !stats) return;
    let alive = true;
    setCard(null);
    renderShareCard(stats)
      .then((c) => alive && setCard(c))
      .catch(() => alive && setFlash("Couldn't render the card."));
    return () => {
      alive = false;
    };
  }, [open, stats]);

  // Auto-clear the action feedback.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  if (!stats) return null;

  const fileName = `agent-idle-${stats.handle}.png`;

  const download = () => {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setFlash("Image saved.");
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setFlash("Caption copied!");
    } catch {
      setFlash("Clipboard blocked — select & copy below.");
    }
  };

  const copyImage = async () => {
    if (!card) return;
    try {
      // ClipboardItem isn't in every webview — guard before using it.
      const Item = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (!Item || !navigator.clipboard?.write) throw new Error("unsupported");
      await navigator.clipboard.write([new Item({ "image/png": card.blob })]);
      setFlash("Image copied!");
    } catch {
      setFlash("Image copy unsupported — use Save.");
    }
  };

  const share = async () => {
    if (!card) return;
    const file = new File([card.blob], fileName, { type: "image/png" });
    if (canShareFiles(file)) {
      try {
        await navigator.share({ files: [file], text: caption, title: "My Agent Idle run" });
        setFlash("Shared!");
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // user dismissed the sheet
      }
    }
    // No native share sheet (typical on desktop/Tauri): save the image and stage the caption.
    download();
    void copyCaption();
  };

  return (
    <section className="panel share">
      <div className="share__row">
        <div className="share__text">
          <strong>Show off your run</strong>
          <span>Flex your rank, streak &amp; trophies</span>
        </div>
        <button type="button" className="share__open" onClick={() => setOpen(true)}>
          ✦ Share
        </button>
      </div>

      {open ? (
        <div className="share-modal" role="dialog" aria-modal="true" aria-label="Share your progress" onClick={() => setOpen(false)}>
          <div className="share-modal__inner" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="share-modal__close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
            <div className="share-modal__preview">
              {card ? (
                <img
                  className="share-modal__img"
                  src={card.dataUrl}
                  alt="Your Agent Idle progress card"
                  title="Tap to view full size"
                  onClick={() => setZoomed(true)}
                />
              ) : (
                <div className="share-modal__rendering">Rendering your card…</div>
              )}
            </div>

            <div className="share-modal__actions">
              <button type="button" className="share__btn share__btn--primary" onClick={share} disabled={!card}>
                Share
              </button>
              <button type="button" className="share__btn" onClick={download} disabled={!card}>
                Save image
              </button>
              <button type="button" className="share__btn" onClick={copyImage} disabled={!card}>
                Copy image
              </button>
              <button type="button" className="share__btn" onClick={copyCaption}>
                Copy caption
              </button>
            </div>

            <pre className="share-modal__caption">{caption}</pre>
            {flash ? <p className="share-modal__flash">{flash}</p> : null}
          </div>
        </div>
      ) : null}

      {zoomed && card ? (
        <div className="share-zoom" role="dialog" aria-modal="true" aria-label="Full-size card" onClick={() => setZoomed(false)}>
          <img className="share-zoom__img" src={card.dataUrl} alt="Your Agent Idle progress card, full size" />
          <span className="share-zoom__hint">Tap anywhere to close</span>
        </div>
      ) : null}
    </section>
  );
}
