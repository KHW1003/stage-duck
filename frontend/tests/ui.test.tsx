import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ApiError } from "../src/shared/api/client";
import { Button } from "../src/shared/ui/Button";
import { ErrorNotice, NETWORK_ERROR_MESSAGE, fieldErrorOf } from "../src/shared/ui/ErrorText";
import { Field, Input } from "../src/shared/ui/Field";
import { MoneyText, formatWon } from "../src/shared/ui/MoneyText";
import { Select, type SelectOption } from "../src/shared/ui/Select";

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

describe("Select (DESIGN.md 5장 고르기 칸, 목업 v4 select.js)", () => {
  const SIDO: SelectOption[] = [
    { value: "서울특별시", label: "서울특별시" },
    { value: "광주광역시", label: "광주광역시" },
    { value: "제주특별자치도", label: "제주특별자치도", disabled: true },
    { value: "전라남도", label: "전라남도" },
  ];

  function Sido({ initial = "", onChange = () => {} }: { initial?: string; onChange?: (v: string) => void }) {
    const [value, setValue] = useState(initial);
    return (
      <Field label="지역" required>
        {(p) => (
          <Select
            {...p}
            value={value}
            options={SIDO}
            placeholder="시·도를 골라 주세요"
            onChange={(v) => {
              setValue(v);
              onChange(v);
            }}
          />
        )}
      </Field>
    );
  }

  it("이름과 이어지고, 고른 값이 없으면 안내 문구를 보여 준다", () => {
    render(<Sido />);
    const box = screen.getByRole("combobox", { name: /지역/ });
    expect(box).toHaveTextContent("시·도를 골라 주세요");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("누르면 목록이 열리고 고른 항목에 표시가 있다", async () => {
    render(<Sido initial="광주광역시" />);
    await userEvent.click(screen.getByRole("combobox", { name: /지역/ }));
    expect(screen.getByRole("combobox", { name: /지역/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(SIDO.map((o) => o.label));
    expect(screen.getByRole("option", { name: "광주광역시" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "서울특별시" })).toHaveAttribute("aria-selected", "false");
  });

  it("항목을 누르면 고르고 닫힌다", async () => {
    const onChange = vi.fn();
    render(<Sido onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: /지역/ }));
    await userEvent.click(screen.getByRole("option", { name: "서울특별시" }));
    expect(onChange).toHaveBeenCalledWith("서울특별시");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /지역/ })).toHaveTextContent("서울특별시");
  });

  it("키보드: ↓로 열고 ↑↓로 옮기고 Enter로 고른다. 고른 뒤 포커스는 칸에 남는다", async () => {
    const onChange = vi.fn();
    render(<Sido initial="서울특별시" onChange={onChange} />);
    const box = screen.getByRole("combobox", { name: /지역/ });
    box.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "서울특별시" }).id);
    await userEvent.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "광주광역시" }).id);
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("광주광역시");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(box).toHaveFocus();
  });

  it("키보드: 꺼진 항목은 건너뛰고, 끝에서 더 가지 않는다", async () => {
    const onChange = vi.fn();
    render(<Sido initial="광주광역시" onChange={onChange} />);
    screen.getByRole("combobox", { name: /지역/ }).focus();
    await userEvent.keyboard("{Enter}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("전라남도");
  });

  it("꺼진 항목은 눌러도 고르지 않는다", async () => {
    const onChange = vi.fn();
    render(<Sido onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: /지역/ }));
    await userEvent.click(screen.getByRole("option", { name: "제주특별자치도" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("Esc는 고르지 않고 닫으며, 바깥(창 닫기 등)으로 Esc를 넘기지 않는다", async () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Sido onChange={onChange} />
      </div>,
    );
    const box = screen.getByRole("combobox", { name: /지역/ });
    box.focus();
    await userEvent.keyboard("{ArrowDown}");
    outer.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    expect(box).toHaveFocus();
  });

  it("목록 바깥을 누르면 닫힌다", async () => {
    render(
      <>
        <Sido />
        <button type="button">다른 곳</button>
      </>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: /지역/ }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "다른 곳" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("오류가 있으면 aria-invalid 를 달고, 꺼져 있으면 열리지 않는다", async () => {
    const { rerender } = render(
      <Field label="말머리" error="승인받지 않은 부문이에요.">
        {(p) => <Select {...p} value="" options={SIDO} onChange={() => {}} />}
      </Field>,
    );
    expect(screen.getByRole("combobox", { name: /말머리/ })).toHaveAttribute("aria-invalid", "true");
    rerender(
      <Field label="말머리">
        {(p) => <Select {...p} value="" options={SIDO} onChange={() => {}} disabled />}
      </Field>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: /말머리/ }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("name 을 주면 form 에 값이 함께 실린다", () => {
    const { container } = render(<Select name="sido" value="광주광역시" options={SIDO} onChange={() => {}} aria-label="지역" />);
    expect(container.querySelector('input[type="hidden"][name="sido"]')).toHaveValue("광주광역시");
  });
});
