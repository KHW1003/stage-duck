/**
 * 화면을 그리다 깨지면 하얀 화면 대신 오류 화면 500 을 보여 준다. 주소가 바뀌면(resetKey) 다시 그려 본다.
 * 서버가 준 오류(ApiError)면 그 traceId 를 "오류 번호"로 보여 준다.
 */
import { Component, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { ErrorView } from "./ErrorView";

interface Props {
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: unknown;
  key: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const traceId = error instanceof ApiError ? error.body.traceId : null;
    const kind = error instanceof ApiError && error.status === 503 ? "503" : "500";
    return (
      <div className="container main">
        <ErrorView kind={kind} traceId={traceId} onRetry={() => this.setState({ error: null })} />
      </div>
    );
  }
}
