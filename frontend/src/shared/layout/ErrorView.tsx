/**
 * 오류 화면 (mockup-v4/pages/error.html): 큰 상태 번호(또는 아이콘) + 제목 + 할 일 한 문장 + 버튼 2개. 머리·바닥글은 그대로 둔다.
 * - 404: 없는 주소, 권한 없는 화면 (있는지조차 알리지 않는다, CLAUDE.md 10 · FR-AUTH-07)
 * - 401: 로그인 시간이 지남 / 403: 계정 종류·심사·정지 / suspended: 이용 정지 계정
 * - 500: 화면이 깨짐·서버 오류 (오류 번호 traceId 를 보여 준다) / 503: 점검 / offline: 인터넷 끊김
 */
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Me } from "../api/types";
import { ME_KEY, layoutKindOf, useLogout } from "../auth/useMe";
import { Ico, type KitIconName } from "../ui/Ico";
import { HOME } from "./menus";
import "./error-view.css";

export type ErrorKind = "404" | "401" | "403" | "suspended" | "500" | "503" | "offline";

const TEXT: Record<ErrorKind, { title: string; desc: string; icon?: KitIconName; bad?: boolean }> = {
  "404": { title: "화면을 찾을 수 없어요", desc: "주소가 바뀌었거나, 지워졌거나, 볼 수 없는 화면이에요. 주소를 다시 확인해 주세요." },
  "401": { title: "로그인이 필요해요", desc: "로그인 시간이 지났거나 로그아웃됐어요. 다시 로그인하면 보던 화면으로 돌아와요." },
  "403": {
    title: "지금은 볼 수 없는 화면이에요",
    desc: "계정 종류가 다르거나, 업체 심사가 끝나지 않았거나, 이용이 정지된 계정이에요. 궁금한 점은 1:1 문의로 알려 주세요.",
  },
  suspended: {
    title: "이용이 정지된 계정이에요",
    desc: "경고가 3회 쌓여 공고·견적서·채팅을 쓸 수 없어요. 정지에 대해 궁금한 점은 1:1 문의로 알려 주세요.",
    icon: "lock",
    bad: true,
  },
  "500": { title: "서버에 문제가 생겼어요", desc: "잠시 후 다시 시도해 주세요. 결제 중이었다면 결제가 되었는지 결제 내역에서 먼저 확인해 주세요." },
  "503": { title: "잠시 점검하고 있어요", desc: "점검이 끝나면 바로 다시 쓸 수 있어요. 점검 시간은 공지사항에서 볼 수 있어요." },
  offline: { title: "인터넷 연결이 끊겼어요", desc: "연결을 확인한 뒤 다시 시도해 주세요. 쓰고 있던 내용은 이 화면에 그대로 남아 있어요.", icon: "plug" },
};

interface Props {
  kind: ErrorKind;
  /** 500: 문의할 때 알려 줄 오류 번호 (서버 traceId) */
  traceId?: string | null;
  /** suspended: 계정·정지일 같은 요약 줄 */
  rows?: [string, ReactNode][];
  /** 다시 시도 (기본: 새로 고침) */
  onRetry?: () => void;
}

export function ErrorView({ kind, traceId, rows, onRetry }: Props) {
  const navigate = useNavigate();
  // 내 정보는 이미 받아 둔 값만 읽는다. 여기서 다시 불러오면 내 정보 오류 화면이 "불러오는 중 ↔ 오류"를 되풀이한다
  const home = HOME[layoutKindOf(useQueryClient().getQueryData<Me | null>(ME_KEY))];
  const t = TEXT[kind];
  const logout = useLogout();
  const retry = (
    <button className="btn btn--sm btn--primary" type="button" onClick={onRetry ?? (() => window.location.reload())}>
      <Ico name="refresh" sm />
      다시 시도
    </button>
  );

  return (
    <section className="err" role={kind === "offline" ? "alert" : undefined}>
      {t.icon ? (
        <span className={t.bad ? "err__ico err__ico--bad" : "err__ico"}>
          <Ico name={t.icon} />
        </span>
      ) : (
        <p className="err__code" aria-hidden="true">
          {kind}
        </p>
      )}
      <h1>{t.title}</h1>
      <p>{t.desc}</p>
      {rows && rows.length > 0 && (
        <table className="info-table">
          <tbody>
            {rows.map(([th, td]) => (
              <tr key={th}>
                <th>{th}</th>
                <td>{td}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="err__actions">
        {kind === "404" && (
          <>
            <Link className="btn btn--sm btn--primary" to={home}>
              홈으로
            </Link>
            <button className="btn btn--sm" type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(home))}>
              이전 화면
            </button>
          </>
        )}
        {kind === "401" && (
          <>
            <Link className="btn btn--sm btn--primary" to={`/login?next=${encodeURIComponent(window.location.pathname)}`}>
              로그인
            </Link>
            <Link className="btn btn--sm" to="/">
              처음으로
            </Link>
          </>
        )}
        {kind === "403" && (
          <>
            <Link className="btn btn--sm btn--primary" to={home}>
              홈으로
            </Link>
            <Link className="btn btn--sm" to="/inquiries/new">
              1:1 문의
            </Link>
          </>
        )}
        {kind === "suspended" && (
          <>
            <Link className="btn btn--sm btn--primary" to="/inquiries/new">
              1:1 문의
            </Link>
            <button className="btn btn--sm" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
              로그아웃
            </button>
          </>
        )}
        {kind === "500" && (
          <>
            {retry}
            <Link className="btn btn--sm" to={home}>
              홈으로
            </Link>
          </>
        )}
        {(kind === "503" || kind === "offline") && retry}
      </div>
      {kind === "500" && traceId && <p className="err__meta">오류 번호 {traceId} · 문의할 때 알려 주세요</p>}
    </section>
  );
}
