# 눈밭 밥집 (Hypercasual-1)

눈밭에서 고기를 모아 사람들에게 밥을 주는 방치형(idle) 게임 v1.
바닐라 JS 정적 사이트. 백엔드 없이 진행 상황은 브라우저 localStorage에만 저장됩니다.

## 플레이 루프
1. **고기 줍기** (수동 클릭) → 고기 획득
2. **요리하기** → 고기 1개를 요리 1개로
3. **밥 주기** → 배고픈 주민에게 요리 서빙, +5 코인
4. 코인으로 업그레이드 구매:
   - 🏹 **자동 사냥** (고기 10개 수집 시 해금) - 5초마다 고기 자동 획득
   - 🍳 **자동 요리** (자동 사냥 Lv.1 해금) - 6초마다 자동 조리
   - 🔔 **자동 서빙** (자동 요리 Lv.1 해금) - 8초마다 자동 서빙
5. 게임을 꺼도 돌아올 때 오프라인 수익 정산 (최대 8시간분)

## 배포
GitHub Pages (main 브랜치 루트): https://dalyoon.github.io/hypercasual-1/

## 에셋 출처 / 라이선스
- [Kenney - Pixel Platformer](https://kenney.nl/assets/pixel-platformer) (주민, 모닥불 스프라이트)
- [Kenney - Pixel Platformer Food Expansion](https://kenney.nl/assets/pixel-platformer-food-expansion) (고기/요리 스프라이트)
- 라이선스: **CC0 (퍼블릭 도메인)** — 개인/상업적 사용 자유, 출처 표기 불필요
  (https://kenney.nl/support 참고). 원본 라이선스 파일: `assets/LICENSE-*.txt`
