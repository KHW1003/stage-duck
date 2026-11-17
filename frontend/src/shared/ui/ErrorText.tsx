/**
 * 오류 표시 (CLAUDE.md 6.2). 서버 오류 문구(ApiError.body.message)를 그대로 보여 주고, 화면에서 새로 지어내지 않는다.
 * - ErrorNotice: 화면 위쪽 안내 상자 (role="alert" 라 바로 읽어 준다)
 * - fieldErrorOf: fieldErrors 에서 칸 하나의 이유를 꺼내 <Field error> 에 넘긴다
 */
import { ApiError } from "../api/client";
import { Icon } from "./Icon";
import styles from "./ErrorText.module.css";

/** 서버 응답이 아닌 오류(네트워크 끊김 등)에만 쓰는 문구 */
export const NETWORK_ERROR_MESSAGE = "서버와 연결되지 않았어요. 잠시 뒤 다시 시도해 주세요.";

export function errorMessageOf(error: unknown): string {
  return error instanceof ApiError ? error.body.message : NETWORK_ERROR_MESSAGE;
}

export function fieldErrorOf(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return error.body.fieldErrors?.find((e) => e.field === field)?.reason;
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className={styles.notice}>
      <Icon name="conflict" />
      <p>{errorMessageOf(error)}</p>
    </div>
  );
}
