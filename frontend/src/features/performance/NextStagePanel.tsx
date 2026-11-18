/**
 * [다음 단계로] (목업 next.html, FR-CHAT-04·FR-ASSIGN-03) — 다음 할 일이 OPEN_NEXT 일 때 상세 화면에 붙는다.
 * - AC-F3-02 다음 단계 업체 모집 시작 / 건너뛰기(책임 고지) / AC-F3-04 전부 구했어요(재확인)
 * - 버튼은 Idempotency-Key 를 넘기고 응답이 올 때까지 끈다. 같은 시도를 다시 보낼 때는 같은 키를 쓴다.
 */
import { useRef, useState } from "react";
import type { PerformanceDetail } from "../../shared/api/types";
import { Button } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { useAdvance, useDeclareAllSecured } from "./api";
import { ConfirmModal } from "./ConfirmModal";
import { STAGE_NAME } from "./labels";
import styles from "./Performance.module.css";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function NextStagePanel({ performance }: { performance: PerformanceDetail }) {
  const advance = useAdvance();
  const declare = useDeclareAllSecured();
  const [asking, setAsking] = useState<"skip" | "all" | null>(null);
  const keys = useRef({ OPEN_NEXT: newKey(), SKIP_NEXT: newKey() });

  const index = performance.stages.findIndex((s) => s.id === performance.nextStageId);
  const next = performance.stages[index + 1];
  if (index < 0 || !next) return null;
  const nextName = STAGE_NAME[next.stageType];

  function send(action: "OPEN_NEXT" | "SKIP_NEXT") {
    advance.mutate(
      { stageId: performance.nextStageId!, action, idempotencyKey: keys.current[action] },
      {
        onSuccess: () => {
          keys.current[action] = newKey();
          setAsking(null);
        },
      },
    );
  }

  return (
    <div className={styles.noticeActions}>
      <Button variant="primary" onClick={() => send("OPEN_NEXT")} loading={advance.isPending && advance.variables?.action === "OPEN_NEXT"}>
        {nextName} 업체 모집 시작
      </Button>
      <Button variant="line" onClick={() => setAsking("skip")}>
        {nextName}는 이미 있어요 · 건너뛰기
      </Button>
      <Button variant="ghost" onClick={() => setAsking("all")}>
        전부 구했어요
      </Button>
      {!asking && <ErrorNotice error={advance.error} />}

      {asking === "skip" && (
        <ConfirmModal
          title={`${nextName} 단계를 건너뛸까요?`}
          confirmLabel="건너뛰기"
          cancelLabel="모집할래요"
          loading={advance.isPending}
          error={advance.error}
          onCancel={() => setAsking(null)}
          onConfirm={() => send("SKIP_NEXT")}
        >
          <p>
            건너뛰면 {nextName} 업체를 따로 모집하지 않아요. 건너뛴 부분의 일정·장비·인력은 직접 준비해야 하고, 그 책임은 사용자에게 있어요.
          </p>
        </ConfirmModal>
      )}
      {asking === "all" && (
        <ConfirmModal
          title="남은 단계를 모두 건너뛸까요?"
          confirmLabel="모두 건너뛰기"
          loading={declare.isPending}
          error={declare.error}
          onCancel={() => setAsking(null)}
          onConfirm={() => declare.mutate(performance.id, { onSuccess: () => setAsking(null) })}
        >
          <p>
            남은 단계가 모두 건너뜀이 되고 바로 결제로 가요. 건너뛴 단계의 장비·인력은 직접 준비해야 해요. 그 부분의 일정·장비 문제는 STAGE DUCK이 확인하지 않아요.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
