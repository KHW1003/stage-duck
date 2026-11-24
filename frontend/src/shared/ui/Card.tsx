/**
 * 테두리 상자 (목업 v3 .side-box 모양: 1px 선, 모서리 8px, 그림자 없음).
 * 목업 원칙상 카드를 겹겹이 쌓지 않는다 — 오른쪽 행동 상자·요약처럼 "따로 묶어야 할 것" 한 덩어리에만 쓴다.
 */
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

interface Props extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** 제목 오른쪽 (링크·작은 버튼) */
  side?: ReactNode;
  children: ReactNode;
}

export function Card({ title, side, children, className, ...rest }: Props) {
  return (
    <section {...rest} className={[styles.card, className ?? ""].filter(Boolean).join(" ")}>
      {(title || side) && (
        <header className={styles.head}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {side}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
