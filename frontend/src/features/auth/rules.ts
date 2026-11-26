/**
 * 가입·계정 칸 규칙 (서버 app/auth/calc.py 와 같게). 화면에서 먼저 막고, 서버도 다시 본다.
 */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export const emailError = (v: string) =>
  !v.trim() ? "이메일을 적어 주세요." : v.trim().length > 255 || !EMAIL_RE.test(v.trim()) ? "이메일 형식을 확인해 주세요." : undefined;

export const passwordError = (v: string) => (PASSWORD_RE.test(v) ? undefined : "8자 이상, 영문과 숫자를 함께 써 주세요.");

/** 전화번호: 하이픈을 빼고 숫자 9~11자리 */
export const phoneError = (v: string) => (/^\d{9,11}$/.test(v.replace(/-/g, "").trim()) ? undefined : "전화번호는 숫자 9~11자리로 적어 주세요.");

/** 닉네임 최대 글자 수 (11/26 목산: 30 → 15, 서버 backend/app/auth/calc.py NICKNAME_MAX 와 같게) */
export const NICKNAME_MAX = 15;

export const nicknameError = (v: string) =>
  !v.trim() ? "닉네임을 적어 주세요." : v.trim().length > NICKNAME_MAX ? `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있어요.` : undefined;
