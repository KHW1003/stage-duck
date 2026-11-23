/**
 * 완료 안내 (mockup-v4/pages/done.html): 결과 아이콘 + 한 문장 + 요약표 + 다음에 할 일 버튼.
 * 서버가 성공을 확인한 뒤에만 보여 준다. 가입·요청서 게시·견적 요청·컨펌·결제·취소에서 같은 틀로 쓴다.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Ico } from "./Ico";
import "./done.css";

export interface DoneAction {
  label: string;
  to: string;
  primary?: boolean;
}

interface Props {
  title: string;
  desc: ReactNode;
  rows: [string, ReactNode, boolean?][];
  next?: ReactNode;
  actions: DoneAction[];
  /** 취소처럼 축하가 아닌 완료 (검정 테두리) */
  plain?: boolean;
  testPay?: string;
}

export function DoneView({ title, desc, rows, next, actions, plain = false, testPay }: Props) {
  return (
    <section className="done">
      <div className="result">
        <span className={plain ? "result__icon result__icon--plain" : "result__icon"}>
          <Ico name="check" />
        </span>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <table className="info-table">
        <tbody>
          {rows.map(([th, td, strong]) => (
            <tr key={th}>
              <th>{th}</th>
              <td className={strong ? "strong" : undefined}>{td}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {testPay && (
        <p className="test-pay mt-16">
          <Ico name="info" sm />
          {testPay}
        </p>
      )}
      {next && <p className="done__next">{next}</p>}
      <div className="btns btns--center mt-16">
        {actions.map((a) => (
          <Link key={a.label} className={a.primary ? "btn btn--primary btn--lg" : "btn btn--lg"} to={a.to}>
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
