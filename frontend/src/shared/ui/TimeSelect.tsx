/** 시각 고르기: 공통 Select 로 30분 단위만 고른다 (11/25). 예전에 저장한 17:15 같은 값은 바꾸기 전까지 남긴다 */
import type { ComponentProps } from "react";
import { Select } from "./Select";

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(i >> 1).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

interface Props extends Omit<ComponentProps<typeof Select>, "options"> {
  /** 이보다 늦은 시각만 보여 준다 */
  after?: string;
  /** 꼭 고르지 않아도 되는 칸: 고른 시각을 지우는 "정하지 않음" 항목을 더한다 */
  optional?: boolean;
}

export function TimeSelect({ value: raw, after = "", optional, ...rest }: Props) {
  const value = raw.slice(0, 5); // 서버가 준 15:00:00 도 15:00 으로
  const times = [...new Set([...TIMES.filter((t) => t > after), ...(value ? [value] : [])])].sort();
  const options = times.map((t) => ({ value: t, label: t }));
  return (
    <Select
      placeholder="시각"
      {...rest}
      value={value}
      options={optional ? [{ value: "", label: "정하지 않음" }, ...options] : options}
    />
  );
}
