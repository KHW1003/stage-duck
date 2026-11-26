/**
 * 업체에게 보이는 사용자 프로필 (AC-F5-16, 목업 v4 mypage.html "업체에게 이렇게 보여요").
 * 닉네임·사진·가입일·이용 횟수·반려 횟수만 받는다 — 이름·전화·이메일·생년월일은 넣을 칸이 없다 (CLAUDE.md 20).
 * 쓰는 곳: 마이페이지 미리보기. 3번 공고 화면은 useUserProfile(id) 와 함께 이 부품을 붙인다.
 */
import type { CSSProperties } from "react";
import type { UserProfile } from "../../shared/api/types";
import { Ico } from "../../shared/ui/Ico";
import { yearMonth } from "./labels";
import "./profile.css";
import { ProfileAvatar } from "../../shared/ui/ProfileAvatar";

export function UserProfileCard({ profile }: { profile: UserProfile }) {
  const name = profile.nickname ?? "";
  const photo = profile.profileImageUrl;
  return (
    <div className="summary" style={{ "--cols": 4 } as CSSProperties}>
      <div className="profile-card__who">
        <ProfileAvatar className="avatar avatar--lg" name={name} src={photo} duck={profile.duck} size={72} label={`${name} 프로필 사진`} />
        <div>
          <b className="profile-card__name">{name}</b>
          <span>{yearMonth(profile.joinedAt)} 가입</span>
        </div>
      </div>
      <div className="has-ico">
        <span className="ico-box">
          <Ico name="ticket" />
        </span>
        <div>
          <span>이용 횟수</span>
          <b>
            {profile.usageCount}
            <small>회</small>
          </b>
        </div>
      </div>
      <div className="has-ico">
        <span className="ico-box">
          <Ico name="refresh" />
        </span>
        <div>
          <span>반려 횟수</span>
          <b>
            {profile.rejectionCount}
            <small>회</small>
          </b>
        </div>
      </div>
    </div>
  );
}
