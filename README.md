# 퇴근하고 다 부숴! (OFFICE SMASH) — 1차 버전

사무실 물건을 망치로 부수는 모바일 우선 3D 스트레스 해소 게임입니다.
Three.js(r160)를 CDN에서 불러오고, 3D 모델·이미지 파일 없이 기본 도형과 Canvas 텍스처로만 동작합니다.

## 폴더 구조

```
office-smash/
├─ index.html        화면 구조 (HUD, 메뉴, 일시정지, 게임오버)
├─ css/style.css     UI 스타일 (세로 화면 우선, 안전영역 대응)
└─ js/
   ├─ main.js        게임 루프, 상태, 점수·콤보, 입력, 카메라, 품질 자동 조절
   ├─ office.js      사무실 공간 + 책상·모니터·복사기 (4단계 파손 로직)
   ├─ effects.js     파편·유리조각·종이·충격파·분리 부품 간이 물리
   ├─ hammer.js      망치 모델과 휘두르기 애니메이션
   ├─ textures.js    나무결·카펫·모니터 화면·균열 텍스처 (Canvas 생성)
   └─ audio.js       Web Audio 합성 효과음, 진동
```

## 1차 버전 구현 범위

- 메인 메뉴 / 조작 방법 / 그래픽 품질(자동·높음·중간·낮음)
- 3D 사무실 1곳: 책상 2, 모니터 2, 복사기 1 (창문·화이트보드·벽시계 배경)
- 망치 공격 (타격 지점으로 실제로 내려치는 애니메이션, 15% 강타)
- 물건별 내구도 + 4단계 파손
  - 균열: 균열 데칼 / 모니터 유리에 타격 지점 기준 실시간 균열, 흔들림
  - 심각한 파손: 서랍·키보드·마우스·스캐너 덮개·용지함 분리, 모니터 화면 꺾임·글리치
  - 완전 파괴: 모든 부품이 흩어져 바닥에 쌓임, 모니터 유리 산산조각, 복사기 종이 폭발
  - 책상이 부서지면 위의 모니터가 바닥으로 추락
- 파편·충격파·섬광·화면 흔들림·슬로모션·진동·효과음
- 점수: 타격 점수 × 콤보 배율 + 단계 보너스 + 완전 파괴 보너스 + 사무실 전멸 보너스(+2,000)
- 60초 챌린지 (전멸 시 새 사무실 자동 입고), 무한 모드(🔧 복구 버튼)
- 게임 오버·다시 하기 (파편·이벤트 완전 초기화), 최고 점수 localStorage 저장
- 터치: 탭 = 공격, 드래그 = 시점 회전 (확대·스크롤·더블탭 줌 차단)
- PC: 클릭 = 공격, 드래그 = 시점 회전, ESC/P = 일시정지
- 성능: 파편·종이·분리 부품 수 상한, 인스턴싱, 기기 성능 추정 + FPS 저하 시 자동 품질 하향

나머지 도구(주먹·방망이·철퇴·레이저)는 버튼만 있고 누르면 해제 조건을 안내합니다. 다음 단계에서 구현할 예정입니다.

## 내 PC에서 실행하기

ES 모듈을 쓰기 때문에 `index.html`을 **더블클릭해서 열면 동작하지 않습니다.** 간단한 로컬 서버로 여세요.

```bash
cd office-smash
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

같은 Wi-Fi의 휴대폰에서 테스트하려면 `http://<PC의 IP>:8000`으로 접속하면 됩니다.
인터넷 연결이 필요합니다 (Three.js를 CDN에서 불러옴).

## GitHub Pages 배포

1. GitHub에서 새 저장소를 만듭니다. 예: `office-smash` (Public)
2. 이 폴더의 파일을 **저장소 최상위**에 올립니다. `index.html`이 저장소 루트에 있어야 합니다.
   - 웹에서: 저장소 → **Add file → Upload files** → 폴더 안의 내용 전체를 끌어다 놓기 → Commit
   - 또는 터미널:
     ```bash
     cd office-smash
     git init
     git add .
     git commit -m "OFFICE SMASH 1차 버전"
     git branch -M main
     git remote add origin https://github.com/<아이디>/office-smash.git
     git push -u origin main
     ```
3. 저장소 **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → Save
4. 1~2분 뒤 `https://<아이디>.github.io/office-smash/` 에서 플레이할 수 있습니다.
5. 휴대폰 브라우저 메뉴의 **홈 화면에 추가**를 쓰면 앱처럼 전체화면으로 실행됩니다.

## 조정하기 쉬운 값

| 항목 | 위치 |
|---|---|
| 제한시간, 콤보 유지 시간, 전멸 보너스 | `js/main.js` 상단 설정 |
| 망치 데미지(24~33), 강타 확률 | `js/main.js` `applyHit()` |
| 물건 내구도·파괴 보너스 | `js/office.js` 각 `build…()`의 `maxHP`, `destroyBonus` |
| 파손 단계 기준(80% / 42%) | `js/office.js` `stageFromHP()` |
| 품질별 파편 수·그림자 | `js/main.js` `QUALITY` |
| 망치 휘두르는 속도 | `js/hammer.js` `swingTime`, `recoilTime` |
