/**
 * 가입 화면의 약관 [보기] — 다른 화면으로 가지 않고 그 자리에 A4 종이 모양으로 띄운다.
 * - 화면을 옮기면 가입 칸에 넣은 값이 모두 지워져서(11/20 피드백) 모달로 바꿨다.
 * - 뒤는 어둡게 덮어 동의서에 눈이 가게 한다. 종이는 A4 비율(210×297), 안에서 스크롤.
 * - [동의하고 닫기]를 누르면 그 약관 칸에 체크해 준다. Esc·바깥 누르기·닫기 버튼으로 닫힌다.
 * - 열려 있는 동안 뒤 화면 스크롤을 잠그고, 닫으면 [보기] 버튼으로 초점을 돌려준다.
 */
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Ico } from "../../shared/ui/Ico";
import { TERMS, type TermsType } from "./terms";
import { TermsDocumentBody } from "./TermsDocumentBody";
import "./support.css";
import "./terms-modal.css";

interface Props {
  type: TermsType;
  /** 체크 칸 이름 (예: "개인정보 수집·이용 (필수)") — 동의 버튼에 함께 읽어 준다 */
  label: string;
  onClose: () => void;
  /** 주면 [동의하고 닫기] 버튼이 생긴다 */
  onAgree?: () => void;
}

export function TermsModal({ type, label, onClose, onAgree }: Props) {
  const id = useId();
  const paper = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const doc = TERMS[type];

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    paper.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="tmm-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tmm" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="tmm-paper" ref={paper} tabIndex={-1}>
          <div className="tmm-doc">
            <header className="tmm-doc__head">
              <span className="tmm-doc__brand">STAGE DUCK</span>
              <h2 id={`${id}-t`}>{doc.title}</h2>
              <p className="tmm-doc__meta">{doc.versionLabel}</p>
            </header>
            <TermsDocumentBody doc={doc} />
          </div>
        </div>
        <div className="tmm-bar">
          <span className="tmm-bar__hint">끝까지 읽은 뒤 동의해 주세요. 내용은 시연용 요약본입니다.</span>
          <div className="tmm-bar__btns">
            <button type="button" className="btn btn--line" onClick={onClose}>
              닫기
            </button>
            {onAgree && (
              <button
                type="button"
                className="btn btn--primary"
                aria-label={`${label}에 동의하고 닫기`}
                onClick={() => {
                  onAgree();
                  onClose();
                }}
              >
                동의하고 닫기
              </button>
            )}
          </div>
        </div>
        <button type="button" className="tmm-x" aria-label="약관 닫기" onClick={onClose}>
          <Ico name="x" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
