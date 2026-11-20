/** 별점 보이기·고르기 (specs/reviews.md). 색만으로 뜻을 전하지 않게 숫자도 함께 읽어 준다. */
import { useState } from "react";
import "./review.css";

const STAR = "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";

function Star({ fill }: { fill: number }) {
  // fill: 0~1 (반 개 표현)
  const id = `star-${Math.round(fill * 100)}`;
  return (
    <svg viewBox="0 0 24 24" className="star" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="currentColor" />
          <stop offset={`${fill * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/** 평균 별점 (읽기 전용) */
export function Stars({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`stars stars--${size}`} role="img" aria-label={`별점 5점 만점에 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} fill={Math.max(0, Math.min(1, value - n + 1))} />
      ))}
    </span>
  );
}

/** 목록 카드용 짧은 별점: ★ 4.5 (12) */
export function RatingBadge({ average, count }: { average: number; count: number }) {
  return (
    <span className="rating-badge" aria-label={`별점 ${average}점, 후기 ${count}개`}>
      <svg viewBox="0 0 24 24" className="star" aria-hidden="true">
        <path d={STAR} fill="currentColor" />
      </svg>
      <b className="sd-num">{average.toFixed(1)}</b>
      <span className="sd-num">({count})</span>
    </span>
  );
}

const WORDS = ["", "별로예요", "아쉬워요", "보통이에요", "좋아요", "최고예요"];

/** 별점 고르기 — 라디오 5개 (키보드 ←→ 로도 고른다) */
export function StarPicker({ value, onChange, name }: { value: number; onChange: (v: number) => void; name: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="star-picker" role="radiogroup" aria-label="별점" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= shown ? "is-on" : undefined} onMouseEnter={() => setHover(n)}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n}점 ${WORDS[n]}`} />
          <svg viewBox="0 0 24 24" className="star" aria-hidden="true">
            <path d={STAR} fill={n <= shown ? "currentColor" : "transparent"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </label>
      ))}
      <span className="star-picker__word">{shown ? `${shown}점 · ${WORDS[shown]}` : "별점을 골라 주세요"}</span>
    </div>
  );
}
