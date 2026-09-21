import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './workshop-video.css';

export default function WorkshopVideo({ video, title, arabic = false }) {
  const [open, setOpen] = useState(false);
  const preview = useRef(null), dialog = useRef(null), player = useRef(null), trigger = useRef(null);
  const say = (en, ar) => arabic ? ar : en;
  useEffect(() => {
    const element = preview.current;
    let visible = false;
    const update = () => {
      if (visible && !open && !document.hidden) {
        if (!element.getAttribute('src')) element.src = video.preview;
        element.muted = true;
        element.play().catch(() => {});
      } else element.pause();
    };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); element.pause(); };
  }, [video.preview, open]);
  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    player.current.play().catch(() => {});
    return () => { modal.close(); document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [open]);
  return <div className="workshop-video-preview">
    <span className="video-decoration video-star-top" aria-hidden="true">✦</span>
    <span className="video-decoration video-spark-top" aria-hidden="true">✧</span>
    <span className="video-decoration video-heart-left" aria-hidden="true">♡</span>
    <span className="video-decoration video-star-right" aria-hidden="true">✦</span>
    <span className="video-decoration video-spark-bottom" aria-hidden="true">✧</span>
    <span className="video-decoration video-heart-bottom" aria-hidden="true">♡</span>
    <button ref={trigger} type="button" className="workshop-video-trigger" aria-label={say('Expand video: ', 'تكبير الفيديو: ') + title} onClick={() => setOpen(true)}>
      <span className="workshop-video-frame"><video ref={preview} autoPlay muted loop playsInline preload="none" poster={video.poster} aria-hidden="true"/>
      </span>
      <span className="workshop-video-caption">{say('Tap to view larger', 'اضغطي للمشاهدة بحجم أكبر')} ↗</span>
    </button>
    {open && createPortal(<dialog ref={dialog} className="workshop-video-modal" aria-label={title} onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="workshop-video-player">
        <button type="button" className="workshop-video-close" aria-label={say('Close video', 'إغلاق الفيديو')} onClick={() => setOpen(false)} autoFocus>×</button>
        <video ref={player} src={video.full} poster={video.poster} controls playsInline preload="metadata"/>
      </div>
    </dialog>, document.body)}
  </div>;
}