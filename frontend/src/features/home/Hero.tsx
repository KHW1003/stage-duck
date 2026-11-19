/**
 * 메인 히어로 (mockup/home.html 2번 구역): 왼쪽 문구 / 오른쪽 방문자 = 슬라이드, 사용자 = 진행 중인 공연.
 * 로그인 여부와 상관없이 오른쪽 칸 크기가 같아 배치가 흔들리지 않는다 (목업 .now 주석).
 */
import { Link } from "react-router-dom";
import type { PerformanceSummary } from "../../shared/api/types";
import { SLIDES } from "./content";
import { cx } from "./cx";
import { HeroSlider } from "./HeroSlider";
import { NowPanel } from "./NowPanel";
import s from "./home.module.css";

interface Props {
  /** 로그인한 사용자 닉네임. 없으면 방문자 화면 */
  userName?: string | null;
  /** 진행 중인 공연 (사용자). undefined = 불러오는 중 */
  perf?: PerformanceSummary | null;
}

const STATS = [
  { dt: "요청서", dd: "한 번만 써요" },
  { dt: "견적서", dd: "자동으로 검사해요" },
  { dt: "결제금", dd: "공연 뒤 정산돼요" },
];

export function Hero({ userName, perf }: Props) {
  const user = !!userName;
  /** 처음 가입했거나 진행 중인 요청서가 없는 사용자: "이어서"·"받은 견적" 대신 시작 안내 (11/19 피드백) */
  const fresh = user && perf === null;
  return (
    <section className={s.hero}>
      <div className={cx(s.wrap, s.heroGrid)}>
        <div className={s.heroCopy}>
          {user ? (
            <p className={s.eyebrow}>{fresh ? `${userName}님, 반가워요` : `${userName}님, 다시 오셨네요`}</p>
          ) : (
            <p className={s.eyebrow}>
              작은 공연의 시작, <b>STAGE DUCK</b>
            </p>
          )}
          {user ? (
            <h1>
              공연 준비,
              <br />
              {fresh ? "시작해 볼까요?" : "이어서 할까요?"}
            </h1>
          ) : (
            <h1>
              공연할 공간부터
              <br />
              음향·엔지니어까지
            </h1>
          )}
          <p className={s.heroDesc}>
            어떤 공연을 준비하는지 알려주세요.
            <br />
            공간에 맞는 제안을 받고, 비용과 일정을 함께 비교하세요.
          </p>
          <div className={s.heroActions}>
            {fresh ? (
              <Link className={cx(s.btn, s.btnPrimary)} to="/performances/new">
                새 공연 요청서 쓰기
              </Link>
            ) : user ? (
              <Link className={cx(s.btn, s.btnPrimary)} to={perf ? `/performances/${perf.id}` : "/me/performances"}>
                받은 견적 비교하기
              </Link>
            ) : (
              <Link className={cx(s.btn, s.btnPrimary)} to="/signup">
                공연 준비 시작하기
              </Link>
            )}
            <Link className={cx(s.btn, s.btnGhost)} to="/venues">
              공간 먼저 둘러보기
            </Link>
          </div>
          <Link className={s.heroSub} to={fresh ? "/board" : "/performances/new"}>
            {fresh ? "업체 먼저 둘러보기" : user ? "새 공연 요청서 쓰기" : "이미 공간이 있어요"} <span aria-hidden="true">→</span>
          </Link>
          <dl className={s.heroStats}>
            {STATS.map((st) => (
              <div key={st.dt}>
                <dt>{st.dt}</dt>
                <dd>{st.dd}</dd>
              </div>
            ))}
          </dl>
        </div>
        {user ? perf === undefined ? <div className={s.now} aria-busy="true" /> : <NowPanel perf={perf} /> : <HeroSlider slides={SLIDES} />}
      </div>
    </section>
  );
}
