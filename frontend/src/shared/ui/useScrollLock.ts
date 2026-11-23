/**
 * 모달이 열려 있는 동안 뒤 화면 스크롤을 잠근다 (KitModal·TermsModal 과 같은 방식). 닫히면 원래 값으로 되돌린다.
 * 디자인 검수(11/23): 따로 만든 모달 3개(ReportModal·ConfirmDelete·ConfirmModal)가 잠그지 않아 공통으로 뺐다.
 */
import { useEffect } from "react";

export function useScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}
