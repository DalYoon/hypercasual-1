# 눈밭 밥집 (Hypercasual-1)

눈밭에서 일꾼들이 알아서 고기 수집 → 요리 → 서빙까지 하는 방치형 경영 게임 v2.
플레이어는 코인으로 업그레이드와 확장만 합니다 (클릭커 아님).
바닐라 JS 정적 사이트. 백엔드 없이 진행 상황은 브라우저 localStorage에만 저장됩니다.

## 플레이 구조
1. 일꾼이 자동으로 사냥터 → 모닥불 → 손님 자리를 오가며 서빙 (서빙 1회 = +5 코인)
2. 손님은 먹고 나면 일정 시간 후 다시 배고파짐
3. 코인으로 업그레이드 구매:
   - 👷 **일꾼 고용** - 일꾼 +1 (최대 6명)
   - 👟 **장화** - 이동속도 +25%/Lv (최대 5)
   - 🧤 **수집 연습** - 고기 수집 시간 -20%/Lv (최대 5)
   - 🔥 **화력 강화** - 조리 시간 -20%/Lv (최대 5)
   - 🪑 **자리 확장** - 손님 자리 +1 (최대 6석)
   - ⭐ **맛집 소문** - 서빙당 코인 +1/Lv (최대 5)
4. 게임을 꺼도 돌아올 때 오프라인 수익 정산 (최대 8시간분)

## 배포
GitHub Pages (main 브랜치 루트): https://dalyoon.github.io/hypercasual-1/

## 에셋 출처 / 라이선스
- [Kenney - Pixel Platformer](https://kenney.nl/assets/pixel-platformer) (캐릭터, 모닥불 스프라이트)
- [Kenney - Pixel Platformer Food Expansion](https://kenney.nl/assets/pixel-platformer-food-expansion) (고기/요리 스프라이트)
- 라이선스: **CC0 (퍼블릭 도메인)** — 개인/상업적 사용 자유, 출처 표기 불필요
  (https://kenney.nl/support 참고). 원본 라이선스 파일: `assets/LICENSE-*.txt`
