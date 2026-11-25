// 관리자 화면은 서비스와 같은 밝은 화면 하나로 쓴다 (11/25 해원: 구조 개편, 다크 모드와 전환 버튼 없앰).
// Tabler 가 data-bs-theme 를 보고 색을 고르므로 head 에서 바로 light 로 둔다.
document.documentElement.setAttribute("data-bs-theme", "light");
