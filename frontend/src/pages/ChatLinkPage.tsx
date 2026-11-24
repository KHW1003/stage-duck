/** 메일의 채팅 링크(/chats/{방번호}) → 역할별 첫 화면에서 채팅 창을 연다 (D-42). 남의 방·없는 방은 채팅 창이 안내한다 */
import { Navigate, useParams } from "react-router-dom";
import { useMe } from "../shared/auth/useMe";

export function ChatLinkPage() {
  const { id = "" } = useParams();
  const home = useMe().data?.role === "SUPPLIER" ? "/partner" : "/me/performances";
  return <Navigate replace to={/^[1-9]\d{0,14}$/.test(id) ? `${home}?chat=${id}` : home} />;
}
