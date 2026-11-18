/**
 * 로그인·비밀번호 찾기 화면 틀 (mockup-v4 login.html · password.html 의 .auth-split):
 * 왼쪽 무대 사진 + 서비스 안내 세 줄, 오른쪽 폼. 760px 이하에서는 사진 칸이 위로 올라가 짧아진다 (auth.css).
 */
import type { CSSProperties, ReactNode } from "react";
import { Ico, type KitIconName } from "../../shared/ui/Ico";
import "./auth.css";

const POINTS: { icon: KitIconName; text: string }[] = [
  { icon: "layers", text: "공연장 → 장비 → 엔지니어 순서로 견적서를 받아요" },
  { icon: "pass", text: "견적서마다 설치 시간·수용 인원을 자동 검사해요" },
  { icon: "shield", text: "결제 금액은 공연이 끝날 때까지 보관돼요" },
];

export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="container">
      <div className="auth-split">
        <div
          className="auth-visual"
          style={{ "--img": "url('/photos/photo-1499364615650-ec38552f4f34.jpg')" } as CSSProperties}
          role="img"
          aria-label="공연장 무대 조명 사진"
        >
          <h2>
            공연장부터 엔지니어까지,
            <br />한 곳에서 차례로 정해요.
          </h2>
          <ul>
            {POINTS.map((p) => (
              <li key={p.icon}>
                <span className="ico-box">
                  <Ico name={p.icon} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        {children}
      </div>
    </div>
  );
}
