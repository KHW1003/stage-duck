/**
 * 비밀번호 찾기 (/password/forgot) · 새 비밀번호 (/password/reset?token=). 목업: mockup-v4/pages/password.html · FR-AUTH-09 · D-55
 * 단계: 이메일 입력 → 메일 보냄 / 새 비밀번호 → 바뀜, 링크 만료.
 *
 * 화면만 먼저 만들었다. 서버 API(POST /auth/password-reset, /auth/password-reset/confirm)는 1번 묶음이 만들면
 * send·confirm 두 곳만 바꾼다. 가입 여부는 화면에 드러내지 않는다 — 어떤 이메일이든 같은 "메일 보냄" 화면.
 */
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthSplit } from "../features/auth/AuthSplit";
import { usePageMeta } from "../features/seo/usePageMeta";
import { Ico } from "../shared/ui/Ico";

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

function Forgot({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) onSent(email.trim());
  };
  return (
    <div className="pw">
      <h1>비밀번호 찾기</h1>
      <p>가입한 이메일을 넣으면 비밀번호를 바꿀 수 있는 링크를 보내 드려요.</p>
      <form className="pw__form stack" style={{ ["--gap" as string]: "14px" }} onSubmit={submit}>
        <input
          className="input login__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="이메일"
          placeholder="이메일"
          autoComplete="email"
          required
        />
        <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={!email.trim()}>
          링크 보내기
        </button>
      </form>
      <p className="pw__note">네이버로 가입했다면 비밀번호가 없어요. 로그인 화면에서 [네이버로 로그인]을 눌러 주세요.</p>
      <div className="pw__links">
        <Link to="/login">로그인</Link>
        <Link to="/signup">사용자 가입</Link>
      </div>
    </div>
  );
}

function Sent({ email }: { email: string }) {
  return (
    <div className="pw">
      <div className="pw__ico">
        <Ico name="mail" />
      </div>
      <h1>메일을 보냈어요</h1>
      <p>
        <b>{email}</b>로 가입되어 있다면 링크가 담긴 메일이 가요.
        <br />
        링크는 30분 동안 한 번만 쓸 수 있어요.
      </p>
      <div className="pw__form stack" style={{ ["--gap" as string]: "10px" }}>
        <Link className="btn btn--lg btn--block" to="/login">
          로그인으로
        </Link>
      </div>
      <p className="pw__note">메일이 안 왔다면 스팸함을 확인하거나 잠시 뒤 다시 요청해 주세요. 같은 이메일은 10분에 3번까지 요청할 수 있어요.</p>
    </div>
  );
}

function Reset({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [touched, setTouched] = useState(false);
  const weak = touched && !PASSWORD_RE.test(pw);
  const mismatch = touched && pw2 !== pw;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (PASSWORD_RE.test(pw) && pw === pw2) onDone();
  };
  return (
    <div className="pw">
      <h1>새 비밀번호</h1>
      <p>앞으로 로그인할 때 쓸 비밀번호를 정해 주세요.</p>
      <form className="pw__form stack" style={{ ["--gap" as string]: "14px" }} onSubmit={submit} noValidate>
        <div className="field">
          <input
            className="input login__input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-label="새 비밀번호"
            autoComplete="new-password"
            aria-invalid={weak}
          />
          {weak ? (
            <p className="field__error mt-4">
              <Ico name="warn" sm />
              8자 이상, 영문과 숫자를 함께 써 주세요.
            </p>
          ) : (
            <p className="field__hint mt-4">8자 이상, 영문과 숫자를 함께 써 주세요.</p>
          )}
        </div>
        <input
          className="input login__input"
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          aria-label="새 비밀번호 확인"
          autoComplete="new-password"
          aria-invalid={mismatch}
        />
        {mismatch && (
          <p className="field__error">
            <Ico name="warn" sm />
            비밀번호가 서로 달라요.
          </p>
        )}
        <button className="btn btn--primary btn--lg btn--block" type="submit">
          비밀번호 바꾸기
        </button>
      </form>
      <p className="pw__note">바꾸면 다른 기기에서 로그인된 곳도 모두 로그아웃돼요.</p>
    </div>
  );
}

function Result({ icon, title, desc, to, label }: { icon: "clock" | "check"; title: string; desc: string; to: string; label: string }) {
  return (
    <div className="pw">
      <div className="pw__ico">
        <Ico name={icon} />
      </div>
      <h1>{title}</h1>
      <p>{desc}</p>
      <div className="pw__form">
        <Link className="btn btn--primary btn--lg btn--block" to={to}>
          {label}
        </Link>
      </div>
    </div>
  );
}

export function PasswordForgotPage() {
  usePageMeta("비밀번호 찾기");
  const [sentTo, setSentTo] = useState<string | null>(null);
  return <AuthSplit>{sentTo ? <Sent email={sentTo} /> : <Forgot onSent={setSentTo} />}</AuthSplit>;
}

export function PasswordResetPage() {
  usePageMeta("새 비밀번호");
  const token = useSearchParams()[0].get("token");
  const [done, setDone] = useState(false);
  let body;
  if (!token) body = <Result icon="clock" title="링크가 만료됐어요" desc="30분이 지났거나 이미 쓴 링크예요. 새 링크를 받아 주세요." to="/password/forgot" label="다시 요청" />;
  else if (done) body = <Result icon="check" title="비밀번호를 바꿨어요" desc="새 비밀번호로 로그인해 주세요." to="/login" label="로그인" />;
  else body = <Reset onDone={() => setDone(true)} />;
  return <AuthSplit>{body}</AuthSplit>;
}
