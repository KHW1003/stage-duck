/**
 * 메인 히어로 슬라이드 (방문자). 목업 home.html 스크립트와 같은 동작:
 * 5초마다 다음 장, 이전·다음 버튼을 누르면 타이머를 다시 시작, 멈춤/재생, 아래 진행 막대.
 * 움직임 줄이기 설정(prefers-reduced-motion)이면 처음부터 멈춘 상태로 둔다.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Slide } from "./content";
import { cx } from "./cx";
import { HomeIcon } from "./icons";
import s from "./home.module.css";

const INTERVAL = 5000;

const prefersReduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function SlideLink({ to, className, children }: { to: string; className: string; children: string }) {
  // "#flow" 같은 같은 화면 안 구역은 <a>, 다른 화면은 <Link>
  return to.startsWith("#") ? (
    <a className={className} href={to}>
      {children}
    </a>
  ) : (
    <Link className={className} to={to}>
      {children}
    </Link>
  );
}

export function HeroSlider({ slides }: { slides: Slide[] }) {
  const [cur, setCur] = useState(0);
  const [paused, setPaused] = useState(prefersReduced);
  // 버튼을 누를 때마다 바뀌어 타이머·진행 막대를 처음부터 다시 시작한다
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setCur((c) => (c + 1) % slides.length), INTERVAL);
    return () => window.clearInterval(id);
  }, [paused, tick, slides.length]);

  const go = (dir: number) => {
    setCur((c) => (c + dir + slides.length) % slides.length);
    setTick((t) => t + 1);
  };

  return (
    <div className={s.slider} aria-roledescription="carousel" aria-label="STAGE DUCK 소개">
      <div className={s.sliderTrack}>
        {slides.map((slide, i) => (
          <article
            key={slide.tag}
            className={cx(s.slide, i === cur && s.isActive)}
            style={{ "--img": `url('${slide.photo}')` } as CSSProperties}
            aria-hidden={i !== cur}
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${slides.length}`}
          >
            <div className={s.slideBody}>
              <span className={s.slideTag}>{slide.tag}</span>
              <h2>
                {slide.title.map((line, k) => (
                  <span key={line}>
                    {k > 0 && <br />}
                    {line}
                  </span>
                ))}
              </h2>
              <p>{slide.desc}</p>
              <SlideLink to={slide.to} className={cx(s.btn, s.btnPrimary)}>
                {slide.cta}
              </SlideLink>
            </div>
          </article>
        ))}
      </div>
      <div className={s.sliderCtrl}>
        <button type="button" className={s.sliderBtn} aria-label="이전 슬라이드" onClick={() => go(-1)}>
          <HomeIcon name="prev" />
        </button>
        <span className={s.sliderCount} aria-live="polite">
          <b>{cur + 1}</b> / {slides.length}
        </span>
        <button type="button" className={s.sliderBtn} aria-label="다음 슬라이드" onClick={() => go(1)}>
          <HomeIcon name="next" />
        </button>
        <button
          type="button"
          className={cx(s.sliderBtn, s.sliderPause)}
          aria-label={paused ? "자동 넘김 시작" : "자동 넘김 멈추기"}
          onClick={() => {
            setPaused((p) => !p);
            setTick((t) => t + 1);
          }}
        >
          <HomeIcon name={paused ? "play" : "pause"} />
        </button>
      </div>
      <div className={s.sliderBar} aria-hidden="true">
        {/* key 가 바뀌면 막대 애니메이션이 처음부터 다시 돈다 */}
        <span key={`${cur}-${tick}`} className={paused ? undefined : s.run} />
      </div>
    </div>
  );
}
