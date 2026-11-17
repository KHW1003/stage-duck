import { render, screen } from "@testing-library/react";
import { ApiError } from "../src/shared/api/client";
import { Button } from "../src/shared/ui/Button";
import { ErrorNotice, NETWORK_ERROR_MESSAGE, fieldErrorOf } from "../src/shared/ui/ErrorText";
import { Field, Input } from "../src/shared/ui/Field";
import { MoneyText, formatWon } from "../src/shared/ui/MoneyText";

describe("MoneyText (CLAUDE.md 11: 원 단위 정수)", () => {
  it.each([
    [1_850_000, "1,850,000원"],
    [92_500, "92,500원"],
    [1_942_500, "1,942,500원"],
    [0, "0원"],
    [999, "999원"],
    [1000, "1,000원"],
  ])("%d → %s", (value, text) => {
    render(<MoneyText value={value} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("단위를 빼고 쓸 수 있다", () => {
    render(<MoneyText value={500_000} unit="" />);
    expect(screen.getByText("500,000")).toBeInTheDocument();
  });

  it.each([1850000.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("정수가 아닌 값(%s)은 지어내지 않고 오류를 낸다", (v) => {
    expect(() => formatWon(v)).toThrow();
  });
});

describe("Field (입력 칸)", () => {
  it("이름·필수 표시·오류를 입력칸과 이어서 읽어 준다", () => {
    render(
      <Field label="이메일" required error="이메일 형식을 확인해 주세요">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText(/이메일/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("이메일 형식을 확인해 주세요");
  });

  it("오류가 없으면 aria-invalid 를 달지 않는다", () => {
    render(<Field label="닉네임">{(p) => <Input {...p} />}</Field>);
    expect(screen.getByLabelText("닉네임")).not.toHaveAttribute("aria-invalid");
  });
});

describe("오류 표시 (CLAUDE.md 6.2: 서버 문구를 그대로)", () => {
  const err = new ApiError(400, {
    code: "VALIDATION_FAILED",
    message: "입력한 내용을 확인해 주세요.",
    fieldErrors: [{ field: "email", reason: "이메일 형식을 확인해 주세요" }],
  });

  it("서버 message 를 그대로 보여 준다", () => {
    render(<ErrorNotice error={err} />);
    expect(screen.getByRole("alert")).toHaveTextContent("입력한 내용을 확인해 주세요.");
  });

  it("서버 응답이 아닌 오류는 연결 안내만 보여 준다", () => {
    render(<ErrorNotice error={new TypeError("Failed to fetch")} />);
    expect(screen.getByRole("alert")).toHaveTextContent(NETWORK_ERROR_MESSAGE);
  });

  it("오류가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<ErrorNotice error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("fieldErrors 에서 칸 하나의 이유를 꺼낸다", () => {
    expect(fieldErrorOf(err, "email")).toBe("이메일 형식을 확인해 주세요");
    expect(fieldErrorOf(err, "name")).toBeUndefined();
    expect(fieldErrorOf(new Error("x"), "email")).toBeUndefined();
  });
});

describe("Button", () => {
  it("loading 이면 꺼져서 두 번 눌리지 않는다", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        결제하기
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /결제하기/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    btn.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("type 을 적지 않으면 form 을 제출하지 않는 button 이다", () => {
    render(<Button>취소</Button>);
    expect(screen.getByRole("button", { name: "취소" })).toHaveAttribute("type", "button");
  });
});
