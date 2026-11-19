/**
 * 로그인 (/login). 목업: mockup-v4/pages/login.html · FR-AUTH-02·06 · AC-F1-04·08·11
 * - 성공하면 서버가 정한 역할별 첫 화면(landing)으로. 로그인이 필요한 화면에서 왔으면(?next=) 그 화면으로
 *   (next 는 이 사이트 안 주소만 받는다 — "/"로 시작하고 "//"가 아닌 것)
 * - 비밀번호 틀림(UNAUTHENTICATED)은 입력칸 아래, 5회 실패(LOGIN_LOCKED)는 안내 상자로 서버 문구를 보여 준다
 * - [이메일 저장]은 이 브라우저에만 남긴다 (localStorage, 비밀번호는 저장하지 않는다)
 * - [네이버로 로그인]은 서버의 /auth/naver/start 로 이동한다 (AC-F1-04). 처음이면 서버가 추가 정보 화면(/signup/extra)으로 보낸다
 * - 카카오 버튼은 VITE_KAKAO_LOGIN_ENABLED=true 일 때만 그린다 (AC-F1-08·09)
 * - 소셜 로그인을 마치지 못하고 돌아오면(?social=failed) 안내를 보여 준다
 * - 시연 계정 전환은 1번 묶음 API 가 생기면 붙인다
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthSplit } from "../features/auth/AuthSplit";
import { SOCIAL_START, kakaoLoginEnabled, useLogin } from "../features/auth/api";
import { usePageMeta } from "../features/seo/usePageMeta";
import { ApiError } from "../shared/api/client";
import { Ico } from "../shared/ui/Ico";

const SAVED_EMAIL = "sd.login.email";

function readSaved(): string {
  try {
    return localStorage.getItem(SAVED_EMAIL) ?? "";
  } catch {
    return "";
  }
}

function writeSaved(email: string | null) {
  try {
    if (email) localStorage.setItem(SAVED_EMAIL, email);
    else localStorage.removeItem(SAVED_EMAIL);
  } catch {
    /* 저장할 수 없는 브라우저면 넘어간다 */
  }
}

export function LoginPage() {
  usePageMeta("로그인");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextParam = params.get("next");
  const socialFailed = params.get("social") === "failed";
  const from = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const login = useLogin();
  const [email, setEmail] = useState(readSaved);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => readSaved() !== "");

  const err = login.error instanceof ApiError ? login.error.body : null;
  const locked = err?.code === "LOGIN_LOCKED";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (res) => {
          writeSaved(remember ? email.trim() : null);
          navigate(from ?? res.landing, { replace: true });
        },
      },
    );
  };

  return (
    <AuthSplit>
      <div className="login">
        <h1>로그인</h1>
        <p>사용자와 업체 모두 같은 화면에서 로그인해요.</p>
        <form className="login__form stack" style={{ ["--gap" as string]: "14px" }} onSubmit={submit} noValidate>
          <input
            className="input login__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="이메일"
            placeholder="이메일"
            autoComplete="email"
            aria-invalid={!!err && !locked}
            required
          />
          <input
            className="input login__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="비밀번호"
            placeholder="비밀번호"
            autoComplete="current-password"
            aria-invalid={!!err && !locked}
            required
          />
          {err && !locked && (
            <p className="field__error" role="alert">
              <Ico name="warn" sm />
              {err.message}
            </p>
          )}
          {locked && (
            <div className="notice notice--conflict" role="alert">
              <Ico name="lock" />
              <div>{err.message}</div>
            </div>
          )}
          <div className="login__opts">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              이메일 저장
            </label>
            <Link className="link" to="/password/forgot">
              비밀번호 찾기
            </Link>
          </div>
          <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={login.isPending}>
            {login.isPending ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <div className="login__or">간편 로그인</div>
        {socialFailed && (
          <div className="notice notice--conflict mb-16" role="alert">
            <Ico name="warn" />
            <div>간편 로그인을 마치지 못했어요. 다시 시도하거나 이메일로 로그인해 주세요.</div>
          </div>
        )}
        <a className="naver" href={SOCIAL_START.naver}>
          <span>N</span>네이버로 로그인
        </a>
        {kakaoLoginEnabled() && (
          <a className="kakao" href={SOCIAL_START.kakao}>
            <span>K</span>카카오로 로그인
          </a>
        )}
        <p className="field__hint mt-8" style={{ textAlign: "center" }}>
          처음이면 추가 정보 화면으로 이어져요.
        </p>
        <div className="login__links">
          <Link to="/signup">사용자 가입</Link>
          <Link to="/signup/supplier">업체 입점 신청</Link>
        </div>
      </div>
    </AuthSplit>
  );
}
