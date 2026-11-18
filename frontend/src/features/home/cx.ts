/** className 합치기: 거짓 값은 뺀다. cx(s.btn, on && s.isOn) */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
