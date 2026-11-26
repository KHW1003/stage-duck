/**
 * 마이페이지 · 내 프로필 (/mypage, #33). 목업 v4 mypage.html · FR-PROFILE-02 · AC-F5-16. 사용자만.
 * - "업체에게 이렇게 보여요": GET /me/profile 을 UserProfileCard 로 (업체가 보는 것과 같은 모양)
 * - 프로필: 닉네임·사진. 사진은 고르는 순간 올리고(PROFILE) 저장할 때 번호만 보낸다. 중복 닉네임은 저장할 때 서버가 409
 * - 계정 정보: GET /me (나만 보인다)
 * - [중복 확인]: 누르는 즉시 서버에 묻는다(지금 내 닉네임이면 묻지 않음). 저장할 때도 서버가 다시 본다(409)
 * 목업과 다르게 정한 것: [비밀번호 바꾸기]·[탈퇴]·마케팅 수신 뺌,
 * 생년월일·로그인 방식은 GET /me 에 없어 뺌, 메뉴 옆 숫자는 서버 값이 없어 뺌.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMyProfile, useUpdateMyProfile, useUploadProfilePhoto } from "../features/profile/api";
import { DuckPicker } from "../features/profile/DuckPicker";
import { nicknameError } from "../features/auth/rules";
import { useDupCheck } from "../features/auth/useDupCheck";
import "../features/profile/profile.css";
import { UserProfileCard } from "../features/profile/UserProfileCard";
import type { MyProfileRequest } from "../shared/api/types";
import { ProfileAvatar } from "../shared/ui/ProfileAvatar";
import { useLogout, useMe } from "../shared/auth/useMe";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice, errorMessageOf, fieldErrorOf } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import { usePageMeta } from "../features/seo/usePageMeta";

const NAV = [
  { label: "내 프로필", to: "/mypage" },
  { label: "관심 업체", to: "/favorites" },
  { label: "알림", to: "/notifications" },
  // 최종 담당표는 공연별(/performances/:id/sheet)이라 여기서 뺐다 (11/23, 없는 주소 /sheet 404)
  { label: "1:1 문의", to: "/me/inquiries" },
];

function SideNav() {
  const logout = useLogout();
  return (
    <nav className="side-nav" aria-label="마이페이지">
      <p className="side-nav__title">마이페이지</p>
      <div className="side-nav__group">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} aria-current={n.to === "/mypage" ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </div>
      <div className="side-nav__group">
        <a
          href="/login"
          onClick={(e) => {
            e.preventDefault();
            logout.mutate();
          }}
        >
          로그아웃
        </a>
      </div>
    </nav>
  );
}

function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="field__error" role="alert">
      <Ico name="warn" sm />
      {text}
    </p>
  );
}

export function MyPage() {
  usePageMeta("마이페이지");
  const me = useMe();
  const profile = useMyProfile();
  const update = useUpdateMyProfile();
  const upload = useUploadProfilePhoto();
  // 입력 중인 값만 여기 둔다 (null = 아직 안 고침). 서버 값은 profile.data 그대로 쓴다
  const [nickname, setNickname] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const saved = profile.data;
  const dup = useDupCheck();
  const [tried, setTried] = useState(false);
  const nickValue = nickname ?? saved?.nickname ?? "";
  const nickDup = dup.result("nickname", nickValue);
  const nickError =
    (tried && nickname !== null ? nicknameError(nickname) : undefined) ??
    fieldErrorOf(update.error, "nickname") ??
    (nickDup?.ok === false ? nickDup.msg : undefined);

  /** 오리를 고르면 사진을 빼고, 사진을 올리면 그 사진으로 — 둘 다 바로 저장한다 (11/26) */
  const close = { onSuccess: () => setPicking(false) };
  const pickDuck = (pick: string) => update.mutate({ duckAvatar: pick, profileFileId: null }, close);
  const uploadPhoto = (file: File) => upload.mutate(file, { onSuccess: (f) => update.mutate({ profileFileId: f.id }, close) });

  function save() {
    if (!saved) return;
    const body: MyProfileRequest = {};
    setTried(true);
    if (nickname !== null && nicknameError(nickname)) return;
    if (nickname !== null && nickname.trim() !== saved.nickname) body.nickname = nickname.trim();
    if (Object.keys(body).length === 0) return;
    update.mutate(body, {
      onSuccess: () => {
        setNickname(null);
      },
    });
  }

  return (
    <>
      <KitPageTop crumbs={[{ label: "마이페이지" }]} title="내 프로필" />
      <div className="container main">
        <div className="with-nav my-shell">
          <SideNav />
          <div>
            <section className="sec" aria-labelledby="mypage-preview">
              <div className="sec-head">
                <h2 id="mypage-preview">
                  <Ico name="eye" />
                  업체에게 이렇게 보여요
                </h2>
              </div>
              {saved ? <UserProfileCard profile={saved} /> : profile.isError ? <ErrorNotice error={profile.error} /> : null}
              <ul className="bullets mt-12">
                <li>반려 횟수: 채팅을 시작한 뒤 공고를 내린 횟수예요. 5회가 되면 24시간 동안 새 공고를 올릴 수 없어요.</li>
                <li>마지막으로 내린 지 180일이 지나면 0으로 돌아가요.</li>
              </ul>
            </section>

            <section className="sec" aria-labelledby="mypage-profile">
              <div className="sec-head">
                <h2 id="mypage-profile">
                  <Ico name="user" />
                  프로필
                </h2>
              </div>
              <div className="form-table">
                <div>
                  <label className="form-table__th" htmlFor="mypage-nickname">
                    닉네임
                  </label>
                  <span className="form-table__td">
                    <span className="form-table__inline">
                      <input
                        id="mypage-nickname"
                        className="input profile-nick"
                        value={nickname ?? saved?.nickname ?? ""}
                        maxLength={30}
                        aria-invalid={nickError ? true : undefined}
                        onChange={(e) => setNickname(e.target.value)}
                      />
                      <button
                        className="btn btn--sm"
                        type="button"
                        disabled={dup.checking === "nickname" || !saved}
                        onClick={() => dup.check("nickname", nickValue, saved?.nickname ?? undefined)}
                        aria-label="닉네임 중복 확인"
                      >
                        {dup.checking === "nickname" ? "확인 중…" : "중복 확인"}
                      </button>
                    </span>
                    <FieldError text={nickError} />
                    {!nickError && nickDup?.ok && (
                      <p className="field__hint" style={{ color: "var(--sd-pass-text)" }}>
                        <Ico name="check" sm /> {nickDup.msg}
                      </p>
                    )}
                  </span>
                </div>
                <div>
                  <span className="form-table__th">프로필 사진</span>
                  <span className="form-table__td">
                    <span className="form-table__inline">
                      <ProfileAvatar name={saved?.nickname ?? ""} src={saved?.profileImageUrl} duck={saved?.duck} />
                      <button type="button" className="btn btn--sm" disabled={!saved} onClick={() => setPicking(true)}>
                        <Ico name="upload" sm />
                        사진 바꾸기
                      </button>
                    </span>
                    {picking && saved && (
                      <DuckPicker
                        duck={saved.duck}
                        hasPhoto={Boolean(saved.profileImageUrl)}
                        busy={upload.isPending || update.isPending}
                        error={upload.error ?? update.error}
                        onPick={pickDuck}
                        onUpload={uploadPhoto}
                        onClose={() => setPicking(false)}
                      />
                    )}
                    <FieldError text={upload.isError ? errorMessageOf(upload.error) : undefined} />
                  </span>
                </div>
              </div>
            </section>

            <section className="sec" aria-labelledby="mypage-account">
              <div className="sec-head">
                <h2 id="mypage-account">
                  <Ico name="lock" />
                  계정 정보
                </h2>
                <p>나만 보여요.</p>
              </div>
              {me.data && (
                <div className="table-box">
                  <table className="info-table">
                    <tbody>
                      <tr>
                        <th scope="row">이름</th>
                        <td>{me.data.name}</td>
                        <th scope="row">이메일</th>
                        <td>{me.data.email}</td>
                      </tr>
                      <tr>
                        <th scope="row">전화번호</th>
                        <td className="num" colSpan={3}>
                          {me.data.phone}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {update.isError && !nickError && <ErrorNotice error={update.error} />}
            <div className="btns btns--center mt-40">
              <button className="btn btn--primary btn--lg profile-save" type="button" disabled={update.isPending || !saved} onClick={save}>
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
